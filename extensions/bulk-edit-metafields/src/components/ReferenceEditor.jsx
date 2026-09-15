/** @jsxImportSource preact */
import { useState } from 'preact/hooks';
import {
  fetchMetaobjectType,
  fetchMetaobjects,
} from '../operations.js';
import {
  isMetaobjectRefType,
  isResourcePickerType,
  metaobjectDefinitionIds,
  parsePasteTokens,
  resourcePickerType,
} from '../valueCodec.js';

/**
 * Reference editor - native pickers for product/collection/variant/metaobject.
 * Metaobject picker shows display names + color/image thumbnails (Shopify-like).
 * GID paste only for reference types without a picker.
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
  const [picking, setPicking] = useState(false);
  const items = Array.isArray(values) ? values : values ? [values] : [];
  const typeName = definition.type;
  const pickerType = resourcePickerType(typeName);
  const isMetaobject = isMetaobjectRefType(typeName);
  const canPick = isResourcePickerType(typeName) || isMetaobject;
  const showGidPaste = !canPick;

  async function pickResources() {
    setPicking(true);
    try {
      if (isMetaobject) {
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
    } finally {
      setPicking(false);
    }
  }

  async function pickMetaobjects() {
    const defIds = metaobjectDefinitionIds(definition.validations);
    if (!defIds.length) {
      throw new Error('This metafield has no metaobject definition constraint.');
    }

    const entries = [];
    const typeNames = [];
    for (const defId of defIds) {
      const def = await fetchMetaobjectType(defId);
      if (!def?.type) continue;
      typeNames.push(def.name || def.type);
      const nodes = await fetchMetaobjects(def.type, def);
      for (const entry of nodes) {
        entries.push(entry);
      }
    }

    if (!entries.length) {
      throw new Error('No metaobject entries found for this definition.');
    }

    const heading =
      typeNames.length === 1
        ? typeNames[0]
        : i18n.translate('pick-metaobjects');

    const picker = await shopify.picker({
      heading,
      multiple: Boolean(multiple),
      headers: typeNames.length > 1 ? [{ content: 'Type' }] : undefined,
      items: entries.map((entry) => ({
        id: entry.id,
        heading: entry.displayName,
        data: typeNames.length > 1 ? [entry.typeLabel] : undefined,
        thumbnail: entry.thumbnailUrl ? { url: entry.thumbnailUrl } : undefined,
        selected: items.some((i) => i.id === entry.id),
      })),
    });

    const selectedIds = await picker.selected;
    if (!selectedIds) return;

    const idSet = new Set(selectedIds);
    onChange(
      entries
        .filter((e) => idSet.has(e.id))
        .map((e) => ({
          id: e.id,
          label: e.displayName,
          thumbnailUrl: e.thumbnailUrl,
          color: e.color,
        })),
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

  const buttonLabel = isMetaobject
    ? i18n.translate(multiple ? 'pick-metaobjects-multiple' : 'pick-metaobjects')
    : pickLabel;

  return (
    <s-stack direction="block" gap="base">
      {canPick && (
        <s-button loading={picking} onClick={pickResources}>
          {buttonLabel}
        </s-button>
      )}

      {showGidPaste && (
        <s-stack direction="block" gap="base">
          <s-text color="subdued">{i18n.translate('gid-paste-help')}</s-text>
          <s-text-area
            label={i18n.translate('paste-gids')}
            value={gidPaste}
            rows={2}
            onChange={(e) => setGidPaste(e.currentTarget.value)}
          />
          <s-button disabled={!gidPaste.trim()} onClick={importGids}>
            {i18n.translate('add-gids')}
          </s-button>
        </s-stack>
      )}

      {items.length > 0 && (
        <s-stack direction="inline" gap="small-200" alignItems="center">
          {items.map((item, index) => (
            <s-stack key={item.id ?? index} direction="inline" gap="small-200" alignItems="center">
              {item.thumbnailUrl && (
                <s-thumbnail src={item.thumbnailUrl} alt={item.label ?? ''} size="small" />
              )}
              <s-clickable-chip removable onRemove={() => removeAt(index)}>
                {item.label ?? item.id}
              </s-clickable-chip>
            </s-stack>
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
