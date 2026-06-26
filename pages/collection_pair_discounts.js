import { LitElement, html, nothing } from 'lit';
import { gidToId } from '../utils.js';
import {
  buildMarketRows,
  validateMarketRows,
} from '../utils/collectionPairDiscountConfig.js';

function statusTone(status) {
  if (status === 'ACTIVE') return 'success';
  if (status === 'SCHEDULED') return 'info';
  if (status === 'EXPIRED') return 'subdued';
  return 'warning';
}

function formatDate(iso) {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

function adminDiscountHref(discountId) {
  const numericId = gidToId(discountId);
  return numericId ? `shopify://admin/discounts/${ numericId }` : null;
}

class CollectionPairDiscountsPage extends LitElement {
  static properties = {
    discounts: { state: true },
    collections: { state: true },
    marketRows: { state: true },
    loading: { state: true },
    creating: { state: true },
    searchingCollections: { state: true },
    loadingMarkets: { state: true },
    error: { state: true },
    formError: { state: true },
    functionDeployed: { state: true },
    title: { state: true },
    collectionQuery: { state: true },
    selectedCollectionId: { state: true },
    selectedCollectionTitle: { state: true },
    startsAt: { state: true },
  };

  constructor() {
    super();
    this.discounts = [];
    this.collections = [];
    this.marketRows = [];
    this.loading = false;
    this.creating = false;
    this.searchingCollections = false;
    this.loadingMarkets = false;
    this.error = null;
    this.formError = null;
    this.functionDeployed = true;
    this.title = '';
    this.collectionQuery = '';
    this.selectedCollectionId = '';
    this.selectedCollectionTitle = '';
    this.startsAt = new Date().toISOString().slice(0, 16);
  }

  createRenderRoot() {
    return this;
  }

  get shop() {
    return new URLSearchParams(window.location.search).get('shop');
  }

  get shopQuery() {
    return this.shop ? `?${ new URLSearchParams({ shop: this.shop }).toString() }` : '';
  }

  async connectedCallback() {
    super.connectedCallback();
    if (!this.shop) return;
    await Promise.all([
      this.loadDiscounts(),
      this.searchCollections(),
      this.loadMarkets(),
    ]);
  }

  async apiGet(path, params = {}) {
    const q = new URLSearchParams({ shop: this.shop, ...params });
    const data = await fetch(`${ path }?${ q }`).then((r) => r.json());
    if (!data.ok) {
      throw new Error(data.errors?.[ 0 ]?.message ?? data.error ?? 'Request failed');
    }
    return data;
  }

  async apiPost(path, body) {
    const q = new URLSearchParams({ shop: this.shop });
    const data = await fetch(`${ path }?${ q }`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then((r) => r.json());

    if (!data.ok) {
      const userError = data.userErrors?.[ 0 ]?.message;
      throw new Error(userError ?? data.errors?.[ 0 ]?.message ?? data.error ?? 'Request failed');
    }

    return data;
  }

  async loadDiscounts() {
    this.loading = true;
    this.error = null;
    try {
      const data = await this.apiGet('/api/collectionPairDiscounts');
      this.discounts = data.discounts ?? [];
      this.functionDeployed = data.functionDeployed !== false;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    } finally {
      this.loading = false;
    }
  }

  async loadMarkets() {
    if (!this.shop) return;
    this.loadingMarkets = true;
    try {
      const data = await this.apiGet('/api/markets');
      const allMarkets = (data.markets ?? []).map((market) => ({
        id: market.id,
        name: market.name,
        currencyCode: market.currencyCode ?? '',
      }));
      this.marketRows = buildMarketRows(allMarkets, {}, '');
    } catch (e) {
      this.formError = e instanceof Error ? e.message : String(e);
    } finally {
      this.loadingMarkets = false;
    }
  }

  async searchCollections() {
    if (!this.shop) return;
    this.searchingCollections = true;
    try {
      const params = { first: '25' };
      if (this.collectionQuery.trim()) {
        params.q = this.collectionQuery.trim();
      }
      const data = await this.apiGet('/api/collections', params);
      this.collections = data.collections ?? [];
    } catch (e) {
      this.formError = e instanceof Error ? e.message : String(e);
    } finally {
      this.searchingCollections = false;
    }
  }

  onCollectionQueryInput(event) {
    this.collectionQuery = event.currentTarget.value;
  }

  async onCollectionSearch(event) {
    event?.preventDefault?.();
    await this.searchCollections();
  }

  onSelectCollection(event) {
    const collectionId = event.currentTarget.value;
    const collection = this.collections.find((row) => row.id === collectionId);
    this.selectedCollectionId = collectionId;
    this.selectedCollectionTitle = collection?.title ?? '';
  }

  clearSelectedCollection() {
    this.selectedCollectionId = '';
    this.selectedCollectionTitle = '';
  }

  onMarketEnabledChange(marketId, enabled) {
    this.marketRows = this.marketRows.map((row) => (
      row.marketId === marketId ? { ...row, enabled } : row
    ));
  }

  onMarketPriceChange(marketId, value) {
    this.marketRows = this.marketRows.map((row) => (
      row.marketId === marketId ? { ...row, bundlePrice: value } : row
    ));
  }

  async onCreate(event) {
    event.preventDefault();
    this.formError = null;

    const validationError = validateMarketRows(this.marketRows);
    if (validationError) {
      this.formError = validationError;
      return;
    }

    this.creating = true;

    try {
      await this.apiPost('/api/collectionPairDiscountCreate', {
        title: this.title,
        collectionId: this.selectedCollectionId,
        marketRows: this.marketRows,
        startsAt: this.startsAt ? new Date(this.startsAt).toISOString() : undefined,
      });

      this.title = '';
      this.clearSelectedCollection();
      this.startsAt = new Date().toISOString().slice(0, 16);
      await this.loadMarkets();
      await this.loadDiscounts();
    } catch (e) {
      this.formError = e instanceof Error ? e.message : String(e);
    } finally {
      this.creating = false;
    }
  }

  renderMarketRow(row) {
    return html`
      <s-box padding="small" border="base" borderRadius="base">
        <s-stack gap="small">
          <s-checkbox
            .checked=${ row.enabled }
            label=${ row.name }
            @change=${ (event) => this.onMarketEnabledChange(row.marketId, event.currentTarget.checked) }
          ></s-checkbox>
          <s-number-field
            label=${ `Bundle price (${ row.currencyCode || '—' })` }
            name=${ `marketPrice-${ row.marketId }` }
            value=${ row.enabled ? String(row.bundlePrice ?? '') : '' }
            min="0"
            step="0.01"
            ?disabled=${ !row.enabled }
            @input=${ (event) => this.onMarketPriceChange(row.marketId, event.currentTarget.value) }
          ></s-number-field>
        </s-stack>
      </s-box>
    `;
  }

  renderDiscountRow(discount) {
    const adminHref = adminDiscountHref(discount.discountId);
    const priceSummary = (discount.enabledPrices ?? []).length
      ? discount.enabledPrices.join(', ')
      : discount.bundlePrice;

    return html`
      <s-box padding="base" border="base" borderRadius="base">
        <s-stack gap="small">
          <s-stack direction="inline" alignItems="center" justifyContent="space-between">
            <s-heading>${ discount.title }</s-heading>
            <s-badge tone=${ statusTone(discount.status) }>${ discount.status }</s-badge>
          </s-stack>
          <s-paragraph>
            ${ discount.collectionTitle || 'No collection configured' }
            ${ priceSummary ? html` · ${ priceSummary } bundle` : nothing }
          </s-paragraph>
          <s-paragraph color="subdued">
            Starts ${ formatDate(discount.startsAt) }
            ${ discount.endsAt ? html` · Ends ${ formatDate(discount.endsAt) }` : nothing }
          </s-paragraph>
          ${ adminHref ? html`
            <s-link href=${ adminHref } target="_blank">Open in Shopify admin</s-link>
          ` : nothing }
        </s-stack>
      </s-box>
    `;
  }

  render() {
    const showEmpty = !this.loading && !this.error && this.discounts.length === 0;
    const canCreate = Boolean(
      this.title.trim()
      && this.selectedCollectionId
      && !this.creating
      && !validateMarketRows(this.marketRows),
    );

    return html`
      <s-page heading="Collection pair discounts">
        <s-section heading="Create discount">
          ${ this.formError ? html`<s-banner tone="critical">${ this.formError }</s-banner>` : nothing }
          ${ this.functionDeployed ? nothing : html`
            <s-banner tone="warning">
              Deploy the collection-pair-discount function before creating discounts.
            </s-banner>
          ` }
          <form @submit=${ this.onCreate }>
            <s-stack gap="base">
              <s-text-field
                label="Discount title"
                name="title"
                value=${ this.title }
                required
                @input=${ (event) => { this.title = event.currentTarget.value; } }
              ></s-text-field>
              <s-text-field
                label="Starts at"
                name="startsAt"
                type="datetime-local"
                value=${ this.startsAt }
                @input=${ (event) => { this.startsAt = event.currentTarget.value; } }
              ></s-text-field>
              <s-stack gap="small">
                <s-text-field
                  label="Search collections"
                  name="collectionQuery"
                  value=${ this.collectionQuery }
                  @input=${ this.onCollectionQueryInput }
                ></s-text-field>
                <s-button variant="secondary" type="button" @click=${ this.onCollectionSearch }>
                  ${ this.searchingCollections ? 'Searching…' : 'Search collections' }
                </s-button>
                <s-select
                  label="Collection"
                  name="collectionId"
                  value=${ this.selectedCollectionId }
                  @change=${ this.onSelectCollection }
                >
                  <s-option value="">Select a collection</s-option>
                  ${ this.collections.map((collection) => html`
                    <s-option value=${ collection.id }>${ collection.title }</s-option>
                  `) }
                </s-select>
                ${ this.selectedCollectionTitle ? html`
                  <s-paragraph color="subdued">Selected: ${ this.selectedCollectionTitle }</s-paragraph>
                ` : nothing }
              </s-stack>
              <s-heading>Markets</s-heading>
              ${ this.loadingMarkets ? html`<s-text>Loading markets…</s-text>` : nothing }
              ${ !this.loadingMarkets && this.marketRows.length ? html`
                <s-stack gap="base">
                  ${ this.marketRows.map((row) => this.renderMarketRow(row)) }
                </s-stack>
              ` : nothing }
              ${ !this.loadingMarkets && !this.marketRows.length ? html`
                <s-paragraph color="subdued">No markets found for this store.</s-paragraph>
              ` : nothing }
              <s-paragraph color="subdued">
                Enable markets individually. Any two products from the collection are sold for that market's fixed total price.
              </s-paragraph>
              <s-button
                type="submit"
                variant="primary"
                ?disabled=${ !canCreate || !this.functionDeployed }
              >
                ${ this.creating ? 'Creating…' : 'Create automatic discount' }
              </s-button>
            </s-stack>
          </form>
        </s-section>

        <s-section heading="Existing discounts">
          ${ this.error ? html`<s-banner tone="critical">${ this.error }</s-banner>` : nothing }
          ${ this.loading ? html`
            <s-stack direction="inline" gap="small" alignItems="center">
              <s-spinner accessibility-label="Loading discounts" size="base"></s-spinner>
              <s-text>Loading discounts…</s-text>
            </s-stack>
          ` : nothing }
          ${ showEmpty ? html`
            <s-paragraph color="subdued">No collection pair discounts yet.</s-paragraph>
          ` : nothing }
          ${ !this.loading && this.discounts.length ? html`
            <s-stack gap="base">
              ${ this.discounts.map((discount) => this.renderDiscountRow(discount)) }
            </s-stack>
          ` : nothing }
          <s-button variant="secondary" type="button" @click=${ this.loadDiscounts } ?disabled=${ this.loading }>
            Refresh
          </s-button>
        </s-section>
      </s-page>
    `;
  }
}

customElements.define('kit-collection-pair-discounts', CollectionPairDiscountsPage);
