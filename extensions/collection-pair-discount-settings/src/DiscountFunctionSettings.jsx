
import '@shopify/ui-extensions/preact';
import { render } from 'preact';
import { useState, useEffect, useMemo } from 'preact/hooks';

export default async () => {
  render(<App />, document.body);
};

function MarketPriceRow({ row, i18n, onEnabledChange, onPriceChange }) {
  return (
    <s-box padding="small" border="base" borderRadius="base">
      <s-stack gap="small">
        <s-checkbox
          checked={ row.enabled }
          onChange={() => onEnabledChange(row.marketId, !row.enabled)}
          label={ row.name }
        />
        <s-number-field
          label={ `${ i18n.translate('marketPriceLabel') } (${ row.currencyCode || '—' })` }
          name={ `marketPrice-${ row.marketId }` }
          value={ row.enabled ? String(row.bundlePrice ?? '') : '' }
          defaultValue={ row.enabled ? String(row.bundlePrice ?? '') : '' }
          min={ 0 }
          step={ 0.01 }
          disabled={ !row.enabled }
          onChange={(event) => onPriceChange(row.marketId, event.currentTarget.value)}
        />
      </s-stack>
    </s-box>
  );
}

function App() {
  const {
    applyExtensionMetafieldChange,
    collection,
    ensureProductDiscountClass,
    i18n,
    initialCollection,
    initialMarketRows,
    loading,
    marketRows,
    onMarketEnabledChange,
    onMarketPriceChange,
    onSelectCollection,
    removeCollection,
    resetForm,
  } = useExtensionData();

  const [ error, setError ] = useState();

  useEffect(() => {
    ensureProductDiscountClass().catch(() => {
      setError(i18n.translate('error'));
    });
  }, [ ensureProductDiscountClass, i18n ]);

  if (loading) {
    return <s-text>{ i18n.translate('loading') }</s-text>;
  }

  return (
    <s-function-settings
      onSubmit={(event) => {
        event.waitUntil?.(applyExtensionMetafieldChange().catch((err) => {
          setError(err instanceof Error ? err.message : String(err));
        }));
      }}
      onReset={resetForm}
    >
      <s-heading>{ i18n.translate('title') }</s-heading>
      <s-section>
        <s-stack gap="base">
          { error ? <s-banner tone="critical">{ error }</s-banner> : null }
          <s-paragraph color="subdued">{ i18n.translate('helpText') }</s-paragraph>
          <s-stack gap="base">
            <s-button onClick={onSelectCollection}>
              { i18n.translate('collectionButtonLabel') }
            </s-button>
            { collection ? (
              <s-stack direction="inline" alignItems="center" justifyContent="space-between">
                <s-link
                  href={ `shopify://admin/collections/${ collection.id.split('/').pop() }` }
                  target="_blank"
                >
                  { collection.title }
                </s-link>
                <s-button variant="tertiary" onClick={removeCollection}>
                  <s-icon type="x-circle" />
                </s-button>
              </s-stack>
            ) : (
              <s-paragraph color="subdued">{ i18n.translate('noCollection') }</s-paragraph>
            ) }
          </s-stack>
          <s-heading>{ i18n.translate('marketsHeading') }</s-heading>
          { marketRows.length ? marketRows.map((row) => (
            <MarketPriceRow
              key={ row.marketId }
              row={ row }
              i18n={ i18n }
              onEnabledChange={ onMarketEnabledChange }
              onPriceChange={ onMarketPriceChange }
            />
          )) : (
            <s-paragraph color="subdued">{ i18n.translate('noMarkets') }</s-paragraph>
          ) }
          <s-paragraph color="subdued">{ i18n.translate('itemCountNote') }</s-paragraph>
        </s-stack>
      </s-section>
    </s-function-settings>
  );
}

function useExtensionData() {
  const { applyMetafieldChange, data, i18n, query, resourcePicker } = shopify;

  const metafieldConfig = useMemo(
    () => parseMetafield(
      data?.metafields?.find((metafield) => metafield.key === 'function-configuration')?.value,
    ),
    [ data?.metafields ],
  );

  const [ collection, setCollection ] = useState(null);
  const [ initialCollection, setInitialCollection ] = useState(null);
  const [ marketRows, setMarketRows ] = useState([]);
  const [ initialMarketRows, setInitialMarketRows ] = useState([]);
  const [ loading, setLoading ] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);

      const [ selectedCollection, allMarkets ] = await Promise.all([
        metafieldConfig.collectionId
          ? getCollection(metafieldConfig.collectionId, query)
          : Promise.resolve(null),
        getMarkets(query),
      ]);

      setInitialCollection(selectedCollection);
      setCollection(selectedCollection);

      const rows = buildMarketRows(
        allMarkets,
        metafieldConfig.markets,
        metafieldConfig.legacyBundlePrice,
      );
      setMarketRows(rows);
      setInitialMarketRows(rows);
      setLoading(false);
    };

    load();
  }, [ metafieldConfig.collectionId, metafieldConfig.legacyBundlePrice, data?.metafields, query ]);

  const ensureProductDiscountClass = async () => {
    const discountClasses = shopify.discounts?.discountClasses?.value ?? [];
    if (discountClasses.includes('product') && discountClasses.length === 1) {
      return;
    }

    const result = await shopify.discounts?.updateDiscountClasses?.([ 'product' ]);
    if (!result?.success) {
      throw new Error('Unable to update discount classes');
    }
  };

  const onMarketEnabledChange = (marketId, enabled) => {
    setMarketRows((prev) => prev.map((row) => (
      row.marketId === marketId ? { ...row, enabled } : row
    )));
  };

  const onMarketPriceChange = (marketId, value) => {
    setMarketRows((prev) => prev.map((row) => (
      row.marketId === marketId ? { ...row, bundlePrice: value } : row
    )));
  };

  async function applyExtensionMetafieldChange() {
    if (!collection?.id) {
      throw new Error('Collection is required');
    }

    const validationError = validateMarketRows(marketRows);
    if (validationError) {
      throw new Error(validationError);
    }

    const discountTitle = await getDiscountTitle(data?.id, query);

    await applyMetafieldChange({
      type: 'updateMetafield',
      namespace: '$app',
      key: 'function-configuration',
      value: JSON.stringify({
        collectionIds: [ collection.id ],
        itemCount: 2,
        discountTitle,
        markets: serializeMarketsConfig(marketRows),
      }),
      valueType: 'json',
    });

    setInitialCollection(collection);
    setInitialMarketRows(marketRows);
  }

  const resetForm = () => {
    setCollection(initialCollection);
    setMarketRows(initialMarketRows);
  };

  const onSelectCollection = async () => {
    const selection = await resourcePicker({
      type: 'collection',
      selectionIds: collection ? [ { id: collection.id } ] : [],
      action: 'select',
      multiple: false,
      filter: {
        archived: true,
        variants: true,
      },
    });

    setCollection(selection?.[ 0 ] ?? null);
  };

  const removeCollection = () => {
    setCollection(null);
  };

  return {
    applyExtensionMetafieldChange,
    collection,
    ensureProductDiscountClass,
    i18n,
    initialCollection,
    initialMarketRows,
    loading,
    marketRows,
    onMarketEnabledChange,
    onMarketPriceChange,
    onSelectCollection,
    removeCollection,
    resetForm,
  };
}

function parseMetafield(value) {
  try {
    const parsed = JSON.parse(value || '{}');
    const collectionId = Array.isArray(parsed.collectionIds) && parsed.collectionIds.length
      ? parsed.collectionIds[ 0 ]
      : parsed.collectionId ?? '';

    return {
      collectionId,
      markets: parsed.markets && typeof parsed.markets === 'object' ? parsed.markets : {},
      legacyBundlePrice: parsed.bundlePrice != null ? String(parsed.bundlePrice) : '',
    };
  } catch {
    return {
      collectionId: '',
      markets: {},
      legacyBundlePrice: '',
    };
  }
}

function buildMarketRows(allMarkets, savedMarkets, legacyBundlePrice) {
  const hasSavedMarkets = Object.keys(savedMarkets ?? {}).length > 0;

  return allMarkets.map((market) => {
    const saved = savedMarkets?.[ market.id ];

    if (hasSavedMarkets) {
      return {
        marketId: market.id,
        name: market.name,
        currencyCode: market.currencyCode ?? '',
        enabled: saved?.enabled === true,
        bundlePrice: saved?.bundlePrice != null ? saved.bundlePrice : '',
      };
    }

    return {
      marketId: market.id,
      name: market.name,
      currencyCode: market.currencyCode ?? '',
      enabled: Boolean(legacyBundlePrice),
      bundlePrice: legacyBundlePrice || '',
    };
  });
}

function serializeMarketsConfig(marketRows) {
  /** @type {Record<string, { enabled: boolean, bundlePrice?: string }>} */
  const markets = {};

  for (const row of marketRows) {
    const entry = { enabled: row.enabled === true };
    if (entry.enabled) {
      const amount = typeof row.bundlePrice === 'number'
        ? row.bundlePrice
        : parseFloat(String(row.bundlePrice ?? ''));

      if (Number.isFinite(amount) && amount > 0) {
        entry.bundlePrice = amount.toFixed(2);
      }
    }

    markets[ row.marketId ] = entry;
  }

  return markets;
}

function validateMarketRows(marketRows) {
  const enabled = marketRows.filter((row) => row.enabled);
  if (!enabled.length) {
    return 'Enable at least one market';
  }

  for (const row of enabled) {
    const amount = typeof row.bundlePrice === 'number'
      ? row.bundlePrice
      : parseFloat(String(row.bundlePrice ?? ''));

    if (!Number.isFinite(amount) || amount <= 0) {
      return `Enter a bundle price for ${ row.name }`;
    }
  }

  return null;
}

async function getDiscountTitle(discountNodeId, adminApiQuery) {
  if (!discountNodeId) {
    return '';
  }

  const gql = `#graphql
    query DiscountTitle($id: ID!) {
      discountNode(id: $id) {
        discount {
          ... on DiscountAutomaticApp {
            title
          }
          ... on DiscountCodeApp {
            title
          }
        }
      }
    }
  `;
  const result = await adminApiQuery(
    gql,
    { variables: { id: discountNodeId } },
  );

  return result?.data?.discountNode?.discount?.title ?? '';
}

async function getMarkets(adminApiQuery) {
  const gql = `#graphql
    query CollectionPairDiscountMarkets($first: Int!) {
      markets(first: $first) {
        nodes {
          id
          name
          currencySettings {
            baseCurrency {
              currencyCode
            }
          }
        }
      }
    }
  `;
  const result = await adminApiQuery(
    gql,
    { variables: { first: 50 } },
  );

  return (result?.data?.markets?.nodes ?? []).map((market) => ({
    id: market.id,
    name: market.name,
    currencyCode: market.currencySettings?.baseCurrency?.currencyCode ?? '',
  }));
}

async function getCollection(collectionGid, adminApiQuery) {
  const gql = `#graphql
    query GetCollection($id: ID!) {
      collection(id: $id) {
        id
        title
      }
    }
  `;
  const result = await adminApiQuery(
    gql,
    { variables: { id: collectionGid } },
  );

  return result?.data?.collection ?? null;
}
