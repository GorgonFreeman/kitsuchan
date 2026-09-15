/** @jsxImportSource preact */
import { useState } from 'preact/hooks';

/** Chip list editor for list metafield scalar values. */
export function ListChipEditor({ values, onChange, inputLabel, addLabel, placeholder }) {
  const [draft, setDraft] = useState('');
  const list = Array.isArray(values) ? values : [];

  function addItem() {
    const trimmed = String(draft).trim();
    if (!trimmed) return;
    if (list.some((v) => String(v) === trimmed)) {
      setDraft('');
      return;
    }
    onChange([...list, trimmed]);
    setDraft('');
  }

  function removeAt(index) {
    onChange(list.filter((_, i) => i !== index));
  }

  return (
    <s-stack direction="block" gap="base">
      <s-stack direction="inline" gap="base" alignItems="end">
        <s-text-field
          label={inputLabel}
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.currentTarget.value)}
        />
        <s-button onClick={addItem}>{addLabel}</s-button>
      </s-stack>
      {list.length > 0 && (
        <s-stack direction="inline" gap="small-200">
          {list.map((item, index) => (
            <s-clickable-chip
              key={`${item}-${index}`}
              removable
              onRemove={() => removeAt(index)}
            >
              {String(item)}
            </s-clickable-chip>
          ))}
        </s-stack>
      )}
    </s-stack>
  );
}

export function chipValues(state) {
  return Array.isArray(state) ? state : [];
}
