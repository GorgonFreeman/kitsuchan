/**
  * Market bundle prices are stored in each market's currency. Checkout line prices
  * are in presentment currency. This module converts configured bundle prices to
  * presentment cents using:
  *
  * 1. shop.metafields.global.conversion_rates — rates[CUR] is how many units of CUR
  *    equal 1 unit of shop currency (shop currency has rate 1, e.g. GBP: 1, EUR: 1.16).
  *    Divide market amount by rates[CUR] to reach shop currency.
  * 2. presentmentCurrencyRate — multiply shop currency to reach checkout presentment
  */

/**
  * @param {string | undefined | null} code
  */
export function normalizeCurrencyCode(code) {
  return typeof code === 'string' ? code.trim().toUpperCase() : '';
}

/**
  * @param {unknown} jsonValue
  * @returns {Record<string, number>}
  */
export function parseConversionRates(jsonValue) {
  if (!jsonValue || typeof jsonValue !== 'object') {
    return {};
  }

  const container = /** @type {Record<string, unknown>} */ (jsonValue);
  const raw = container.rates && typeof container.rates === 'object'
    ? /** @type {Record<string, unknown>} */ (container.rates)
    : container;

  /** @type {Record<string, number>} */
  const rates = {};

  for (const [ key, value ] of Object.entries(raw)) {
    if (key === 'base') {
      continue;
    }

    const code = normalizeCurrencyCode(key);
    const rate = typeof value === 'number' ? value : parseFloat(String(value ?? ''));

    if (code && Number.isFinite(rate) && rate > 0) {
      rates[ code ] = rate;
    }
  }

  return rates;
}

/**
  * @param {unknown} jsonValue
  * @param {string} configShopCurrencyCode
  */
export function parseShopCurrencyCode(jsonValue, configShopCurrencyCode) {
  const fromConfig = normalizeCurrencyCode(configShopCurrencyCode);
  if (fromConfig) {
    return fromConfig;
  }

  if (jsonValue && typeof jsonValue === 'object') {
    const container = /** @type {Record<string, unknown>} */ (jsonValue);
    const base = container.base;
    if (typeof base === 'string') {
      return normalizeCurrencyCode(base);
    }

    const rates = parseConversionRates(jsonValue);
    for (const [ code, rate ] of Object.entries(rates)) {
      if (rate === 1) {
        return code;
      }
    }
  }

  return '';
}

/**
  * @param {Array<{ cost?: { amountPerQuantity?: { currencyCode?: string } } }>} lines
  * @returns {string}
  */
export function cartPresentmentCurrencyCode(lines) {
  for (const line of lines) {
    const currencyCode = line.cost?.amountPerQuantity?.currencyCode;
    if (typeof currencyCode === 'string' && currencyCode.length > 0) {
      return normalizeCurrencyCode(currencyCode);
    }
  }

  return '';
}

/**
  * @param {{
  *   bundlePriceCents: number,
  *   configCurrencyCode?: string,
  *   cartCurrencyCode?: string,
  *   shopCurrencyCode?: string,
  *   presentmentCurrencyRate: number,
  *   conversionRates?: Record<string, number>,
  * }} input
  * @returns {number | null}
  */
export function resolveMarketBundlePresentmentCents(input) {
  const configCurrency = normalizeCurrencyCode(input.configCurrencyCode);
  const cartCurrency = normalizeCurrencyCode(input.cartCurrencyCode);
  const shopCurrency = normalizeCurrencyCode(input.shopCurrencyCode);
  const conversionRates = input.conversionRates ?? {};
  const presentmentRate = input.presentmentCurrencyRate;

  if (configCurrency && cartCurrency && configCurrency === cartCurrency) {
    return input.bundlePriceCents;
  }

  const shopCents = marketConfigToShopCents({
    bundlePriceCents: input.bundlePriceCents,
    configCurrency,
    shopCurrency,
    conversionRates,
  });
  if (shopCents == null) {
    return null;
  }

  if (cartCurrency && shopCurrency && cartCurrency === shopCurrency) {
    return shopCents;
  }

  return Math.round(shopCents * presentmentRate);
}

/**
  * @param {{
  *   bundlePriceCents: number,
  *   configCurrency: string,
  *   shopCurrency: string,
  *   conversionRates: Record<string, number>,
  * }} input
  * @returns {number | null}
  */
export function marketConfigToShopCents(input) {
  const { bundlePriceCents, configCurrency, shopCurrency, conversionRates } = input;

  if (!configCurrency) {
    return bundlePriceCents;
  }

  if (shopCurrency && configCurrency === shopCurrency) {
    return bundlePriceCents;
  }

  const marketToShopRate = conversionRates[ configCurrency ];
  if (!Number.isFinite(marketToShopRate) || marketToShopRate <= 0) {
    return null;
  }

  return Math.round(bundlePriceCents / marketToShopRate);
}
