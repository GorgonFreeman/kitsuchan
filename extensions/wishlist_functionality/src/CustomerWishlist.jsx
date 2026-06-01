/** @jsxImportSource preact */
import '@shopify/ui-extensions/preact';
import { render } from 'preact';
import { useState, useEffect, useCallback } from 'preact/hooks';
import { EmojiSwatch, ColourSwatch } from './EmojiSwatch.jsx';
import {
  getShopDomain,
  getInitialBoards,
  getProductsByIds,
  getWishlistEmojis,
  getWishlistColours,
} from './adminGraphql.js';
import {
  createBoard as apiCreateBoard,
  editBoard as apiEditBoard,
  deleteBoard as apiDeleteBoard,
  removeItem as apiRemoveItem,
  removeAllItems as apiRemoveAllItems,
} from './wishlistApi.js';
import { configForShop } from './regionConfig.js';

export default async () => {
  render(<Extension />, document.body);
};

function gidToNumeric(gid) {
  if (!gid) return null;
  const idx = String(gid).lastIndexOf('/');
  return idx >= 0 ? String(gid).slice(idx + 1) : String(gid);
}

const BOARD_CONFIG = {
  DEFAULT_BOARD_ID: 1,
  MAX_BOARDS: 12,
  MAX_NAME_LENGTH: 25,
};

function parseWishlistId(id) {
  const parts = String(id).split(':');
  return { productId: parts[0], variantId: parts[1] ?? null };
}

// ─── Board form (create / edit) ──────────────────────────────────────────────

function BoardForm({ initial, emojis, colours, onSave, onCancel, saving, error }) {
  const defaultEmoji = emojis.find(e => e.default) ?? emojis[0];
  const defaultColour = colours.find(c => c.default) ?? colours[0];

  const [name, setName] = useState(initial?.name ?? '');
  const [emoji, setEmoji] = useState(initial?.emoji ?? defaultEmoji?.value ?? '');
  const [colour, setColour] = useState(initial?.colour ?? defaultColour?.colour ?? '#FF6B6B');

  const selectedEmojiEntry = emojis.find(e => e.value === emoji) ?? emojis.find(e => e.display === emoji);

  return (
    <s-box padding="base" border="base" border-radius="base">
      <s-stack direction="block" gap="base">
        {error && <s-banner tone="critical"><s-text>{error}</s-text></s-banner>}

        <s-text-field
          label="Board name"
          value={name}
          onInput={e => setName(e.target.value)}
          max-length={BOARD_CONFIG.MAX_NAME_LENGTH}
          placeholder="e.g. Summer Looks"
        />

        <s-stack direction="block" gap="small">
          <s-text type="subdued">Emoji</s-text>
          <s-stack direction="inline" gap="small" wrap="wrap">
            {emojis.map(entry => (
              <s-pressable
                key={entry.value}
                onPress={() => setEmoji(entry.value)}
                style={{
                  padding: '4px',
                  borderRadius: '6px',
                  border: emoji === entry.value ? '2px solid #333' : '2px solid transparent',
                  background: emoji === entry.value ? '#f0f0f0' : 'transparent',
                }}
              >
                <EmojiSwatch entry={entry} size={22} />
              </s-pressable>
            ))}
          </s-stack>
        </s-stack>

        <s-stack direction="block" gap="small">
          <s-text type="subdued">Colour</s-text>
          <s-stack direction="inline" gap="small" wrap="wrap">
            {colours.map(c => (
              <s-pressable key={c.value} onPress={() => setColour(c.colour)}>
                <ColourSwatch value={c.colour} size={24} selected={colour === c.colour} />
              </s-pressable>
            ))}
          </s-stack>
        </s-stack>

        <s-stack direction="inline" gap="small">
          <s-button
            variant="primary"
            loading={saving}
            onPress={() => onSave({ name: name.trim(), emoji, colour })}
          >
            Save
          </s-button>
          <s-button onPress={onCancel}>Cancel</s-button>
        </s-stack>
      </s-stack>
    </s-box>
  );
}

// ─── Single item row ──────────────────────────────────────────────────────────

function ItemRow({ wishlistId, boardId, productMap, customerId, config, onBoards }) {
  const { productId } = parseWishlistId(wishlistId);
  const info = productMap.get(productId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function handle(op) {
    setBusy(true);
    setError(null);
    try {
      const result = await op();
      if (!result.success) { setError(result.message); return; }
      onBoards(result.boards);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <s-box padding-block="small" padding-inline="small" border="base" border-radius="base">
      <s-stack direction="inline" gap="base" block-align="center">
        {info?.image && (
          <img
            src={info.image.url}
            alt={info.image.altText ?? info?.title ?? ''}
            width={48}
            height={48}
            style={{ objectFit: 'cover', borderRadius: 4, flexShrink: 0 }}
          />
        )}
        <s-box grow="true">
          <s-text type="strong">{info?.title ?? productId}</s-text>
          {error && <s-text tone="critical">{error}</s-text>}
        </s-box>
        <s-button
          size="slim"
          loading={busy}
          onPress={() => handle(() => apiRemoveItem(customerId, config, boardId, productId))}
        >
          Remove
        </s-button>
        <s-button
          size="slim"
          tone="critical"
          loading={busy}
          onPress={() => handle(() => apiRemoveAllItems(customerId, config, productId))}
        >
          Remove from all
        </s-button>
      </s-stack>
    </s-box>
  );
}

// ─── Single board card ────────────────────────────────────────────────────────

function BoardCard({ board, emojis, colours, productMap, customerId, config, onBoards, isOnly }) {
  const [expanded, setExpanded] = useState(false);
  const [mode, setMode] = useState('view'); // 'view' | 'edit' | 'delete'
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState(null);

  const isDefault = board.id === BOARD_CONFIG.DEFAULT_BOARD_ID;
  const emojiEntry = emojis.find(e => e.value === board.emoji) ?? { type: 'emoji', display: board.emoji ?? '❤️' };

  async function handleEdit({ name, emoji, colour }) {
    if (!name) { setFormError('Board name is required'); return; }
    setBusy(true);
    setFormError(null);
    try {
      const result = await apiEditBoard(customerId, config, {
        boardId: board.id,
        boardName: name,
        emoji,
        colour,
      });
      if (!result.success) { setFormError(result.message); return; }
      onBoards(result.boards);
      setMode('view');
    } catch (e) {
      setFormError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    setBusy(true);
    try {
      const result = await apiDeleteBoard(customerId, config, board.id);
      if (!result.success) { setFormError(result.message); return; }
      onBoards(result.boards);
    } catch (e) {
      setFormError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <s-box border="base" border-radius="base" padding="base">
      <s-stack direction="block" gap="small">

        {/* Board header row */}
        <s-stack direction="inline" gap="small" block-align="center">
          <EmojiSwatch entry={emojiEntry} size={20} />
          <ColourSwatch value={board.colour ?? '#FF6B6B'} size={14} />
          <s-box grow="true">
            <s-text type="strong">{board.name}</s-text>
            <s-text type="subdued"> · {board.items?.length ?? 0} item{board.items?.length !== 1 ? 's' : ''}</s-text>
          </s-box>
          <s-button size="slim" onPress={() => setExpanded(v => !v)}>
            {expanded ? 'Hide' : 'Show'}
          </s-button>
          <s-button size="slim" onPress={() => { setMode(mode === 'edit' ? 'view' : 'edit'); setFormError(null); }}>
            Edit
          </s-button>
          {!isDefault && !isOnly && (
            <s-button
              size="slim"
              tone="critical"
              onPress={() => setMode(mode === 'delete' ? 'view' : 'delete')}
            >
              Delete
            </s-button>
          )}
        </s-stack>

        {/* Edit form */}
        {mode === 'edit' && (
          <BoardForm
            initial={board}
            emojis={emojis}
            colours={colours}
            onSave={handleEdit}
            onCancel={() => { setMode('view'); setFormError(null); }}
            saving={busy}
            error={formError}
          />
        )}

        {/* Delete confirm */}
        {mode === 'delete' && (
          <s-box padding="small" background="subdued" border-radius="base">
            <s-stack direction="inline" gap="small" block-align="center">
              <s-text>Delete "{board.name}"? Items in this board will be lost.</s-text>
              {formError && <s-text tone="critical">{formError}</s-text>}
              <s-button tone="critical" loading={busy} onPress={handleDelete}>Confirm delete</s-button>
              <s-button onPress={() => { setMode('view'); setFormError(null); }}>Cancel</s-button>
            </s-stack>
          </s-box>
        )}

        {/* Items list */}
        {expanded && (
          <s-stack direction="block" gap="small">
            {!board.items?.length && <s-text type="subdued">No items in this board.</s-text>}
            {board.items?.map(id => (
              <ItemRow
                key={id}
                wishlistId={id}
                boardId={board.id}
                productMap={productMap}
                customerId={customerId}
                config={config}
                onBoards={onBoards}
              />
            ))}
          </s-stack>
        )}

      </s-stack>
    </s-box>
  );
}

// ─── Root extension ───────────────────────────────────────────────────────────

function Extension() {
  const { data } = shopify;
  const customerGid = data?.selected?.[0]?.id ?? null;
  const customerId = gidToNumeric(customerGid);

  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'error'
  const [loadError, setLoadError] = useState(null);
  const [config, setConfig] = useState(null);
  const [boards, setBoards] = useState([]);
  const [productMap, setProductMap] = useState(new Map());
  const [emojis, setEmojis] = useState([]);
  const [colours, setColours] = useState([]);

  // Create board form state
  const [showCreate, setShowCreate] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState(null);

  // Refresh product thumbnails whenever boards change
  const refreshProducts = useCallback(async (currentBoards) => {
    const ids = new Set();
    for (const board of currentBoards) {
      for (const item of board.items ?? []) {
        ids.add(parseWishlistId(item).productId);
      }
    }
    if (!ids.size) return;
    const map = await getProductsByIds([...ids]);
    setProductMap(prev => new Map([...prev, ...map]));
  }, []);

  const handleBoards = useCallback((newBoards) => {
    setBoards(newBoards);
    refreshProducts(newBoards);
  }, [refreshProducts]);

  useEffect(() => {
    if (!customerGid) {
      setStatus('error');
      setLoadError('No customer selected.');
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        const [domain, initialBoards, fetchedEmojis, fetchedColours] = await Promise.all([
          getShopDomain(),
          getInitialBoards(customerGid),
          getWishlistEmojis(),
          getWishlistColours(),
        ]);

        if (cancelled) return;

        const cfg = configForShop(domain);
        setConfig(cfg);
        setBoards(initialBoards);
        setEmojis(fetchedEmojis);
        setColours(fetchedColours);
        setStatus('ready');

        refreshProducts(initialBoards);
      } catch (e) {
        if (cancelled) return;
        setLoadError(e.message);
        setStatus('error');
      }
    }

    load();
    return () => { cancelled = true; };
  }, [customerGid, refreshProducts]);

  async function handleCreate({ name, emoji, colour }) {
    if (!name) { setCreateError('Board name is required'); return; }
    setCreateBusy(true);
    setCreateError(null);
    try {
      const result = await apiCreateBoard(customerId, config, { boardName: name, emoji, colour });
      if (!result.success) { setCreateError(result.message); return; }
      handleBoards(result.boards);
      setShowCreate(false);
    } catch (e) {
      setCreateError(e.message);
    } finally {
      setCreateBusy(false);
    }
  }

  if (status === 'loading') {
    return (
      <s-admin-block heading="Wishlist boards">
        <s-spinner />
      </s-admin-block>
    );
  }

  if (status === 'error') {
    return (
      <s-admin-block heading="Wishlist boards">
        <s-banner tone="critical">
          <s-text>{loadError ?? 'Failed to load wishlist.'}</s-text>
        </s-banner>
      </s-admin-block>
    );
  }

  const canCreateMore = boards.length < BOARD_CONFIG.MAX_BOARDS;

  return (
    <s-admin-block heading="Wishlist boards">
      <s-stack direction="block" gap="base">

        {!boards.length && (
          <s-text type="subdued">This customer has no wishlist boards yet.</s-text>
        )}

        {boards.map(board => (
          <BoardCard
            key={board.id}
            board={board}
            emojis={emojis}
            colours={colours}
            productMap={productMap}
            customerId={customerId}
            config={config}
            onBoards={handleBoards}
            isOnly={boards.length === 1}
          />
        ))}

        {showCreate ? (
          <BoardForm
            emojis={emojis}
            colours={colours}
            onSave={handleCreate}
            onCancel={() => { setShowCreate(false); setCreateError(null); }}
            saving={createBusy}
            error={createError}
          />
        ) : (
          canCreateMore && (
            <s-button onPress={() => setShowCreate(true)}>+ Create board</s-button>
          )
        )}

      </s-stack>
    </s-admin-block>
  );
}
