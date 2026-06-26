/** @typedef {{ marketId: string, name: string, currencyCode: string, enabled: boolean, bundlePrice: number | string }} MarketRow */

export const PRICING_MODE_SINGLE = 'single';
export const PRICING_MODE_MARKETS = 'markets';

/**
  * @param {unknown} parsed
  * @returns {'single' | 'markets'}
  */
export function inferPricingMode(parsed) {
  if (parsed?.pricingMode === PRICING_MODE_MARKETS) {
    return PRICING_MODE_MARKETS;
  }

  if (parsed?.pricingMode === PRICING_MODE_SINGLE) {
    return PRICING_MODE_SINGLE;
  }

  if (parsed?.markets && typeof parsed.markets === 'object' && Object.keys(parsed.markets).length > 0) {
    return PRICING_MODE_MARKETS;
  }

  return PRICING_MODE_SINGLE;
}

/**
  * @param {unknown} rawValue
  */
export function parseMarketsFromConfig(rawValue) {
  if (rawValue == null || rawValue === '') {
    return {
      markets: {},
      bundlePrice: '',
      pricingMode: PRICING_MODE_SINGLE,
    };
  }

  try {
    const parsed = typeof rawValue === 'string' ? JSON.parse(rawValue) : rawValue;
    const markets = parsed?.markets && typeof parsed.markets === 'object' ? parsed.markets : {};

    return {
      markets,
      bundlePrice: parsed?.bundlePrice != null ? String(parsed.bundlePrice) : '',
      pricingMode: inferPricingMode(parsed),
    };
  } catch {
    return {
      markets: {},
      bundlePrice: '',
      pricingMode: PRICING_MODE_SINGLE,
    };
  }
}

/**
  * @param {Array<{ id: string, name: string, currencyCode?: string }>} allMarkets
  * @param {Record<string, { enabled?: boolean, bundlePrice?: string | number }>} savedMarkets
  * @returns {MarketRow[]}
  */
export function buildMarketRows(allMarkets, savedMarkets) {
  const hasSavedMarkets = Object.keys(savedMarkets ?? {}).length > 0;

  return allMarkets.map((market) => {
    const saved = savedMarkets?.[ market.id ];

    return {
      marketId: market.id,
      name: market.name,
      currencyCode: market.currencyCode ?? '',
      enabled: hasSavedMarkets ? saved?.enabled === true : false,
      bundlePrice: saved?.bundlePrice != null ? saved.bundlePrice : '',
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
  * @param {'single' | 'markets'} pricingMode
  */
export function isSinglePriceMode(pricingMode) {
  return pricingMode === PRICING_MODE_SINGLE;
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
  * @param {{
  *   pricingMode: 'single' | 'markets',
  *   marketRows?: MarketRow[],
  *   bundlePrice?: number | string,
  * }} input
  */
export function validatePricingConfig(input) {
  if (isSinglePriceMode(input.pricingMode)) {
    return validateSinglePrice(input.bundlePrice);
  }

  if (!input.marketRows?.length) {
    return 'No markets are configured in Shopify';
  }

  return validateMarketRows(input.marketRows);
}

/**
  * @param {{
  *   collectionIds: string[],
  *   itemCount?: number,
  *   discountTitle?: string,
  *   pricingMode: 'single' | 'markets',
  *   marketRows?: MarketRow[],
  *   bundlePrice?: number | string,
  * }} input
  */
export function buildFunctionConfiguration(input) {
  const payload = {
    collectionIds: input.collectionIds,
    itemCount: input.itemCount ?? 2,
    discountTitle: input.discountTitle ?? '',
    pricingMode: input.pricingMode,
  };

  if (isSinglePriceMode(input.pricingMode)) {
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

/**
  * @param {'single' | 'markets'} pricingMode
  * @param {string} bundlePrice
  * @param {Record<string, { enabled?: boolean, bundlePrice?: string }>} markets
  */
export function summarizePricing(pricingMode, bundlePrice, markets) {
  if (isSinglePriceMode(pricingMode)) {
    return bundlePrice ? [ bundlePrice ] : [];
  }

  return summarizeEnabledMarkets(markets);
}
