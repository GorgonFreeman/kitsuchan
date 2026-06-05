/** @jsxImportSource preact */
import '@shopify/ui-extensions/preact';
import { render } from 'preact';
import { useState, useEffect } from 'preact/hooks';

export default async () => {
  render(<WishlistBulkStalenessCheck />, document.body);
};

const DAY_MS = 24 * 60 * 60 * 1000;

function getStaleness(updatedAt) {
  const days = Math.floor((Date.now() - new Date(updatedAt).getTime()) / DAY_MS);
  if (days <= 7)  return { tone: 'success', badge: 'Active',  days };
  if (days <= 30) return { tone: 'warning', badge: 'Quiet',   days };
  return           { tone: 'critical', badge: 'Stale',   days };
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

async function fetchCustomerWishlist(customerGid) {
  const res = await fetch('shopify:admin/api/graphql.json', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `query WishlistBulkMeta($id: ID!) {
        customer(id: $id) {
          displayName
          metafield(namespace: "wishlist", key: "main") {
            updatedAt
            value
          }
        }
      }`,
      variables: { id: customerGid },
    }),
  });
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0].message);
  const customer = json.data?.customer;
  return {
    id: customerGid,
    name: customer?.displayName ?? customerGid,
    metafield: customer?.metafield ?? null,
  };
}

function WishlistBulkStalenessCheck() {
  const { close, data } = shopify;
  const selectedIds = (data?.selected ?? []).map(s => s.id);

  const [rows, setRows]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState(null);

  useEffect(() => {
    if (!selectedIds.length) {
      setError('No customers selected.');
      setLoading(false);
      return;
    }

    let cancelled = false;
    Promise.all(selectedIds.map(fetchCustomerWishlist))
      .then(results => {
        if (!cancelled) { setRows(results); setLoading(false); }
      })
      .catch(e => {
        if (!cancelled) { setError(e.message); setLoading(false); }
      });
    return () => { cancelled = true; };
  }, []);

  const summary = (() => {
    if (!rows.length) return null;
    const withWishlist = rows.filter(r => r.metafield);
    const active  = withWishlist.filter(r => getStaleness(r.metafield.updatedAt).tone === 'success').length;
    const quiet   = withWishlist.filter(r => getStaleness(r.metafield.updatedAt).tone === 'warning').length;
    const stale   = withWishlist.filter(r => getStaleness(r.metafield.updatedAt).tone === 'critical').length;
    const none    = rows.length - withWishlist.length;
    return { active, quiet, stale, none };
  })();

  return (
    <s-admin-action heading={`Wishlist health — ${selectedIds.length} customer${selectedIds.length === 1 ? '' : 's'}`}>
      <s-button slot="primary-action" onClick={() => close()}>Close</s-button>
      <s-button slot="secondary-actions" onClick={() => close()}>Cancel</s-button>

      <s-stack direction="block" gap="base">

        {loading && (
          <s-stack direction="inline" gap="small" alignItems="center">
            <s-spinner />
            <s-text color="subdued">Checking wishlists…</s-text>
          </s-stack>
        )}

        {!loading && error && (
          <s-banner tone="critical" heading={error} />
        )}

        {!loading && !error && summary && (
          <s-stack direction="block" gap="base">
            <s-stack direction="inline" gap="base">
              <s-badge tone="success">{summary.active} active</s-badge>
              <s-badge tone="warning">{summary.quiet} quiet</s-badge>
              <s-badge tone="critical">{summary.stale} stale</s-badge>
              {summary.none > 0 && <s-badge tone="info">{summary.none} no wishlist</s-badge>}
            </s-stack>

            <s-table>
              <s-table-header-row>
                <s-table-header>Customer</s-table-header>
                <s-table-header>Status</s-table-header>
                <s-table-header>Last updated</s-table-header>
                <s-table-header>Boards</s-table-header>
                <s-table-header>Items</s-table-header>
              </s-table-header-row>
              <s-table-body>
                {rows.map(row => {
                  if (!row.metafield) {
                    return (
                      <s-table-row key={row.id}>
                        <s-table-cell>{row.name}</s-table-cell>
                        <s-table-cell><s-badge tone="info">No wishlist</s-badge></s-table-cell>
                        <s-table-cell>—</s-table-cell>
                        <s-table-cell>—</s-table-cell>
                        <s-table-cell>—</s-table-cell>
                      </s-table-row>
                    );
                  }

                  const s = getStaleness(row.metafield.updatedAt);
                  let boardCount = 0;
                  let itemCount = 0;
                  try {
                    const boards = JSON.parse(row.metafield.value);
                    if (Array.isArray(boards)) {
                      boardCount = boards.length;
                      itemCount = boards.reduce((n, b) => n + (b.items?.length ?? 0), 0);
                    }
                  } catch { /* malformed JSON */ }

                  return (
                    <s-table-row key={row.id}>
                      <s-table-cell>{row.name}</s-table-cell>
                      <s-table-cell><s-badge tone={s.tone}>{s.badge}</s-badge></s-table-cell>
                      <s-table-cell>{formatDate(row.metafield.updatedAt)}</s-table-cell>
                      <s-table-cell>{boardCount}</s-table-cell>
                      <s-table-cell>{itemCount}</s-table-cell>
                    </s-table-row>
                  );
                })}
              </s-table-body>
            </s-table>
          </s-stack>
        )}

      </s-stack>
    </s-admin-action>
  );
}
