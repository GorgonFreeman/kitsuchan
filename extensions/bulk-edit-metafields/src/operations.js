import { adminGraphql, chunk } from './adminGraphql.js';
import {
  collectGids,
  enrichMetaobjectEntry,
  labelFromResolvedNode,
} from './metaobjectDisplay.js';
import {
  encodeMetafieldValue,
  formatDisplayValue,
  isListType,
  isReferenceType,
  mergeUnique,
  parseMetafieldValue,
  removeMatches,
  valuesEqual,
} from './valueCodec.js';

const DEFINITIONS_QUERY = `#graphql
  query ProductMetafieldDefinitions($first: Int!, $after: String) {
    metafieldDefinitions(ownerType: PRODUCT, first: $first, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        name
        namespace
        key
        type { name }
        validations { name value }
      }
    }
  }
`;

const PRODUCTS_METAFIELD_QUERY = `#graphql
  query ProductsMetafield($ids: [ID!]!, $namespace: String!, $key: String!) {
    nodes(ids: $ids) {
      ... on Product {
        id
        title
        metafield(namespace: $namespace, key: $key) {
          id
          value
          type
        }
      }
    }
  }
`;

const METAFIELDS_SET = `#graphql
  mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields { id }
      userErrors { field message code }
    }
  }
`;

const METAFIELDS_DELETE = `#graphql
  mutation MetafieldsDelete($metafields: [MetafieldIdentifierInput!]!) {
    metafieldsDelete(metafields: $metafields) {
      deletedMetafields { ownerId }
      userErrors { field message }
    }
  }
`;

const METAOBJECT_DEF_QUERY = `#graphql
  query MetaobjectDefinitionType($id: ID!) {
    metaobjectDefinition(id: $id) {
      id
      type
      name
      displayNameKey
      fieldDefinitions {
        key
        name
        type { name }
      }
    }
  }
`;

const METAOBJECTS_QUERY = `#graphql
  query MetaobjectsByType($type: String!, $first: Int!, $after: String) {
    metaobjects(type: $type, first: $first, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        handle
        displayName
        type
        fields {
          key
          value
          type
          reference {
            ... on MediaImage {
              id
              image { url altText }
            }
            ... on GenericFile {
              id
              url
            }
          }
        }
      }
    }
  }
`;

const NODES_LABELS_QUERY = `#graphql
  query NodesDisplayNames($ids: [ID!]!) {
    nodes(ids: $ids) {
      __typename
      ... on Metaobject {
        id
        displayName
        handle
        fields { key value type }
      }
      ... on Product {
        id
        title
      }
      ... on Collection {
        id
        title
      }
      ... on ProductVariant {
        id
        title
        displayName
      }
      ... on Page {
        id
        title
      }
      ... on MediaImage {
        id
        image { url altText }
      }
      ... on GenericFile {
        id
        url
      }
    }
  }
`;

const PRODUCTS_BY_QUERY = `#graphql
  query ProductsByQuery($first: Int!, $after: String, $query: String) {
    products(first: $first, after: $after, query: $query) {
      pageInfo { hasNextPage endCursor }
      nodes { id title }
    }
  }
`;

/**
 * Paginate all product IDs matching an Admin search query.
 * Pass empty/null query for the full catalog.
 * @param {string | null | undefined} query
 * @param {{ onProgress?: (loaded: number) => void, maxProducts?: number }} [opts]
 */
export async function fetchProductIdsByQuery(query, opts = {}) {
  const maxProducts = opts.maxProducts ?? 5000;
  const onProgress = opts.onProgress;
  const all = [];
  let after = null;
  let hasNextPage = true;
  const q = typeof query === 'string' && query.trim() ? query.trim() : null;

  while (hasNextPage) {
    const data = await adminGraphql(PRODUCTS_BY_QUERY, {
      first: 50,
      after,
      query: q,
    });
    const conn = data?.products;
    for (const node of conn?.nodes ?? []) {
      if (node?.id) all.push(node.id);
    }
    onProgress?.(all.length);
    if (all.length >= maxProducts) {
      return {
        ids: all.slice(0, maxProducts),
        truncated: true,
        totalLoaded: all.length,
      };
    }
    hasNextPage = Boolean(conn?.pageInfo?.hasNextPage);
    after = conn?.pageInfo?.endCursor ?? null;
  }

  return { ids: all, truncated: false, totalLoaded: all.length };
}

export async function fetchAllProductMetafieldDefinitions() {
  const all = [];
  let after = null;
  let hasNextPage = true;
  while (hasNextPage) {
    const data = await adminGraphql(DEFINITIONS_QUERY, { first: 50, after });
    const conn = data?.metafieldDefinitions;
    all.push(...(conn?.nodes ?? []));
    hasNextPage = Boolean(conn?.pageInfo?.hasNextPage);
    after = conn?.pageInfo?.endCursor ?? null;
  }
  return all.map((node) => ({
    id: node.id,
    name: node.name,
    namespace: node.namespace,
    key: node.key,
    type: node.type?.name,
    validations: node.validations ?? [],
  }));
}

export async function fetchMetaobjectType(definitionGid) {
  const data = await adminGraphql(METAOBJECT_DEF_QUERY, { id: definitionGid });
  return data?.metaobjectDefinition ?? null;
}

export async function fetchMetaobjects(type, definition = null) {
  const all = [];
  let after = null;
  let hasNextPage = true;
  while (hasNextPage) {
    const data = await adminGraphql(METAOBJECTS_QUERY, { type, first: 50, after });
    const conn = data?.metaobjects;
    all.push(...(conn?.nodes ?? []));
    hasNextPage = Boolean(conn?.pageInfo?.hasNextPage);
    after = conn?.pageInfo?.endCursor ?? null;
    if (all.length >= 250) break;
  }
  return all.map((node) => enrichMetaobjectEntry(node, definition));
}

/** Resolve Shopify GIDs to human-readable labels (never show raw GIDs in UI). */
export async function resolveDisplayLabels(ids) {
  const unique = [...new Set((ids || []).filter((id) => typeof id === 'string' && id.startsWith('gid://')))];
  const map = new Map();
  if (!unique.length) return map;

  for (const batch of chunk(unique, 50)) {
    try {
      const data = await adminGraphql(NODES_LABELS_QUERY, { ids: batch });
      for (const node of data?.nodes ?? []) {
        if (!node?.id) continue;
        const label = labelFromResolvedNode(node);
        if (label) map.set(node.id, label);
      }
    } catch {
      // Partial label resolution is fine - formatDisplayValue falls back to humanized type/id
    }
  }
  return map;
}

export async function readProductMetafields(productGids, namespace, key) {
  const results = [];
  for (const ids of chunk(productGids, 25)) {
    const data = await adminGraphql(PRODUCTS_METAFIELD_QUERY, { ids, namespace, key });
    for (const node of data?.nodes ?? []) {
      if (node?.id) results.push(node);
    }
  }
  return results;
}

/** Sample current values for a metafield across selected products. */
export async function sampleMetafieldValues(productGids, definition, limit = 5) {
  const sampleIds = productGids.slice(0, Math.min(25, productGids.length));
  const products = await readProductMetafields(sampleIds, definition.namespace, definition.key);
  const withValue = products.filter((p) => p.metafield?.value != null && p.metafield.value !== '');

  let labelMap = null;
  if (isReferenceType(definition.type)) {
    const gids = [];
    for (const p of withValue.slice(0, limit)) {
      gids.push(...collectGids(parseMetafieldValue(definition.type, p.metafield.value)));
    }
    labelMap = await resolveDisplayLabels(gids);
  }

  const samples = withValue.slice(0, limit).map((p) => ({
    productId: p.id,
    title: p.title,
    display: formatDisplayValue(
      definition.type,
      parseMetafieldValue(definition.type, p.metafield.value),
      labelMap,
    ),
  }));
  return {
    sampled: sampleIds.length,
    withValue: withValue.length,
    withoutValue: sampleIds.length - withValue.length,
    samples,
  };
}

function nextValueForProduct(type, operation, current, editorValue) {
  if (operation === 'clear') return null;
  if (operation === 'update') return editorValue;
  if (!isListType(type)) return editorValue;
  const list = Array.isArray(current) ? current : [];
  const items = Array.isArray(editorValue) ? editorValue : [editorValue];
  if (operation === 'add') return mergeUnique(list, items);
  return removeMatches(list, items);
}

/** Dry-run one rule against selected products (no writes). */
export async function dryRunRule(productGids, { definition, operation, editorValue }) {
  const { namespace, key, type } = definition;
  const products = await readProductMetafields(productGids, namespace, key);
  const byId = new Map(products.map((p) => [p.id, p]));

  let willChange = 0;
  let unchanged = 0;
  let missing = 0;
  const pendingExamples = [];

  for (const ownerId of productGids) {
    const product = byId.get(ownerId);
    const raw = product?.metafield?.value;
    const hasValue = raw != null && raw !== '';
    if (!hasValue) missing += 1;

    const current = parseMetafieldValue(type, raw);
    if (operation === 'clear') {
      if (hasValue) {
        willChange += 1;
        if (pendingExamples.length < 3) {
          pendingExamples.push({
            title: product?.title ?? ownerId,
            from: current,
            to: null,
          });
        }
      } else {
        unchanged += 1;
      }
      continue;
    }

    const next = nextValueForProduct(type, operation, current, editorValue);
    const same =
      operation === 'update'
        ? hasValue && valuesEqual(current, next)
        : valuesEqual(current, next);

    if (same) {
      unchanged += 1;
    } else {
      willChange += 1;
      if (pendingExamples.length < 3) {
        pendingExamples.push({
          title: product?.title ?? ownerId,
          from: current,
          to: next,
        });
      }
    }
  }

  const gids = [...collectGids(editorValue)];
  for (const ex of pendingExamples) {
    gids.push(...collectGids(ex.from), ...collectGids(ex.to));
  }
  const labelMap = await resolveDisplayLabels(gids);

  const examples = pendingExamples.map((ex) => ({
    title: ex.title,
    from: formatDisplayValue(type, ex.from, labelMap),
    to: ex.to == null ? '-' : formatDisplayValue(type, ex.to, labelMap),
  }));

  return {
    definition,
    operation,
    total: productGids.length,
    willChange,
    unchanged,
    missing,
    examples,
    valueLabel: formatDisplayValue(type, editorValue, labelMap),
    labelMap,
  };
}

export async function dryRunRules(productGids, rules) {
  const reports = [];
  for (const rule of rules) {
    reports.push(await dryRunRule(productGids, rule));
  }
  return reports;
}

async function setMetafields(inputs) {
  let success = 0;
  let failed = 0;
  const errors = [];
  for (const batch of chunk(inputs, 25)) {
    const data = await adminGraphql(METAFIELDS_SET, { metafields: batch });
    const userErrors = data?.metafieldsSet?.userErrors ?? [];
    const saved = data?.metafieldsSet?.metafields?.length ?? 0;
    if (userErrors.length) {
      errors.push(...userErrors.map((e) => e.message));
      success += saved;
      failed += Math.max(0, batch.length - saved);
    } else {
      success += batch.length;
    }
  }
  return { success, failed, errors };
}

async function deleteMetafields(identifiers) {
  let success = 0;
  let failed = 0;
  const errors = [];
  for (const batch of chunk(identifiers, 250)) {
    const data = await adminGraphql(METAFIELDS_DELETE, { metafields: batch });
    const userErrors = data?.metafieldsDelete?.userErrors ?? [];
    const deleted = data?.metafieldsDelete?.deletedMetafields?.length ?? 0;
    if (userErrors.length) {
      errors.push(...userErrors.map((e) => e.message));
      success += deleted;
      failed += Math.max(0, batch.length - deleted);
    } else {
      success += batch.length;
    }
  }
  return { success, failed, errors };
}

export async function runBulkMetafieldOperation(operation, { productGids, definition, editorValue }) {
  const { namespace, key, type } = definition;
  const total = productGids.length;

  if (operation === 'clear') {
    const identifiers = productGids.map((ownerId) => ({ ownerId, namespace, key }));
    const result = await deleteMetafields(identifiers);
    return { ...result, total, definition, operation };
  }

  if (operation === 'update') {
    const value = encodeMetafieldValue(type, editorValue);
    const inputs = productGids.map((ownerId) => ({
      ownerId,
      namespace,
      key,
      type,
      value,
    }));
    const result = await setMetafields(inputs);
    return { ...result, total, definition, operation };
  }

  if (!isListType(type)) {
    throw new Error('Add and Remove are only available for list metafields.');
  }

  const products = await readProductMetafields(productGids, namespace, key);
  const byId = new Map(products.map((p) => [p.id, p]));
  const additions = Array.isArray(editorValue) ? editorValue : [editorValue];
  const inputs = [];

  for (const ownerId of productGids) {
    const current = parseMetafieldValue(type, byId.get(ownerId)?.metafield?.value);
    const next =
      operation === 'add'
        ? mergeUnique(current, additions)
        : removeMatches(current, additions);
    inputs.push({
      ownerId,
      namespace,
      key,
      type,
      value: encodeMetafieldValue(type, next),
    });
  }

  const result = await setMetafields(inputs);
  return { ...result, total, definition, operation };
}

/** Run multiple rules sequentially. */
export async function runBulkMetafieldRules(productGids, rules) {
  const results = [];
  for (const rule of rules) {
    results.push(
      await runBulkMetafieldOperation(rule.operation, {
        productGids,
        definition: rule.definition,
        editorValue: rule.editorValue,
      }),
    );
  }
  return results;
}
