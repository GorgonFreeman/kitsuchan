/** Metafield type helpers and value encode/decode. */

const SUPPORTED_BASE = new Set([
  'single_line_text_field',
  'multi_line_text_field',
  'number_integer',
  'number_decimal',
  'boolean',
  'date',
  'date_time',
  'url',
  'color',
  'product_reference',
  'collection_reference',
  'variant_reference',
  'metaobject_reference',
]);

export function isListType(typeName) {
  return typeof typeName === 'string' && typeName.startsWith('list.');
}

export function baseType(typeName) {
  return isListType(typeName) ? typeName.slice(5) : typeName;
}

export function isSupportedType(typeName) {
  return SUPPORTED_BASE.has(baseType(typeName));
}

export function isReferenceType(typeName) {
  const base = baseType(typeName);
  return (
    base === 'product_reference' ||
    base === 'collection_reference' ||
    base === 'variant_reference' ||
    base === 'metaobject_reference'
  );
}

export function resourcePickerType(typeName) {
  switch (baseType(typeName)) {
    case 'product_reference':
      return 'product';
    case 'collection_reference':
      return 'collection';
    case 'variant_reference':
      return 'variant';
    default:
      return null;
  }
}

export function metaobjectDefinitionId(validations = []) {
  const match = validations.find((v) => v.name === 'metaobject_definition_id');
  return match?.value ?? null;
}

/** Parse a metafield `.value` string into a JS array (lists) or scalar. */
export function parseMetafieldValue(typeName, value) {
  if (value == null || value === '') {
    return isListType(typeName) ? [] : null;
  }
  if (isListType(typeName)) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map(normalizeItem) : [];
    } catch {
      return [];
    }
  }
  return normalizeItem(value, typeName);
}

function normalizeItem(raw, typeName) {
  const base = typeName ? baseType(typeName) : null;
  if (base === 'boolean') return String(raw) === 'true';
  if (base === 'number_integer') return String(raw);
  if (base === 'number_decimal') return String(raw);
  return String(raw);
}

/** Encode editor values into the string Shopify expects for metafieldsSet. */
export function encodeMetafieldValue(typeName, editorValue) {
  if (isListType(typeName)) {
    const items = Array.isArray(editorValue) ? editorValue : [];
    return JSON.stringify(items.map((item) => encodeScalar(baseType(typeName), item)));
  }
  return encodeScalar(baseType(typeName), editorValue);
}

function encodeScalar(base, value) {
  if (base === 'boolean') return value === true || value === 'true' ? 'true' : 'false';
  if (value == null) return '';
  return String(value);
}

export function valuesEqual(a, b) {
  return String(a) === String(b);
}

export function mergeUnique(existing, additions) {
  const out = [...existing];
  for (const item of additions) {
    if (!out.some((x) => valuesEqual(x, item))) out.push(item);
  }
  return out;
}

export function removeMatches(existing, toRemove) {
  return existing.filter((item) => !toRemove.some((x) => valuesEqual(x, item)));
}

export function definitionLabel(def) {
  return `${def.name} (${def.namespace}.${def.key})`;
}
