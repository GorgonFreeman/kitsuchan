import { resolveMarketBundlePresentmentCents } from './marketCurrency.js';

/**
  * @typedef {{
  *   unitId?: string,
  *   lineId: string,
  *   unitPriceCents: number,
  * }} BundleUnit
  *
  * @typedef {BundleUnit[]} Pair
  *
  * @typedef {{
  *   pricingMode: 'single' | 'markets',
  *   shopCurrencyCode?: string,
  *   markets?: Record<string, { enabled?: boolean, bundlePrice?: unknown, currencyCode?: string }>,
  *   bundlePrice?: unknown,
  * }} BundlePricingConfig
  */

/**
  * Determine which units form collection-pair bundles.
  * Sorts cheapest-first, then groups into tuples of `itemCount`.
  * Leftover units (not enough for another full group) are omitted.
  *
  * Used by collection-pair-discount to apply pair discounts, and by
  * bundle-aware functions to exclude paired units from other discounts.
  *
  * @param {BundleUnit[]} units Bundle-eligible units (already filtered)
  * @param {number} itemCount Units per bundle (typically 2)
  * @returns {Pair[]} Array of tuples (each tuple length === itemCount)
  */
export function getPairs(units, itemCount) {
  if (!units.length || !Number.isFinite(itemCount) || itemCount < 2) {
    return [];
  }

  const size = Math.floor(itemCount);
  const sorted = units
    .slice()
    .sort((left, right) => left.unitPriceCents - right.unitPriceCents);

  /** @type {Pair[]} */
  const pairs = [];
  for (let i = 0; i + size <= sorted.length; i += size) {
    pairs.push(sorted.slice(i, i + size));
  }

  return pairs;
}

/**
  * Speculative cart spend assuming pair discounts have applied.
  * Each pair contributes its post-discount total (proportional split to
  * `bundlePriceCents`); unpaired units in `units` contribute full price.
  *
  * @param {BundleUnit[]} units Full cart units that should count toward spend
  * @param {Pair[]} pairs From getPairs
  * @param {number} bundlePriceCents Presentment-currency cents per pair group
  * @returns {number} Presentment-currency cents
  */
export function getPostPairsSubtotal(units, pairs, bundlePriceCents) {
  /** @type {Set<string>} */
  const pairedUnitIds = new Set();
  let totalCents = 0;

  for (const pair of pairs) {
    const pricesCents = pair.map((unit) => unit.unitPriceCents);
    const discountsCents = Number.isFinite(bundlePriceCents) && bundlePriceCents > 0
      ? proportionalDiscountCents(pricesCents, bundlePriceCents)
      : pricesCents.map(() => 0);

    pair.forEach((unit, index) => {
      pairedUnitIds.add(unitIdOf(unit));
      totalCents += Math.max(0, pricesCents[ index ] - (discountsCents[ index ] || 0));
    });
  }

  for (const unit of units) {
    if (pairedUnitIds.has(unitIdOf(unit))) {
      continue;
    }
    totalCents += unit.unitPriceCents;
  }

  return totalCents;
}

/**
  * Flat set of unitIds covered by pairs (for exclusion checks).
  * @param {Pair[]} pairs
  * @returns {Set<string>}
  */
export function pairedUnitIdSet(pairs) {
  /** @type {Set<string>} */
  const ids = new Set();
  for (const pair of pairs) {
    for (const unit of pair) {
      ids.add(unitIdOf(unit));
    }
  }
  return ids;
}

/**
  * Aggregate fixed-amount discount buckets per cart line from pairs.
  * @param {Pair[]} pairs
  * @param {number} bundlePriceCents
  * @returns {Map<string, { discountedQty: number, totalDiscountCents: number }>}
  */
export function lineDiscountBucketsFromPairs(pairs, bundlePriceCents) {
  /** @type {Map<string, { discountedQty: number, totalDiscountCents: number }>} */
  const lineBuckets = new Map();

  if (!Number.isFinite(bundlePriceCents) || bundlePriceCents <= 0) {
    return lineBuckets;
  }

  for (const pair of pairs) {
    const pricesCents = pair.map((unit) => unit.unitPriceCents);
    const discountsCents = proportionalDiscountCents(pricesCents, bundlePriceCents);

    pair.forEach((unit, index) => {
      const discountCents = discountsCents[ index ] || 0;
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

  return lineBuckets;
}

/**
  * @param {number[]} unitPricesCents
  * @param {number} bundlePriceCents
  * @returns {number[]}
  */
export function proportionalDiscountCents(unitPricesCents, bundlePriceCents) {
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
  * @param {{
  *   config: BundlePricingConfig,
  *   marketId: string | null,
  *   presentmentCurrencyRate: number,
  *   cartCurrencyCode: string,
  *   shopCurrencyCode: string,
  *   conversionRates: Record<string, number>,
  * }} input
  * @returns {number | null}
  */
export function resolveBundlePriceCents(input) {
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

  const markets = config.markets ?? {};
  if (!marketId || !markets[ marketId ]) {
    return null;
  }

  const entry = markets[ marketId ];
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
export function parsePresentmentCurrencyRate(value) {
  const rate = parseFloat(String(value ?? '1'));
  if (!Number.isFinite(rate) || rate <= 0) {
    return 1;
  }

  return rate;
}

/**
  * @param {unknown} value
  * @returns {number | null}
  */
export function moneyToCents(value) {
  const amount = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
  if (!Number.isFinite(amount)) {
    return null;
  }

  return Math.round(amount * 100);
}

/**
  * @param {BundleUnit} unit
  * @returns {string}
  */
function unitIdOf(unit) {
  if (typeof unit.unitId === 'string' && unit.unitId.length > 0) {
    return unit.unitId;
  }

  return unit.lineId;
}
