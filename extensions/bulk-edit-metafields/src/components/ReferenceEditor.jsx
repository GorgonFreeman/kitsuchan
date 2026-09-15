/** @jsxImportSource preact */
import { useState } from 'preact/hooks';
import {
  fetchMetaobjectType,
  fetchMetaobjects,
} from '../operations.js';
import {
  isMetaobjectRefType,
  isResourcePickerType,
  metaobjectDefinitionId,
  parsePasteTokens,
  resourcePickerType,
} from '../valueCodec.js';

/**
 * Reference editor — resourcePicker / metaobject picker when possible,
 * otherwise GID paste (pages, files, customers, etc.).
 */
export function ReferenceEditor({
  definition,
  values,
  onChange,
  multiple,
  pickLabel,
  onError,
  i18n,
}) {
  const [gidPaste, setGidPaste] = useState('');
  const items = Array.isArray(values) ? values : values ? [values] : [];
  const typeName = definition.type;
  const pickerType = resourcePickerType(typeName);
  const canPick =
    isResourcePickerType(typeName) || isMetaobjectRefType(typeName);

  async function pickResources() {
    try {
      if (isMetaobjectRefType(typeName)) {
        await pickMetaobjects();
        return;
      }
      if (!pickerType) return;
      const selected = await shopify.resourcePicker({
        type: pickerType,
        multiple: Boolean(multiple),
        action: 'select',
      });
      if (!selected) return;
      const list = Array.isArray(selected) ? selected : [selected];
      const next = list.map((r) => ({
        id: r.id,
        label: r.title ?? r.name ?? r.displayName ?? r.id,
      }));
      if (multiple) onChange(mergeById(items, next));
      else onChange(next[0] ? [next[0]] : []);
    } catch (err) {
      onError?.(err instanceof Error ? err.message : String(err));
    }
  }

  async function pickMetaobjects() {
    const defId = metaobjectDefinitionId(definition.validations);
    if (!defId) {
      throw new Error('This metafield has no metaobject definition constraint.');
    }
    const def = await fetchMetaobjectType(defId);
    if (!def?.type) throw new Error('Could not load metaobject definition type.');
    const entries = await fetchMetaobjects(def.type);
    const picker = await shopify.picker({
      heading: def.name || 'Select metaobjects',
      multiple: Boolean(multiple),
      headers: [{ content: 'Name' }, { content: 'Handle' }],
      items: entries.map((entry) => ({
        id: entry.id,
        heading: entry.displayName || entry.handle,
        data: [entry.handle],
        selected: items.some((i) => i.id === entry.id),
      })),
    });
    const selectedIds = await picker.selected;
    if (!selectedIds) return;
    const idSet = new Set(selectedIds);
    onChange(
      entries
        .filter((e) => idSet.has(e.id))
        .map((e) => ({ id: e.id, label: e.displayName || e.handle })),
    );
  }

  function importGids() {
    const tokens = parsePasteTokens(gidPaste);
    if (!tokens.length) return;
    let next = multiple ? [...items] : [];
    for (const id of tokens) {
      if (!next.some((i) => (i.id ?? i) === id)) {
        next.push({ id, label: id });
      }
    }
    if (!multiple) next = next.slice(-1);
    onChange(next);
    setGidPaste('');
  }

  function removeAt(index) {
    onChange(items.filter((_, i) => i !== index));
  }

  return (
    <s-stack direction="block" gap="base">
      {canPick && <s-button onClick={pickResources}>{pickLabel}</s-button>}
      {!canPick && (
        <s-text color="subdued">
          {i18n.translate('gid-paste-help')}
        </s-text>
      )}
      <s-text-area
        label={i18n.translate('paste-gids')}
        value={gidPaste}
        rows={2}
        onChange={(e) => setGidPaste(e.currentTarget.value)}
      />
      <s-button disabled={!gidPaste.trim()} onClick={importGids}>
        {i18n.translate('add-gids')}
      </s-button>
      {items.length > 0 && (
        <s-stack direction="inline" gap="small-200">
          {items.map((item, index) => (
            <s-clickable-chip
              key={item.id ?? index}
              removable
              onRemove={() => removeAt(index)}
            >
              {item.label ?? item.id}
            </s-clickable-chip>
          ))}
        </s-stack>
      )}
    </s-stack>
  );
}

function mergeById(existing, additions) {
  const out = [...existing];
  for (const item of additions) {
    if (!out.some((x) => x.id === item.id)) out.push(item);
  }
  return out;
}

export function referenceGids(state) {
  const list = Array.isArray(state) ? state : state ? [state] : [];
  return list.map((item) => (typeof item === 'string' ? item : item.id)).filter(Boolean);
}
