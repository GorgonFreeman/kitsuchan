// @ts-check

/**
 * @typedef {import("../generated/api").CartValidationsGenerateRunInput} CartValidationsGenerateRunInput
 * @typedef {import("../generated/api").CartValidationsGenerateRunResult} CartValidationsGenerateRunResult
 * @typedef {{ volumeThreshold?: unknown, message?: unknown }} VolumeConfig
 */

const DEFAULT_MESSAGE = 'Cart exceeds the dangerous goods volume limit.';

/**
 * @param {CartValidationsGenerateRunInput} input
 * @returns {CartValidationsGenerateRunResult}
 */
export function cartValidationsGenerateRun(input) {
  const config = parseConfig(input.validation?.metafield?.jsonValue);
  const errors = [];

  if (config) {
    const totalVolumeMl = totalDangerousGoodsVolumeMl(input.cart.lines);

    if (totalVolumeMl > config.volumeThreshold) {
      errors.push({
        message: config.message,
        target: '$.cart',
      });
    }
  }

  return {
    operations: [
      {
        validationAdd: {
          errors,
        },
      },
    ],
  };
}

/**
 * @param {unknown} jsonValue
 * @returns {{ volumeThreshold: number, message: string } | null}
 */
function parseConfig(jsonValue) {
  /** @type {VolumeConfig} */
  const raw = (jsonValue && typeof jsonValue === 'object' && !Array.isArray(jsonValue))
    ? /** @type {VolumeConfig} */ (jsonValue)
    : {};

  const volumeThreshold = Number(raw.volumeThreshold);
  if (!Number.isFinite(volumeThreshold) || volumeThreshold < 0) {
    return null;
  }

  const message = typeof raw.message === 'string' && raw.message.trim()
    ? raw.message.trim()
    : DEFAULT_MESSAGE;

  return {
    volumeThreshold,
    message,
  };
}

/**
 * @param {CartValidationsGenerateRunInput['cart']['lines']} lines
 * @returns {number}
 */
function totalDangerousGoodsVolumeMl(lines) {
  let total = 0;

  for (const line of lines) {
    if (line.merchandise?.__typename !== 'ProductVariant') {
      continue;
    }

    if (!line.merchandise.product?.hasAnyTag) {
      continue;
    }

    const unitVolumeMl = resolveVolumeMl(line.merchandise);
    if (unitVolumeMl == null) {
      continue;
    }

    total += unitVolumeMl * line.quantity;
  }

  return total;
}

/**
 * @param {Extract<CartValidationsGenerateRunInput['cart']['lines'][number]['merchandise'], { __typename: 'ProductVariant' }>} merchandise
 * @returns {number | null}
 */
function resolveVolumeMl(merchandise) {
  const variantValue = parseVolumeMl(merchandise.volumeMl?.value);
  if (variantValue != null) {
    return variantValue;
  }

  return parseVolumeMl(merchandise.product?.volumeMl?.value);
}

/**
 * @param {string | null | undefined} value
 * @returns {number | null}
 */
function parseVolumeMl(value) {
  if (value == null || value === '') {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}
