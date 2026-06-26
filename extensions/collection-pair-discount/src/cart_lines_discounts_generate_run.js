import {
  DiscountClass,
  ProductDiscountSelectionStrategy,
} from '../generated/api';


/**
  * @typedef {import("../generated/api").CartInput} RunInput
  * @typedef {import("../generated/api").CartLinesDiscountsGenerateRunResult} CartLinesDiscountsGenerateRunResult
  * @typedef {{ collectionIds: string[], itemCount: number, discountTitle: string, pricingMode: 'single' | 'markets', markets: Record<string, { enabled?: boolean, bundlePrice?: unknown }>, bundlePrice: unknown }} ParsedConfig
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
  const bundlePriceCents = resolveBundlePriceCents(config, marketId);
  if (bundlePriceCents == null) {
    return { operations: [] };
  }

  const discountMessage = config.discountTitle?.trim() || null;

  const units = expandEligibleUnits(input.cart.lines);
  const pairs = pairUnits(units, config.itemCount);
  if (!pairs.length) {
    return { operations: [] };
  }

  /** @type {Map<string, { discountedQty: number, totalDiscountCents: number }>} */
  const lineBuckets = new Map();

  for (const pair of pairs) {
    const unitPricesCents = pair.map((unit) => unit.unitPriceCents);
    const unitDiscountsCents = proportionalDiscountCents(
      unitPricesCents,
      bundlePriceCents,
    );

    pair.forEach((unit, index) => {
      const discountCents = unitDiscountsCents[ index ];
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

  if (!candidates.length) {
    return { operations: [] };
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

  const pricingMode = inferPricingMode(config, markets);

  return {
    collectionIds,
    itemCount: Math.floor(itemCount),
    discountTitle: typeof config.discountTitle === 'string' ? config.discountTitle : '',
    pricingMode,
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

  if (Object.keys(markets).length > 0) {
    return 'markets';
  }

  return 'single';
}

/**
  * @param {ParsedConfig} config
  * @param {string | null} marketId
  * @returns {number | null}
  */
function resolveBundlePriceCents(config, marketId) {
  if (config.pricingMode === 'single') {
    const cents = moneyToCents(config.bundlePrice);
    if (cents == null || cents <= 0) {
      return null;
    }

    return cents;
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

  return cents;
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

    if (lineHasDiscount(line)) {
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
  * @param {RunInput['cart']['lines'][number]} line
  * @returns {boolean}
  */
function lineHasDiscount(line) {
  const allocations = line.discountAllocations ?? [];

  for (const allocation of allocations) {
    const cents = moneyToCents(allocation.discountedAmount?.amount);
    if (cents != null && cents > 0) {
      return true;
    }
  }

  return false;
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
  const subtotalCents = unitPricesCents.reduce((sum, price) => sum + price, 0);
  const totalDiscountCents = Math.max(0, subtotalCents - bundlePriceCents);

  if (totalDiscountCents === 0) {
    return unitPricesCents.map(() => 0);
  }

  if (subtotalCents === 0) {
    return unitPricesCents.map(() => 0);
  }

  const discounts = unitPricesCents.map((price) =>
    Math.floor((totalDiscountCents * price) / subtotalCents),
  );
  const assigned = discounts.reduce((sum, value) => sum + value, 0);
  const remainder = totalDiscountCents - assigned;

  if (remainder > 0) {
    const highestIndex = unitPricesCents.indexOf(Math.max(...unitPricesCents));
    discounts[ highestIndex ] += remainder;
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
