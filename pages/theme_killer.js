import { LitElement, html, nothing } from 'lit';

class ThemeKillerPage extends LitElement {
  static properties = {
    themes: { state: true },
    sortMode: { state: true },
    selected: { state: true },
    loading: { state: true },
    busy: { state: true },
    error: { state: true },
  };

  constructor() {
    super();
    this.themes = [];
    this.sortMode = 'updatedAt-desc';
    this.selected = {};
    this.loading = false;
    this.busy = false;
    this.error = null;
  }

  createRenderRoot() {
    return this;
  }

  get shop() {
    return new URLSearchParams(window.location.search).get('shop');
  }

  async connectedCallback() {
    super.connectedCallback();
    await this.refresh();
  }

  async refresh() {
    if (!this.shop) return;
    this.loading = true;
    this.error = null;
    try {
      const data = await fetch(`/api/themes?${ new URLSearchParams({ shop: this.shop }) }`).then((r) => r.json());
      if (!data.ok) {
        throw new Error(data.errors?.[ 0 ]?.message ?? data.error ?? 'Request failed');
      }
      this.themes = data.themes ?? [];
      this.selected = {};
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    } finally {
      this.loading = false;
    }
  }

  toggle(id, role, checked) {
    if (role === 'MAIN') return;
    this.selected = { ...this.selected, [ id ]: checked };
  }

  onSortChange(e) {
    const v = e.currentTarget?.value;
    if (typeof v === 'string') this.sortMode = v;
  }

  onRowCheckChange(t, e) {
    const checked = Boolean(e.currentTarget?.checked);
    this.toggle(t.id, t.role, checked);
  }

  selectedIds() {
    return Object.entries(this.selected).filter(([, on]) => on).map(([ id ]) => id);
  }

  sortedThemes() {
    const list = [ ...this.themes ];
    const dash = this.sortMode.lastIndexOf('-');
    const key = this.sortMode.slice(0, dash);
    const dir = this.sortMode.slice(dash + 1);
    const mult = dir === 'desc' ? -1 : 1;
    list.sort((a, b) => {
      if (key === 'updatedAt') {
        const ta = new Date(a.updatedAt).getTime();
        const tb = new Date(b.updatedAt).getTime();
        return mult * (ta - tb);
      }
      return mult * String(a.name).localeCompare(String(b.name), undefined, { sensitivity: 'base' });
    });
    return list;
  }

  formatSavedAt(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  }

  rowDetails(t) {
    const saved = `Saved ${ this.formatSavedAt(t.updatedAt) }`;
    return t.role === 'MAIN' ? `${ saved } · Published (protected)` : saved;
  }

  async submitDelete() {
    const ids = this.selectedIds();
    if (!this.shop || ids.length === 0) return;
    this.busy = true;
    this.error = null;
    try {
      const data = await fetch(`/api/themesDelete?${ new URLSearchParams({ shop: this.shop }) }`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      }).then((r) => r.json());
      if (!data.ok) {
        const first = data.results?.find((r) => r.userErrors?.length)?.userErrors?.[ 0 ]?.message;
        this.error = data.error ?? first ?? 'Delete failed';
        return;
      }
      await this.refresh();
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    } finally {
      this.busy = false;
    }
  }

  render() {
    const n = this.selectedIds().length;
    return html`
      <s-page heading='Theme killer'>
        <s-section>
          <s-stack direction='block' gap='base'>
            ${ this.error ? html`<s-paragraph tone='critical'>${ this.error }</s-paragraph>` : nothing }
            <s-stack direction='inline' align-items='end' justify-content='space-between' gap='base'>
              <s-select
                label='Sort'
                name='theme-killer-sort'
                .value=${ this.sortMode }
                ?disabled=${ this.loading }
                @change=${ (e) => this.onSortChange(e) }
              >
                <s-option value='updatedAt-desc'>Last updated (newest first)</s-option>
                <s-option value='updatedAt-asc'>Last updated (oldest first)</s-option>
                <s-option value='name-asc'>Name A-Z</s-option>
                <s-option value='name-desc'>Name Z-A</s-option>
              </s-select>
              <s-button icon='refresh' @click=${ () => window.location.reload() }>Refresh</s-button>
            </s-stack>
            ${ this.loading
              ? html`
                  <s-stack direction='inline' gap='small' align-items='center'>
                    <s-spinner accessibility-label='Loading themes' size='base'></s-spinner>
                    <s-text>Loading…</s-text>
                  </s-stack>
                `
              : html`
                  <s-stack direction='block' gap='small'>
                    ${ this.sortedThemes().map(
                      (t) => html`
                        <s-checkbox
                          label=${ t.name }
                          details=${ this.rowDetails(t) }
                          .checked=${ Boolean(this.selected[ t.id ]) }
                          ?disabled=${ t.role === 'MAIN' }
                          @change=${ (e) => this.onRowCheckChange(t, e) }
                        ></s-checkbox>
                      `,
                    ) }
                  </s-stack>
                  <s-button
                    variant='primary'
                    tone='critical'
                    ?disabled=${ n === 0 }
                    ?loading=${ this.busy }
                    @click=${ () => this.submitDelete() }
                  >Delete ${ n } theme${ n === 1 ? '' : 's' }</s-button>
                ` }
          </s-stack>
        </s-section>
      </s-page>
    `;
  }
}

customElements.define('kit-theme-killer', ThemeKillerPage);
