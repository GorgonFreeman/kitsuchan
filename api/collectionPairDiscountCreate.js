/** POST /api/collectionPairDiscountCreate?shop=… */

import { shopify } from '../shopify-server.js';
import {
  PRICING_MODE_MARKETS,
  PRICING_MODE_SINGLE,
  buildFunctionConfiguration,
  validatePricingConfig,
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
    return [];
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
  const bundlePrice = body?.bundlePrice;
  const shopCurrencyCode = typeof body?.shopCurrencyCode === 'string'
    ? body.shopCurrencyCode.trim()
    : '';
  const pricingMode = body?.pricingMode === PRICING_MODE_MARKETS
    ? PRICING_MODE_MARKETS
    : PRICING_MODE_SINGLE;

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

  const pricingError = validatePricingConfig({
    pricingMode,
    marketRows,
    bundlePrice,
  });
  if (pricingError) {
    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: pricingError }));
    return;
  }

  const effectiveStartsAt = startsAt || new Date().toISOString();
  const config = buildFunctionConfiguration({
    collectionIds: [ collectionId ],
    discountTitle: title,
    pricingMode,
    marketRows,
    bundlePrice,
    shopCurrencyCode,
  });

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
              value: JSON.stringify(config),
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
