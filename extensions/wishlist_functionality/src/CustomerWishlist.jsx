/** @jsxImportSource preact */
import '@shopify/ui-extensions/preact';
import { render } from 'preact';
import { useState, useEffect, useCallback } from 'preact/hooks';
import { EmojiSwatch } from './EmojiSwatch.jsx';
import {
  getShopDomain,
  getInitialBoards,
  getWishlistEmojis,
} from './adminGraphql.js';
import {
  addItems as apiAddItems,
  removeItems as apiRemoveItems,
  createBoard as apiCreateBoard,
  deleteBoard as apiDeleteBoard,
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

const BOARD_CONFIG = { DEFAULT_BOARD_ID: 1, MAX_BOARDS: 12, MAX_NAME_LENGTH: 25 };

function parseProductId(wishlistId) {
  return String(wishlistId).split(':')[0];
}

// ─── Board card ───────────────────────────────────────────────────────────────

function BoardCard({ board, emojis, customerId, config, onBoards, isOnly }) {
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const isDefault = board.id === BOARD_CONFIG.DEFAULT_BOARD_ID;
  const itemCount = board.items?.length ?? 0;
  const emojiEntry = emojis.find(e => e.value === board.emoji) ?? { type: 'emoji', display: board.emoji ?? '❤️' };

  async function handleEditWishlist() {
    setEditBusy(true);
    setEditError(null);
    try {
      const currentIds = (board.items ?? []).map(parseProductId);
      const selectionIds = currentIds.map(id => ({ id: `gid://shopify/Product/${id}` }));

      const picked = await shopify.resourcePicker({
        type: 'product',
        action: 'select',
        multiple: true,
        selectionIds,
      });

      if (!picked) return;

      const beforeSet = new Set(currentIds);
      const afterSet = new Set(picked.map(p => gidToNumeric(p.id)).filter(Boolean));
      const toAdd = [...afterSet].filter(id => !beforeSet.has(id));
      const toRemove = [...beforeSet].filter(id => !afterSet.has(id));

      if (!toAdd.length && !toRemove.length) return;

      let result;
      if (toAdd.length) {
        result = await apiAddItems(customerId, config, board.id, toAdd);
        if (!result.success) { setEditError(result.message); return; }
      }
      if (toRemove.length) {
        result = await apiRemoveItems(customerId, config, board.id, toRemove);
        if (!result.success) { setEditError(result.message); return; }
      }
      if (result?.boards) onBoards(result.boards);
    } catch (e) {
      if (!e.message?.toLowerCase().includes('cancel')) setEditError(e.message);
    } finally {
      setEditBusy(false);
    }
  }

  async function handleDelete() {
    setDeleteBusy(true);
    try {
      const result = await apiDeleteBoard(customerId, config, board.id);
      if (!result.success) { setEditError(result.message); setConfirmDelete(false); return; }
      onBoards(result.boards);
    } catch (e) {
      setEditError(e.message);
    } finally {
      setDeleteBusy(false);
      setConfirmDelete(false);
    }
  }

  return (
    <div style={{ border: '1px solid #e1e3e5', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
      <div style={{ height: 4, background: board.colour ?? '#FF6B6B' }} />
      <div style={{ padding: 16 }}>
        <s-stack direction="block" gap="small">

          <s-stack direction="inline" gap="small" alignItems="center">
            <div style={{
              width: 40, height: 40, borderRadius: 8, flexShrink: 0,
              background: `${(board.colour ?? '#FF6B6B')}22`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <EmojiSwatch entry={emojiEntry} size={22} />
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <s-text type="strong">{board.name}</s-text>
              <br />
              <s-text color="subdued">
                {itemCount === 0 ? 'Empty' : `${itemCount} product${itemCount !== 1 ? 's' : ''}`}
              </s-text>
            </div>

            <s-button variant="primary" loading={editBusy || undefined} onClick={handleEditWishlist}>
              Edit wishlist
            </s-button>

            {!isDefault && !isOnly && (
              <s-button tone="critical" onClick={() => setConfirmDelete(true)}>
                Delete
              </s-button>
            )}
          </s-stack>

          {editError && <s-banner tone="critical" heading={editError} />}

          {confirmDelete && (
            <s-banner tone="warning" heading={`Delete "${board.name}"?`}>
              <s-stack direction="inline" gap="small">
                <s-button tone="critical" loading={deleteBusy || undefined} onClick={handleDelete}>
                  Yes, delete
                </s-button>
                <s-button onClick={() => setConfirmDelete(false)}>Keep board</s-button>
              </s-stack>
            </s-banner>
          )}

        </s-stack>
      </div>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

function Extension() {
  const { data } = shopify;
  const customerGid = data?.selected?.[0]?.id ?? null;
  const customerId = gidToNumeric(customerGid);

  const [status, setStatus] = useState('loading');
  const [loadError, setLoadError] = useState(null);
  const [config, setConfig] = useState(null);
  const [boards, setBoards] = useState([]);
  const [emojis, setEmojis] = useState([]);

  const [showCreate, setShowCreate] = useState(false);
  const [newBoardName, setNewBoardName] = useState('');
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState(null);

  const handleBoards = useCallback((newBoards) => {
    setBoards(newBoards);
  }, []);

  useEffect(() => {
    if (!customerGid) { setStatus('error'); setLoadError('No customer selected.'); return; }
    let cancelled = false;
    async function load() {
      try {
        const [domain, initialBoards, fetchedEmojis] = await Promise.all([
          getShopDomain(),
          getInitialBoards(customerGid),
          getWishlistEmojis(),
        ]);
        if (cancelled) return;
        setConfig(configForShop(domain));
        setBoards(initialBoards);
        setEmojis(fetchedEmojis);
        setStatus('ready');
      } catch (e) {
        if (!cancelled) { setLoadError(e.message); setStatus('error'); }
      }
    }
    load();
    return () => { cancelled = true; };
  }, [customerGid]);

  async function handleCreate() {
    const name = newBoardName.trim();
    if (!name) { setCreateError('Board name is required'); return; }
    setCreateBusy(true);
    setCreateError(null);
    try {
      const result = await apiCreateBoard(customerId, config, { boardName: name });
      if (!result.success) { setCreateError(result.message); return; }
      handleBoards(result.boards);
      setNewBoardName('');
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
        <s-stack direction="inline" gap="small" alignItems="center">
          <s-spinner />
          <s-text color="subdued">Loading…</s-text>
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

        {boards.length > 0 && (
          <s-text color="subdued">
            {boards.length} board{boards.length !== 1 ? 's' : ''} · {totalProducts} product{totalProducts !== 1 ? 's' : ''} saved
          </s-text>
        )}

        {boards.length === 0 && !showCreate && (
          <s-text color="subdued">This customer has no wishlist boards yet.</s-text>
        )}

        {boards.map(board => (
          <BoardCard
            key={board.id}
            board={board}
            emojis={emojis}
            customerId={customerId}
            config={config}
            onBoards={handleBoards}
            isOnly={boards.length === 1}
          />
        ))}

        {showCreate ? (
          <s-box padding="base" border="base" borderRadius="base">
            <s-stack direction="block" gap="small">
              {createError && <s-banner tone="critical" heading={createError} />}
              <s-text-field
                label="Board name"
                value={newBoardName}
                maxLength={BOARD_CONFIG.MAX_NAME_LENGTH}
                placeholder="e.g. Summer Looks"
                onChange={e => setNewBoardName(e.target.value)}
              />
              <s-stack direction="inline" gap="small">
                <s-button variant="primary" loading={createBusy || undefined} onClick={handleCreate}>
                  Create board
                </s-button>
                <s-button onClick={() => { setShowCreate(false); setNewBoardName(''); setCreateError(null); }}>
                  Cancel
                </s-button>
              </s-stack>
            </s-stack>
          </s-box>
        ) : (
          canCreateMore && (
            <s-button onClick={() => setShowCreate(true)}>+ New board</s-button>
          )
        )}

        {!canCreateMore && (
          <s-text color="subdued">Maximum of {BOARD_CONFIG.MAX_BOARDS} boards reached.</s-text>
        )}

      </s-stack>
    </s-admin-block>
  );
}
