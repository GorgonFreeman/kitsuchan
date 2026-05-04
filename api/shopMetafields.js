/** GET /api/shopMetafields?shop=…&first=&after= */

import { shopify } from '../shopify-server.js';

const QUERY = `#graphql
  query ShopMetafields($first: Int!, $after: String) {
    shop {
      metafields(first: $first, after: $after) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          id
          namespace
          key
          type
          value
        }
      }
    }
  }
`;

function parseFirst(url) {
  const n = Number.parseInt(url.searchParams.get('first') ?? '50', 10);
  return Number.isFinite(n) ? Math.min(250, Math.max(1, n)) : 50;
}

export default async function shopMetafields(req, res, { session }) {
  const url = new URL(req.url, `https://${ req.headers.host }`);
  const first = parseFirst(url);
  const after = url.searchParams.get('after') || null;

  try {
    const client = new shopify.clients.Graphql({ session });
    const { data } = await client.request(QUERY, { variables: { first, after } });
    const conn = data?.shop?.metafields;
    const nodes = conn?.nodes ?? [];
    const pageInfo = conn?.pageInfo ?? {};

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(
      JSON.stringify({
        ok: true,
        metafields: nodes,
        pageInfo: {
          hasNextPage: Boolean(pageInfo.hasNextPage),
          endCursor: pageInfo.endCursor ?? null,
        },
      }),
    );
  } catch (err) {
    console.error('shopMetafields', err);
    const gql = err?.response?.body?.errors?.graphQLErrors;
    const status = err?.response?.code ?? 500;
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(
      JSON.stringify({
        ok: false,
        error: err?.message ?? String(err),
        ...(Array.isArray(gql) ? { errors: gql } : {}),
      }),
    );
  }
}
