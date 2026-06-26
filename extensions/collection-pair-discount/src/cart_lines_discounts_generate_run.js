import {
  DiscountClass,
  ProductDiscountSelectionStrategy,
} from '../generated/api';


/**
  * @typedef {import("../generated/api").CartInput} RunInput
  * @typedef {import("../generated/api").CartLinesDiscountsGenerateRunResult} CartLinesDiscountsGenerateRunResult
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
      config.bundlePriceCents,
    );

    pair.forEach((unit, index) => {
      const bucket = lineBuckets.get(unit.lineId) ?? {
        discountedQty: 0,
        totalDiscountCents: 0,
      };
      bucket.discountedQty += 1;
      bucket.totalDiscountCents += unitDiscountsCents[ index ];
      lineBuckets.set(unit.lineId, bucket);
    });
  }

  const candidates = [ ...lineBuckets.entries() ].map(([ lineId, bucket ]) => ({
    message: 'Collection pair bundle',
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
  * @returns {{ collectionIds: string[], itemCount: number, bundlePriceCents: number } | null}
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

  const bundlePriceCents = moneyToCents(config.bundlePrice);
  if (bundlePriceCents == null || bundlePriceCents < 0) {
    return null;
  }

  return {
    collectionIds,
    itemCount: Math.floor(itemCount),
    bundlePriceCents,
  };
}

/**
  * @param {RunInput['cart']['lines']} lines
  * @returns {Array<{ lineId: string, unitPriceCents: number }>}
  */
function expandEligibleUnits(lines) {
  /** @type {Array<{ lineId: string, unitPriceCents: number }>} */
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
  * @param {Array<{ lineId: string, unitPriceCents: number }>} units
  * @param {number} itemCount
  */
function pairUnits(units, itemCount) {
  /** @type {Array<Array<{ lineId: string, unitPriceCents: number }>>} */
  const pairs = [];

  for (let i = 0; i + itemCount <= units.length; i += itemCount) {
    pairs.push(units.slice(i, i + itemCount));
  }

  return pairs;
}

/**
  * Split a bundle discount across units proportionally to price.
  * Any leftover cents go to the highest-priced unit.
  *
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
