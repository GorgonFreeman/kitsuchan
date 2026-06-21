/** @jsxImportSource preact */
import '@shopify/ui-extensions/preact';
import { render } from 'preact';
import { useState, useEffect, useCallback } from 'preact/hooks';
import { EmojiSwatch } from './EmojiSwatch.jsx';
import {
  getShopDomain,
  getInitialBoards,
  getWishlistEmojis,
  getWishlistColours,
} from './adminGraphql.js';
import {
  addItems as apiAddItems,
  removeItems as apiRemoveItems,
  createBoard as apiCreateBoard,
  editBoard as apiEditBoard,
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

function BoardCard({ board, emojis, colours, customerId, config, onBoards, isOnly }) {
  const isDefault = board.id === BOARD_CONFIG.DEFAULT_BOARD_ID;
  const itemCount = board.items?.length ?? 0;
  const emojiEntry = emojis.find(e => e.value === board.emoji) ?? { type: 'emoji', display: board.emoji ?? '❤️' };

  // Edit form state
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(board.name);
  const [emoji, setEmoji] = useState(board.emoji ?? emojis.find(e => e.default)?.value ?? '');
  const [colour, setColour] = useState(board.colour ?? colours.find(c => c.default)?.colour ?? '#FF6B6B');
  const [saveBusy, setSaveBusy] = useState(false);
  const [productsBusy, setProductsBusy] = useState(false);
  const [error, setError] = useState(null);

  // Delete state
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  function openEdit() {
    setName(board.name);
    setEmoji(board.emoji ?? emojis.find(e => e.default)?.value ?? '');
    setColour(board.colour ?? colours.find(c => c.default)?.colour ?? '#FF6B6B');
    setError(null);
    setEditing(true);
  }

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) { setError('Board name is required'); return; }
    setSaveBusy(true);
    setError(null);
    try {
      const result = await apiEditBoard(customerId, config, {
        boardId: board.id,
        boardName: trimmed,
        emoji,
        colour,
      });
      if (!result.success) { setError(result.message); return; }
      onBoards(result.boards);
      setEditing(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaveBusy(false);
    }
  }

  async function handleEditProducts() {
    setProductsBusy(true);
    setError(null);
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
        if (!result.success) { setError(result.message); return; }
      }
      if (toRemove.length) {
        result = await apiRemoveItems(customerId, config, board.id, toRemove);
        if (!result.success) { setError(result.message); return; }
      }
      if (result?.boards) onBoards(result.boards);
    } catch (e) {
      if (!e.message?.toLowerCase().includes('cancel')) setError(e.message);
    } finally {
      setProductsBusy(false);
    }
  }

  async function handleDelete() {
    setDeleteBusy(true);
    try {
      const result = await apiDeleteBoard(customerId, config, board.id);
      if (!result.success) { setError(result.message); setConfirmDelete(false); return; }
      onBoards(result.boards);
    } catch (e) {
      setError(e.message);
    } finally {
      setDeleteBusy(false);
      setConfirmDelete(false);
    }
  }

  const selectedEmojiEntry = emojis.find(e => e.value === emoji) ?? { type: 'emoji', display: emoji };

  return (
    <s-stack direction="block" gap="base">

      {/* Colour accent bar */}
      <div style={{ height: 3, borderRadius: 2, background: board.colour ?? '#FF6B6B' }} />

      {/* Header row */}
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

            <s-button variant="primary" onClick={editing ? () => { setEditing(false); setError(null); } : openEdit}>
              {editing ? 'Close' : 'Edit board'}
            </s-button>

            {!isDefault && !isOnly && (
              <s-button tone="critical" onClick={() => { setConfirmDelete(true); setEditing(false); }}>
                Delete
              </s-button>
            )}
          </s-stack>

          {/* Inline edit form */}
          {editing && (
            <s-box padding="base" background="subdued" borderRadius="base">
              <s-stack direction="block" gap="base">
                {error && <s-banner tone="critical" heading={error} />}

                <s-text-field
                  label="Board name"
                  value={name}
                  maxLength={BOARD_CONFIG.MAX_NAME_LENGTH}
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
                          background={emoji === entry.value ? 'base' : undefined}
                        >
                          <div style={{
                            outline: emoji === entry.value ? `2px solid ${colour}` : '2px solid transparent',
                            borderRadius: 6,
                            padding: 2,
                          }}>
                            <EmojiSwatch entry={entry} size={22} />
                          </div>
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
                          <div style={{
                            width: 28, height: 28, borderRadius: '50%',
                            background: c.colour,
                            outline: colour === c.colour ? '2px solid #333' : '2px solid transparent',
                            outlineOffset: 2,
                          }} />
                        </s-clickable>
                      ))}
                    </div>
                  </s-stack>
                )}

                <s-divider />

                <s-stack direction="inline" gap="small" alignItems="center">
                  <s-button
                    loading={productsBusy || undefined}
                    onClick={handleEditProducts}
                  >
                    Edit products
                  </s-button>
                  <s-text color="subdued">
                    {itemCount === 0 ? 'No products yet' : `${itemCount} product${itemCount !== 1 ? 's' : ''} in this board`}
                  </s-text>
                </s-stack>

                <s-stack direction="inline" gap="small">
                  <s-button variant="primary" loading={saveBusy || undefined} onClick={handleSave}>
                    Save changes
                  </s-button>
                  <s-button onClick={() => { setEditing(false); setError(null); }}>Cancel</s-button>
                </s-stack>
              </s-stack>
            </s-box>
          )}

          {/* Delete confirm */}
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
  const [colours, setColours] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newBoardName, setNewBoardName] = useState('');
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState(null);

  const handleBoards = useCallback((newBoards) => setBoards(newBoards), []);

  useEffect(() => {
    if (!customerGid) { setStatus('error'); setLoadError('No customer selected.'); return; }
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
        setConfig(configForShop(domain));
        setBoards(initialBoards);
        setEmojis(fetchedEmojis);
        setColours(fetchedColours);
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

        {boards.map((board, idx) => (
          <s-stack key={board.id} direction="block" gap="base">
            {idx > 0 && <s-divider />}
            <BoardCard
              board={board}
              emojis={emojis}
              colours={colours}
              customerId={customerId}
              config={config}
              onBoards={handleBoards}
              isOnly={boards.length === 1}
            />
          </s-stack>
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
