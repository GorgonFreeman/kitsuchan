/** @jsxImportSource preact */
import { ListChipEditor, chipValues } from './ListChipEditor.jsx';
import { ReferenceEditor, referenceGids } from './ReferenceEditor.jsx';
import {
  baseType,
  isListType,
  isReferenceType,
} from '../valueCodec.js';

/**
 * Type-aware value editor. `value` / `onChange` hold editor state;
 * use `editorValueForOperation(definition, operation, value)` before apply.
 */
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
      />
    );
  }

  if (list || operation === 'add' || operation === 'remove') {
    return (
      <ListChipEditor
        values={value ?? []}
        onChange={onChange}
        inputLabel={i18n.translate('values')}
        addLabel={i18n.translate('add-value')}
        placeholder={placeholderFor(base)}
      />
    );
  }

  return (
    <ScalarEditor
      base={base}
      value={value ?? ''}
      onChange={onChange}
      label={i18n.translate('value')}
    />
  );
}

function ScalarEditor({ base, value, onChange, label }) {
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
  return (
    <s-text-field
      label={label}
      value={value || ''}
      onChange={(e) => onChange(e.currentTarget.value)}
    />
  );
}

function placeholderFor(base) {
  if (base === 'url') return 'https://';
  if (base === 'color') return '#000000';
  return '';
}

/** Convert editor UI state into the value shape operations.js expects. */
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

  return editorState;
}

export function isEditorReady(definition, operation, editorState, clearConfirm) {
  if (operation === 'clear') return clearConfirm === 'clear';
  const prepared = editorValueForOperation(definition, operation, editorState);
  if (Array.isArray(prepared)) return prepared.length > 0;
  if (typeof prepared === 'boolean') return true;
  return prepared != null && String(prepared).trim() !== '';
}
