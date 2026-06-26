export const FUNCTION_HANDLE = 'collection-pair-discount';
export const CONFIG_NAMESPACE = '$app';
export const CONFIG_KEY = 'function-configuration';

const SHOPIFY_FUNCTIONS_QUERY = `#graphql
  query CollectionPairDiscountFunction {
    shopifyFunctions(first: 50, apiType: DISCOUNT) {
      nodes {
        id
        handle
        title
      }
    }
  }
`;

export async function getFunctionId(client) {
  const { data } = await client.request(SHOPIFY_FUNCTIONS_QUERY);
  const nodes = data?.shopifyFunctions?.nodes ?? [];
  const match = nodes.find((node) => node.handle === FUNCTION_HANDLE);
  return match?.id ?? null;
}

export function parseBundleConfig(rawValue) {
  if (rawValue == null || rawValue === '') {
    return null;
  }

  try {
    const parsed = typeof rawValue === 'string' ? JSON.parse(rawValue) : rawValue;
    const collectionIds = Array.isArray(parsed.collectionIds)
      ? parsed.collectionIds.filter((id) => typeof id === 'string' && id.length > 0)
      : typeof parsed.collectionId === 'string' && parsed.collectionId
        ? [ parsed.collectionId ]
        : [];

    return {
      collectionIds,
      itemCount: Number(parsed.itemCount ?? 2),
      bundlePrice: parsed.bundlePrice != null ? String(parsed.bundlePrice) : '',
    };
  } catch {
    return null;
  }
}

export function gqlErrorResponse(res, err, label) {
  console.error(label, err);
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

export function userErrorsResponse(res, userErrors) {
  res.writeHead(422, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ ok: false, userErrors }));
}
