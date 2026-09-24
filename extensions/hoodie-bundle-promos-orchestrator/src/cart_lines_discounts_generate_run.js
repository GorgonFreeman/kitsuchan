import {
  DiscountClass,
  ProductDiscountSelectionStrategy,
  OrderDiscountSelectionStrategy,
} from '../generated/api';

/**
 * @typedef {import("../generated/api").CartInput} RunInput
 * @typedef {import("../generated/api").CartLinesDiscountsGenerateRunResult} CartLinesDiscountsGenerateRunResult
 */

/** @typedef {'none' | 'b2g1' | 'spend_save_percent' | 'spend_save_fixed' | 'b1g50' | 'hoodie_sweatpants_50'} PromoType */

/**
 * @typedef {{
 *   hoodieBundle: string,
 *   b2g1: string,
 *   b1g50: string,
 *   hoodieSweatpants50: string,
 *   spendSavePercent: string,
 *   spendSaveFixed: string,
 * }} PromoMessages
 *
 * @typedef {{
 *   hoodieCollectionIds: string[],
 *   sweatpantsCollectionIds: string[],
 *   hoodieBundlePrice: number,
 *   promoType: PromoType,
 *   messages: PromoMessages,
 * }} ParsedConfig
 */

/**
 * One sellable unit expanded from a cart line.
 * @typedef {{
 *   unitId: string,
 *   lineId: string,
 *   unitPriceCents: number,
 *   isHoodie: boolean,
 *   isSweatpants: boolean,
 * }} Unit
 */

/**
 * Discount applied to a specific unit (later aggregated per line).
 * @typedef {{
 *   unitId: string,
 *   lineId: string,
 *   discountCents: number,
 *   message: string,
 * }} UnitDiscount
 */

/** Spend & save tiers keyed by presentment currency family */
const SPEND_SAVE_PERCENT_TIERS = {
  AUD: [
    { minCents: 7500, pct: 20 },
    { minCents: 15000, pct: 25 },
    { minCents: 20000, pct: 30 },
  ],
  USD: [
    { minCents: 5000, pct: 20 },
    { minCents: 10000, pct: 25 },
    { minCents: 15000, pct: 30 },
  ],
  GBP: [
    { minCents: 4000, pct: 20 },
    { minCents: 7500, pct: 25 },
    { minCents: 10000, pct: 30 },
  ],
};

const SPEND_SAVE_FIXED_TIERS = {
  AUD: [
    { minCents: 7500, offCents: 1500 },
    { minCents: 15000, offCents: 4000 },
    { minCents: 20000, offCents: 6000 },
  ],
  USD: [
    { minCents: 5000, offCents: 1000 },
    { minCents: 10000, offCents: 2500 },
    { minCents: 15000, offCents: 4500 },
  ],
  GBP: [
    { minCents: 4000, offCents: 1000 },
    { minCents: 7500, offCents: 2000 },
    { minCents: 10000, offCents: 3000 },
  ],
};

/**
 * @param {RunInput} input
 * @returns {CartLinesDiscountsGenerateRunResult}
 */
export function cartLinesDiscountsGenerateRun(input) {
  const classes = input.discount.discountClasses || [];
  const hasProduct = classes.includes(DiscountClass.Product);
  const hasOrder = classes.includes(DiscountClass.Order);

  if ((!hasProduct && !hasOrder) || !input.cart.lines.length) {
    return { operations: [] };
  }

  const config = parseConfig(input.discount.metafield?.jsonValue);
  if (!config) {
    return { operations: [] };
  }

  const presentmentRate = parsePresentmentCurrencyRate(input.presentmentCurrencyRate);
  const currencyCode = resolveCurrencyCode(input);
  const hoodieBundlePriceCents = resolveHoodieBundlePriceCents(
    config.hoodieBundlePrice,
    presentmentRate,
  );

  const units = expandUnits(input.cart.lines);
  if (!units.length) {
    return { operations: [] };
  }

  /** @type {UnitDiscount[]} */
  let productUnitDiscounts = [];
  /** @type {{ amountCents: number, message: string } | null} */
  let orderDiscount = null;

  switch (config.promoType) {
    case 'none':
      productUnitDiscounts = applyHoodieBundlesOnly(units, hoodieBundlePriceCents, config);
      break;

    case 'b2g1':
      productUnitDiscounts = applyBestOfBundlesAndB2G1(units, hoodieBundlePriceCents, config);
      break;

    case 'b1g50':
      productUnitDiscounts = applyBestOfBundlesAndB1G50(units, hoodieBundlePriceCents, config);
      break;

    case 'hoodie_sweatpants_50':
      productUnitDiscounts = applyBestOfBundlesAndHoodieSweatpants(
        units,
        hoodieBundlePriceCents,
        config,
      );
      break;

    case 'spend_save_percent':
    case 'spend_save_fixed': {
      // Hoodie bundles first as product discounts; their discounted prices feed spend thresholds.
      productUnitDiscounts = applyHoodieBundlesOnly(units, hoodieBundlePriceCents, config);
      if (hasOrder) {
        orderDiscount = computeSpendSaveOrderDiscount(
          units,
          productUnitDiscounts,
          config.promoType,
          currencyCode,
          config,
        );
      }
      break;
    }

    default:
      productUnitDiscounts = applyHoodieBundlesOnly(units, hoodieBundlePriceCents, config);
      break;
  }

  /** @type {CartLinesDiscountsGenerateRunResult['operations']} */
  const operations = [];

  if (hasProduct && productUnitDiscounts.length) {
    const candidates = aggregateProductCandidates(productUnitDiscounts);
    if (candidates.length) {
      operations.push({
        productDiscountsAdd: {
          candidates,
          selectionStrategy: ProductDiscountSelectionStrategy.All,
        },
      });
    }
  }

  if (hasOrder && orderDiscount && orderDiscount.amountCents > 0) {
    operations.push({
      orderDiscountsAdd: {
        candidates: [
          {
            message: orderDiscount.message,
            targets: [{ orderSubtotal: { excludedCartLineIds: [] } }],
            value: {
              fixedAmount: {
                amount: (orderDiscount.amountCents / 100).toFixed(2),
              },
            },
          },
        ],
        selectionStrategy: OrderDiscountSelectionStrategy.First,
      },
    });
  }

  return { operations };
}

// ---------------------------------------------------------------------------
// Config / money helpers
// ---------------------------------------------------------------------------

/**
 * @param {unknown} jsonValue
 * @returns {ParsedConfig | null}
 */
function parseConfig(jsonValue) {
  if (!jsonValue || typeof jsonValue !== 'object') {
    return null;
  }

  const raw = /** @type {Record<string, unknown>} */ (jsonValue);

  const hoodieCollectionIds = normalizeIdList(
    raw.hoodieCollectionIds ?? raw.collectionIds ?? raw.collectionId,
  );
  // Bundle still requires a hoodie collection; other promos may run without it.
  const sweatpantsCollectionIds = normalizeIdList(raw.sweatpantsCollectionIds);

  const promoType = normalizePromoType(raw.promoType);
  const hoodieBundlePrice = Number(raw.hoodieBundlePrice ?? raw.bundlePrice ?? 100);
  if (!Number.isFinite(hoodieBundlePrice) || hoodieBundlePrice <= 0) {
    return null;
  }

  return {
    hoodieCollectionIds,
    sweatpantsCollectionIds,
    hoodieBundlePrice,
    promoType,
    messages: parseMessages(raw),
  };
}

/**
 * Prefer nested `messages` object; fall back to legacy single-title fields.
 * @param {Record<string, unknown>} raw
 * @returns {PromoMessages}
 */
function parseMessages(raw) {
  const nested =
    raw.messages && typeof raw.messages === 'object'
      ? /** @type {Record<string, unknown>} */ (raw.messages)
      : {};

  const str = (value, fallback) =>
    typeof value === 'string' && value.trim() ? value.trim() : fallback;

  return {
    hoodieBundle: str(
      nested.hoodieBundle ?? raw.hoodieBundleTitle ?? raw.discountTitle,
      'Hoodie Bundle 2 for $100',
    ),
    b2g1: str(nested.b2g1 ?? raw.discountTitle, 'Buy 2 Get 1 Free'),
    b1g50: str(nested.b1g50 ?? raw.discountTitle, 'Buy 1 Get 1 50% Off'),
    hoodieSweatpants50: str(
      nested.hoodieSweatpants50 ?? raw.discountTitle,
      '50% off sweatpants with hoodie',
    ),
    spendSavePercent: str(nested.spendSavePercent ?? raw.discountTitle, ''),
    spendSaveFixed: str(nested.spendSaveFixed ?? raw.discountTitle, ''),
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
    return [value];
  }
  return [];
}

/**
 * @param {unknown} value
 * @returns {PromoType}
 */
function normalizePromoType(value) {
  const v = typeof value === 'string' ? value.trim().toLowerCase() : 'none';
  const allowed = new Set([
    'none',
    'b2g1',
    'spend_save_percent',
    'spend_save_fixed',
    'b1g50',
    'hoodie_sweatpants_50',
  ]);
  return allowed.has(v) ? /** @type {PromoType} */ (v) : 'none';
}

/**
 * @param {unknown} value
 * @returns {number}
 */
function parsePresentmentCurrencyRate(value) {
  const rate = parseFloat(String(value ?? '1'));
  return Number.isFinite(rate) && rate > 0 ? rate : 1;
}

/**
 * Bundle price is configured in shop currency (single price). Convert with presentment rate.
 * @param {number} shopAmount
 * @param {number} presentmentRate
 * @returns {number}
 */
function resolveHoodieBundlePriceCents(shopAmount, presentmentRate) {
  return Math.round(shopAmount * 100 * presentmentRate);
}

/**
 * @param {RunInput} input
 * @returns {string}
 */
function resolveCurrencyCode(input) {
  const fromCost = input.cart?.cost?.subtotalAmount?.currencyCode;
  if (typeof fromCost === 'string' && fromCost) {
    return fromCost.toUpperCase();
  }
  for (const line of input.cart.lines) {
    const code = line.cost?.amountPerQuantity?.currencyCode;
    if (typeof code === 'string' && code) {
      return code.toUpperCase();
    }
  }
  const country = input.localization?.country?.isoCode;
  if (country === 'AU') return 'AUD';
  if (country === 'GB' || country === 'UK') return 'GBP';
  if (country === 'US') return 'USD';
  return 'AUD';
}

/**
 * @param {unknown} value
 * @returns {number | null}
 */
function moneyToCents(value) {
  const amount = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
  if (!Number.isFinite(amount)) return null;
  return Math.round(amount * 100);
}

// ---------------------------------------------------------------------------
// Unit expansion
// ---------------------------------------------------------------------------

/**
 * Expand cart lines into individual units. Skip lines marked `_hoodie_bundle_exclude`.
 * @param {RunInput['cart']['lines']} lines
 * @returns {Unit[]}
 */
function expandUnits(lines) {
  /** @type {Unit[]} */
  const units = [];
  let seq = 0;

  for (const line of lines) {
    if (line.merchandise.__typename !== 'ProductVariant') continue;
    if (line.excludeAttribute?.value) continue;

    const unitPriceCents = moneyToCents(line.cost.amountPerQuantity.amount);
    if (unitPriceCents == null || unitPriceCents <= 0) continue;

    const isHoodie = Boolean(line.merchandise.product?.inHoodieCollection);
    const isSweatpants = Boolean(line.merchandise.product?.inSweatpantsCollection);

    for (let i = 0; i < line.quantity; i += 1) {
      units.push({
        unitId: `${line.id}#${seq++}`,
        lineId: line.id,
        unitPriceCents,
        isHoodie,
        isSweatpants,
      });
    }
  }

  return units;
}

// ---------------------------------------------------------------------------
// Hoodie bundles (cheapest-first pairing)
// ---------------------------------------------------------------------------

/**
 * Pair cheapest hoodies first into groups of 2 at bundle price.
 * @param {Unit[]} units
 * @param {number} bundlePriceCents
 * @param {ParsedConfig} config
 * @returns {UnitDiscount[]}
 */
function applyHoodieBundlesOnly(units, bundlePriceCents, config) {
  const hoodies = units
    .filter((u) => u.isHoodie)
    .slice()
    .sort((a, b) => a.unitPriceCents - b.unitPriceCents);

  /** @type {UnitDiscount[]} */
  const discounts = [];
  const title = config.messages.hoodieBundle;

  for (let i = 0; i + 1 < hoodies.length; i += 2) {
    const pair = [hoodies[i], hoodies[i + 1]];
    const prices = pair.map((u) => u.unitPriceCents);
    const disc = proportionalDiscountCents(prices, bundlePriceCents);
    pair.forEach((unit, idx) => {
      if (disc[idx] > 0) {
        discounts.push({
          unitId: unit.unitId,
          lineId: unit.lineId,
          discountCents: disc[idx],
          message: title,
        });
      }
    });
  }

  return discounts;
}

/**
 * @param {number[]} unitPricesCents
 * @param {number} bundlePriceCents
 * @returns {number[]}
 */
function proportionalDiscountCents(unitPricesCents, bundlePriceCents) {
  const subtotal = unitPricesCents.reduce((s, v) => s + v, 0);
  const totalDiscount = subtotal - bundlePriceCents;
  if (totalDiscount <= 0) {
    return unitPricesCents.map(() => 0);
  }

  const discounts = unitPricesCents.map((p) =>
    Math.floor((totalDiscount * p) / subtotal),
  );
  const assigned = discounts.reduce((s, v) => s + v, 0);
  const remainder = totalDiscount - assigned;
  if (remainder > 0) {
    const highestIndex = unitPricesCents.indexOf(Math.max(...unitPricesCents));
    discounts[highestIndex] += remainder;
  }
  return discounts;
}

// ---------------------------------------------------------------------------
// B2G1 Free — compete with hoodie bundles for best customer value
// ---------------------------------------------------------------------------

/**
 * Compare pure hoodie-bundle plan vs plans that leave some/all hoodies for B2G1.
 * Greedy: sort all units cheapest-first for free slots; paid slots are the rest.
 * Hoodie pairs and B2G1 triples are mutually exclusive per unit.
 *
 * Strategy:
 * 1. Compute discount if we maximise hoodie pairs first, then B2G1 on remaining.
 * 2. Compute discount if we maximise B2G1 first (cheapest free), then hoodie pairs on remaining hoodies.
 * 3. Pick the plan with higher total discount cents.
 *
 * @param {Unit[]} units
 * @param {number} bundlePriceCents
 * @param {ParsedConfig} config
 * @returns {UnitDiscount[]}
 */
function applyBestOfBundlesAndB2G1(units, bundlePriceCents, config) {
  const planBundlesFirst = planBundlesThenB2G1(units, bundlePriceCents, config);
  const planB2G1First = planB2G1ThenBundles(units, bundlePriceCents, config);

  const total = (plan) => plan.reduce((s, d) => s + d.discountCents, 0);
  return total(planB2G1First) > total(planBundlesFirst) ? planB2G1First : planBundlesFirst;
}

/**
 * @param {Unit[]} units
 * @param {number} bundlePriceCents
 * @param {ParsedConfig} config
 * @returns {UnitDiscount[]}
 */
function planBundlesThenB2G1(units, bundlePriceCents, config) {
  const bundleDiscounts = applyHoodieBundlesOnly(units, bundlePriceCents, config);
  const bundledIds = new Set(bundleDiscounts.map((d) => d.unitId));
  const remaining = units.filter((u) => !bundledIds.has(u.unitId));
  const b2g1 = applyB2G1(remaining, config);
  return [...bundleDiscounts, ...b2g1];
}

/**
 * @param {Unit[]} units
 * @param {number} bundlePriceCents
 * @param {ParsedConfig} config
 * @returns {UnitDiscount[]}
 */
function planB2G1ThenBundles(units, bundlePriceCents, config) {
  const b2g1 = applyB2G1(units, config);
  const usedIds = new Set(b2g1.map((d) => d.unitId));
  // B2G1 also "uses" the two paid units in each group — track them via grouping logic below.
  // applyB2G1 only returns discounts for free units; we need the paid units marked used too.
  const freeIds = new Set(b2g1.map((d) => d.unitId));
  const sorted = units.slice().sort((a, b) => a.unitPriceCents - b.unitPriceCents);
  /** @type {Set<string>} */
  const allUsed = new Set(freeIds);
  // Reconstruct groups: cheapest free with next two paid (by sort order after removing frees).
  // Simpler: re-run grouping and mark all three.
  markB2G1UsedUnits(sorted, allUsed);

  const remainingHoodies = units.filter(
    (u) => u.isHoodie && !allUsed.has(u.unitId),
  );
  const bundleDiscounts = applyHoodieBundlesOnly(remainingHoodies, bundlePriceCents, config);
  return [...bundleDiscounts, ...b2g1];
}

/**
 * Buy 2 Get 1 Free: groups of 3, cheapest unit in each group is free (100% off).
 * Multiple groups. Units sorted cheapest-first; free slots take cheapest available.
 *
 * Classic "cheapest free": sort ascending, for every 3 units the first of each
 * group of 3 (cheapest) is free when we walk groups of [free, paid, paid] from
 * the sorted list... Actually standard is: sort descending by price for paid,
 * free the cheapest overall per group. Spec: "The cheapest paid product that is
 * not already in a group should receive the discount" — meaning the free item
 * is the cheapest not-yet-grouped.
 *
 * Implementation: sort all units by price ascending. While >= 3 remain, take
 * the cheapest as free and the next two (any) as paid group members.
 *
 * @param {Unit[]} units
 * @param {ParsedConfig} config
 * @returns {UnitDiscount[]}
 */
function applyB2G1(units, config) {
  const sorted = units.slice().sort((a, b) => a.unitPriceCents - b.unitPriceCents);
  /** @type {UnitDiscount[]} */
  const discounts = [];
  const message = config.messages.b2g1;

  let i = 0;
  while (i + 2 < sorted.length) {
    const freeUnit = sorted[i];
    // paid: sorted[i+1], sorted[i+2]
    discounts.push({
      unitId: freeUnit.unitId,
      lineId: freeUnit.lineId,
      discountCents: freeUnit.unitPriceCents,
      message,
    });
    i += 3;
  }

  return discounts;
}

/**
 * Mark all units consumed by B2G1 groups (free + 2 paid).
 * @param {Unit[]} sortedAsc
 * @param {Set<string>} used
 */
function markB2G1UsedUnits(sortedAsc, used) {
  let i = 0;
  while (i + 2 < sortedAsc.length) {
    used.add(sortedAsc[i].unitId);
    used.add(sortedAsc[i + 1].unitId);
    used.add(sortedAsc[i + 2].unitId);
    i += 3;
  }
}

// ---------------------------------------------------------------------------
// B1G1 50% off — compete with hoodie bundles
// ---------------------------------------------------------------------------

/**
 * Any paid product can qualify another for 50% off (cheapest ungrouped receives 50%).
 * Multiple pairs. Hoodie bundles compete — pick higher total discount.
 *
 * @param {Unit[]} units
 * @param {number} bundlePriceCents
 * @param {ParsedConfig} config
 * @returns {UnitDiscount[]}
 */
function applyBestOfBundlesAndB1G50(units, bundlePriceCents, config) {
  const planBundlesFirst = planBundlesThenB1G50(units, bundlePriceCents, config);
  const planB1G50First = planB1G50ThenBundles(units, bundlePriceCents, config);

  const total = (plan) => plan.reduce((s, d) => s + d.discountCents, 0);
  return total(planB1G50First) > total(planBundlesFirst) ? planB1G50First : planBundlesFirst;
}

/**
 * @param {Unit[]} units
 * @param {number} bundlePriceCents
 * @param {ParsedConfig} config
 * @returns {UnitDiscount[]}
 */
function planBundlesThenB1G50(units, bundlePriceCents, config) {
  const bundleDiscounts = applyHoodieBundlesOnly(units, bundlePriceCents, config);
  const bundledIds = new Set(bundleDiscounts.map((d) => d.unitId));
  const remaining = units.filter((u) => !bundledIds.has(u.unitId));
  const b1g50 = applyB1G50(remaining, config);
  return [...bundleDiscounts, ...b1g50];
}

/**
 * @param {Unit[]} units
 * @param {number} bundlePriceCents
 * @param {ParsedConfig} config
 * @returns {UnitDiscount[]}
 */
function planB1G50ThenBundles(units, bundlePriceCents, config) {
  const b1g50 = applyB1G50(units, config);
  const used = new Set();
  markB1G50UsedUnits(units, used);
  const remainingHoodies = units.filter((u) => u.isHoodie && !used.has(u.unitId));
  const bundleDiscounts = applyHoodieBundlesOnly(remainingHoodies, bundlePriceCents, config);
  return [...bundleDiscounts, ...b1g50];
}

/**
 * Pair units: each pair has one full-price qualifier and one 50% off (cheapest available).
 * Sort ascending; free/half slots are cheapest: for every 2 units, cheaper gets 50%.
 *
 * @param {Unit[]} units
 * @param {ParsedConfig} config
 * @returns {UnitDiscount[]}
 */
function applyB1G50(units, config) {
  const sorted = units.slice().sort((a, b) => a.unitPriceCents - b.unitPriceCents);
  /** @type {UnitDiscount[]} */
  const discounts = [];
  const message = config.messages.b1g50;

  let i = 0;
  while (i + 1 < sorted.length) {
    const halfUnit = sorted[i]; // cheapest gets 50%
    // qualifier = sorted[i+1]
    const halfOff = Math.floor(halfUnit.unitPriceCents / 2);
    if (halfOff > 0) {
      discounts.push({
        unitId: halfUnit.unitId,
        lineId: halfUnit.lineId,
        discountCents: halfOff,
        message,
      });
    }
    i += 2;
  }

  return discounts;
}

/**
 * @param {Unit[]} units
 * @param {Set<string>} used
 */
function markB1G50UsedUnits(units, used) {
  const sorted = units.slice().sort((a, b) => a.unitPriceCents - b.unitPriceCents);
  let i = 0;
  while (i + 1 < sorted.length) {
    used.add(sorted[i].unitId);
    used.add(sorted[i + 1].unitId);
    i += 2;
  }
}

// ---------------------------------------------------------------------------
// Buy 1 full-price hoodie → 50% off cheapest sweatpants
// ---------------------------------------------------------------------------

/**
 * Full-price (non-bundled) hoodie qualifies cheapest ungrouped sweatpants for 50% off.
 * Compete with pure hoodie bundles: if bundling two hoodies is better than using
 * them as qualifiers for sweatpants, prefer bundles.
 *
 * @param {Unit[]} units
 * @param {number} bundlePriceCents
 * @param {ParsedConfig} config
 * @returns {UnitDiscount[]}
 */
function applyBestOfBundlesAndHoodieSweatpants(units, bundlePriceCents, config) {
  const planBundlesFirst = planBundlesThenHoodieSweatpants(units, bundlePriceCents, config);
  const planSweatFirst = planHoodieSweatpantsThenBundles(units, bundlePriceCents, config);

  const total = (plan) => plan.reduce((s, d) => s + d.discountCents, 0);
  return total(planSweatFirst) > total(planBundlesFirst) ? planSweatFirst : planBundlesFirst;
}

/**
 * @param {Unit[]} units
 * @param {number} bundlePriceCents
 * @param {ParsedConfig} config
 * @returns {UnitDiscount[]}
 */
function planBundlesThenHoodieSweatpants(units, bundlePriceCents, config) {
  const bundleDiscounts = applyHoodieBundlesOnly(units, bundlePriceCents, config);
  const bundledIds = new Set(bundleDiscounts.map((d) => d.unitId));
  const remaining = units.filter((u) => !bundledIds.has(u.unitId));
  const hs = applyHoodieSweatpants50(remaining, config);
  return [...bundleDiscounts, ...hs];
}

/**
 * Prefer maximising hoodie→sweatpants pairs, then bundle leftover hoodies.
 * @param {Unit[]} units
 * @param {number} bundlePriceCents
 * @param {ParsedConfig} config
 * @returns {UnitDiscount[]}
 */
function planHoodieSweatpantsThenBundles(units, bundlePriceCents, config) {
  const hs = applyHoodieSweatpants50(units, config);
  const usedHoodieIds = new Set();
  const usedSweatIds = new Set(hs.map((d) => d.unitId));

  // Reconstruct which hoodies were used as qualifiers (one per sweatpants discount).
  const hoodies = units
    .filter((u) => u.isHoodie)
    .slice()
    .sort((a, b) => a.unitPriceCents - b.unitPriceCents);
  const sweatCount = hs.length;
  for (let i = 0; i < sweatCount && i < hoodies.length; i += 1) {
    usedHoodieIds.add(hoodies[i].unitId);
  }

  const remainingHoodies = units.filter(
    (u) => u.isHoodie && !usedHoodieIds.has(u.unitId) && !usedSweatIds.has(u.unitId),
  );
  const bundleDiscounts = applyHoodieBundlesOnly(remainingHoodies, bundlePriceCents, config);
  return [...bundleDiscounts, ...hs];
}

/**
 * Each full-price hoodie can qualify the cheapest remaining sweatpants for 50% off.
 * @param {Unit[]} units
 * @param {ParsedConfig} config
 * @returns {UnitDiscount[]}
 */
function applyHoodieSweatpants50(units, config) {
  const hoodies = units
    .filter((u) => u.isHoodie)
    .slice()
    .sort((a, b) => a.unitPriceCents - b.unitPriceCents);
  const sweatpants = units
    .filter((u) => u.isSweatpants)
    .slice()
    .sort((a, b) => a.unitPriceCents - b.unitPriceCents);

  /** @type {UnitDiscount[]} */
  const discounts = [];
  const message = config.messages.hoodieSweatpants50;

  const pairs = Math.min(hoodies.length, sweatpants.length);
  for (let i = 0; i < pairs; i += 1) {
    const sweat = sweatpants[i];
    const halfOff = Math.floor(sweat.unitPriceCents / 2);
    if (halfOff > 0) {
      discounts.push({
        unitId: sweat.unitId,
        lineId: sweat.lineId,
        discountCents: halfOff,
        message,
      });
    }
  }

  return discounts;
}

// ---------------------------------------------------------------------------
// Spend & Save (order-level after hoodie product discounts)
// ---------------------------------------------------------------------------

/**
 * Hoodie bundles already applied as product discounts. Compute cart spend using
 * discounted prices for bundled units, full prices otherwise. Apply tier.
 *
 * @param {Unit[]} units
 * @param {UnitDiscount[]} productDiscounts
 * @param {'spend_save_percent' | 'spend_save_fixed'} promoType
 * @param {string} currencyCode
 * @param {ParsedConfig} config
 * @returns {{ amountCents: number, message: string } | null}
 */
function computeSpendSaveOrderDiscount(
  units,
  productDiscounts,
  promoType,
  currencyCode,
  config,
) {
  const discountByUnit = new Map();
  for (const d of productDiscounts) {
    discountByUnit.set(d.unitId, (discountByUnit.get(d.unitId) || 0) + d.discountCents);
  }

  let spendCents = 0;
  for (const u of units) {
    const disc = discountByUnit.get(u.unitId) || 0;
    spendCents += Math.max(0, u.unitPriceCents - disc);
  }

  const family = currencyFamily(currencyCode);
  if (promoType === 'spend_save_percent') {
    const tiers = SPEND_SAVE_PERCENT_TIERS[family] || SPEND_SAVE_PERCENT_TIERS.AUD;
    let bestPct = 0;
    for (const tier of tiers) {
      if (spendCents >= tier.minCents) bestPct = tier.pct;
    }
    if (bestPct <= 0) return null;
    const amountCents = Math.floor((spendCents * bestPct) / 100);
    return {
      amountCents,
      message: config.messages.spendSavePercent || `${bestPct}% off`,
    };
  }

  const tiers = SPEND_SAVE_FIXED_TIERS[family] || SPEND_SAVE_FIXED_TIERS.AUD;
  let bestOff = 0;
  for (const tier of tiers) {
    if (spendCents >= tier.minCents) bestOff = tier.offCents;
  }
  if (bestOff <= 0) return null;
  return {
    amountCents: bestOff,
    message: config.messages.spendSaveFixed || `$${(bestOff / 100).toFixed(0)} off`,
  };
}

/**
 * @param {string} code
 * @returns {'AUD' | 'USD' | 'GBP'}
 */
function currencyFamily(code) {
  const c = (code || '').toUpperCase();
  if (c === 'USD' || c === 'CAD' || c === 'NZD') return 'USD';
  if (c === 'GBP' || c === 'EUR') return 'GBP';
  return 'AUD';
}

// ---------------------------------------------------------------------------
// Aggregate unit discounts → product discount candidates (per line)
// ---------------------------------------------------------------------------

/**
 * One candidate per (lineId, message) with summed fixed amount and quantity.
 * @param {UnitDiscount[]} unitDiscounts
 * @returns {Array<{
 *   message?: string,
 *   targets: Array<{ cartLine: { id: string, quantity: number } }>,
 *   value: { fixedAmount: { amount: string, appliesToEachItem: boolean } },
 * }>}
 */
function aggregateProductCandidates(unitDiscounts) {
  /** @type {Map<string, { lineId: string, message: string, qty: number, totalCents: number }>} */
  const buckets = new Map();

  for (const d of unitDiscounts) {
    if (d.discountCents <= 0) continue;
    const key = `${d.lineId}::${d.message}`;
    const bucket = buckets.get(key) ?? {
      lineId: d.lineId,
      message: d.message,
      qty: 0,
      totalCents: 0,
    };
    bucket.qty += 1;
    bucket.totalCents += d.discountCents;
    buckets.set(key, bucket);
  }

  return [...buckets.values()].map((b) => ({
    ...(b.message ? { message: b.message } : {}),
    targets: [
      {
        cartLine: {
          id: b.lineId,
          quantity: b.qty,
        },
      },
    ],
    value: {
      fixedAmount: {
        amount: (b.totalCents / 100).toFixed(2),
        appliesToEachItem: false,
      },
    },
  }));
}
