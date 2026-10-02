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
  *   spendSaveFixedTiers: Array<{ minShopAmount: number, value: number }>,
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
  if (!config || !config.spendSaveFixedTiers.length) {
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

  const fixedShopAmount = pickBestFixedAmount(
    config.spendSaveFixedTiers,
    artificialSpendCents,
    presentmentCurrencyRate,
  );
  if (fixedShopAmount <= 0) {
    return { operations: [] };
  }

  const discountPresentmentCents = Math.round(fixedShopAmount * 100 * presentmentCurrencyRate);

  /** @type {Unit[]} */
  const targetUnits = [];
  for (const unit of units) {
    if (unit.excluded) continue;
    if (!unit.inEligiblePool) continue;
    if (pairedUnitIds.has(unit.unitId)) continue;
    targetUnits.push(unit);
  }

  if (!targetUnits.length) {
    return { operations: [] };
  }

  const unitDiscountsCents = splitFixedAcrossUnits(targetUnits, discountPresentmentCents);
  /** @type {Map<string, { quantity: number, totalDiscountCents: number }>} */
  const lineBuckets = new Map();

  targetUnits.forEach((unit, index) => {
    const discountCents = unitDiscountsCents[ index ] || 0;
    if (discountCents <= 0) return;

    const bucket = lineBuckets.get(unit.lineId) ?? {
      quantity: 0,
      totalDiscountCents: 0,
    };
    bucket.quantity += 1;
    bucket.totalDiscountCents += discountCents;
    lineBuckets.set(unit.lineId, bucket);
  });

  if (![ ...lineBuckets.values() ].some((b) => b.totalDiscountCents > 0)) {
    return { operations: [] };
  }

  const discountMessage = formatDiscountTitle(config.discountTitle, fixedShopAmount);
  const candidates = [ ...lineBuckets.entries() ]
    .filter(([ , bucket ]) => bucket.totalDiscountCents > 0)
    .map(([ lineId, bucket ]) => ({
      ...(discountMessage ? { message: discountMessage } : {}),
      targets: [
        {
          cartLine: {
            id: lineId,
            quantity: bucket.quantity,
          },
        },
      ],
      value: {
        fixedAmount: {
          amount: (bucket.totalDiscountCents / 100).toFixed(2),
          appliesToEachItem: false,
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
  * Split a fixed presentment-cents discount across units proportional to price.
  * Caps at the pool subtotal. Remainder cents go to the highest-priced unit.
  *
  * @param {Unit[]} units
  * @param {number} totalDiscountCents
  * @returns {number[]}
  */
function splitFixedAcrossUnits(units, totalDiscountCents) {
  const pricesCents = units.map((unit) => unit.unitPriceCents);
  const poolCents = pricesCents.reduce((sum, value) => sum + value, 0);
  const allocateCents = Math.min(Math.max(0, totalDiscountCents), poolCents);
  if (allocateCents <= 0 || !poolCents) {
    return pricesCents.map(() => 0);
  }

  const discounts = pricesCents.map((priceCents) =>
    Math.floor((allocateCents * priceCents) / poolCents),
  );
  const assignedCents = discounts.reduce((sum, value) => sum + value, 0);
  const remainderCents = allocateCents - assignedCents;

  if (remainderCents > 0) {
    const highestIndex = pricesCents.indexOf(Math.max(...pricesCents));
    discounts[ highestIndex ] += remainderCents;
  }

  return discounts;
}

/**
  * Replace `[discountAmount]` with the unlocked fixed $ amount (shop major units).
  * @param {string} title
  * @param {number} shopAmount
  * @returns {string | null}
  */
function formatDiscountTitle(title, shopAmount) {
  const trimmed = typeof title === 'string' ? title.trim() : '';
  if (!trimmed) {
    return null;
  }

  const display = Number.isInteger(shopAmount)
    ? String(shopAmount)
    : shopAmount.toFixed(2).replace(/\.?0+$/, '') || String(shopAmount);

  return trimmed.replace(/\[discountAmount\]/g, display);
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

  const spendSaveFixedTiers = parseSpendTiersCsv(
    typeof raw.spendSaveFixedCsv === 'string' ? raw.spendSaveFixedCsv : '',
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
    spendSaveFixedTiers,
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
  * CSV `spend|dollars-off` in shop-currency major units, e.g. `75|15,150|40,200|60`.
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
  * @returns {number} Shop-currency major units off
  */
function pickBestFixedAmount(tiers, artificialSpendCents, presentmentRate) {
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
