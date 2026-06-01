/** @jsxImportSource preact */
import '@shopify/ui-extensions/preact';
import { render } from 'preact';
import { useState, useEffect } from 'preact/hooks';

export default async () => {
  render(<WishlistStalenessCheck />, document.body);
};

const DAY_MS = 24 * 60 * 60 * 1000;

function getStaleness(updatedAt) {
  const days = Math.floor((Date.now() - new Date(updatedAt).getTime()) / DAY_MS);

  if (days <= 7) {
    return {
      tone: 'success',
      badge: 'Active',
      heading: days === 0
        ? 'Wishlist updated today'
        : days === 1
          ? 'Wishlist updated yesterday'
          : `Wishlist updated ${days} days ago`,
    };
  }
  if (days <= 30) {
    return {
      tone: 'warning',
      badge: 'Quiet',
      heading: `Wishlist last updated ${days} days ago`,
    };
  }
  return {
    tone: 'critical',
    badge: 'Stale',
    heading: `Wishlist hasn't been updated in ${days} days`,
  };
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric', month: 'long', day: 'numeric',
  });
}

async function fetchWishlistMeta(customerGid) {
  const res = await fetch('shopify:admin/api/graphql.json', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `query WishlistMeta($id: ID!) {
        customer(id: $id) {
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
  return json.data?.customer?.metafield ?? null;
}

function WishlistStalenessCheck() {
  const { close, data } = shopify;
  const customerGid = data?.selected?.[0]?.id ?? null;

  const [status, setStatus] = useState('loading');
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!customerGid) { setError('No customer selected.'); setStatus('error'); return; }
    let cancelled = false;
    fetchWishlistMeta(customerGid)
      .then(m => { if (!cancelled) { setMeta(m); setStatus('ready'); } })
      .catch(e => { if (!cancelled) { setError(e.message); setStatus('error'); } });
    return () => { cancelled = true; };
  }, [customerGid]);

  const staleness = meta?.updatedAt ? getStaleness(meta.updatedAt) : null;

  const { boardCount, itemCount } = (() => {
    if (!meta?.value) return { boardCount: 0, itemCount: 0 };
    try {
      const boards = JSON.parse(meta.value);
      if (!Array.isArray(boards)) return { boardCount: 0, itemCount: 0 };
      return {
        boardCount: boards.length,
        itemCount: boards.reduce((n, b) => n + (b.items?.length ?? 0), 0),
      };
    } catch {
      return { boardCount: 0, itemCount: 0 };
    }
  })();

  return (
    <s-admin-action heading="Wishlist health check">
      <s-button slot="primaryAction" onClick={() => close()}>Done</s-button>

      <s-stack direction="block" gap="base">

        {status === 'loading' && (
          <s-stack direction="inline" gap="small" alignItems="center">
            <s-spinner />
            <s-text color="subdued">Checking wishlist…</s-text>
          </s-stack>
        )}

        {status === 'error' && (
          <s-banner tone="critical" heading={error ?? 'Could not load wishlist.'} />
        )}

        {status === 'ready' && !meta && (
          <s-banner tone="info" heading="No wishlist found">
            <s-text>This customer has never saved anything to their wishlist.</s-text>
          </s-banner>
        )}

        {status === 'ready' && meta && staleness && (
          <s-stack direction="block" gap="base">
            <s-banner tone={staleness.tone} heading={staleness.heading} />

            <s-stack direction="block" gap="small">
              <s-stack direction="inline" gap="base" alignItems="center">
                <s-text color="subdued">Status</s-text>
                <s-badge tone={staleness.tone}>{staleness.badge}</s-badge>
              </s-stack>
              <s-divider />
              <s-stack direction="inline" gap="base">
                <s-text color="subdued">Last updated</s-text>
                <s-text>{formatDate(meta.updatedAt)}</s-text>
              </s-stack>
              <s-stack direction="inline" gap="base">
                <s-text color="subdued">Boards</s-text>
                <s-text>{boardCount}</s-text>
              </s-stack>
              <s-stack direction="inline" gap="base">
                <s-text color="subdued">Products saved</s-text>
                <s-text>{itemCount}</s-text>
              </s-stack>
            </s-stack>
          </s-stack>
        )}

      </s-stack>
    </s-admin-action>
  );
}
