/** GET /api/collectionPairDiscounts?shop=…&first=&after= */

import { shopify } from '../shopify-server.js';
import {
  CONFIG_KEY,
  CONFIG_NAMESPACE,
  getFunctionId,
  gqlErrorResponse,
  parseBundleConfig,
} from './_collectionPairDiscountShared.js';

const LIST_QUERY = `#graphql
  query CollectionPairDiscounts($first: Int!, $after: String, $query: String) {
    discountNodes(first: $first, after: $after, query: $query) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        metafield(namespace: "${ CONFIG_NAMESPACE }", key: "${ CONFIG_KEY }") {
          value
        }
        discount {
          __typename
          ... on DiscountAutomaticApp {
            title
            status
            startsAt
            endsAt
            discountId
            appDiscountType {
              functionId
            }
          }
        }
      }
    }
  }
`;

const COLLECTIONS_QUERY = `#graphql
  query CollectionPairDiscountCollectionTitles($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on Collection {
        id
        title
      }
    }
  }
`;

function parseFirst(url) {
  const n = Number.parseInt(url.searchParams.get('first') ?? '50', 10);
  return Number.isFinite(n) ? Math.min(100, Math.max(1, n)) : 50;
}

export default async function collectionPairDiscounts(req, res, { session }) {
  if (req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: 'Method not allowed' }));
    return;
  }

  const url = new URL(req.url, `https://${ req.headers.host }`);
  const first = parseFirst(url);
  const after = url.searchParams.get('after') || null;

  try {
    const client = new shopify.clients.Graphql({ session });
    const functionId = await getFunctionId(client);

    if (!functionId) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        ok: true,
        functionDeployed: false,
        discounts: [],
        pageInfo: { hasNextPage: false, endCursor: null },
      }));
      return;
    }

    const { data } = await client.request(LIST_QUERY, {
      variables: {
        first,
        after,
        query: 'type:app AND method:automatic',
      },
    });

    const conn = data?.discountNodes;
    const nodes = (conn?.nodes ?? []).filter((node) => {
      const discount = node.discount;
      return discount?.__typename === 'DiscountAutomaticApp'
        && discount.appDiscountType?.functionId === functionId;
    });

    const collectionIds = [
      ...new Set(
        nodes.flatMap((node) => parseBundleConfig(node.metafield?.value)?.collectionIds ?? []),
      ),
    ];

    /** @type {Map<string, string>} */
    const collectionTitles = new Map();

    if (collectionIds.length) {
      const collectionsResult = await client.request(COLLECTIONS_QUERY, {
        variables: { ids: collectionIds },
      });
      for (const collection of collectionsResult.data?.nodes ?? []) {
        if (collection?.id && collection?.title) {
          collectionTitles.set(collection.id, collection.title);
        }
      }
    }

    const discounts = nodes.map((node) => {
      const discount = node.discount;
      const config = parseBundleConfig(node.metafield?.value);
      const collectionId = config?.collectionIds?.[ 0 ] ?? null;

      return {
        nodeId: node.id,
        discountId: discount.discountId,
        title: discount.title,
        status: discount.status,
        startsAt: discount.startsAt,
        endsAt: discount.endsAt,
        bundlePrice: config?.bundlePrice ?? '',
        collectionId,
        collectionTitle: collectionId ? (collectionTitles.get(collectionId) ?? '') : '',
      };
    });

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      ok: true,
      functionDeployed: true,
      discounts,
      pageInfo: {
        hasNextPage: Boolean(conn?.pageInfo?.hasNextPage),
        endCursor: conn?.pageInfo?.endCursor ?? null,
      },
    }));
  } catch (err) {
    gqlErrorResponse(res, err, 'collectionPairDiscounts');
  }
}
