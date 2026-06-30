/** GET /api/markets?shop=… */

import { graphQlErrorsMessage } from '../utils/collectionPairDiscountConfig.js';
import { shopify } from '../shopify-server.js';
import { gqlErrorResponse } from './_collectionPairDiscountShared.js';

const QUERY = `#graphql
  query CollectionPairDiscountMarkets($first: Int!) {
    shop {
      currencyCode
    }
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
    const response = await client.request(QUERY, { variables: { first } });
    const gqlErrors = response.errors ?? response.body?.errors?.graphQLErrors;
    const accessError = graphQlErrorsMessage(gqlErrors);
    if (accessError) {
      res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: accessError, errors: gqlErrors }));
      return;
    }

    const { data } = response;
    const nodes = (data?.markets?.nodes ?? []).map((market) => ({
      id: market.id,
      name: market.name,
      status: market.status,
      currencyCode: market.currencySettings?.baseCurrency?.currencyCode ?? '',
    }));

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      ok: true,
      currencyCode: data?.shop?.currencyCode ?? '',
      markets: nodes,
    }));
  } catch (err) {
    gqlErrorResponse(res, err, 'markets');
  }
}
