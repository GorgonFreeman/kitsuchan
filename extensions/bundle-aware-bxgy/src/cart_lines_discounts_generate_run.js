import {
  DiscountClass,
  ProductDiscountSelectionStrategy,
} from '../generated/api';
import {
  getPairs,
  moneyToCents,
  pairedUnitIdSet,
} from '../../collection-pair-discount/src/collectionPairing.js';
import {
  applyBxGyPercent,
  aggregateProductCandidates,
} from '../../collection-pair-discount/src/bxgyPercent.js';

/**
  * @typedef {import("../generated/api").CartInput} RunInput
  * @typedef {import("../generated/api").CartLinesDiscountsGenerateRunResult} CartLinesDiscountsGenerateRunResult
  *
  * @typedef {{
  *   bundleCollectionIds: string[],
  *   qualifyCollectionIds: string[],
  *   eligibleCollectionIds: string[],
  *   itemCount: number,
  *   paidCount: number,
  *   percent: number,
  *   discountTitle: string,
  * }} ParsedConfig
  *
  * @typedef {{
  *   unitId: string,
  *   lineId: string,
  *   unitPriceCents: number,
  *   inBundleCollection: boolean,
  *   inQualify: boolean,
  *   inEligible: boolean,
  *   excluded: boolean,
  * }} Unit
  */

const DEFAULT_ITEM_COUNT = 2;
const DEFAULT_PAID_COUNT = 1;
const DEFAULT_PERCENT = 50;
const DEFAULT_MESSAGE = 'Buy X Get Y% Off';

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

  const units = expandUnits(input.cart.lines, config);
  if (!units.length) {
    return { operations: [] };
  }

  const bundleUnits = units.filter((unit) => unit.inBundleCollection && !unit.excluded);
  const pairs = getPairs(bundleUnits, config.itemCount);
  const pairedUnitIds = pairedUnitIdSet(pairs);

  const remaining = units.filter((unit) => {
    if (unit.excluded) return false;
    if (pairedUnitIds.has(unit.unitId)) return false;
    return true;
  });

  const unitDiscounts = applyBxGyPercent(
    remaining,
    (u) => u.inQualify,
    (u) => u.inEligible,
    config.paidCount,
    config.percent,
    config.discountTitle,
  );

  if (!unitDiscounts.length) {
    return { operations: [] };
  }

  const candidates = aggregateProductCandidates(unitDiscounts);
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

  const raw = /** @type {Record<string, unknown>} */ (jsonValue);

  const bundleCollectionIds = normalizeIdList(
    raw.bundleCollectionIds ?? raw.hoodieCollectionIds ?? raw.collectionId,
  );
  if (!bundleCollectionIds.length) {
    return null;
  }

  const qualifyCollectionIds = normalizeIdList(raw.qualifyCollectionIds);
  const eligibleCollectionIds = normalizeIdList(raw.eligibleCollectionIds);

  const itemCount = Number(raw.itemCount ?? DEFAULT_ITEM_COUNT);
  if (!Number.isFinite(itemCount) || itemCount < 2) {
    return null;
  }

  const paidCount = Number(raw.paidCount ?? DEFAULT_PAID_COUNT);
  if (!Number.isFinite(paidCount) || paidCount < 1) {
    return null;
  }

  const percentRaw = Number(raw.percent ?? DEFAULT_PERCENT);
  const percent = Number.isFinite(percentRaw) && percentRaw > 0
    ? Math.min(100, percentRaw)
    : DEFAULT_PERCENT;

  const discountTitle = typeof raw.discountTitle === 'string' && raw.discountTitle.trim()
    ? raw.discountTitle.trim()
    : DEFAULT_MESSAGE;

  return {
    bundleCollectionIds,
    qualifyCollectionIds,
    eligibleCollectionIds,
    itemCount: Math.floor(itemCount),
    paidCount: Math.floor(paidCount),
    percent,
    discountTitle,
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
        inQualify: isInAny(memberIds, config.qualifyCollectionIds),
        inEligible: isInAny(memberIds, config.eligibleCollectionIds),
        excluded,
      });
    }
  }

  return units;
}
