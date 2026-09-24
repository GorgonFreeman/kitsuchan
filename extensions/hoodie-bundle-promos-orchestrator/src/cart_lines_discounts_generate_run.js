import {
  DiscountClass,
  ProductDiscountSelectionStrategy,
  OrderDiscountSelectionStrategy,
} from '../generated/api';

/**
 * @typedef {import("../generated/api").CartInput} RunInput
 * @typedef {import("../generated/api").CartLinesDiscountsGenerateRunResult} CartLinesDiscountsGenerateRunResult
 */

/** @typedef {'none' | 'b2g1' | 'b1g50' | 'b1hg50_sw' | 'spend_save_percent' | 'spend_save_fixed'} PromoOfTheDay */

/**
 * @typedef {{
 *   hoodieBundle: string,
 *   b2g1: string,
 *   b1g50: string,
 *   b1hg50Sw: string,
 *   spendSavePercent: string,
 *   spendSaveFixed: string,
 * }} PromoMessages
 *
 * @typedef {{
 *   qualifyCollectionIds: string[],
 *   eligibleCollectionIds: string[],
 *   percent: number,
 * }} CollectionPromoSlot
 *
 * @typedef {{
 *   minShopAmount: number,
 *   value: number,
 * }} SpendTierRow
 *
 * @typedef {{
 *   hoodieCollectionIds: string[],
 *   hoodieBundlePrice: number,
 *   promoOfTheDay: PromoOfTheDay,
 *   b2g1: CollectionPromoSlot,
 *   b1g50: CollectionPromoSlot,
 *   b1hg50Sw: CollectionPromoSlot,
 *   spendSavePercentTiers: SpendTierRow[],
 *   spendSaveFixedTiers: SpendTierRow[],
 *   messages: PromoMessages,
 * }} ParsedConfig
 */

/**
 * @typedef {{
 *   unitId: string,
 *   lineId: string,
 *   unitPriceCents: number,
 *   isHoodie: boolean,
 *   inPromoQualify: boolean,
 *   inPromoEligible: boolean,
 * }} Unit
 */

/**
 * @typedef {{
 *   unitId: string,
 *   lineId: string,
 *   discountCents: number,
 *   message: string,
 * }} UnitDiscount
 */

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
  const hoodieBundlePriceCents = resolveShopAmountToPresentmentCents(
    config.hoodieBundlePrice,
    presentmentRate,
  );

  const units = expandUnits(input.cart.lines, config);
  if (!units.length) {
    return { operations: [] };
  }

  // Always: hoodie bundles first on eligible hoodie units.
  const bundleDiscounts = applyHoodieBundlesOnly(units, hoodieBundlePriceCents, config);
  const bundledIds = new Set(bundleDiscounts.map((d) => d.unitId));
  const remaining = units.filter((u) => !bundledIds.has(u.unitId));

  /** @type {UnitDiscount[]} */
  let promoDiscounts = [];
  /** @type {{ amountCents: number, message: string } | null} */
  let orderDiscount = null;

  const activeSlot = promoSlotForDay(config);

  switch (config.promoOfTheDay) {
    case 'b2g1':
      promoDiscounts = applyBxGyPercent(
        remaining,
        (u) => u.inPromoQualify,
        (u) => u.inPromoEligible,
        2,
        activeSlot.percent,
        config.messages.b2g1,
      );
      break;

    case 'b1g50':
      promoDiscounts = applyBxGyPercent(
        remaining,
        (u) => u.inPromoQualify,
        (u) => u.inPromoEligible,
        1,
        activeSlot.percent,
        config.messages.b1g50,
      );
      break;

    case 'b1hg50_sw':
      promoDiscounts = applyBxGyPercent(
        remaining,
        (u) => u.inPromoQualify,
        (u) => u.inPromoEligible,
        1,
        activeSlot.percent,
        config.messages.b1hg50Sw,
      );
      break;

    case 'spend_save_percent':
    case 'spend_save_fixed': {
      if (hasOrder) {
        orderDiscount = computeSpendSaveOrderDiscount(
          units,
          bundleDiscounts,
          config,
          presentmentRate,
        );
      }
      break;
    }

    case 'none':
    default:
      break;
  }

  const productUnitDiscounts = [...bundleDiscounts, ...promoDiscounts];

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
// Config
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
    raw.hoodieCollectionIds ?? raw.collectionId,
  );
  // Note: top-level `collectionIds` is the input-variable union for inCollections — not the hoodie list.

  const hoodieBundlePrice = Number(raw.hoodieBundlePrice ?? raw.bundlePrice ?? 0);
  if (!Number.isFinite(hoodieBundlePrice) || hoodieBundlePrice <= 0) {
    return null;
  }

  return {
    hoodieCollectionIds,
    hoodieBundlePrice,
    promoOfTheDay: normalizePromoOfTheDay(raw.promoOfTheDay ?? raw.promoType),
    b2g1: parseCollectionPromoSlot(raw, 'b2g1', 100, {
      qualify: ['b2g1QualifyCollectionIds'],
      eligible: ['b2g1EligibleCollectionIds'],
      percent: ['b2g1Percent'],
    }),
    b1g50: parseCollectionPromoSlot(raw, 'b1g50', 50, {
      qualify: ['b1g50QualifyCollectionIds'],
      eligible: ['b1g50EligibleCollectionIds'],
      percent: ['b1g50Percent'],
    }),
    b1hg50Sw: parseCollectionPromoSlot(raw, 'b1hg50Sw', 50, {
      qualify: [
        'b1hg50SwQualifyCollectionIds',
        'hoodieCollectionIds',
      ],
      eligible: [
        'b1hg50SwEligibleCollectionIds',
        'sweatpantsCollectionIds',
      ],
      percent: ['b1hg50SwPercent'],
    }),
    spendSavePercentTiers: parseSpendTiersCsv(
      typeof raw.spendSavePercentCsv === 'string' ? raw.spendSavePercentCsv : '',
      { discountIsPercent: true },
    ),
    spendSaveFixedTiers: parseSpendTiersCsv(
      typeof raw.spendSaveFixedCsv === 'string' ? raw.spendSaveFixedCsv : '',
      { discountIsPercent: false },
    ),
    messages: parseMessages(raw),
  };
}

/**
 * @param {Record<string, unknown>} raw
 * @param {string} _slotName
 * @param {number} defaultPercent
 * @param {{ qualify: string[], eligible: string[], percent: string[] }} keys
 * @returns {CollectionPromoSlot}
 */
function parseCollectionPromoSlot(raw, _slotName, defaultPercent, keys) {
  const nested =
    raw[_slotName] && typeof raw[_slotName] === 'object'
      ? /** @type {Record<string, unknown>} */ (raw[_slotName])
      : null;

  const qualifyCollectionIds = normalizeIdList(
    nested?.qualifyCollectionIds ?? firstDefined(raw, keys.qualify),
  );
  const eligibleCollectionIds = normalizeIdList(
    nested?.eligibleCollectionIds ?? firstDefined(raw, keys.eligible),
  );

  const percentRaw = nested?.percent ?? firstDefined(raw, keys.percent) ?? defaultPercent;
  const percent = Number(percentRaw);
  return {
    qualifyCollectionIds,
    eligibleCollectionIds,
    percent: Number.isFinite(percent) && percent > 0 ? Math.min(100, percent) : defaultPercent,
  };
}

/**
 * @param {Record<string, unknown>} raw
 * @param {string[]} keys
 * @returns {unknown}
 */
function firstDefined(raw, keys) {
  for (const key of keys) {
    if (raw[key] !== undefined && raw[key] !== null && raw[key] !== '') {
      return raw[key];
    }
  }
  return undefined;
}

/**
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
      'Hoodie Bundle',
    ),
    b2g1: str(nested.b2g1 ?? raw.discountTitle, 'Buy 2 Get 1 Free'),
    b1g50: str(nested.b1g50 ?? raw.discountTitle, 'Buy 1 Get 1 50% Off'),
    b1hg50Sw: str(
      nested.b1hg50Sw ?? nested.hoodieSweatpants50 ?? raw.discountTitle,
      '50% off sweatpants with hoodie',
    ),
    spendSavePercent: str(nested.spendSavePercent ?? raw.discountTitle, 'Spend & Save'),
    spendSaveFixed: str(nested.spendSaveFixed ?? raw.discountTitle, 'Spend & Save'),
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
 * @returns {PromoOfTheDay}
 */
function normalizePromoOfTheDay(value) {
  const v = typeof value === 'string' ? value.trim().toLowerCase() : 'none';
  const aliases = {
    none: 'none',
    b2g1: 'b2g1',
    b1g50: 'b1g50',
    b1hg50_sw: 'b1hg50_sw',
    b1hg50sw: 'b1hg50_sw',
    hoodie_sweatpants_50: 'b1hg50_sw',
    spend_save_percent: 'spend_save_percent',
    spend_save_fixed: 'spend_save_fixed',
    'spend & save %': 'spend_save_percent',
    'spend & save $': 'spend_save_fixed',
  };
  return /** @type {PromoOfTheDay} */ (aliases[v] ?? 'none');
}

/**
 * Parse `75|20,150|25` (% ) or `75|1500,150|4000` ($ off in cents).
 * Spend is shop-currency major units; % value is percent; fixed value is shop cents.
 *
 * @param {string} csv
 * @param {{ discountIsPercent: boolean }} opts
 * @returns {SpendTierRow[]}
 */
function parseSpendTiersCsv(csv, opts) {
  if (!csv || typeof csv !== 'string') return [];

  /** @type {SpendTierRow[]} */
  const tiers = [];
  for (const part of csv.split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const [spendRaw, discountRaw] = trimmed.split('|').map((s) => s.trim());
    const minShopAmount = Number(spendRaw);
    const value = Number(discountRaw);
    if (!Number.isFinite(minShopAmount) || minShopAmount < 0) continue;
    if (!Number.isFinite(value) || value <= 0) continue;
    if (opts.discountIsPercent && value > 100) continue;
    tiers.push({ minShopAmount, value });
  }

  return tiers.sort((a, b) => a.minShopAmount - b.minShopAmount);
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
 * Shop-currency major units → presentment cents.
 * @param {number} shopAmount
 * @param {number} presentmentRate
 * @returns {number}
 */
function resolveShopAmountToPresentmentCents(shopAmount, presentmentRate) {
  return Math.round(shopAmount * 100 * presentmentRate);
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

/**
 * Active BxGy slot for the selected Promo of the Day (empty for none / spend & save).
 * @param {ParsedConfig} config
 * @returns {CollectionPromoSlot}
 */
function promoSlotForDay(config) {
  if (config.promoOfTheDay === 'b2g1') return config.b2g1;
  if (config.promoOfTheDay === 'b1g50') return config.b1g50;
  if (config.promoOfTheDay === 'b1hg50_sw') return config.b1hg50Sw;
  return { qualifyCollectionIds: [], eligibleCollectionIds: [], percent: 0 };
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
 * @param {Set<string>} memberIds
 * @param {string[]} collectionIds
 * @returns {boolean}
 */
function isInAny(memberIds, collectionIds) {
  // Empty list = unrestricted (applies to every unit).
  if (!collectionIds.length) return true;
  for (const id of collectionIds) {
    if (memberIds.has(id)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------

/**
 * @param {RunInput['cart']['lines']} lines
 * @param {ParsedConfig} config
 * @returns {Unit[]}
 */
function expandUnits(lines, config) {
  const slot = promoSlotForDay(config);
  /** @type {Unit[]} */
  const units = [];
  let seq = 0;

  for (const line of lines) {
    if (line.merchandise.__typename !== 'ProductVariant') continue;
    if (line.excludeAttribute?.value) continue;

    const unitPriceCents = moneyToCents(line.cost.amountPerQuantity.amount);
    if (unitPriceCents == null || unitPriceCents <= 0) continue;

    const product = line.merchandise.product;
    const memberIds = memberCollectionIdSet(product?.collectionMemberships);

    for (let i = 0; i < line.quantity; i += 1) {
      units.push({
        unitId: `${ line.id }#${ seq++ }`,
        lineId: line.id,
        unitPriceCents,
        isHoodie: isInAny(memberIds, config.hoodieCollectionIds),
        inPromoQualify: isInAny(memberIds, slot.qualifyCollectionIds),
        inPromoEligible: isInAny(memberIds, slot.eligibleCollectionIds),
      });
    }
  }

  return units;
}

// ---------------------------------------------------------------------------
// Hoodie bundles — cheapest pairs first, proportional attribution
// ---------------------------------------------------------------------------

/**
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
// BxGy percent (B2G1 / B1G50 / B1HG50Sw)
// ---------------------------------------------------------------------------

/**
 * Midway grouping: count how many full groups fit, then assign discount slots
 * from cheapest eligible upwards. Paid qualifiers are the next-cheapest remaining
 * qualify units — the most expensive units can sit outside any group.
 *
 * Example B2G1 with 7 units: floor(7/3)=2 free → 2 cheapest discounted;
 * next 4 are paid; 1 dearest leftover is not in a group.
 *
 * @param {Unit[]} units
 * @param {(u: Unit) => boolean} isQualify
 * @param {(u: Unit) => boolean} isEligible
 * @param {number} paidCount
 * @param {number} percent
 * @param {string} message
 * @returns {UnitDiscount[]}
 */
function applyBxGyPercent(units, isQualify, isEligible, paidCount, percent, message) {
  if (paidCount < 1 || percent <= 0) return [];

  const byPriceAsc = (a, b) => a.unitPriceCents - b.unitPriceCents;

  const eligibleSorted = units.filter(isEligible).slice().sort(byPriceAsc);
  const qualifySorted = units.filter(isQualify).slice().sort(byPriceAsc);

  if (!eligibleSorted.length || qualifySorted.length < paidCount) return [];

  const poolSize = new Set(
    [...eligibleSorted, ...qualifySorted].map((u) => u.unitId),
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

// ---------------------------------------------------------------------------
// Spend & Save (order-level after hoodie product discounts)
// ---------------------------------------------------------------------------

/**
 * @param {Unit[]} units
 * @param {UnitDiscount[]} productDiscounts
 * @param {ParsedConfig} config
 * @param {number} presentmentRate
 * @returns {{ amountCents: number, message: string } | null}
 */
function computeSpendSaveOrderDiscount(units, productDiscounts, config, presentmentRate) {
  const discountByUnit = new Map();
  for (const d of productDiscounts) {
    discountByUnit.set(d.unitId, (discountByUnit.get(d.unitId) || 0) + d.discountCents);
  }

  let spendCents = 0;
  for (const u of units) {
    const disc = discountByUnit.get(u.unitId) || 0;
    spendCents += Math.max(0, u.unitPriceCents - disc);
  }

  if (config.promoOfTheDay === 'spend_save_percent') {
    const tiers = config.spendSavePercentTiers;
    if (!tiers.length) return null;

    let bestPct = 0;
    for (const tier of tiers) {
      const minCents = resolveShopAmountToPresentmentCents(tier.minShopAmount, presentmentRate);
      if (spendCents >= minCents) bestPct = tier.value;
    }
    if (bestPct <= 0) return null;
    return {
      amountCents: Math.floor((spendCents * bestPct) / 100),
      message: config.messages.spendSavePercent || `${ bestPct }% off`,
    };
  }

  const tiers = config.spendSaveFixedTiers;
  if (!tiers.length) return null;

  let bestOffPresentmentCents = 0;
  for (const tier of tiers) {
    const minCents = resolveShopAmountToPresentmentCents(tier.minShopAmount, presentmentRate);
    if (spendCents >= minCents) {
      // tier.value is shop-currency cents
      bestOffPresentmentCents = Math.round(tier.value * presentmentRate);
    }
  }
  if (bestOffPresentmentCents <= 0) return null;
  return {
    amountCents: bestOffPresentmentCents,
    message: config.messages.spendSaveFixed || 'Spend & Save',
  };
}

// ---------------------------------------------------------------------------
// Aggregate unit discounts → product discount candidates (per line)
// ---------------------------------------------------------------------------

/**
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
