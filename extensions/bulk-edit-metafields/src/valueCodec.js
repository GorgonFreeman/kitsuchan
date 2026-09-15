/** Metafield type helpers, encode/decode, and display. */

/** Types stored as JSON `{ value, unit }`. */
export const MEASUREMENT_UNITS = {
  antenna_gain: ['decibels_isotropic', 'decibels_dipole'],
  area: ['square_centimeters', 'square_feet', 'square_inches', 'square_meters', 'square_yards'],
  battery_charge_capacity: ['milliamp_hours'],
  battery_energy_capacity: ['watt_hours'],
  capacitance: ['picofarads', 'nanofarads', 'microfarads', 'farads'],
  concentration: ['milligrams_per_gram', 'milligrams_per_milliliter'],
  data_storage_capacity: ['bytes', 'kilobytes', 'megabytes', 'gigabytes', 'terabytes'],
  data_transfer_rate: ['bits_per_second', 'kilobits_per_second', 'megabits_per_second', 'gigabits_per_second'],
  dimension: ['millimeters', 'centimeters', 'meters', 'inches', 'feet', 'yards'],
  display_density: ['pixels_per_inch', 'dots_per_inch'],
  distance: ['kilometers', 'miles'],
  duration: ['nanoseconds', 'microseconds', 'milliseconds', 'seconds', 'minutes', 'hours', 'days', 'months', 'years'],
  electric_current: ['milliamperes', 'amperes', 'kiloamperes'],
  electrical_resistance: ['ohms', 'kiloohms'],
  energy: ['joules', 'calories', 'kilojoules', 'kilocalories'],
  frequency: ['hertz', 'kilohertz', 'megahertz', 'gigahertz'],
  illuminance: ['lux', 'foot_candles'],
  inductance: ['microhenries', 'millihenries', 'henries'],
  luminous_flux: ['lumens'],
  mass_flow_rate: [
    'grams_per_second', 'kilograms_per_hour', 'kilograms_per_second',
    'pounds_per_hour', 'ounces_per_second',
  ],
  power: ['milliwatts', 'watts', 'horsepower', 'kilowatts'],
  pressure: ['pounds_per_square_inch', 'bars'],
  resolution: ['pixels', 'megapixels'],
  rotational_speed: ['revolutions_per_minute'],
  sound_level: ['decibels'],
  speed: ['kilometers_per_hour', 'feet_per_second', 'miles_per_hour', 'meters_per_second'],
  temperature: ['celsius', 'fahrenheit', 'kelvin'],
  thermal_power: ['british_thermal_units_per_hour', 'kilowatts', 'tons_of_refrigeration'],
  voltage: ['volts'],
  volume: [
    'milliliters', 'centiliters', 'liters', 'cubic_meters',
    'us_fluid_ounces', 'us_pints', 'us_quarts', 'us_gallons',
    'imperial_fluid_ounces', 'imperial_pints', 'imperial_quarts', 'imperial_gallons',
  ],
  volumetric_flow_rate: [
    'liters_per_hour', 'liters_per_minute', 'liters_per_second',
    'gallons_per_hour', 'gallons_per_minute', 'cubic_meters_per_hour',
  ],
  weight: ['grams', 'kilograms', 'ounces', 'pounds'],
};

const RESOURCE_PICKER_TYPES = new Set([
  'product_reference',
  'collection_reference',
  'variant_reference',
]);

const REFERENCE_TYPES = new Set([
  'product_reference',
  'collection_reference',
  'variant_reference',
  'metaobject_reference',
  'mixed_reference',
  'page_reference',
  'article_reference',
  'file_reference',
  'customer_reference',
  'company_reference',
  'order_reference',
  'product_taxonomy_value_reference',
]);

const COMPLEX_OBJECT_TYPES = new Set([
  'money',
  'rating',
  'link',
  'json',
  'rich_text_field',
]);

export function isListType(typeName) {
  return typeof typeName === 'string' && typeName.startsWith('list.');
}

export function baseType(typeName) {
  return isListType(typeName) ? typeName.slice(5) : typeName;
}

/** All Shopify product metafield types are editable (raw JSON fallback). */
export function isSupportedType(_typeName) {
  return true;
}

export function isMeasurementType(typeName) {
  return Object.prototype.hasOwnProperty.call(MEASUREMENT_UNITS, baseType(typeName));
}

export function isReferenceType(typeName) {
  return REFERENCE_TYPES.has(baseType(typeName));
}

export function isResourcePickerType(typeName) {
  return RESOURCE_PICKER_TYPES.has(baseType(typeName));
}

export function isMetaobjectRefType(typeName) {
  const base = baseType(typeName);
  return base === 'metaobject_reference' || base === 'mixed_reference';
}

export function isComplexObjectType(typeName) {
  return COMPLEX_OBJECT_TYPES.has(baseType(typeName));
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
  const ids = metaobjectDefinitionIds(validations);
  return ids[0] ?? null;
}

/** One or more metaobject definition GIDs from metafield validations. */
export function metaobjectDefinitionIds(validations = []) {
  const single = validations.find((v) => v.name === 'metaobject_definition_id')?.value;
  const multi = validations.find((v) => v.name === 'metaobject_definition_ids')?.value;
  const ids = [];
  if (single) ids.push(String(single));
  if (multi) {
    try {
      const parsed = JSON.parse(multi);
      if (Array.isArray(parsed)) ids.push(...parsed.map(String));
      else if (parsed) ids.push(String(parsed));
    } catch {
      ids.push(String(multi));
    }
  }
  return [...new Set(ids.filter(Boolean))];
}

export function ratingScale(validations = []) {
  const min = validations.find((v) => v.name === 'scale_min')?.value;
  const max = validations.find((v) => v.name === 'scale_max')?.value;
  return {
    scale_min: min != null ? String(min) : '0.0',
    scale_max: max != null ? String(max) : '5.0',
  };
}

export function emptyEditorValue(typeName, operation) {
  const list = isListType(typeName);
  if (operation === 'clear') return null;
  if (list || operation === 'add' || operation === 'remove') return [];
  const base = baseType(typeName);
  if (isMeasurementType(typeName)) {
    return { value: '', unit: MEASUREMENT_UNITS[base][0] };
  }
  if (base === 'money') return { amount: '', currency_code: 'AUD' };
  if (base === 'rating') return { value: '', scale_min: '1.0', scale_max: '5.0' };
  if (base === 'link') return { text: '', url: '' };
  if (base === 'boolean') return false;
  if (base === 'json' || base === 'rich_text_field') return '';
  return '';
}

export function parseMetafieldValue(typeName, value) {
  if (value == null || value === '') {
    return isListType(typeName) ? [] : null;
  }
  if (isListType(typeName)) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  const base = baseType(typeName);
  if (base === 'boolean') return String(value) === 'true';
  if (
    isMeasurementType(typeName) ||
    isComplexObjectType(typeName)
  ) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return String(value);
}

export function encodeMetafieldValue(typeName, editorValue) {
  if (isListType(typeName)) {
    const items = Array.isArray(editorValue) ? editorValue : [];
    return JSON.stringify(items.map((item) => encodeListItem(baseType(typeName), item)));
  }
  return encodeScalar(baseType(typeName), editorValue);
}

function encodeListItem(base, item) {
  if (REFERENCE_TYPES.has(base)) {
    return typeof item === 'string' ? item : item?.id ?? String(item);
  }
  if (Object.prototype.hasOwnProperty.call(MEASUREMENT_UNITS, base)) {
    return {
      value: Number(item?.value ?? item),
      unit: item?.unit ?? MEASUREMENT_UNITS[base][0],
    };
  }
  if (base === 'money') {
    return {
      amount: String(item?.amount ?? item),
      currency_code: String(item?.currency_code ?? 'AUD'),
    };
  }
  if (base === 'rating') {
    return {
      value: String(item?.value ?? item),
      scale_min: String(item?.scale_min ?? '1.0'),
      scale_max: String(item?.scale_max ?? '5.0'),
    };
  }
  if (base === 'link') {
    return { text: String(item?.text ?? ''), url: String(item?.url ?? '') };
  }
  if (base === 'boolean') return item === true || item === 'true';
  return item;
}

function encodeScalar(base, value) {
  if (base === 'boolean') return value === true || value === 'true' ? 'true' : 'false';
  if (Object.prototype.hasOwnProperty.call(MEASUREMENT_UNITS, base)) {
    return JSON.stringify({
      value: Number(value?.value ?? 0),
      unit: value?.unit ?? MEASUREMENT_UNITS[base][0],
    });
  }
  if (base === 'money') {
    return JSON.stringify({
      amount: String(value?.amount ?? ''),
      currency_code: String(value?.currency_code ?? 'AUD'),
    });
  }
  if (base === 'rating') {
    return JSON.stringify({
      value: String(value?.value ?? ''),
      scale_min: String(value?.scale_min ?? '1.0'),
      scale_max: String(value?.scale_max ?? '5.0'),
    });
  }
  if (base === 'link') {
    return JSON.stringify({
      text: String(value?.text ?? ''),
      url: String(value?.url ?? ''),
    });
  }
  if (base === 'json' || base === 'rich_text_field') {
    if (typeof value === 'string') {
      JSON.parse(value); // throws if invalid
      return value;
    }
    return JSON.stringify(value);
  }
  if (value == null) return '';
  return String(value);
}

export function valuesEqual(a, b) {
  return JSON.stringify(normalizeForCompare(a)) === JSON.stringify(normalizeForCompare(b));
}

function normalizeForCompare(value) {
  if (value && typeof value === 'object' && value.id) return String(value.id);
  return value;
}

export function mergeUnique(existing, additions) {
  const out = [...(existing ?? [])];
  for (const item of additions) {
    if (!out.some((x) => valuesEqual(x, item))) out.push(item);
  }
  return out;
}

export function removeMatches(existing, toRemove) {
  return (existing ?? []).filter((item) => !toRemove.some((x) => valuesEqual(x, item)));
}

export function definitionLabel(def) {
  return `${def.name} (${def.namespace}.${def.key})`;
}

export function formatDisplayValue(typeName, value, labelMap = null) {
  if (value == null || value === '') return '-';
  if (Array.isArray(value)) {
    if (!value.length) return '(empty)';
    return value.map((v) => formatDisplayValue(baseType(typeName), v, labelMap)).join(', ');
  }
  if (typeof value === 'object') {
    if (value.id) {
      return (
        value.label ||
        labelMap?.get(String(value.id)) ||
        humanizeRef(value.id)
      );
    }
    if (value.amount != null) return `${value.amount} ${value.currency_code ?? ''}`.trim();
    if (value.unit != null) return `${value.value} ${value.unit}`;
    if (value.text != null && value.url != null) return `${value.text} -> ${value.url}`;
    if (value.value != null && value.scale_max != null) {
      return `${value.value} (${value.scale_min}-${value.scale_max})`;
    }
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  if (typeof value === 'string' && value.startsWith('gid://')) {
    return labelMap?.get(value) || humanizeRef(value);
  }
  return String(value);
}

function humanizeRef(gid) {
  const parts = String(gid).split('/');
  const type = parts[parts.length - 2] || 'Item';
  const id = parts[parts.length - 1] || '';
  return `${type} ${id}`.trim();
}

/** Split pasted CSV / newline / comma text into string tokens. */
export function parsePasteTokens(text) {
  if (!text || !String(text).trim()) return [];
  return String(text)
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function summarizeRuleValue(typeName, operation, editorValue, labelMap = null) {
  if (operation === 'clear') return 'clear metafield';
  return formatDisplayValue(typeName, editorValue, labelMap);
}
