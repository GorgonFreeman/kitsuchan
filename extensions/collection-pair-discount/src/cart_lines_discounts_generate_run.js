import {
  DiscountClass,
  ProductDiscountSelectionStrategy,
} from '../generated/api';
import {
  cartPresentmentCurrencyCode,
  parseConversionRates,
  parseShopCurrencyCode,
} from './marketCurrency.js';
import {
  getPairs,
  lineDiscountBucketsFromPairs,
  moneyToCents,
  parsePresentmentCurrencyRate,
  resolveBundlePriceCents,
} from './collectionPairing.js';

/**
  * @typedef {import("../generated/api").CartInput} RunInput
  * @typedef {import("../generated/api").CartLinesDiscountsGenerateRunResult} CartLinesDiscountsGenerateRunResult
  * @typedef {{ collectionIds: string[], itemCount: number, discountTitle: string, pricingMode: 'single' | 'markets', shopCurrencyCode: string, markets: Record<string, { enabled?: boolean, bundlePrice?: unknown, currencyCode?: string }>, bundlePrice: unknown }} ParsedConfig
  * @typedef {{ unitId: string, lineId: string, unitPriceCents: number }} BundleUnit
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

  const units = expandEligibleUnits(input.cart.lines);
  if (!units.length) {
    return { operations: [] };
  }

  const pairs = getPairs(units, config.itemCount);
  const lineBuckets = lineDiscountBucketsFromPairs(pairs, bundlePriceCents);

  if (!lineBuckets.size) {
    return { operations: [] };
  }

  const discountMessage = config.discountTitle?.trim() || null;
  const candidates = [ ...lineBuckets.entries() ].map(([ lineId, bucket ]) => ({
    ...(discountMessage ? { message: discountMessage } : {}),
    targets: [
      {
        cartLine: {
          id: lineId,
          quantity: bucket.discountedQty,
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
  * @param {unknown} jsonValue
  * @returns {ParsedConfig | null}
  */
function parseConfig(jsonValue) {
  if (!jsonValue || typeof jsonValue !== 'object') {
    return null;
  }

  const config = /** @type {Record<string, unknown>} */ (jsonValue);
  const collectionIds = Array.isArray(config.collectionIds)
    ? config.collectionIds.filter((id) => typeof id === 'string' && id.length > 0)
    : typeof config.collectionId === 'string' && config.collectionId
      ? [ config.collectionId ]
      : [];

  if (!collectionIds.length) {
    return null;
  }

  const itemCount = Number(config.itemCount ?? DEFAULT_ITEM_COUNT);
  if (!Number.isFinite(itemCount) || itemCount < 2) {
    return null;
  }

  const markets = config.markets && typeof config.markets === 'object'
    ? /** @type {ParsedConfig['markets']} */ (config.markets)
    : {};

  return {
    collectionIds,
    itemCount: Math.floor(itemCount),
    discountTitle: typeof config.discountTitle === 'string' ? config.discountTitle : '',
    pricingMode: inferPricingMode(config, markets),
    shopCurrencyCode: typeof config.shopCurrencyCode === 'string' ? config.shopCurrencyCode : '',
    markets,
    bundlePrice: config.bundlePrice,
  };
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
  * @param {RunInput['cart']['lines']} lines
  * @returns {BundleUnit[]}
  */
function expandEligibleUnits(lines) {
  /** @type {BundleUnit[]} */
  const units = [];
  let seq = 0;

  for (const line of lines) {
    if (line.merchandise.__typename !== 'ProductVariant') {
      continue;
    }

    if (line.excludeAttribute?.value) {
      continue;
    }

    if (!line.merchandise.product?.inAnyCollection) {
      continue;
    }

    const unitPriceCents = moneyToCents(line.cost.amountPerQuantity.amount);
    if (unitPriceCents == null || unitPriceCents <= 0) {
      continue;
    }

    for (let i = 0; i < line.quantity; i += 1) {
      units.push({
        unitId: `${ line.id }#${ seq++ }`,
        lineId: line.id,
        unitPriceCents,
      });
    }
  }

  return units;
}
