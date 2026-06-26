/** @typedef {{ marketId: string, name: string, currencyCode: string, enabled: boolean, bundlePrice: number | string }} MarketRow */

/**
  * @param {unknown} rawValue
  */
export function parseMarketsFromConfig(rawValue) {
  if (rawValue == null || rawValue === '') {
    return { markets: {}, legacyBundlePrice: '' };
  }

  try {
    const parsed = typeof rawValue === 'string' ? JSON.parse(rawValue) : rawValue;
    const markets = parsed?.markets && typeof parsed.markets === 'object' ? parsed.markets : {};
    return {
      markets,
      legacyBundlePrice: parsed?.bundlePrice != null ? String(parsed.bundlePrice) : '',
    };
  } catch {
    return { markets: {}, legacyBundlePrice: '' };
  }
}

/**
  * @param {Array<{ id: string, name: string, currencyCode?: string }>} allMarkets
  * @param {Record<string, { enabled?: boolean, bundlePrice?: string | number }>} savedMarkets
  * @param {string} legacyBundlePrice
  * @returns {MarketRow[]}
  */
export function buildMarketRows(allMarkets, savedMarkets, legacyBundlePrice = '') {
  const hasSavedMarkets = Object.keys(savedMarkets ?? {}).length > 0;

  return allMarkets.map((market) => {
    const saved = savedMarkets?.[ market.id ];

    if (hasSavedMarkets) {
      return {
        marketId: market.id,
        name: market.name,
        currencyCode: market.currencyCode ?? '',
        enabled: saved?.enabled === true,
        bundlePrice: saved?.bundlePrice != null ? saved.bundlePrice : '',
      };
    }

    return {
      marketId: market.id,
      name: market.name,
      currencyCode: market.currencyCode ?? '',
      enabled: Boolean(legacyBundlePrice),
      bundlePrice: legacyBundlePrice || '',
    };
  });
}

/**
  * @param {MarketRow[]} marketRows
  */
export function serializeMarketsConfig(marketRows) {
  /** @type {Record<string, { enabled: boolean, bundlePrice?: string }>} */
  const markets = {};

  for (const row of marketRows) {
    const entry = { enabled: row.enabled === true };
    if (entry.enabled) {
      const amount = typeof row.bundlePrice === 'number'
        ? row.bundlePrice
        : parseFloat(String(row.bundlePrice ?? ''));

      if (Number.isFinite(amount) && amount > 0) {
        entry.bundlePrice = amount.toFixed(2);
      }
    }

    markets[ row.marketId ] = entry;
  }

  return markets;
}

/**
  * @param {MarketRow[]} marketRows
  */
export function usesSinglePrice(marketRows) {
  return !marketRows?.length;
}

/**
  * @param {number | string} bundlePrice
  */
export function validateSinglePrice(bundlePrice) {
  const amount = typeof bundlePrice === 'number'
    ? bundlePrice
    : parseFloat(String(bundlePrice ?? ''));

  if (!Number.isFinite(amount) || amount <= 0) {
    return 'Bundle price must be greater than zero';
  }

  return null;
}

/**
  * @param {MarketRow[]} marketRows
  * @param {number | string} [bundlePrice]
  */
export function validatePricingConfig(marketRows, bundlePrice) {
  if (usesSinglePrice(marketRows)) {
    return validateSinglePrice(bundlePrice);
  }

  return validateMarketRows(marketRows);
}

/**
  * @param {{
  *   collectionIds: string[],
  *   itemCount?: number,
  *   discountTitle?: string,
  *   marketRows?: MarketRow[],
  *   bundlePrice?: number | string,
  * }} input
  */
export function buildFunctionConfiguration(input) {
  const payload = {
    collectionIds: input.collectionIds,
    itemCount: input.itemCount ?? 2,
    discountTitle: input.discountTitle ?? '',
  };

  if (usesSinglePrice(input.marketRows ?? [])) {
    const amount = typeof input.bundlePrice === 'number'
      ? input.bundlePrice
      : parseFloat(String(input.bundlePrice ?? ''));

    return {
      ...payload,
      bundlePrice: amount.toFixed(2),
    };
  }

  return {
    ...payload,
    markets: serializeMarketsConfig(input.marketRows ?? []),
  };
}

/**
  * @param {MarketRow[]} marketRows
  */
export function validateMarketRows(marketRows) {
  const enabled = marketRows.filter((row) => row.enabled);
  if (!enabled.length) {
    return 'Enable at least one market';
  }

  for (const row of enabled) {
    const amount = typeof row.bundlePrice === 'number'
      ? row.bundlePrice
      : parseFloat(String(row.bundlePrice ?? ''));

    if (!Number.isFinite(amount) || amount <= 0) {
      return `Enter a bundle price for ${ row.name }`;
    }
  }

  return null;
}

/**
  * @param {Record<string, { enabled?: boolean, bundlePrice?: string }>} markets
  */
export function summarizeEnabledMarkets(markets) {
  return Object.entries(markets ?? {})
    .filter(([ , entry ]) => entry?.enabled && entry?.bundlePrice)
    .map(([ , entry ]) => entry.bundlePrice);
}
