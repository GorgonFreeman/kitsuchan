/** @jsxImportSource preact */
import { ListChipEditor, chipValues } from './ListChipEditor.jsx';
import { ReferenceEditor, referenceGids } from './ReferenceEditor.jsx';
import {
  baseType,
  isComplexObjectType,
  isListType,
  isMeasurementType,
  isReferenceType,
  MEASUREMENT_UNITS,
  ratingScale,
} from '../valueCodec.js';

export function ValueEditor({ definition, operation, value, onChange, onError, i18n }) {
  const typeName = definition.type;
  const list = isListType(typeName);
  const ref = isReferenceType(typeName);
  const base = baseType(typeName);

  if (operation === 'clear') return null;

  if (ref) {
    return (
      <ReferenceEditor
        definition={definition}
        values={value ?? []}
        onChange={onChange}
        onError={onError}
        multiple={list || operation === 'add' || operation === 'remove'}
        pickLabel={i18n.translate('pick-resources')}
        i18n={i18n}
      />
    );
  }

  // List ops for measurements/complex: paste JSON lines or use chip strings
  if (list || operation === 'add' || operation === 'remove') {
    if (isMeasurementType(typeName) || isComplexObjectType(typeName)) {
      return (
        <JsonListEditor
          values={value ?? []}
          onChange={onChange}
          label={i18n.translate('values-json')}
          help={i18n.translate('values-json-help')}
        />
      );
    }
    return (
      <ListChipEditor
        values={value ?? []}
        onChange={onChange}
        inputLabel={i18n.translate('values')}
        addLabel={i18n.translate('add-value')}
        placeholder={placeholderFor(base)}
        pasteLabel={i18n.translate('paste-csv')}
        pasteHelp={i18n.translate('paste-csv-help')}
      />
    );
  }

  return (
    <ScalarEditor
      base={base}
      typeName={typeName}
      definition={definition}
      value={value}
      onChange={onChange}
      label={i18n.translate('value')}
      i18n={i18n}
    />
  );
}

function ScalarEditor({ base, typeName, definition, value, onChange, label, i18n }) {
  if (base === 'boolean') {
    return (
      <s-checkbox
        label={label}
        checked={value === true || value === 'true'}
        onChange={(e) => onChange(Boolean(e.currentTarget.checked))}
      />
    );
  }
  if (base === 'number_integer' || base === 'number_decimal') {
    return (
      <s-number-field
        label={label}
        value={value === '' || value == null ? '' : String(value)}
        onChange={(e) => onChange(e.currentTarget.value)}
      />
    );
  }
  if (base === 'date' || base === 'date_time') {
    return (
      <s-date-field
        label={label}
        value={value || ''}
        onChange={(e) => onChange(e.currentTarget.value)}
      />
    );
  }
  if (base === 'url') {
    return (
      <s-url-field
        label={label}
        value={value || ''}
        onChange={(e) => onChange(e.currentTarget.value)}
      />
    );
  }
  if (base === 'color') {
    return (
      <s-color-field
        label={label}
        value={value || '#000000'}
        defaultValue="#000000"
        onChange={(e) => onChange(e.currentTarget.value)}
      />
    );
  }
  if (base === 'multi_line_text_field') {
    return (
      <s-text-area
        label={label}
        value={value || ''}
        rows={4}
        onChange={(e) => onChange(e.currentTarget.value)}
      />
    );
  }
  if (isMeasurementType(typeName)) {
    const units = MEASUREMENT_UNITS[base] ?? [];
    const current = value && typeof value === 'object' ? value : { value: '', unit: units[0] };
    return (
      <s-stack direction="inline" gap="base" alignItems="end">
        <s-number-field
          label={label}
          value={current.value === '' || current.value == null ? '' : String(current.value)}
          onChange={(e) => onChange({ ...current, value: e.currentTarget.value })}
        />
        <s-select
          label={i18n.translate('unit')}
          value={current.unit || units[0]}
          onChange={(e) => onChange({ ...current, unit: e.currentTarget.value })}
        >
          {units.map((u) => (
            <s-option key={u} value={u}>{u}</s-option>
          ))}
        </s-select>
      </s-stack>
    );
  }
  if (base === 'money') {
    const current = value && typeof value === 'object' ? value : { amount: '', currency_code: 'AUD' };
    return (
      <s-stack direction="inline" gap="base" alignItems="end">
        <s-text-field
          label={i18n.translate('amount')}
          value={current.amount || ''}
          onChange={(e) => onChange({ ...current, amount: e.currentTarget.value })}
        />
        <s-text-field
          label={i18n.translate('currency')}
          value={current.currency_code || 'AUD'}
          onChange={(e) => onChange({ ...current, currency_code: e.currentTarget.value })}
        />
      </s-stack>
    );
  }
  if (base === 'rating') {
    const scale = ratingScale(definition.validations);
    const current =
      value && typeof value === 'object'
        ? value
        : { value: '', ...scale };
    return (
      <s-number-field
        label={label}
        details={`${current.scale_min} – ${current.scale_max}`}
        value={current.value === '' || current.value == null ? '' : String(current.value)}
        onChange={(e) =>
          onChange({
            value: e.currentTarget.value,
            scale_min: current.scale_min ?? scale.scale_min,
            scale_max: current.scale_max ?? scale.scale_max,
          })
        }
      />
    );
  }
  if (base === 'link') {
    const current = value && typeof value === 'object' ? value : { text: '', url: '' };
    return (
      <s-stack direction="block" gap="base">
        <s-text-field
          label={i18n.translate('link-text')}
          value={current.text || ''}
          onChange={(e) => onChange({ ...current, text: e.currentTarget.value })}
        />
        <s-url-field
          label={i18n.translate('link-url')}
          value={current.url || ''}
          onChange={(e) => onChange({ ...current, url: e.currentTarget.value })}
        />
      </s-stack>
    );
  }
  if (base === 'json' || base === 'rich_text_field') {
    return (
      <s-text-area
        label={label}
        details={i18n.translate('json-help')}
        value={typeof value === 'string' ? value : value ? JSON.stringify(value, null, 2) : ''}
        rows={6}
        onChange={(e) => onChange(e.currentTarget.value)}
      />
    );
  }
  return (
    <s-text-field
      label={label}
      value={value || ''}
      onChange={(e) => onChange(e.currentTarget.value)}
    />
  );
}

function JsonListEditor({ values, onChange, label, help }) {
  const text = Array.isArray(values)
    ? values.map((v) => (typeof v === 'string' ? v : JSON.stringify(v))).join('\n')
    : '';
  return (
    <s-text-area
      label={label}
      details={help}
      value={text}
      rows={5}
      onChange={(e) => {
        const lines = e.currentTarget.value
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean);
        const parsed = lines.map((line) => {
          try {
            return JSON.parse(line);
          } catch {
            return line;
          }
        });
        onChange(parsed);
      }}
    />
  );
}

function placeholderFor(base) {
  if (base === 'url') return 'https://';
  if (base === 'color') return '#000000';
  return '';
}

export function editorValueForOperation(definition, operation, editorState) {
  const typeName = definition.type;
  const list = isListType(typeName);
  const ref = isReferenceType(typeName);

  if (operation === 'clear') return null;

  if (ref) {
    const gids = referenceGids(editorState);
    if (list || operation === 'add' || operation === 'remove') return gids;
    return gids[0] ?? '';
  }

  if (list || operation === 'add' || operation === 'remove') {
    return chipValues(editorState);
  }

  if (baseType(typeName) === 'rating' && definition.validations) {
    const scale = ratingScale(definition.validations);
    return {
      ...(typeof editorState === 'object' && editorState ? editorState : { value: editorState }),
      scale_min: editorState?.scale_min ?? scale.scale_min,
      scale_max: editorState?.scale_max ?? scale.scale_max,
    };
  }

  return editorState;
}

export function isEditorReady(definition, operation, editorState, clearConfirm) {
  if (operation === 'clear') return clearConfirm === 'clear';
  try {
    const prepared = editorValueForOperation(definition, operation, editorState);
    if (Array.isArray(prepared)) return prepared.length > 0;
    if (typeof prepared === 'boolean') return true;
    if (prepared && typeof prepared === 'object') {
      if ('amount' in prepared) return Boolean(String(prepared.amount || '').trim());
      if ('value' in prepared && 'unit' in prepared) {
        return prepared.value !== '' && prepared.value != null;
      }
      if ('text' in prepared) {
        return Boolean(String(prepared.text || '').trim() && String(prepared.url || '').trim());
      }
      if ('value' in prepared && 'scale_max' in prepared) {
        return prepared.value !== '' && prepared.value != null;
      }
    }
    const base = baseType(definition.type);
    if (base === 'json' || base === 'rich_text_field') {
      if (!String(prepared || '').trim()) return false;
      JSON.parse(String(prepared));
      return true;
    }
    return prepared != null && String(prepared).trim() !== '';
  } catch {
    return false;
  }
}
