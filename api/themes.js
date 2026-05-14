/** GET /api/themes?shop=… */

import { shopify } from '../shopify-server.js';

const PAGE = 150;

const QUERY = `#graphql
  query ThemesList($first: Int!, $after: String) {
    themes(first: $first, after: $after) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        name
        role
        updatedAt
      }
    }
  }
`;

export default async function themes(req, res, { session }) {
  if (req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: 'Method not allowed' }));
    return;
  }

  try {
    const client = new shopify.clients.Graphql({ session });
    const themesList = [];
    let after = null;
    for (;;) {
      const { data } = await client.request(QUERY, { variables: { first: PAGE, after } });
      const conn = data?.themes;
      themesList.push(...(conn?.nodes ?? []));
      const pageInfo = conn?.pageInfo ?? {};
      if (!pageInfo.hasNextPage || !pageInfo.endCursor) break;
      after = pageInfo.endCursor;
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, themes: themesList }));
  } catch (err) {
    console.error('themes', err);
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
