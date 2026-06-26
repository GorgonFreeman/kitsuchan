/** POST /api/collectionPairDiscountCreate?shop=… */

import { shopify } from '../shopify-server.js';
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

export default async function collectionPairDiscountCreate(req, res, { session, body }) {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: 'Method not allowed' }));
    return;
  }

  const title = typeof body?.title === 'string' ? body.title.trim() : '';
  const collectionId = typeof body?.collectionId === 'string' ? body.collectionId.trim() : '';
  const bundlePriceRaw = body?.bundlePrice;
  const startsAt = typeof body?.startsAt === 'string' ? body.startsAt.trim() : '';
  const endsAt = typeof body?.endsAt === 'string' && body.endsAt.trim() ? body.endsAt.trim() : null;

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

  const bundleAmount = typeof bundlePriceRaw === 'number'
    ? bundlePriceRaw
    : parseFloat(String(bundlePriceRaw ?? ''));

  if (!Number.isFinite(bundleAmount) || bundleAmount <= 0) {
    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: 'bundlePrice must be greater than zero' }));
    return;
  }

  const bundlePrice = bundleAmount.toFixed(2);
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
                bundlePrice,
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
