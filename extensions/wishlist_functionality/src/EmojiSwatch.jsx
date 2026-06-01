/** @jsxImportSource preact */

export function EmojiSwatch({ entry, size = 24, style = {} }) {
  if (!entry) return null;
  const base = { width: size, height: size, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', ...style };
  if (entry.type === 'svg') {
    return (
      <span
        style={base}
        dangerouslySetInnerHTML={{ __html: entry.display }}
      />
    );
  }
  if (entry.type === 'image') {
    return <img src={entry.display} alt={entry.value} width={size} height={size} style={{ objectFit: 'contain', ...style }} />;
  }
  return <span style={{ fontSize: size * 0.85, lineHeight: 1, ...style }}>{entry.display}</span>;
}

export function ColourSwatch({ value, size = 20, selected = false, style = {} }) {
  return (
    <span
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: '50%',
        background: value,
        outline: selected ? '2px solid #333' : '2px solid transparent',
        outlineOffset: 2,
        cursor: 'pointer',
        ...style,
      }}
    />
  );
}
