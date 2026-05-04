import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

function uniqKey(m) {
  return `${ m.namespace }\x1e${ m.key }`;
}

export default function ShopMetafieldsPage() {
  const [ searchParams ] = useSearchParams();
  const shop = searchParams.get('shop');

  const [ rows, setRows ] = useState([]);
  const [ cursor, setCursor ] = useState(null);
  const [ hasNext, setHasNext ] = useState(false);
  const [ loading, setLoading ] = useState(false);
  const [ loadingMore, setLoadingMore ] = useState(false);
  const [ error, setError ] = useState(null);
  const [ open, setOpen ] = useState({});

  const load = useCallback(
    async (append, afterCursor) => {
      if (!shop) return;
      const q = new URLSearchParams({ shop, first: '50' });
      if (afterCursor) q.set('after', afterCursor);
      const data = await fetch(`/api/shopMetafields?${ q }`).then((r) => r.json());
      if (!data.ok) {
        throw new Error(data.errors?.[ 0 ]?.message ?? data.error ?? 'Request failed');
      }
      const incoming = data.metafields ?? [];
      setCursor(data.pageInfo?.endCursor ?? null);
      setHasNext(Boolean(data.pageInfo?.hasNextPage));
      if (append) {
        setRows((prev) => {
          const seen = new Set(prev.map(uniqKey));
          const next = [ ...prev ];
          for (const m of incoming) {
            const k = uniqKey(m);
            if (!seen.has(k)) {
              seen.add(k);
              next.push(m);
            }
          }
          return next;
        });
      } else {
        const seen = new Set();
        setRows(
          incoming.filter((m) => {
            const k = uniqKey(m);
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
          }),
        );
      }
    },
    [ shop ],
  );

  useEffect(() => {
    if (!shop) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setRows([]);
    setCursor(null);
    setHasNext(false);
    load(false, null)
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ shop, load ]);

  const sorted = useMemo(
    () => [ ...rows ].sort((a, b) => uniqKey(a).localeCompare(uniqKey(b))),
    [ rows ],
  );

  const showLoading = loading && sorted.length === 0;
  const showError = error && sorted.length === 0;
  const showEmpty = !showLoading && !showError && sorted.length === 0 && shop;

  return (
    <s-page heading="Shop metafields">
      <s-section padding={ sorted.length > 0 ? 'none' : 'base' }>
        { !shop ? (
          <s-paragraph>
            Open this app from the Shopify admin (needs <code>shop</code> in the URL).
          </s-paragraph>
        ) : null }

        { showLoading ? (
          <s-stack direction="inline" gap="small" align-items="center">
            <s-spinner accessibility-label="Loading metafields" size="base" />
            <s-text>Loading…</s-text>
          </s-stack>
        ) : null }

        { showError ? (
          <s-paragraph tone="critical">{ error }</s-paragraph>
        ) : null }

        { showEmpty ? (
          <s-paragraph color="subdued">No shop metafields.</s-paragraph>
        ) : null }

        { sorted.length > 0 ? (
          <s-stack direction="block" gap="none">
            { sorted.map((m) => (
              <s-clickable
                key={ m.id }
                onClick={ () => setOpen((o) => ({ ...o, [ m.id ]: !o[ m.id ] })) }
                accessibility-label={ `${ m.namespace } ${ m.key }, ${ open[ m.id ] ? 'collapse' : 'expand' }` }
              >
                <s-box
                  padding="base"
                  border-block-end-width="base"
                  border-color="subdued"
                >
                  <s-stack direction="inline" align-items="center" justify-content="space-between">
                    <s-stack direction="block" gap="small-100">
                      <s-text type="strong">
                        { m.namespace } · { m.key }
                      </s-text>
                      <s-text color="subdued">{ m.type }</s-text>
                    </s-stack>
                    <s-text color="subdued">
                      { open[ m.id ] ? '▼' : '▶' }
                    </s-text>
                  </s-stack>
                  { open[ m.id ] ? (
                    <s-box padding-block-start="small">
                      <pre
                        style={ {
                          margin: 0,
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          fontFamily: 'monospace',
                          fontSize: '0.8125rem',
                          opacity: 0.75,
                        } }
                      >
                        { m.value ?? '—' }
                      </pre>
                    </s-box>
                  ) : null }
                </s-box>
              </s-clickable>
            )) }
          </s-stack>
        ) : null }
      </s-section>

      { error && sorted.length > 0 ? (
        <s-paragraph tone="critical">{ error }</s-paragraph>
      ) : null }

      { hasNext && sorted.length > 0 ? (
        <s-button
          loading={ loadingMore || undefined }
          disabled={ (loadingMore || !cursor) || undefined }
          onClick={ async () => {
            setLoadingMore(true);
            setError(null);
            try {
              await load(true, cursor);
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            } finally {
              setLoadingMore(false);
            }
          } }
        >
          Load more
        </s-button>
      ) : null }
    </s-page>
  );
}
