import {
  DiscountClass,
  ProductDiscountSelectionStrategy,
} from '../generated/api';
import {
  cartPresentmentCurrencyCode,
  parseConversionRates,
  parseShopCurrencyCode,
} from '../../collection-pair-discount/src/marketCurrency.js';
import {
  getPairs,
  getPostPairsSubtotal,
  moneyToCents,
  pairedUnitIdSet,
  parsePresentmentCurrencyRate,
  resolveBundlePriceCents,
} from '../../collection-pair-discount/src/collectionPairing.js';

/**
  * @typedef {import("../generated/api").CartInput} RunInput
  * @typedef {import("../generated/api").CartLinesDiscountsGenerateRunResult} CartLinesDiscountsGenerateRunResult
  *
  * @typedef {{
  *   bundleCollectionIds: string[],
  *   eligibleCollectionIds: string[],
  *   itemCount: number,
  *   discountTitle: string,
  *   pricingMode: 'single' | 'markets',
  *   shopCurrencyCode: string,
  *   markets: Record<string, { enabled?: boolean, bundlePrice?: unknown, currencyCode?: string }>,
  *   bundlePrice: unknown,
  *   spendSavePercentTiers: Array<{ minShopAmount: number, value: number }>,
  * }} ParsedConfig
  *
  * @typedef {{
  *   unitId: string,
  *   lineId: string,
  *   unitPriceCents: number,
  *   inBundleCollection: boolean,
  *   inEligiblePool: boolean,
  *   excluded: boolean,
  * }} Unit
  */

const DEFAULT_ITEM_COUNT = 2;

/**
  * @param {RunInput} input
  * @returns {CartLinesDiscountsGenerateRunResult}
  */
export function cartLinesDiscountsGenerateRun(input) {
  const hasProductDiscountClass = input.discount.discountClasses.includes(
    DiscountClass.Product,
  );
  if (!hasProductDiscountClass || !input.cart.lines.length) {
    return { operations: [] };
  }

  const config = parseConfig(input.discount.metafield?.jsonValue);
  if (!config || !config.spendSavePercentTiers.length) {
    return { operations: [] };
  }

  const marketId = input.localization?.market?.id ?? null;
  const presentmentCurrencyRate = parsePresentmentCurrencyRate(input.presentmentCurrencyRate);
  const conversionRates = parseConversionRates(input.shop?.metafield?.jsonValue);
  const shopCurrencyCode = parseShopCurrencyCode(
    input.shop?.metafield?.jsonValue,
    config.shopCurrencyCode,
  );
  const cartCurrencyCode = cartPresentmentCurrencyCode(input.cart.lines);
  const bundlePriceCents = resolveBundlePriceCents({
    config,
    marketId,
    presentmentCurrencyRate,
    cartCurrencyCode,
    shopCurrencyCode,
    conversionRates,
  });
  if (bundlePriceCents == null) {
    return { operations: [] };
  }

  const units = expandUnits(input.cart.lines, config);
  if (!units.length) {
    return { operations: [] };
  }

  const bundleUnits = units.filter((unit) => unit.inBundleCollection && !unit.excluded);
  const pairs = getPairs(bundleUnits, config.itemCount);
  const pairedUnitIds = pairedUnitIdSet(pairs);
  const artificialSpendCents = getPostPairsSubtotal(units, pairs, bundlePriceCents);

  const percent = pickBestPercent(
    config.spendSavePercentTiers,
    artificialSpendCents,
    presentmentCurrencyRate,
  );
  if (percent <= 0) {
    return { operations: [] };
  }

  /** @type {Map<string, number>} */
  const lineQuantities = new Map();
  for (const unit of units) {
    if (unit.excluded) continue;
    if (!unit.inEligiblePool) continue;
    if (pairedUnitIds.has(unit.unitId)) continue;

    lineQuantities.set(unit.lineId, (lineQuantities.get(unit.lineId) || 0) + 1);
  }

  if (!lineQuantities.size) {
    return { operations: [] };
  }

  const discountMessage = formatDiscountTitle(config.discountTitle, percent);
  const candidates = [ ...lineQuantities.entries() ].map(([ lineId, quantity ]) => ({
    ...(discountMessage ? { message: discountMessage } : {}),
    targets: [
      {
        cartLine: {
          id: lineId,
          quantity,
        },
      },
    ],
    value: {
      percentage: {
        value: percent,
      },
    },
  }));

  return {
    operations: [
      {
        productDiscountsAdd: {
          candidates,
          selectionStrategy: ProductDiscountSelectionStrategy.All,
        },
      },
    ],
  };
}

/**
  * Replace `[discountAmount]` with the unlocked percent (e.g. 20).
  * @param {string} title
  * @param {number} percent
  * @returns {string | null}
  */
function formatDiscountTitle(title, percent) {
  const trimmed = typeof title === 'string' ? title.trim() : '';
  if (!trimmed) {
    return null;
  }

  return trimmed.replace(/\[discountAmount\]/g, String(percent));
}

/**
  * @param {unknown} jsonValue
  * @returns {ParsedConfig | null}
  */
function parseConfig(jsonValue) {
  if (!jsonValue || typeof jsonValue !== 'object') {
    return null;
  }

  const raw = /** @type {Record<string, unknown>} */ (jsonValue);

  const bundleCollectionIds = normalizeIdList(
    raw.bundleCollectionIds ?? raw.collectionIds ?? raw.collectionId,
  );
  if (!bundleCollectionIds.length) {
    return null;
  }

  const eligibleCollectionIds = normalizeIdList(raw.eligibleCollectionIds);

  const itemCount = Number(raw.itemCount ?? DEFAULT_ITEM_COUNT);
  if (!Number.isFinite(itemCount) || itemCount < 2) {
    return null;
  }

  const markets = raw.markets && typeof raw.markets === 'object'
    ? /** @type {ParsedConfig['markets']} */ (raw.markets)
    : {};

  const spendSavePercentTiers = parseSpendTiersCsv(
    typeof raw.spendSavePercentCsv === 'string' ? raw.spendSavePercentCsv : '',
  );

  return {
    bundleCollectionIds,
    eligibleCollectionIds,
    itemCount: Math.floor(itemCount),
    discountTitle: typeof raw.discountTitle === 'string' ? raw.discountTitle : '',
    pricingMode: inferPricingMode(raw, markets),
    shopCurrencyCode: typeof raw.shopCurrencyCode === 'string' ? raw.shopCurrencyCode : '',
    markets,
    bundlePrice: raw.bundlePrice,
    spendSavePercentTiers,
  };
}

/**
  * @param {unknown} value
  * @returns {string[]}
  */
function normalizeIdList(value) {
  if (Array.isArray(value)) {
    return value.filter((id) => typeof id === 'string' && id.length > 0);
  }

  if (typeof value === 'string' && value.length > 0) {
    return [ value ];
  }

  return [];
}

/**
  * @param {Record<string, unknown>} config
  * @param {ParsedConfig['markets']} markets
  * @returns {'single' | 'markets'}
  */
function inferPricingMode(config, markets) {
  if (config.pricingMode === 'markets') {
    return 'markets';
  }

  if (config.pricingMode === 'single') {
    return 'single';
  }

  return Object.keys(markets).length > 0 ? 'markets' : 'single';
}

/**
  * CSV `spend|percent` in shop-currency major units, e.g. `75|15,150|20,200|30`.
  * @param {string} csv
  * @returns {Array<{ minShopAmount: number, value: number }>}
  */
function parseSpendTiersCsv(csv) {
  if (!csv || typeof csv !== 'string') {
    return [];
  }

  /** @type {Array<{ minShopAmount: number, value: number }>} */
  const tiers = [];

  for (const part of csv.split(',')) {
    const [ spendRaw, valueRaw ] = part.split('|').map((s) => s.trim());
    const minShopAmount = parseFloat(spendRaw ?? '');
    const value = parseFloat(valueRaw ?? '');
    if (!Number.isFinite(minShopAmount) || minShopAmount < 0) continue;
    if (!Number.isFinite(value) || value <= 0) continue;
    tiers.push({ minShopAmount, value });
  }

  return tiers.sort((a, b) => a.minShopAmount - b.minShopAmount);
}

/**
  * @param {Array<{ minShopAmount: number, value: number }>} tiers
  * @param {number} artificialSpendCents
  * @param {number} presentmentRate
  * @returns {number}
  */
function pickBestPercent(tiers, artificialSpendCents, presentmentRate) {
  let best = 0;
  for (const tier of tiers) {
    const minCents = Math.round(tier.minShopAmount * 100 * presentmentRate);
    if (artificialSpendCents >= minCents) {
      best = tier.value;
    }
  }
  return best;
}

/**
  * @param {Array<{ collectionId?: string, isMember?: boolean }> | null | undefined} memberships
  * @returns {Set<string>}
  */
function memberCollectionIdSet(memberships) {
  /** @type {Set<string>} */
  const set = new Set();
  if (!Array.isArray(memberships)) return set;
  for (const row of memberships) {
    if (row?.isMember && typeof row.collectionId === 'string') {
      set.add(row.collectionId);
    }
  }
  return set;
}

/**
  * Empty list = unrestricted.
  * @param {Set<string>} memberIds
  * @param {string[]} collectionIds
  * @returns {boolean}
  */
function isInAny(memberIds, collectionIds) {
  if (!collectionIds.length) return true;
  for (const id of collectionIds) {
    if (memberIds.has(id)) return true;
  }
  return false;
}

/**
  * @param {RunInput['cart']['lines']} lines
  * @param {ParsedConfig} config
  * @returns {Unit[]}
  */
function expandUnits(lines, config) {
  /** @type {Unit[]} */
  const units = [];
  let seq = 0;

  for (const line of lines) {
    if (line.merchandise.__typename !== 'ProductVariant') {
      continue;
    }

    const unitPriceCents = moneyToCents(line.cost.amountPerQuantity.amount);
    if (unitPriceCents == null || unitPriceCents <= 0) {
      continue;
    }

    const excluded = Boolean(line.excludeAttribute?.value);
    const memberIds = memberCollectionIdSet(line.merchandise.product?.collectionMemberships);

    for (let i = 0; i < line.quantity; i += 1) {
      units.push({
        unitId: `${ line.id }#${ seq++ }`,
        lineId: line.id,
        unitPriceCents,
        inBundleCollection: isInAny(memberIds, config.bundleCollectionIds),
        inEligiblePool: isInAny(memberIds, config.eligibleCollectionIds),
        excluded,
      });
    }
  }

  return units;
}
