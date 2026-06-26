/** GET /api/markets?shop=… */

import { shopify } from '../shopify-server.js';
import { gqlErrorResponse } from './_collectionPairDiscountShared.js';

const QUERY = `#graphql
  query CollectionPairDiscountMarkets($first: Int!) {
    markets(first: $first) {
      nodes {
        id
        name
        status
        currencySettings {
          baseCurrency {
            currencyCode
          }
        }
      }
    }
  }
`;

function parseFirst(url) {
  const n = Number.parseInt(url.searchParams.get('first') ?? '50', 10);
  return Number.isFinite(n) ? Math.min(50, Math.max(1, n)) : 50;
}

export default async function markets(req, res, { session }) {
  if (req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: 'Method not allowed' }));
    return;
  }

  const url = new URL(req.url, `https://${ req.headers.host }`);
  const first = parseFirst(url);

  try {
    const client = new shopify.clients.Graphql({ session });
    const { data } = await client.request(QUERY, { variables: { first } });
    const nodes = (data?.markets?.nodes ?? []).map((market) => ({
      id: market.id,
      name: market.name,
      status: market.status,
      currencyCode: market.currencySettings?.baseCurrency?.currencyCode ?? '',
    }));

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, markets: nodes }));
  } catch (err) {
    gqlErrorResponse(res, err, 'markets');
  }
}
