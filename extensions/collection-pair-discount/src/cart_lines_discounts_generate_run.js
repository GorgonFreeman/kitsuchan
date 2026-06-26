import {
  DiscountClass,
  DiscountApplicationTarget,
  ProductDiscountSelectionStrategy,
} from '../generated/api';


/**
  * @typedef {import("../generated/api").CartInput} RunInput
  * @typedef {import("../generated/api").CartLinesDiscountsGenerateRunResult} CartLinesDiscountsGenerateRunResult
  * @typedef {{ collectionIds: string[], itemCount: number, discountTitle: string, pricingMode: 'single' | 'markets', markets: Record<string, { enabled?: boolean, bundlePrice?: unknown }>, bundlePrice: unknown }} ParsedConfig
  * @typedef {{ lineId: string, unitPriceCents: number, existingDiscountCents: number }} BundleUnit
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
  const pairs = pairUnitsWithRePair(units, config.itemCount, bundlePriceCents);
  if (!pairs.length) {
    return { operations: [] };
  }

  /** @type {Map<string, { discountedQty: number, totalDiscountCents: number }>} */
  const lineBuckets = new Map();

  for (const pair of pairs) {
    const unitPricesCents = pair.map((unit) => unit.unitPriceCents);
    const subtotalCents = unitPricesCents.reduce((sum, price) => sum + price, 0);
    const existingSavingsCents = pair.reduce(
      (sum, unit) => sum + unit.existingDiscountCents,
      0,
    );
    const bundleSavingsCents = subtotalCents - bundlePriceCents;
    const remainingGapCents = bundleSavingsCents - existingSavingsCents;
    const unitDiscountsCents = allocateRemainingGapCents(pair, remainingGapCents);

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

    const unitPriceCents = moneyToCents(line.cost.amountPerQuantity.amount);
    if (unitPriceCents == null || unitPriceCents <= 0) {
      continue;
    }

    const existingDiscountCents = productDiscountPerUnitCents(line);

    for (let i = 0; i < line.quantity; i += 1) {
      units.push({
        lineId: line.id,
        unitPriceCents,
        existingDiscountCents,
      });
    }
  }

  return units;
}

/**
  * @param {RunInput['cart']['lines'][number]} line
  * @returns {number}
  */
function productDiscountPerUnitCents(line) {
  const allocations = line.discountAllocations ?? [];
  let totalCents = 0;

  for (const allocation of allocations) {
    if (allocation.discountApplication?.targetType !== DiscountApplicationTarget.LineItem) {
      continue;
    }

    const cents = moneyToCents(allocation.discountedAmount?.amount);
    if (cents != null && cents > 0) {
      totalCents += cents;
    }
  }

  const quantity = line.quantity ?? 1;
  if (quantity <= 0) {
    return 0;
  }

  return Math.round(totalCents / quantity);
}

/**
  * @param {BundleUnit[]} units
  * @param {number} itemCount
  * @param {number} bundlePriceCents
  * @returns {BundleUnit[][]}
  */
function pairUnitsWithRePair(units, itemCount, bundlePriceCents) {
  /** @type {BundleUnit[][]} */
  const pairs = [];
  let index = 0;

  while (index + itemCount <= units.length) {
    const candidate = units.slice(index, index + itemCount);
    const subtotalCents = candidate.reduce((sum, unit) => sum + unit.unitPriceCents, 0);
    const existingSavingsCents = candidate.reduce(
      (sum, unit) => sum + unit.existingDiscountCents,
      0,
    );
    const bundleSavingsCents = subtotalCents - bundlePriceCents;

    if (bundleSavingsCents > existingSavingsCents) {
      pairs.push(candidate);
      index += itemCount;
      continue;
    }

    index += 1;
  }

  return pairs;
}

/**
  * @param {BundleUnit[]} units
  * @param {number} remainingGapCents
  * @returns {number[]}
  */
function allocateRemainingGapCents(units, remainingGapCents) {
  const result = units.map(() => 0);
  if (remainingGapCents <= 0) {
    return result;
  }

  /** @type {number[]} */
  let eligible = units.map((_, unitIndex) => unitIndex);
  let unallocatedCents = remainingGapCents;

  while (unallocatedCents > 0 && eligible.length > 0) {
    const eligiblePricesCents = eligible.map((unitIndex) => units[ unitIndex ].unitPriceCents);
    const sharesCents = proportionalSplitCents(eligiblePricesCents, unallocatedCents);
    /** @type {number[]} */
    const nextEligible = [];
    let allocatedThisPassCents = 0;

    eligible.forEach((unitIndex, shareIndex) => {
      const shareCents = sharesCents[ shareIndex ];
      if (shareCents > units[ unitIndex ].existingDiscountCents) {
        result[ unitIndex ] += shareCents;
        allocatedThisPassCents += shareCents;
        nextEligible.push(unitIndex);
        return;
      }
    });

    if (allocatedThisPassCents === 0) {
      const winners = eligible.filter(
        (unitIndex) => unallocatedCents > units[ unitIndex ].existingDiscountCents,
      );

      if (!winners.length) {
        break;
      }

      winners.sort((leftIndex, rightIndex) => (
        units[ leftIndex ].existingDiscountCents - units[ rightIndex ].existingDiscountCents
        || units[ rightIndex ].unitPriceCents - units[ leftIndex ].unitPriceCents
      ));

      const targetIndex = winners[ 0 ];
      result[ targetIndex ] += unallocatedCents;
      break;
    }

    unallocatedCents -= allocatedThisPassCents;
    eligible = nextEligible;
  }

  return result;
}

/**
  * @param {number[]} unitPricesCents
  * @param {number} totalDiscountCents
  * @returns {number[]}
  */
function proportionalSplitCents(unitPricesCents, totalDiscountCents) {
  const subtotalCents = unitPricesCents.reduce((sum, price) => sum + price, 0);

  if (totalDiscountCents === 0 || subtotalCents === 0) {
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
