const GRAPHQL_URL = 'shopify:admin/api/graphql.json';

async function gql(query, variables = {}) {
  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data;
}

export async function getShopDomain() {
  const data = await gql(`{ shop { myshopifyDomain } }`);
  return data.shop.myshopifyDomain;
}

export async function getInitialBoards(customerGid) {
  const data = await gql(
    `query GetCustomerWishlist($id: ID!) {
      customer(id: $id) {
        metafield(namespace: "wishlist", key: "main") {
          value
        }
      }
    }`,
    { id: customerGid },
  );
  const raw = data?.customer?.metafield?.value;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function getProductsByIds(numericIds) {
  if (!numericIds.length) return new Map();
  const gids = numericIds.map(id => `gid://shopify/Product/${id}`);
  const data = await gql(
    `query GetProducts($ids: [ID!]!) {
      nodes(ids: $ids) {
        id
        ... on Product {
          title
          featuredImage { url altText }
        }
      }
    }`,
    { ids: gids },
  );
  const map = new Map();
  for (const node of data?.nodes ?? []) {
    if (!node?.title) continue;
    const numericId = node.id.replace('gid://shopify/Product/', '');
    map.set(numericId, {
      title: node.title,
      image: node.featuredImage ?? null,
    });
  }
  return map;
}

function fieldsToObj(fields) {
  const obj = {};
  for (const { key, value } of fields) obj[key] = value;
  return obj;
}

export async function getWishlistEmojis() {
  const data = await gql(
    `query GetWishlistEmojis {
      metaobjects(type: "wishlist_emojis", first: 250) {
        nodes {
          fields { key value }
        }
      }
    }`,
  );
  return (data?.metaobjects?.nodes ?? []).map(node => {
    const f = fieldsToObj(node.fields);
    let type = 'emoji';
    let display = f.emoji ?? '';
    if (f.svg_code) { type = 'svg'; display = f.svg_code; }
    else if (f.svg) { type = 'image'; display = f.svg; }
    return {
      value: f.name ?? '',
      default: f.default === 'true',
      category: f.category ?? 'Other',
      type,
      display,
    };
  });
}

export async function getWishlistColours() {
  const data = await gql(
    `query GetWishlistColours {
      metaobjects(type: "wishlist_colours", first: 250) {
        nodes {
          fields { key value }
        }
      }
    }`,
  );
  return (data?.metaobjects?.nodes ?? []).map(node => {
    const f = fieldsToObj(node.fields);
    const colour = f.advanced_css ?? f.colour ?? '#FF6B6B';
    return {
      value: f.name ?? '',
      default: f.default === 'true',
      colour,
    };
  });
}
