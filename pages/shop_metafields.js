import { LitElement, html, nothing } from 'lit';
import { gidToId } from '../utils.js';

const PAGE_SIZE = 100;
const DEFAULT_TYPE = 'single_line_text_field';
const PINNED_NAMESPACE = 'kitsuchan';
const PINNED_KEY = 'shop_metafields_pinned';
const PINNED_TYPE = 'single_line_text_field';

function uniqKey(m) {
  return `${ m.namespace }\x1e${ m.key }`;
}

function isPinnedStorageMetafield(m) {
  return m?.namespace === PINNED_NAMESPACE && m?.key === PINNED_KEY;
}

function parsePinnedCsv(raw) {
  if (raw == null || typeof raw !== 'string') return [];
  const out = [];
  const seen = new Set();
  for (const part of raw.split(',')) {
    const s = part.trim();
    if (!s) continue;
    const dot = s.indexOf('.');
    if (dot <= 0 || dot === s.length - 1) continue;
    const ns = s.slice(0, dot);
    const ky = s.slice(dot + 1);
    const uk = `${ ns }\x1e${ ky }`;
    if (!seen.has(uk)) {
      seen.add(uk);
      out.push(uk);
    }
  }
  return out;
}

function pinnedUniqKeysToCsv(pinnedUniqKeys) {
  return pinnedUniqKeys
    .map((uk) => {
      const i = uk.indexOf('\x1e');
      return `${ uk.slice(0, i) }.${ uk.slice(i + 1) }`;
    })
    .join(',');
}

class ShopMetafieldsPage extends LitElement {
  static properties = {
    rows: { state: true },
    cursor: { state: true },
    hasNext: { state: true },
    loading: { state: true },
    loadingMore: { state: true },
    loadingAll: { state: true },
    error: { state: true },
    open: { state: true },
    editing: { state: true },
    confirmingDelete: { state: true },
    busyId: { state: true },
    busyAction: { state: true },
    showAdd: { state: true },
    rowError: { state: true },
    pinnedList: { state: true },
  };

  constructor() {
    super();
    this.rows = [];
    this.cursor = null;
    this.hasNext = false;
    this.loading = false;
    this.loadingMore = false;
    this.loadingAll = false;
    this.error = null;
    this.open = {};
    this.editing = {};
    this.confirmingDelete = {};
    this.busyId = null;
    this.busyAction = null;
    this.showAdd = false;
    this.rowError = {};
    this.pinnedList = [];
  }

  createRenderRoot() {
    return this;
  }

  get shop() {
    return new URLSearchParams(window.location.search).get('shop');
  }

  async connectedCallback() {
    super.connectedCallback();
    if (!this.shop) return;
    this.loading = true;
    this.error = null;
    this.rows = [];
    this.cursor = null;
    this.hasNext = false;
    try {
      await this.load(false, null);
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    } finally {
      this.loading = false;
    }
  }

  async load(append, afterCursor) {
    if (!this.shop) return;
    const q = new URLSearchParams({ shop: this.shop, first: String(PAGE_SIZE) });
    if (afterCursor) q.set('after', afterCursor);
    const data = await fetch(`/api/shopMetafields?${ q }`).then((r) => r.json());
    if (!data.ok) {
      throw new Error(data.errors?.[ 0 ]?.message ?? data.error ?? 'Request failed');
    }
    if (typeof data.pinnedCsv === 'string') {
      this.pinnedList = parsePinnedCsv(data.pinnedCsv);
    }
    const incoming = data.metafields ?? [];
    this.cursor = data.pageInfo?.endCursor ?? null;
    this.hasNext = Boolean(data.pageInfo?.hasNextPage);
    if (append) {
      const seen = new Set(this.rows.map(uniqKey));
      const next = [ ...this.rows ];
      for (const m of incoming) {
        const k = uniqKey(m);
        if (!seen.has(k)) {
          seen.add(k);
          next.push(m);
        }
      }
      this.rows = next;
    } else {
      const seen = new Set();
      this.rows = incoming.filter((m) => {
        const k = uniqKey(m);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    }
  }

  toggleOpen(id) {
    if (this.editing[ id ]) return;
    this.open = { ...this.open, [ id ]: !this.open[ id ] };
    this.confirmingDelete = { ...this.confirmingDelete, [ id ]: false };
  }

  startEdit(id) {
    this.editing = { ...this.editing, [ id ]: true };
    this.confirmingDelete = { ...this.confirmingDelete, [ id ]: false };
    this.rowError = { ...this.rowError, [ id ]: null };
  }

  cancelEdit(id) {
    this.editing = { ...this.editing, [ id ]: false };
    this.rowError = { ...this.rowError, [ id ]: null };
  }

  startConfirmDelete(id) {
    this.confirmingDelete = { ...this.confirmingDelete, [ id ]: true };
    this.rowError = { ...this.rowError, [ id ]: null };
  }

  cancelConfirmDelete(id) {
    this.confirmingDelete = { ...this.confirmingDelete, [ id ]: false };
  }

  toggleAdd() {
    this.showAdd = !this.showAdd;
    this.rowError = { ...this.rowError, add: null };
  }

  comparePinnedSort(a, b) {
    const ka = uniqKey(a);
    const kb = uniqKey(b);
    const ia = this.pinnedList.indexOf(ka);
    const ib = this.pinnedList.indexOf(kb);
    const aPinned = ia >= 0;
    const bPinned = ib >= 0;
    if (aPinned && bPinned) return ia - ib;
    if (aPinned) return -1;
    if (bPinned) return 1;
    return ka.localeCompare(kb);
  }

  async persistPinnedCsv(pinnedUniqKeys) {
    const value = pinnedUniqKeysToCsv(pinnedUniqKeys);
    const data = await fetch(`/api/shopMetafieldsSet?${ new URLSearchParams({ shop: this.shop }) }`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        namespace: PINNED_NAMESPACE,
        key: PINNED_KEY,
        type: PINNED_TYPE,
        value,
      }),
    }).then((r) => r.json());
    if (!data.ok) {
      throw new Error(data.errors?.[ 0 ]?.message ?? data.error ?? 'Could not save pins');
    }
  }

  async togglePin(m) {
    if (!this.shop || this.busyId !== null || isPinnedStorageMetafield(m)) return;
    const k = uniqKey(m);
    const idx = this.pinnedList.indexOf(k);
    const next = idx >= 0
      ? [ ...this.pinnedList.slice(0, idx), ...this.pinnedList.slice(idx + 1) ]
      : [ ...this.pinnedList, k ];

    this.busyId = m.id;
    this.busyAction = 'pin';
    this.rowError = { ...this.rowError, [ m.id ]: null };
    try {
      await this.persistPinnedCsv(next);
      this.pinnedList = next;
    } catch (err) {
      this.rowError = {
        ...this.rowError,
        [ m.id ]: err instanceof Error ? err.message : String(err),
      };
    } finally {
      this.busyId = null;
      this.busyAction = null;
    }
  }

  async loadMore() {
    this.loadingMore = true;
    this.error = null;
    try {
      await this.load(true, this.cursor);
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    } finally {
      this.loadingMore = false;
    }
  }

  async loadAll() {
    this.loadingAll = true;
    this.error = null;
    try {
      while (this.hasNext && this.cursor) {
        await this.load(true, this.cursor);
      }
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    } finally {
      this.loadingAll = false;
    }
  }

  async saveEdit(m) {
    const slug = gidToId(m.id);
    const value = this.querySelector(`#edit-value-${ slug }`)?.value ?? '';
    this.busyId = m.id;
    this.busyAction = 'save';
    this.rowError = { ...this.rowError, [ m.id ]: null };
    try {
      const data = await fetch(`/api/shopMetafieldsSet?${ new URLSearchParams({ shop: this.shop }) }`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ namespace: m.namespace, key: m.key, type: m.type, value }),
      }).then((r) => r.json());
      if (!data.ok) {
        throw new Error(data.errors?.[ 0 ]?.message ?? data.error ?? 'Save failed');
      }
      const updated = data.metafield ?? { ...m, value };
      this.rows = this.rows.map((r) => (uniqKey(r) === uniqKey(m) ? updated : r));
      this.editing = { ...this.editing, [ m.id ]: false };
    } catch (e) {
      this.rowError = { ...this.rowError, [ m.id ]: e instanceof Error ? e.message : String(e) };
    } finally {
      this.busyId = null;
      this.busyAction = null;
    }
  }

  async deleteRow(m) {
    this.busyId = m.id;
    this.busyAction = 'delete';
    this.rowError = { ...this.rowError, [ m.id ]: null };
    try {
      const data = await fetch(`/api/shopMetafieldsDelete?${ new URLSearchParams({ shop: this.shop }) }`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ namespace: m.namespace, key: m.key }),
      }).then((r) => r.json());
      if (!data.ok) {
        throw new Error(data.errors?.[ 0 ]?.message ?? data.error ?? 'Delete failed');
      }
      this.rows = this.rows.filter((r) => uniqKey(r) !== uniqKey(m));
      const pk = uniqKey(m);
      if (this.pinnedList.includes(pk)) {
        const nextPins = this.pinnedList.filter((x) => x !== pk);
        this.pinnedList = nextPins;
        this.persistPinnedCsv(nextPins).catch(() => {});
      }
      this.open = stripKey(this.open, m.id);
      this.editing = stripKey(this.editing, m.id);
      this.confirmingDelete = stripKey(this.confirmingDelete, m.id);
      this.rowError = stripKey(this.rowError, m.id);
    } catch (e) {
      this.rowError = { ...this.rowError, [ m.id ]: e instanceof Error ? e.message : String(e) };
    } finally {
      this.busyId = null;
      this.busyAction = null;
    }
  }

  async submitAdd() {
    const namespace = this.querySelector('#add-namespace')?.value?.trim() ?? '';
    const key = this.querySelector('#add-key')?.value?.trim() ?? '';
    const type = (this.querySelector('#add-type')?.value?.trim() ?? '') || DEFAULT_TYPE;
    const value = this.querySelector('#add-value')?.value ?? '';

    if (!namespace || !key) {
      this.rowError = { ...this.rowError, add: 'Namespace and key are required.' };
      return;
    }

    this.busyId = 'add';
    this.busyAction = 'add';
    this.rowError = { ...this.rowError, add: null };
    try {
      const data = await fetch(`/api/shopMetafieldsSet?${ new URLSearchParams({ shop: this.shop }) }`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ namespace, key, type, value }),
      }).then((r) => r.json());
      if (!data.ok) {
        throw new Error(data.errors?.[ 0 ]?.message ?? data.error ?? 'Create failed');
      }
      const created = data.metafield;
      const existingIdx = this.rows.findIndex((r) => uniqKey(r) === uniqKey(created));
      if (existingIdx >= 0) {
        this.rows = [ ...this.rows.slice(0, existingIdx), created, ...this.rows.slice(existingIdx + 1) ];
      } else {
        this.rows = [ ...this.rows, created ];
      }
      this.showAdd = false;
    } catch (e) {
      this.rowError = { ...this.rowError, add: e instanceof Error ? e.message : String(e) };
    } finally {
      this.busyId = null;
      this.busyAction = null;
    }
  }

  renderHeader(sorted) {
    if (!this.shop) return nothing;
    const countLabel = this.loadingAll
      ? `Loading all… ${ sorted.length } so far`
      : this.hasNext
        ? `Showing ${ sorted.length } — more to load`
        : sorted.length === 0
          ? ''
          : `Showing all ${ sorted.length }`;
    const anyBusy = this.busyId !== null;
    return html`
      <s-stack direction='inline' align-items='center' justify-content='space-between' gap='base'>
        <s-paragraph color='subdued'>${ countLabel }</s-paragraph>
        <s-button
          variant=${ this.showAdd ? 'secondary' : 'primary' }
          ?disabled=${ anyBusy }
          @click=${ () => this.toggleAdd() }
        >${ this.showAdd ? 'Cancel new' : 'Add metafield' }</s-button>
      </s-stack>
    `;
  }

  renderAddForm() {
    if (!this.showAdd) return nothing;
    const busy = this.busyAction === 'add';
    const err = this.rowError.add;
    return html`
      <s-section heading='New metafield'>
        <s-stack direction='block' gap='base'>
          <s-text-field id='add-namespace' label='Namespace' value='custom' required></s-text-field>
          <s-text-field id='add-key' label='Key' placeholder='my_field' required></s-text-field>
          <s-text-field id='add-type' label='Type' value=${ DEFAULT_TYPE } details='See Shopify metafield types docs.'></s-text-field>
          <s-text-area id='add-value' label='Value' rows='4'></s-text-area>
          ${ err ? html`<s-paragraph tone='critical'>${ err }</s-paragraph>` : nothing }
          <s-stack direction='inline' gap='small'>
            <s-button variant='primary' ?loading=${ busy } ?disabled=${ busy } @click=${ () => this.submitAdd() }>Create</s-button>
            <s-button ?disabled=${ busy } @click=${ () => this.toggleAdd() }>Cancel</s-button>
          </s-stack>
        </s-stack>
      </s-section>
    `;
  }

  renderRow(m) {
    const open = Boolean(this.open[ m.id ]);
    const editing = Boolean(this.editing[ m.id ]);
    const confirming = Boolean(this.confirmingDelete[ m.id ]);
    const slug = gidToId(m.id);
    const isThisRow = this.busyId === m.id;
    const anyBusy = this.busyId !== null;
    const saving = isThisRow && this.busyAction === 'save';
    const deleting = isThisRow && this.busyAction === 'delete';
    const pinning = isThisRow && this.busyAction === 'pin';
    const pinned = this.pinnedList.includes(uniqKey(m));
    const pinDisabled = anyBusy && !pinning;
    const err = this.rowError[ m.id ];

    return html`
      <s-box border-block-end-width='base' border-color='subdued'>
        <s-box padding='base' padding-inline-start='small'>
          <s-stack direction='inline' align-items='center' justify-content='space-between' gap='small'>
            <s-clickable
              @click=${ () => { if (!pinDisabled) this.togglePin(m); } }
              ?disabled=${ pinDisabled }
              accessibility-label=${ pinned ? `Unpin ${ m.namespace } · ${ m.key }` : `Pin ${ m.namespace } · ${ m.key }` }
            >
              <s-box padding-inline='small-100' padding-block='small-100'>
                ${ pinning
                  ? html`<s-spinner accessibility-label='Updating pin' size='small'></s-spinner>`
                  : html`<s-icon type=${ pinned ? 'star-filled' : 'star' } size='small' color=${ pinned ? 'base' : 'subdued' }></s-icon>` }
              </s-box>
            </s-clickable>
            <s-clickable
              style='flex:1;min-width:0'
              @click=${ () => this.toggleOpen(m.id) }
              accessibility-label=${ `${ m.namespace } ${ m.key }, ${ open ? 'collapse' : 'expand' }` }
            >
              <s-stack direction='inline' align-items='center' justify-content='space-between' gap='small'>
                <s-stack direction='block' gap='small-100' style='min-width:0'>
                  <s-text type='strong'>${ m.namespace } · ${ m.key }</s-text>
                  <s-text color='subdued'>${ m.type }</s-text>
                </s-stack>
                <s-text color='subdued'>${ open ? '▼' : '▶' }</s-text>
              </s-stack>
            </s-clickable>
          </s-stack>
        </s-box>

        ${ open
          ? html`
            <s-box padding-inline='base' padding-block-end='base'>
              <s-stack direction='block' gap='base'>
                ${ editing
                  ? html`
                    <s-text-area
                      id=${ `edit-value-${ slug }` }
                      label='Value'
                      value=${ m.value ?? '' }
                      rows='4'
                    ></s-text-area>
                  `
                  : html`
                    <s-box background='subdued' padding='small' border-radius='base'>
                      <pre style='margin:0;white-space:pre-wrap;word-break:break-word;font-family:monospace;font-size:0.8125rem;opacity:0.85'>${ m.value ?? '—' }</pre>
                    </s-box>
                  ` }

                ${ err ? html`<s-paragraph tone='critical'>${ err }</s-paragraph>` : nothing }

                <s-stack direction='inline' gap='small'>
                  ${ editing
                    ? html`
                      <s-button variant='primary' ?loading=${ saving } ?disabled=${ anyBusy } @click=${ () => this.saveEdit(m) }>Save</s-button>
                      <s-button ?disabled=${ anyBusy } @click=${ () => this.cancelEdit(m.id) }>Cancel</s-button>
                    `
                    : confirming
                      ? html`
                        <s-button variant='primary' tone='critical' ?loading=${ deleting } ?disabled=${ anyBusy } @click=${ () => this.deleteRow(m) }>Confirm delete</s-button>
                        <s-button ?disabled=${ anyBusy } @click=${ () => this.cancelConfirmDelete(m.id) }>Cancel</s-button>
                      `
                      : html`
                        <s-button ?disabled=${ anyBusy } @click=${ () => this.startEdit(m.id) }>Edit</s-button>
                        <s-button tone='critical' ?disabled=${ anyBusy } @click=${ () => this.startConfirmDelete(m.id) }>Delete</s-button>
                      ` }
                </s-stack>
              </s-stack>
            </s-box>
          `
          : nothing }
      </s-box>
    `;
  }

  renderList(sorted) {
    const showLoading = this.loading && sorted.length === 0;
    const showError = this.error && sorted.length === 0;
    const showEmpty = !showLoading && !showError && sorted.length === 0 && this.shop;

    return html`
      <s-section padding=${ sorted.length > 0 ? 'none' : 'base' }>
        ${ !this.shop
          ? html`<s-paragraph>Open this app from the Shopify admin (needs <code>shop</code> in the URL).</s-paragraph>`
          : nothing }

        ${ showLoading
          ? html`
            <s-stack direction='inline' gap='small' align-items='center'>
              <s-spinner accessibility-label='Loading metafields' size='base'></s-spinner>
              <s-text>Loading…</s-text>
            </s-stack>
          `
          : nothing }

        ${ showError ? html`<s-paragraph tone='critical'>${ this.error }</s-paragraph>` : nothing }

        ${ showEmpty ? html`<s-paragraph color='subdued'>No shop metafields.</s-paragraph>` : nothing }

        ${ sorted.length > 0
          ? html`<s-stack direction='block' gap='none'>${ sorted.map((m) => this.renderRow(m)) }</s-stack>`
          : nothing }
      </s-section>
    `;
  }

  renderFooter(sorted) {
    const busy = this.loadingMore || this.loadingAll;
    return html`
      ${ this.error && sorted.length > 0
        ? html`<s-paragraph tone='critical'>${ this.error }</s-paragraph>`
        : nothing }

      ${ this.hasNext && sorted.length > 0
        ? html`
          <s-stack direction='inline' gap='small'>
            <s-button
              ?loading=${ this.loadingMore }
              ?disabled=${ busy || !this.cursor }
              @click=${ () => this.loadMore() }
            >Load more</s-button>
            <s-button
              ?loading=${ this.loadingAll }
              ?disabled=${ busy || !this.cursor }
              @click=${ () => this.loadAll() }
            >Load all</s-button>
          </s-stack>
        `
        : nothing }
    `;
  }

  render() {
    const visible = this.rows.filter((m) => !isPinnedStorageMetafield(m));
    const sorted = [ ...visible ].sort((a, b) => this.comparePinnedSort(a, b));
    return html`
      <s-page heading='Shop metafields'>
        ${ this.renderHeader(sorted) }
        ${ this.renderAddForm() }
        ${ this.renderList(sorted) }
        ${ this.renderFooter(sorted) }
      </s-page>
    `;
  }
}

function stripKey(obj, key) {
  if (!(key in obj)) return obj;
  const next = { ...obj };
  delete next[ key ];
  return next;
}

customElements.define('kit-shop-metafields', ShopMetafieldsPage);
