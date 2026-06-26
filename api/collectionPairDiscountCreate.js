/** POST /api/collectionPairDiscountCreate?shop=… */

import { shopify } from '../shopify-server.js';
import {
  serializeMarketsConfig,
  validateMarketRows,
} from '../utils/collectionPairDiscountConfig.js';
import {
  CONFIG_KEY,
  CONFIG_NAMESPACE,
  FUNCTION_HANDLE,
  gqlErrorResponse,
  userErrorsResponse,
} from './_collectionPairDiscountShared.js';

const CREATE_MUTATION = `#graphql
  mutation CollectionPairDiscountCreate($automaticAppDiscount: DiscountAutomaticAppInput!) {
    discountAutomaticAppCreate(automaticAppDiscount: $automaticAppDiscount) {
      automaticAppDiscount {
        discountId
        title
        status
      }
      userErrors {
        field
        message
      }
    }
  }
`;

function normalizeMarketRows(body) {
  if (!Array.isArray(body?.marketRows)) {
    return null;
  }

  return body.marketRows.map((row) => ({
    marketId: typeof row?.marketId === 'string' ? row.marketId : '',
    name: typeof row?.name === 'string' ? row.name : 'Market',
    currencyCode: typeof row?.currencyCode === 'string' ? row.currencyCode : '',
    enabled: row?.enabled === true,
    bundlePrice: row?.bundlePrice ?? '',
  })).filter((row) => row.marketId);
}

export default async function collectionPairDiscountCreate(req, res, { session, body }) {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: 'Method not allowed' }));
    return;
  }

  const title = typeof body?.title === 'string' ? body.title.trim() : '';
  const collectionId = typeof body?.collectionId === 'string' ? body.collectionId.trim() : '';
  const startsAt = typeof body?.startsAt === 'string' ? body.startsAt.trim() : '';
  const endsAt = typeof body?.endsAt === 'string' && body.endsAt.trim() ? body.endsAt.trim() : null;
  const marketRows = normalizeMarketRows(body);

  if (!title) {
    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: 'title is required' }));
    return;
  }

  if (!collectionId) {
    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: 'collectionId is required' }));
    return;
  }

  if (!marketRows?.length) {
    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: 'marketRows is required' }));
    return;
  }

  const marketError = validateMarketRows(marketRows);
  if (marketError) {
    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: marketError }));
    return;
  }

  const effectiveStartsAt = startsAt || new Date().toISOString();

  try {
    const client = new shopify.clients.Graphql({ session });
    const { data } = await client.request(CREATE_MUTATION, {
      variables: {
        automaticAppDiscount: {
          title,
          functionHandle: FUNCTION_HANDLE,
          discountClasses: [ 'PRODUCT' ],
          startsAt: effectiveStartsAt,
          endsAt,
          combinesWith: {
            orderDiscounts: true,
            productDiscounts: false,
            shippingDiscounts: true,
          },
          metafields: [
            {
              namespace: CONFIG_NAMESPACE,
              key: CONFIG_KEY,
              type: 'json',
              value: JSON.stringify({
                collectionIds: [ collectionId ],
                itemCount: 2,
                discountTitle: title,
                markets: serializeMarketsConfig(marketRows),
              }),
            },
          ],
        },
      },
    });

    const userErrors = data?.discountAutomaticAppCreate?.userErrors ?? [];
    if (userErrors.length) {
      userErrorsResponse(res, userErrors);
      return;
    }

    const discount = data?.discountAutomaticAppCreate?.automaticAppDiscount ?? null;

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, discount }));
  } catch (err) {
    gqlErrorResponse(res, err, 'collectionPairDiscountCreate');
  }
}
