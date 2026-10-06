/**
  * Midway BxGy grouping shared by bundle-aware promo functions.
  *
  * Count how many full groups fit, then assign discount slots from cheapest
  * eligible upwards. Paid qualifiers are the next-cheapest remaining qualify
  * units — the most expensive units can sit outside any group.
  *
  * All paid qualifier units in a group get a $0.00 vanity so this function claims
  * them and competes as one group against discount codes. Leftover units outside
  * any group are untouched.
  *
  * Example B2G1 with 7 units: floor(7/3)=2 free → 2 cheapest discounted;
  * next 4 are paid qualifiers (vanity); 1 dearest leftover is untouched.
  *
  * @typedef {{
  *   unitId: string,
  *   lineId: string,
  *   unitPriceCents: number,
  * }} BxGyUnit
  *
  * @typedef {{
  *   unitId: string,
  *   lineId: string,
  *   discountCents: number,
  *   message: string,
  * }} UnitDiscount
  */

export const VANITY_CENTS = 0;

/**
  * @param {BxGyUnit[]} units
  * @param {(u: BxGyUnit) => boolean} isQualify
  * @param {(u: BxGyUnit) => boolean} isEligible
  * @param {number} paidCount
  * @param {number} percent
  * @param {string} message
  * @returns {UnitDiscount[]}
  */
export function applyBxGyPercent(units, isQualify, isEligible, paidCount, percent, message) {
  if (paidCount < 1 || percent <= 0) return [];

  const byPriceAsc = (a, b) => a.unitPriceCents - b.unitPriceCents;

  const eligibleSorted = units.filter(isEligible).slice().sort(byPriceAsc);
  const qualifySorted = units.filter(isQualify).slice().sort(byPriceAsc);

  if (!eligibleSorted.length || qualifySorted.length < paidCount) return [];

  const poolSize = new Set(
    [ ...eligibleSorted, ...qualifySorted ].map((u) => u.unitId),
  ).size;
  const groupSize = paidCount + 1;
  const maxByPool = Math.floor(poolSize / groupSize);

  let groupCount = 0;
  for (let k = 1; k <= Math.min(eligibleSorted.length, maxByPool); k += 1) {
    const freeIds = new Set(eligibleSorted.slice(0, k).map((u) => u.unitId));
    const paidAvailable = qualifySorted.filter((u) => !freeIds.has(u.unitId)).length;
    if (paidAvailable < k * paidCount) break;
    groupCount = k;
  }

  if (groupCount <= 0) return [];

  const freeUnits = eligibleSorted.slice(0, groupCount);
  const freeIds = new Set(freeUnits.map((u) => u.unitId));
  const paidUnits = qualifySorted
    .filter((u) => !freeIds.has(u.unitId))
    .slice(0, groupCount * paidCount);

  /** @type {UnitDiscount[]} */
  const discounts = [];
  for (const unit of freeUnits) {
    const discountCents = Math.floor((unit.unitPriceCents * percent) / 100);
    if (discountCents > 0) {
      discounts.push({
        unitId: unit.unitId,
        lineId: unit.lineId,
        discountCents,
        message,
      });
    }
  }

  // Vanity on every paid qualifier unit in a group (not leftovers). Emit one per
  // unit so same-line free+paid (or multiple paid) merges to the right quantity.
  for (const unit of paidUnits) {
    discounts.push({
      unitId: `vanity:${ unit.unitId }`,
      lineId: unit.lineId,
      discountCents: VANITY_CENTS,
      message,
    });
  }

  return discounts;
}

/**
  * Aggregate unit discounts → product discount candidates (per line + message).
  *
  * @param {UnitDiscount[]} unitDiscounts
  * @returns {Array<{
  *   message?: string,
  *   targets: Array<{ cartLine: { id: string, quantity: number } }>,
  *   value: { fixedAmount: { amount: string, appliesToEachItem: boolean } },
  * }>}
  */
export function aggregateProductCandidates(unitDiscounts) {
  /** @type {Map<string, { lineId: string, message: string, qty: number, totalCents: number }>} */
  const buckets = new Map();

  for (const d of unitDiscounts) {
    // Allow $0.00 vanity; skip other non-positive amounts.
    if (d.discountCents < 0) continue;
    if (d.discountCents === 0 && !d.message) continue;
    const key = `${ d.lineId }::${ d.message }`;
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

  return [ ...buckets.values() ].map((b) => ({
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
