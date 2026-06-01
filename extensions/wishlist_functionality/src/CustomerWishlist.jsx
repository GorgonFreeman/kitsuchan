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
  addItems as apiAddItems,
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

// ─── Skeleton tile shown while product data is loading ────────────────────────

function TileSkeleton() {
  return (
    <div style={{
      border: '1px solid #e1e3e5',
      borderRadius: 8,
      overflow: 'hidden',
      background: '#fff',
    }}>
      <div style={{ aspectRatio: '1', background: '#f0f0f0' }} />
      <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ height: 12, borderRadius: 4, background: '#e8e8e8', width: '80%' }} />
        <div style={{ height: 12, borderRadius: 4, background: '#e8e8e8', width: '50%' }} />
      </div>
    </div>
  );
}

// ─── Board form (create / edit) ───────────────────────────────────────────────

function BoardForm({ initial, emojis, colours, onSave, onCancel, saving, error }) {
  const defaultEmoji = emojis.find(e => e.default) ?? emojis[0];
  const defaultColour = colours.find(c => c.default) ?? colours[0];

  const [name, setName] = useState(initial?.name ?? '');
  const [emoji, setEmoji] = useState(initial?.emoji ?? defaultEmoji?.value ?? '');
  const [colour, setColour] = useState(initial?.colour ?? defaultColour?.colour ?? '#FF6B6B');

  return (
    <s-box padding="base" border="base" borderRadius="base">
      <s-stack direction="block" gap="base">
        {error && <s-banner tone="critical" heading={error} />}

        <s-text-field
          label="Board name"
          value={name}
          maxLength={BOARD_CONFIG.MAX_NAME_LENGTH}
          placeholder="e.g. Summer Looks"
          onChange={e => setName(e.target.value)}
        />

        {emojis.length > 0 && (
          <s-stack direction="block" gap="small">
            <s-text color="subdued">Emoji</s-text>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {emojis.map(entry => (
                <s-clickable
                  key={entry.value}
                  onClick={() => setEmoji(entry.value)}
                  padding="base"
                  borderRadius="base"
                  background={emoji === entry.value ? 'subdued' : undefined}
                >
                  <EmojiSwatch entry={entry} size={22} />
                </s-clickable>
              ))}
            </div>
          </s-stack>
        )}

        {colours.length > 0 && (
          <s-stack direction="block" gap="small">
            <s-text color="subdued">Colour</s-text>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {colours.map(c => (
                <s-clickable key={c.value} onClick={() => setColour(c.colour)}>
                  <ColourSwatch value={c.colour} size={28} selected={colour === c.colour} />
                </s-clickable>
              ))}
            </div>
          </s-stack>
        )}

        <s-stack direction="inline" gap="small">
          <s-button
            variant="primary"
            loading={saving || undefined}
            onClick={() => onSave({ name: name.trim(), emoji, colour })}
          >
            Save board
          </s-button>
          <s-button onClick={onCancel}>Cancel</s-button>
        </s-stack>
      </s-stack>
    </s-box>
  );
}

// ─── Product tile ─────────────────────────────────────────────────────────────

function ProductTile({ wishlistId, boardId, productMap, productsLoading, customerId, config, onBoards }) {
  const { productId } = parseWishlistId(wishlistId);
  const info = productMap.get(productId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  // Show skeleton while we're still fetching product data
  if (productsLoading && !info) return <TileSkeleton />;

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
    <div style={{
      border: '1px solid #e1e3e5',
      borderRadius: 8,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      background: '#fff',
    }}>
      {/* Thumbnail */}
      <div style={{ position: 'relative', aspectRatio: '1', background: '#f6f6f7' }}>
        {info?.image ? (
          <img
            src={info.image.url}
            alt={info.image.altText ?? info?.title ?? ''}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <s-icon type="product" />
          </div>
        )}
      </div>

      {/* Info + actions */}
      <div style={{ padding: '8px', display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
        <s-text type="strong">{info?.title ?? 'Unknown product'}</s-text>
        {error && <s-text tone="critical">{error}</s-text>}
        <div style={{ display: 'flex', gap: 4, marginTop: 'auto', flexWrap: 'wrap' }}>
          <s-button
            loading={busy || undefined}
            onClick={() => handle(() => apiRemoveItem(customerId, config, boardId, productId))}
          >
            Remove
          </s-button>
          <s-button
            tone="critical"
            loading={busy || undefined}
            onClick={() => handle(() => apiRemoveAllItems(customerId, config, productId))}
          >
            All boards
          </s-button>
        </div>
      </div>
    </div>
  );
}

// ─── Single board card ────────────────────────────────────────────────────────

function BoardCard({ board, emojis, colours, productMap, productsLoading, customerId, config, onBoards, isOnly }) {
  const [expanded, setExpanded] = useState(false);
  const [mode, setMode] = useState('view'); // 'view' | 'edit' | 'delete'
  const [busy, setBusy] = useState(false);
  const [addBusy, setAddBusy] = useState(false);
  const [formError, setFormError] = useState(null);

  const isDefault = board.id === BOARD_CONFIG.DEFAULT_BOARD_ID;
  const emojiEntry = emojis.find(e => e.value === board.emoji) ?? { type: 'emoji', display: board.emoji ?? '❤️' };
  const itemCount = board.items?.length ?? 0;

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

  async function handleAddProducts() {
    setAddBusy(true);
    setFormError(null);
    try {
      const currentGids = (board.items ?? []).map(id => ({
        id: `gid://shopify/Product/${parseWishlistId(id).productId}`,
      }));

      const picked = await shopify.resourcePicker({
        type: 'product',
        multiple: true,
        selectionIds: currentGids,
        query: 'published_status:published',
      });

      if (!picked?.length) return;

      const currentIds = new Set((board.items ?? []).map(id => parseWishlistId(id).productId));
      const newProductIds = picked
        .map(p => gidToNumeric(p.id))
        .filter(id => id && !currentIds.has(id));

      if (!newProductIds.length) return;

      const result = await apiAddItems(customerId, config, board.id, newProductIds);
      if (result.success) {
        onBoards(result.boards);
        setExpanded(true);
      } else {
        setFormError(result.message);
      }
    } catch (e) {
      if (!e.message?.toLowerCase().includes('cancel')) setFormError(e.message);
    } finally {
      setAddBusy(false);
    }
  }

  return (
    <div style={{
      border: '1px solid #e1e3e5',
      borderRadius: 8,
      overflow: 'hidden',
      background: '#fff',
    }}>
      {/* Coloured top stripe using board colour */}
      <div style={{ height: 4, background: board.colour ?? '#FF6B6B' }} />

      <div style={{ padding: 16 }}>
        <s-stack direction="block" gap="base">

          {/* Board header */}
          <s-stack direction="inline" gap="small" alignItems="center">
            <div style={{
              width: 40,
              height: 40,
              borderRadius: 8,
              background: `${board.colour ?? '#FF6B6B'}22`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}>
              <EmojiSwatch entry={emojiEntry} size={22} />
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <s-text type="strong">{board.name}</s-text>
              <br />
              <s-text color="subdued">
                {itemCount === 0
                  ? 'Empty board'
                  : `${itemCount} product${itemCount !== 1 ? 's' : ''}`}
              </s-text>
            </div>

            {/* Primary action */}
            <s-button
              variant="primary"
              loading={addBusy || undefined}
              onClick={handleAddProducts}
            >
              Add products
            </s-button>

            {/* Show/hide toggle */}
            {itemCount > 0 && (
              <s-button onClick={() => setExpanded(v => !v)}>
                {expanded ? 'Hide' : 'View'}
              </s-button>
            )}

            {/* Secondary actions in a menu */}
            <s-menu id={`board-menu-${board.id}`} accessibilityLabel="Board actions">
              <s-button
                variant="tertiary"
                onClick={() => { setMode(mode === 'edit' ? 'view' : 'edit'); setFormError(null); }}
              >
                Edit board
              </s-button>
              {!isDefault && !isOnly && (
                <s-button
                  variant="tertiary"
                  tone="critical"
                  onClick={() => setMode(mode === 'delete' ? 'view' : 'delete')}
                >
                  Delete board
                </s-button>
              )}
            </s-menu>
          </s-stack>

          {/* Error banner */}
          {formError && mode === 'view' && (
            <s-banner tone="critical" heading={formError} />
          )}

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
            <s-banner tone="warning" heading={`Delete "${board.name}"?`}>
              <s-stack direction="inline" gap="small">
                <s-button tone="critical" loading={busy || undefined} onClick={handleDelete}>
                  Yes, delete board
                </s-button>
                <s-button onClick={() => { setMode('view'); setFormError(null); }}>
                  Keep board
                </s-button>
              </s-stack>
            </s-banner>
          )}

          {/* Product tiles */}
          {expanded && itemCount > 0 && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
              gap: 12,
            }}>
              {board.items.map(id => (
                <ProductTile
                  key={id}
                  wishlistId={id}
                  boardId={board.id}
                  productMap={productMap}
                  productsLoading={productsLoading}
                  customerId={customerId}
                  config={config}
                  onBoards={onBoards}
                />
              ))}
            </div>
          )}

        </s-stack>
      </div>
    </div>
  );
}

// ─── Root extension ───────────────────────────────────────────────────────────

function Extension() {
  const { data } = shopify;
  const customerGid = data?.selected?.[0]?.id ?? null;
  const customerId = gidToNumeric(customerGid);

  const [status, setStatus] = useState('loading');
  const [loadError, setLoadError] = useState(null);
  const [config, setConfig] = useState(null);
  const [boards, setBoards] = useState([]);
  const [productMap, setProductMap] = useState(new Map());
  const [productsLoading, setProductsLoading] = useState(false);
  const [emojis, setEmojis] = useState([]);
  const [colours, setColours] = useState([]);

  const [showCreate, setShowCreate] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState(null);

  const refreshProducts = useCallback(async (currentBoards) => {
    const ids = new Set();
    for (const board of currentBoards) {
      for (const item of board.items ?? []) {
        ids.add(parseWishlistId(item).productId);
      }
    }
    if (!ids.size) return;
    setProductsLoading(true);
    try {
      const map = await getProductsByIds([...ids]);
      setProductMap(prev => new Map([...prev, ...map]));
    } catch {
      // non-fatal — tiles will show "Unknown product"
    } finally {
      setProductsLoading(false);
    }
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
      <s-admin-block heading="Wishlist">
        <s-stack direction="block" gap="base" alignItems="center">
          <s-spinner />
          <s-text color="subdued">Loading wishlist…</s-text>
        </s-stack>
      </s-admin-block>
    );
  }

  if (status === 'error') {
    return (
      <s-admin-block heading="Wishlist">
        <s-banner tone="critical" heading={loadError ?? 'Failed to load wishlist.'} />
      </s-admin-block>
    );
  }

  const totalProducts = boards.reduce((n, b) => n + (b.items?.length ?? 0), 0);
  const canCreateMore = boards.length < BOARD_CONFIG.MAX_BOARDS;

  return (
    <s-admin-block heading="Wishlist">
      <s-stack direction="block" gap="base">

        {/* Summary */}
        {boards.length > 0 && (
          <s-text color="subdued">
            {boards.length} board{boards.length !== 1 ? 's' : ''} · {totalProducts} product{totalProducts !== 1 ? 's' : ''} saved
          </s-text>
        )}

        {/* Empty state */}
        {boards.length === 0 && (
          <s-box padding="large" background="subdued" borderRadius="base">
            <s-stack direction="block" gap="small" alignItems="center">
              <s-text type="strong">No wishlist yet</s-text>
              <s-text color="subdued">This customer hasn't saved any products to their wishlist.</s-text>
            </s-stack>
          </s-box>
        )}

        {boards.map(board => (
          <BoardCard
            key={board.id}
            board={board}
            emojis={emojis}
            colours={colours}
            productMap={productMap}
            productsLoading={productsLoading}
            customerId={customerId}
            config={config}
            onBoards={handleBoards}
            isOnly={boards.length === 1}
          />
        ))}

        {/* Create board */}
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
            <s-button onClick={() => setShowCreate(true)}>
              + New board
            </s-button>
          )
        )}

        {!canCreateMore && (
          <s-text color="subdued">Maximum of {BOARD_CONFIG.MAX_BOARDS} boards reached.</s-text>
        )}

      </s-stack>
    </s-admin-block>
  );
}
