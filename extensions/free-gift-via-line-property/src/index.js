import {
  DiscountClass,
  ProductDiscountSelectionStrategy,
} from '../generated/api';

/**
  * @typedef {import("../generated/api").CartInput} RunInput
  * @typedef {import("../generated/api").CartLinesDiscountsGenerateRunResult} CartLinesDiscountsGenerateRunResult
  * @typedef {{ lineProperty: string, minSpendCents: number, discountTitle: string, redemptions: 'one' | 'multiple' }} ParsedConfig
  */

/**
  * @param {RunInput} input
  * @returns {CartLinesDiscountsGenerateRunResult}
  */
export function cartLinesDiscountsGenerateRun(input) {
  if (!input.discount.discountClasses.includes(DiscountClass.Product)) {
    return { operations: [] };
  }

  const config = parseConfig(input.discount.metafield?.jsonValue);
  if (!config) {
    return { operations: [] };
  }

  const presentmentCurrencyRate = parsePresentmentCurrencyRate(input.presentmentCurrencyRate);
  const minSpendPresentmentCents = Math.round(config.minSpendCents * presentmentCurrencyRate);

  /** @type {RunInput['cart']['lines']} */
  const giftLines = [];
  let qualifyingSubtotalCents = 0;

  for (const line of input.cart.lines) {
    if (line.merchandise.__typename !== 'ProductVariant') {
      continue;
    }

    if (isGiftLine(line, config.lineProperty)) {
      giftLines.push(line);
      continue;
    }

    qualifyingSubtotalCents += lineSubtotalCents(line);
  }

  const earnedFreeGifts = config.redemptions === 'multiple' && minSpendPresentmentCents > 0
    ? Math.floor(qualifyingSubtotalCents / minSpendPresentmentCents)
    : (qualifyingSubtotalCents >= minSpendPresentmentCents ? 1 : 0);

  if (!giftLines.length || earnedFreeGifts < 1) {
    return { operations: [] };
  }

  giftLines.sort((left, right) => unitPriceCents(left) - unitPriceCents(right));

  let remaining = earnedFreeGifts;
  /** @type {{ cartLine: { id: string, quantity: number } }[]} */
  const targets = [];
  for (const giftLine of giftLines) {
    if (remaining <= 0) {
      break;
    }
    if (unitPriceCents(giftLine) <= 0) {
      continue;
    }

    const quantity = Math.min(giftLine.quantity, remaining);
    targets.push({
      cartLine: {
        id: giftLine.id,
        quantity,
      },
    });
    remaining -= quantity;
  }

  if (!targets.length) {
    return { operations: [] };
  }

  const discountMessage = config.discountTitle || null;

  return {
    operations: [
      {
        productDiscountsAdd: {
          candidates: [
            {
              ...(discountMessage ? { message: discountMessage } : {}),
              targets,
              value: {
                percentage: {
                  value: 100,
                },
              },
            },
          ],
          selectionStrategy: ProductDiscountSelectionStrategy.First,
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

  const config = /** @type {Record<string, unknown>} */ (jsonValue);
  const lineProperty = typeof config.lineProperty === 'string'
    ? config.lineProperty.trim()
    : '';
  const minSpendCents = moneyToCents(config.minSpend);
  const discountTitle = typeof config.discountTitle === 'string'
    ? config.discountTitle.trim()
    : '';
  const redemptions = config.redemptions === 'multiple' ? 'multiple' : 'one';

  if (!lineProperty || minSpendCents == null || minSpendCents < 0) {
    return null;
  }

  return {
    lineProperty,
    minSpendCents,
    discountTitle,
    redemptions,
  };
}

/**
  * @param {RunInput['cart']['lines'][number]} line
  * @param {string} lineProperty
  */
function isGiftLine(line, lineProperty) {
  return line.giftAttribute?.key === lineProperty
    && Boolean(line.giftAttribute?.value);
}

/**
  * @param {RunInput['cart']['lines'][number]} line
  */
function lineSubtotalCents(line) {
  const fromSubtotal = moneyToCents(line.cost.subtotalAmount?.amount);
  if (fromSubtotal != null) {
    return fromSubtotal;
  }

  return (moneyToCents(line.cost.amountPerQuantity.amount) ?? 0) * line.quantity;
}

/**
  * @param {RunInput['cart']['lines'][number]} line
  */
function unitPriceCents(line) {
  return moneyToCents(line.cost.amountPerQuantity.amount) ?? Number.POSITIVE_INFINITY;
}

/**
  * @param {unknown} value
  */
function parsePresentmentCurrencyRate(value) {
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
function moneyToCents(value) {
  const amount = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
  if (!Number.isFinite(amount)) {
    return null;
  }

  return Math.round(amount * 100);
}
