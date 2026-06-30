import {
  DiscountClass,
  ProductDiscountSelectionStrategy,
} from '../generated/api';
import {
  cartPresentmentCurrencyCode,
  parseConversionRates,
  parseShopCurrencyCode,
  resolveMarketBundlePresentmentCents,
} from './marketCurrency.js';

/**
  * @typedef {import("../generated/api").CartInput} RunInput
  * @typedef {import("../generated/api").CartLinesDiscountsGenerateRunResult} CartLinesDiscountsGenerateRunResult
  * @typedef {{ collectionIds: string[], itemCount: number, discountTitle: string, pricingMode: 'single' | 'markets', shopCurrencyCode: string, markets: Record<string, { enabled?: boolean, bundlePrice?: unknown, currencyCode?: string }>, bundlePrice: unknown }} ParsedConfig
  * @typedef {{ lineId: string, unitPriceCents: number }} BundleUnit
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

  units.sort((left, right) => left.unitPriceCents - right.unitPriceCents);

  const pairs = pairUnits(units, config.itemCount);
  if (!pairs.length) {
    return { operations: [] };
  }

  /** @type {Map<string, { discountedQty: number, totalDiscountCents: number }>} */
  const lineBuckets = new Map();

  for (const pair of pairs) {
    const pricesCents = pair.map((unit) => unit.unitPriceCents);
    const discountsCents = proportionalDiscountCents(pricesCents, bundlePriceCents);

    pair.forEach((unit, index) => {
      const discountCents = discountsCents[ index ];
      if (discountCents <= 0) {
        return;
      }

      const bucket = lineBuckets.get(unit.lineId) ?? {
        discountedQty: 0,
        totalDiscountCents: 0,
      };
      bucket.discountedQty += 1;
      bucket.totalDiscountCents += discountCents;
      lineBuckets.set(unit.lineId, bucket);
    });
  }

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
  * @param {{
  *   config: ParsedConfig,
  *   marketId: string | null,
  *   presentmentCurrencyRate: number,
  *   cartCurrencyCode: string,
  *   shopCurrencyCode: string,
  *   conversionRates: Record<string, number>,
  * }} input
  * @returns {number | null}
  */
function resolveBundlePriceCents(input) {
  const {
    config,
    marketId,
    presentmentCurrencyRate,
    cartCurrencyCode,
    shopCurrencyCode,
    conversionRates,
  } = input;

  if (config.pricingMode === 'single') {
    const shopCurrencyCents = moneyToCents(config.bundlePrice);
    if (shopCurrencyCents == null || shopCurrencyCents <= 0) {
      return null;
    }

    return Math.round(shopCurrencyCents * presentmentCurrencyRate);
  }

  if (!marketId || !config.markets[ marketId ]) {
    return null;
  }

  const entry = config.markets[ marketId ];
  if (entry.enabled === false) {
    return null;
  }

  const cents = moneyToCents(entry.bundlePrice);
  if (cents == null || cents <= 0) {
    return null;
  }

  return resolveMarketBundlePresentmentCents({
    bundlePriceCents: cents,
    configCurrencyCode: typeof entry.currencyCode === 'string' ? entry.currencyCode : '',
    cartCurrencyCode,
    shopCurrencyCode,
    presentmentCurrencyRate,
    conversionRates,
  });
}

/**
  * @param {unknown} value
  * @returns {number}
  */
function parsePresentmentCurrencyRate(value) {
  const rate = parseFloat(String(value ?? '1'));
  if (!Number.isFinite(rate) || rate <= 0) {
    return 1;
  }

  return rate;
}

/**
  * @param {RunInput['cart']['lines']} lines
  * @returns {BundleUnit[]}
  */
function expandEligibleUnits(lines) {
  /** @type {BundleUnit[]} */
  const units = [];

  for (const line of lines) {
    if (line.merchandise.__typename !== 'ProductVariant') {
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
        lineId: line.id,
        unitPriceCents,
      });
    }
  }

  return units;
}

/**
  * @param {BundleUnit[]} units
  * @param {number} itemCount
  * @returns {BundleUnit[][]}
  */
function pairUnits(units, itemCount) {
  /** @type {BundleUnit[][]} */
  const pairs = [];

  for (let i = 0; i + itemCount <= units.length; i += itemCount) {
    pairs.push(units.slice(i, i + itemCount));
  }

  return pairs;
}

/**
  * @param {number[]} unitPricesCents
  * @param {number} bundlePriceCents
  * @returns {number[]}
  */
function proportionalDiscountCents(unitPricesCents, bundlePriceCents) {
  const subtotalCents = unitPricesCents.reduce((sum, value) => sum + value, 0);
  const totalDiscountCents = subtotalCents - bundlePriceCents;
  if (totalDiscountCents <= 0) {
    return unitPricesCents.map(() => 0);
  }

  const discounts = unitPricesCents.map((priceCents) =>
    Math.floor((totalDiscountCents * priceCents) / subtotalCents),
  );
  const assignedCents = discounts.reduce((sum, value) => sum + value, 0);
  const remainderCents = totalDiscountCents - assignedCents;

  if (remainderCents > 0) {
    const highestIndex = unitPricesCents.indexOf(Math.max(...unitPricesCents));
    discounts[ highestIndex ] += remainderCents;
  }

  return discounts;
}

/**
  * @param {unknown} value
  * @returns {number | null}
  */
function moneyToCents(value) {
  const amount = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
  if (!Number.isFinite(amount)) {
    return null;
  }

  return Math.round(amount * 100);
}
