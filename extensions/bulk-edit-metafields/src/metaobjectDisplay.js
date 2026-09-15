/** Metaobject display helpers - names, color swatches, image thumbnails. */

const NAME_FIELD_KEYS = [
  'name',
  'label',
  'title',
  'internal_name',
  'internal-name',
  'display_name',
  'display-name',
];

const COLOR_FIELD_KEYS = ['color', 'colour', 'swatch', 'hex', 'hex_code', 'hex-code'];
const IMAGE_FIELD_KEYS = ['image', 'swatch_image', 'swatch-image', 'thumbnail', 'photo', 'media'];

export function isGid(value) {
  return typeof value === 'string' && value.startsWith('gid://');
}

export function collectGids(value) {
  const out = [];
  if (value == null) return out;
  if (Array.isArray(value)) {
    for (const item of value) out.push(...collectGids(item));
    return out;
  }
  if (typeof value === 'object') {
    if (value.id) out.push(String(value.id));
    return out;
  }
  if (isGid(value)) out.push(value);
  return out;
}

function fieldMap(fields = []) {
  const map = new Map();
  for (const field of fields) {
    if (field?.key) map.set(field.key, field);
  }
  return map;
}

function findField(fields, preferredKeys, typePredicate) {
  const map = fieldMap(fields);
  for (const key of preferredKeys) {
    if (map.has(key)) return map.get(key);
  }
  for (const field of fields) {
    if (typePredicate?.(field)) return field;
  }
  return null;
}

export function colorSwatchDataUri(hex) {
  const color = normalizeHex(hex);
  if (!color) return null;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" rx="8" fill="${color}"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function normalizeHex(value) {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(trimmed) || /^#[0-9A-Fa-f]{3}$/.test(trimmed)) {
    return trimmed;
  }
  if (/^[0-9A-Fa-f]{6}$/.test(trimmed) || /^[0-9A-Fa-f]{3}$/.test(trimmed)) {
    return `#${trimmed}`;
  }
  return null;
}

/**
 * Build a picker-friendly entry from a Metaobject GraphQL node.
 * @param {object} node
 * @param {{ displayNameKey?: string, name?: string } | null} definition
 */
export function enrichMetaobjectEntry(node, definition = null) {
  const fields = node.fields ?? [];
  const displayNameKey = definition?.displayNameKey;

  let displayName = node.displayName || '';
  if (displayNameKey) {
    const named = fields.find((f) => f.key === displayNameKey)?.value;
    if (named) displayName = named;
  }
  if (!displayName || isGid(displayName)) {
    const nameField = findField(fields, NAME_FIELD_KEYS, (f) =>
      String(f.type || '').includes('single_line_text'),
    );
    if (nameField?.value) displayName = nameField.value;
  }
  if (!displayName) displayName = node.handle || node.id;

  const colorField = findField(
    fields,
    COLOR_FIELD_KEYS,
    (f) => f.type === 'color' || normalizeHex(f.value),
  );
  const color = colorField ? normalizeHex(colorField.value) : null;

  const imageField = findField(
    fields,
    IMAGE_FIELD_KEYS,
    (f) =>
      String(f.type || '').includes('file_reference') ||
      f.reference?.image?.url ||
      f.reference?.url,
  );
  const imageUrl =
    imageField?.reference?.image?.url ||
    imageField?.reference?.url ||
    null;

  const thumbnailUrl = imageUrl || (color ? colorSwatchDataUri(color) : null);

  return {
    id: node.id,
    handle: node.handle,
    displayName,
    color,
    thumbnailUrl,
    typeLabel: definition?.name || node.type,
  };
}

export function labelFromResolvedNode(node) {
  if (!node) return null;
  if (node.__typename === 'Metaobject' || node.displayName != null || node.handle != null) {
    const enriched = enrichMetaobjectEntry(node);
    return enriched.displayName;
  }
  if (node.title) return node.title;
  if (node.displayName) return node.displayName;
  if (node.image?.altText) return node.image.altText;
  if (node.id) return humanizeGid(node.id);
  return null;
}

export function humanizeGid(gid) {
  if (!isGid(gid)) return String(gid);
  // gid://shopify/Metaobject/123 -> Metaobject 123
  const parts = String(gid).split('/');
  const type = parts[parts.length - 2] || 'Item';
  const id = parts[parts.length - 1] || '';
  return `${type} ${id}`.trim();
}
