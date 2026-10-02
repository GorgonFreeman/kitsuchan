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
  *   itemCount: number,
  *   lineProperty: string,
  *   minSpendCents: number,
  *   discountTitle: string,
  *   redemptions: 'one' | 'multiple',
  *   pricingMode: 'single' | 'markets',
  *   shopCurrencyCode: string,
  *   markets: Record<string, { enabled?: boolean, bundlePrice?: unknown, currencyCode?: string }>,
  *   bundlePrice: unknown,
  * }} ParsedConfig
  *
  * @typedef {{
  *   unitId: string,
  *   lineId: string,
  *   unitPriceCents: number,
  *   inBundleCollection: boolean,
  *   isGift: boolean,
  *   excluded: boolean,
  * }} Unit
  */

const DEFAULT_ITEM_COUNT = 2;
const VANITY_CENTS = 1;

/**
  * @param {RunInput} input
  * @returns {CartLinesDiscountsGenerateRunResult}
  */
export function cartLinesDiscountsGenerateRun(input) {
  if (!input.discount.discountClasses.includes(DiscountClass.Product)) {
    return { operations: [] };
  }

  if (!input.cart.lines.length) {
    return { operations: [] };
  }

  const config = parseConfig(input.discount.metafield?.jsonValue);
  if (!config) {
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

  // Pair non-gift paid units only — gifts stay available for the free-gift discount.
  const spendUnits = units.filter((unit) => !unit.isGift && !unit.excluded);
  const bundleUnits = spendUnits.filter((unit) => unit.inBundleCollection);
  const pairs = getPairs(bundleUnits, config.itemCount);
  const pairedUnitIds = pairedUnitIdSet(pairs);

  const artificialSpendCents = getPostPairsSubtotal(spendUnits, pairs, bundlePriceCents);
  const minSpendPresentmentCents = Math.round(config.minSpendCents * presentmentCurrencyRate);

  const earnedFreeGifts = config.redemptions === 'multiple' && minSpendPresentmentCents > 0
    ? Math.floor(artificialSpendCents / minSpendPresentmentCents)
    : (artificialSpendCents >= minSpendPresentmentCents ? 1 : 0);

  if (earnedFreeGifts < 1) {
    return { operations: [] };
  }

  /** @type {Unit[]} */
  const giftUnits = units
    .filter((unit) => unit.isGift && !unit.excluded && unit.unitPriceCents > 0)
    .slice()
    .sort((a, b) => a.unitPriceCents - b.unitPriceCents);

  if (!giftUnits.length) {
    return { operations: [] };
  }

  let remaining = earnedFreeGifts;
  /** @type {Map<string, { quantity: number, totalDiscountCents: number }>} */
  const giftBuckets = new Map();

  for (const unit of giftUnits) {
    if (remaining <= 0) break;
    const bucket = giftBuckets.get(unit.lineId) ?? { quantity: 0, totalDiscountCents: 0 };
    bucket.quantity += 1;
    bucket.totalDiscountCents += unit.unitPriceCents;
    giftBuckets.set(unit.lineId, bucket);
    remaining -= 1;
  }

  if (![ ...giftBuckets.values() ].some((b) => b.totalDiscountCents > 0)) {
    return { operations: [] };
  }

  const discountMessage = config.discountTitle || null;
  /** @type {Array<{
    *   message?: string,
    *   targets: Array<{ cartLine: { id: string, quantity: number } }>,
    *   value: { fixedAmount: { amount: string, appliesToEachItem: boolean } },
    * }>}
    */
  const candidates = [];

  for (const [ lineId, bucket ] of giftBuckets.entries()) {
    if (bucket.totalDiscountCents <= 0) continue;
    candidates.push({
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
    });
  }

  // Vanity $0.01 on each non-gift, non-paired line so this function claims those
  // lines and competes as one group against product discount codes.
  /** @type {Set<string>} */
  const vanityLineIds = new Set();
  for (const unit of spendUnits) {
    if (pairedUnitIds.has(unit.unitId)) continue;
    vanityLineIds.add(unit.lineId);
  }

  for (const lineId of vanityLineIds) {
    candidates.push({
      targets: [
        {
          cartLine: {
            id: lineId,
            quantity: 1,
          },
        },
      ],
      value: {
        fixedAmount: {
          amount: (VANITY_CENTS / 100).toFixed(2),
          appliesToEachItem: false,
        },
      },
    });
  }

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
  * @param {unknown} jsonValue
  * @returns {ParsedConfig | null}
  */
function parseConfig(jsonValue) {
  if (!jsonValue || typeof jsonValue !== 'object') {
    return null;
  }

  const raw = /** @type {Record<string, unknown>} */ (jsonValue);

  const bundleCollectionIds = normalizeIdList(
    raw.bundleCollectionIds ?? raw.hoodieCollectionIds ?? raw.collectionId,
  );
  if (!bundleCollectionIds.length) {
    return null;
  }

  const lineProperty = typeof raw.lineProperty === 'string'
    ? raw.lineProperty.trim()
    : '';
  if (!lineProperty) {
    return null;
  }

  const minSpendCents = moneyToCents(raw.minSpend);
  if (minSpendCents == null || minSpendCents < 0) {
    return null;
  }

  const itemCount = Number(raw.itemCount ?? DEFAULT_ITEM_COUNT);
  if (!Number.isFinite(itemCount) || itemCount < 2) {
    return null;
  }

  const markets = raw.markets && typeof raw.markets === 'object'
    ? /** @type {ParsedConfig['markets']} */ (raw.markets)
    : {};

  return {
    bundleCollectionIds,
    itemCount: Math.floor(itemCount),
    lineProperty,
    minSpendCents,
    discountTitle: typeof raw.discountTitle === 'string' ? raw.discountTitle.trim() : '',
    redemptions: raw.redemptions === 'multiple' ? 'multiple' : 'one',
    pricingMode: inferPricingMode(raw, markets),
    shopCurrencyCode: typeof raw.shopCurrencyCode === 'string' ? raw.shopCurrencyCode : '',
    markets,
    bundlePrice: raw.bundlePrice,
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
  if (config.pricingMode === 'markets') return 'markets';
  if (config.pricingMode === 'single') return 'single';
  return Object.keys(markets).length > 0 ? 'markets' : 'single';
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
    const isGift = line.giftAttribute?.key === config.lineProperty
      && Boolean(line.giftAttribute?.value);
    const memberIds = memberCollectionIdSet(line.merchandise.product?.collectionMemberships);

    for (let i = 0; i < line.quantity; i += 1) {
      units.push({
        unitId: `${ line.id }#${ seq++ }`,
        lineId: line.id,
        unitPriceCents,
        inBundleCollection: isInAny(memberIds, config.bundleCollectionIds),
        isGift,
        excluded,
      });
    }
  }

  return units;
}
