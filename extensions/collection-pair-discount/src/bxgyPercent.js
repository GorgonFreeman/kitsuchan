/**
  * Midway BxGy grouping shared by bundle-aware promo functions.
  *
  * Count how many full groups fit, then assign discount slots from cheapest
  * eligible upwards. Paid qualifiers are the next-cheapest remaining qualify
  * units — the most expensive units can sit outside any group.
  *
  * Example B2G1 with 7 units: floor(7/3)=2 free → 2 cheapest discounted;
  * next 4 are paid; 1 dearest leftover is not in a group.
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

  /** @type {UnitDiscount[]} */
  const discounts = [];
  for (const unit of eligibleSorted.slice(0, groupCount)) {
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
    if (d.discountCents <= 0) continue;
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
