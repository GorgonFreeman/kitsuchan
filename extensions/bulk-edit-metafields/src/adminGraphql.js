const GRAPHQL_URL = 'shopify:admin/api/graphql.json';
const BATCH_SIZE = 25;

async function gql(query, variables = {}) {
  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors[ 0 ].message);
  return json.data;
}

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

export async function fetchProductMetafieldDefinitions() {
  const data = await gql(`#graphql
    query ProductMetafieldDefinitions {
      metafieldDefinitions(ownerType: PRODUCT, first: 250) {
        nodes {
          name
          namespace
          key
          type { name }
        }
      }
    }
  `);
  return data?.metafieldDefinitions?.nodes ?? [];
}

const SET_MUTATION = `#graphql
  mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      userErrors { field message code }
    }
  }
`;

const DELETE_MUTATION = `#graphql
  mutation MetafieldsDelete($metafields: [MetafieldIdentifierInput!]!) {
    metafieldsDelete(metafields: $metafields) {
      userErrors { field message }
    }
  }
`;

export async function setMetafieldsOnProducts({ productGids, namespace, key, type, value }) {
  for (const gids of chunk(productGids, BATCH_SIZE)) {
    const metafields = gids.map((ownerId) => ({ ownerId, namespace, key, type, value }));
    const data = await gql(SET_MUTATION, { metafields });
    const userErrors = data?.metafieldsSet?.userErrors ?? [];
    if (userErrors.length) {
      throw new Error(userErrors.map((e) => e.message).join('; '));
    }
  }
}

export async function deleteMetafieldsOnProducts({ productGids, namespace, key }) {
  for (const gids of chunk(productGids, BATCH_SIZE)) {
    const metafields = gids.map((ownerId) => ({ ownerId, namespace, key }));
    const data = await gql(DELETE_MUTATION, { metafields });
    const userErrors = data?.metafieldsDelete?.userErrors ?? [];
    if (userErrors.length) {
      throw new Error(userErrors.map((e) => e.message).join('; '));
    }
  }
}
