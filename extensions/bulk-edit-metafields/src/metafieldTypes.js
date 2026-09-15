const SUPPORTED = new Set([
  'single_line_text_field',
  'multi_line_text_field',
  'number_integer',
  'number_decimal',
  'boolean',
  'list.single_line_text_field',
  'list.multi_line_text_field',
  'list.number_integer',
  'list.number_decimal',
  'list.boolean',
]);

export function isSupportedType(type) {
  return SUPPORTED.has(type);
}

export function isListType(type) {
  return typeof type === 'string' && type.startsWith('list.');
}

export function scalarTypeOf(type) {
  return isListType(type) ? type.slice('list.'.length) : type;
}

export function defKey(def) {
  return `${ def.namespace }.${ def.key }`;
}

/** Normalize a scalar entry to the string Shopify expects, or null if invalid. */
export function normalizeScalar(type, raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;

  if (type === 'boolean') {
    if (s === 'true' || s === 'false') return s;
    return null;
  }
  if (type === 'number_integer') {
    if (!/^-?\d+$/.test(s)) return null;
    return s;
  }
  if (type === 'number_decimal') {
    if (!/^-?\d+(\.\d+)?$/.test(s) || !Number.isFinite(Number(s))) return null;
    return s;
  }
  // text fields
  return s;
}

export function serializeSetValue(type, value) {
  if (isListType(type)) {
    return JSON.stringify(value);
  }
  return String(value);
}

export function isSetValueReady(type, value) {
  if (isListType(type)) {
    return Array.isArray(value) && value.length > 0;
  }
  return normalizeScalar(type, value) != null;
}

/** Add an item to a list value; skips blanks, invalids, and duplicates. */
export function addListItem(items, type, raw) {
  const scalar = scalarTypeOf(type);
  const next = normalizeScalar(scalar, raw);
  if (next == null) return items;
  if (items.includes(next)) return items;
  return [ ...items, next ];
}
