/** @jsxImportSource preact */
import { useState } from 'preact/hooks';
import { parsePasteTokens } from '../valueCodec.js';

/** Chip list editor with optional CSV / paste import. */
export function ListChipEditor({
  values,
  onChange,
  inputLabel,
  addLabel,
  placeholder,
  pasteLabel,
  pasteHelp,
}) {
  const [draft, setDraft] = useState('');
  const [paste, setPaste] = useState('');
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

  function importPaste() {
    const tokens = parsePasteTokens(paste);
    if (!tokens.length) return;
    const next = [...list];
    for (const token of tokens) {
      if (!next.some((v) => String(v) === token)) next.push(token);
    }
    onChange(next);
    setPaste('');
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
      <s-text-area
        label={pasteLabel}
        details={pasteHelp}
        value={paste}
        rows={3}
        onChange={(e) => setPaste(e.currentTarget.value)}
      />
      <s-button onClick={importPaste} disabled={!paste.trim()}>
        {addLabel} from paste
      </s-button>
      {list.length > 0 && (
        <s-stack direction="inline" gap="small-200">
          {list.map((item, index) => (
            <s-clickable-chip
              key={`${String(item)}-${index}`}
              removable
              onRemove={() => removeAt(index)}
            >
              {typeof item === 'object' ? JSON.stringify(item) : String(item)}
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
