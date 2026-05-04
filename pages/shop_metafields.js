import { LitElement, html, nothing } from 'lit';

function uniqKey(m) {
  return `${ m.namespace }\x1e${ m.key }`;
}

class ShopMetafieldsPage extends LitElement {
  static properties = {
    rows: { state: true },
    cursor: { state: true },
    hasNext: { state: true },
    loading: { state: true },
    loadingMore: { state: true },
    error: { state: true },
    open: { state: true },
  };

  constructor() {
    super();
    this.rows = [];
    this.cursor = null;
    this.hasNext = false;
    this.loading = false;
    this.loadingMore = false;
    this.error = null;
    this.open = {};
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
    const q = new URLSearchParams({ shop: this.shop, first: '50' });
    if (afterCursor) q.set('after', afterCursor);
    const data = await fetch(`/api/shopMetafields?${ q }`).then((r) => r.json());
    if (!data.ok) {
      throw new Error(data.errors?.[ 0 ]?.message ?? data.error ?? 'Request failed');
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

  toggle(id) {
    this.open = { ...this.open, [ id ]: !this.open[ id ] };
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

  render() {
    const sorted = [ ...this.rows ].sort((a, b) => uniqKey(a).localeCompare(uniqKey(b)));
    const showLoading = this.loading && sorted.length === 0;
    const showError = this.error && sorted.length === 0;
    const showEmpty = !showLoading && !showError && sorted.length === 0 && this.shop;

    return html`
      <s-page heading='Shop metafields'>
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
            ? html`
              <s-stack direction='block' gap='none'>
                ${ sorted.map(
                  (m) => html`
                    <s-clickable
                      @click=${ () => this.toggle(m.id) }
                      accessibility-label=${ `${ m.namespace } ${ m.key }, ${ this.open[ m.id ] ? 'collapse' : 'expand' }` }
                    >
                      <s-box padding='base' border-block-end-width='base' border-color='subdued'>
                        <s-stack direction='inline' align-items='center' justify-content='space-between'>
                          <s-stack direction='block' gap='small-100'>
                            <s-text type='strong'>${ m.namespace } · ${ m.key }</s-text>
                            <s-text color='subdued'>${ m.type }</s-text>
                          </s-stack>
                          <s-text color='subdued'>${ this.open[ m.id ] ? '▼' : '▶' }</s-text>
                        </s-stack>
                        ${ this.open[ m.id ]
                          ? html`
                            <s-box padding-block-start='small'>
                              <pre style='margin:0;white-space:pre-wrap;word-break:break-word;font-family:monospace;font-size:0.8125rem;opacity:0.75'>${ m.value ?? '—' }</pre>
                            </s-box>
                          `
                          : nothing }
                      </s-box>
                    </s-clickable>
                  `,
                ) }
              </s-stack>
            `
            : nothing }
        </s-section>

        ${ this.error && sorted.length > 0
          ? html`<s-paragraph tone='critical'>${ this.error }</s-paragraph>`
          : nothing }

        ${ this.hasNext && sorted.length > 0
          ? html`
            <s-button
              ?loading=${ this.loadingMore }
              ?disabled=${ this.loadingMore || !this.cursor }
              @click=${ () => this.loadMore() }
            >Load more</s-button>
          `
          : nothing }
      </s-page>
    `;
  }
}

customElements.define('kit-shop-metafields', ShopMetafieldsPage);
