/** GET /api/collections?shop=…&q=&first= */

import { shopify } from '../shopify-server.js';
import { gqlErrorResponse } from './_collectionPairDiscountShared.js';

const QUERY = `#graphql
  query CollectionsSearch($first: Int!, $query: String) {
    collections(first: $first, query: $query, sortKey: TITLE) {
      nodes {
        id
        title
      }
    }
  }
`;

function parseFirst(url) {
  const n = Number.parseInt(url.searchParams.get('first') ?? '25', 10);
  return Number.isFinite(n) ? Math.min(50, Math.max(1, n)) : 25;
}

export default async function collections(req, res, { session }) {
  if (req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: 'Method not allowed' }));
    return;
  }

  const url = new URL(req.url, `https://${ req.headers.host }`);
  const first = parseFirst(url);
  const query = url.searchParams.get('q')?.trim() || null;

  try {
    const client = new shopify.clients.Graphql({ session });
    const { data } = await client.request(QUERY, {
      variables: { first, query },
    });

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      ok: true,
      collections: data?.collections?.nodes ?? [],
    }));
  } catch (err) {
    gqlErrorResponse(res, err, 'collections');
  }
}
