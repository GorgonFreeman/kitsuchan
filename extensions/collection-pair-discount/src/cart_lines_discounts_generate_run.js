/**
  * @typedef {import("../generated/api").CartInput} RunInput
  * @typedef {import("../generated/api").CartLinesDiscountsGenerateRunResult} CartLinesDiscountsGenerateRunResult
  * @typedef {{ collectionIds: string[], itemCount: number, discountTitle: string, pricingMode: 'single' | 'markets', markets: Record<string, { enabled?: boolean, bundlePrice?: unknown }>, bundlePrice: unknown }} ParsedConfig
  */

const DEFAULT_ITEM_COUNT = 2;

/** Set to false before production deploy. Logs appear in app dev + function run STDERR (1 kB cap). */
const DEBUG_CART_INPUT = true;

/**
  * Logging-only PoC.
  *
  * Keeps current discount configuration parsing/settings context, logs all
  * currently available cart/line discount signals, and intentionally returns no
  * discount operations.
  *
  * @param {RunInput} input
  * @returns {CartLinesDiscountsGenerateRunResult}
  */
export function cartLinesDiscountsGenerateRun(input) {
  const config = parseConfig(input.discount.metafield?.jsonValue);
  const marketId = input.localization?.market?.id ?? null;
  const bundlePriceCents = config ? resolveBundlePriceCents(config, marketId) : null;
  const lineSummaries = summarizeCartLines(input.cart.lines);

  logEvaluation('poc_snapshot', input, {
    reason: 'logging_only_poc',
    hasValidConfig: Boolean(config),
    config: config
      ? {
        collectionIds: config.collectionIds,
        itemCount: config.itemCount,
        pricingMode: config.pricingMode,
        bundlePrice: config.bundlePrice,
        hasMarkets: Object.keys(config.markets ?? {}).length > 0,
      }
      : null,
    marketId,
    bundlePriceCents,
    lines: lineSummaries,
  });

  return { operations: [] };
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
    return cents != null && cents > 0 ? cents : null;
  }

  if (!marketId || !config.markets[ marketId ]) {
    return null;
  }

  const entry = config.markets[ marketId ];
  if (entry.enabled === false) {
    return null;
  }

  const cents = moneyToCents(entry.bundlePrice);
  return cents != null && cents > 0 ? cents : null;
}

/**
  * @param {RunInput['cart']['lines']} lines
  * @returns {Array<Record<string, unknown>>}
  */
function summarizeCartLines(lines) {
  return lines.map((line) => {
    const inCollection = line.merchandise.__typename === 'ProductVariant'
      ? line.merchandise.product?.inAnyCollection === true
      : false;
    const subtotalCents = moneyToCents(line.cost.subtotalAmount.amount) ?? 0;
    const totalCents = moneyToCents(line.cost.totalAmount.amount) ?? subtotalCents;
    const totalPerUnitCents = line.quantity > 0 ? Math.round(totalCents / line.quantity) : 0;

    return {
      id: line.id,
      quantity: line.quantity,
      listPrice: line.cost.amountPerQuantity.amount,
      subtotalAmount: line.cost.subtotalAmount.amount,
      totalAmount: line.cost.totalAmount.amount,
      subtotalCents,
      totalCents,
      totalPerUnitCents,
      discountAllocations: (line.discountAllocations ?? []).map((allocation) => ({
        amount: allocation.discountedAmount?.amount,
        targetType: allocation.discountApplication?.targetType,
      })),
      inCollection,
    };
  });
}

/**
  * @param {string} stage
  * @param {RunInput} input
  * @param {Record<string, unknown>} detail
  */
function logEvaluation(stage, input, detail) {
  if (!DEBUG_CART_INPUT) {
    return;
  }

  const payload = {
    stage,
    triggeringDiscountCode: input.triggeringDiscountCode ?? null,
    enteredDiscountCodes: (input.enteredDiscountCodes ?? []).map((entry) => ({
      code: entry.code,
      rejectable: entry.rejectable,
    })),
    marketId: input.localization?.market?.id ?? null,
    lineCount: input.cart.lines.length,
    ...detail,
  };

  console.error('collectionPairDiscount', JSON.stringify(payload));
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
