
import '@shopify/ui-extensions/preact';
import { render } from 'preact';
import { useState, useEffect, useMemo } from 'preact/hooks';

const PRICING_MODE_SINGLE = 'single';
const PRICING_MODE_MARKETS = 'markets';

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
    bundlePrice,
    collection,
    ensureProductDiscountClass,
    i18n,
    initialBundlePrice,
    initialCollection,
    initialMarketRows,
    initialPricingMode,
    loading,
    marketRows,
    marketsLoadError,
    onBundlePriceChange,
    onMarketEnabledChange,
    onMarketPriceChange,
    onPricingModeChange,
    onSelectCollection,
    pricingMode,
    removeCollection,
    resetForm,
    shopCurrencyCode,
  } = useExtensionData();

  const [ error, setError ] = useState();
  const isSinglePriceMode = pricingMode === PRICING_MODE_SINGLE;

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
          <s-select
            label={ i18n.translate('pricingModeLabel') }
            name="pricingMode"
            value={ pricingMode }
            onChange={(event) => onPricingModeChange(event.currentTarget.value)}
          >
            <s-option value={ PRICING_MODE_SINGLE }>{ i18n.translate('pricingModeSingle') }</s-option>
            <s-option value={ PRICING_MODE_MARKETS }>{ i18n.translate('pricingModeMarkets') }</s-option>
          </s-select>
          { isSinglePriceMode ? (
            <s-number-field
              label={ `${ i18n.translate('bundlePriceLabel') } (${ shopCurrencyCode || '—' })` }
              name="bundlePrice"
              value={ String(bundlePrice) }
              defaultValue={ String(initialBundlePrice) }
              min={ 0 }
              step={ 0.01 }
              onChange={(event) => onBundlePriceChange(event.currentTarget.value)}
            />
          ) : marketsLoadError ? (
            <s-banner tone="critical">{ marketsLoadError }</s-banner>
          ) : marketRows.length ? (
            marketRows.map((row) => (
              <MarketPriceRow
                key={ row.marketId }
                row={ row }
                i18n={ i18n }
                onEnabledChange={ onMarketEnabledChange }
                onPriceChange={ onMarketPriceChange }
              />
            ))
          ) : (
            <s-paragraph color="subdued">{ i18n.translate('noMarkets') }</s-paragraph>
          ) }
          <s-paragraph color="subdued">
            { isSinglePriceMode
              ? i18n.translate('singlePriceNote')
              : i18n.translate('itemCountNote') }
          </s-paragraph>
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
  const [ bundlePrice, setBundlePrice ] = useState(0);
  const [ initialBundlePrice, setInitialBundlePrice ] = useState(0);
  const [ pricingMode, setPricingMode ] = useState(PRICING_MODE_SINGLE);
  const [ initialPricingMode, setInitialPricingMode ] = useState(PRICING_MODE_SINGLE);
  const [ shopCurrencyCode, setShopCurrencyCode ] = useState('');
  const [ marketsLoadError, setMarketsLoadError ] = useState(null);
  const [ loading, setLoading ] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setMarketsLoadError(null);

      const [ selectedCollection, marketsResult ] = await Promise.all([
        metafieldConfig.collectionId
          ? getCollection(metafieldConfig.collectionId, query)
          : Promise.resolve(null),
        getMarkets(query),
      ]);

      setInitialCollection(selectedCollection);
      setCollection(selectedCollection);
      setShopCurrencyCode(marketsResult.currencyCode);
      setMarketsLoadError(marketsResult.error);

      const rows = buildMarketRows(allMarketsFromResult(marketsResult), metafieldConfig.markets);
      const savedPricingMode = metafieldConfig.pricingMode;
      const singlePriceAmount = Number(metafieldConfig.bundlePrice) || 0;

      setPricingMode(savedPricingMode);
      setInitialPricingMode(savedPricingMode);
      setMarketRows(rows);
      setInitialMarketRows(rows);
      setBundlePrice(singlePriceAmount);
      setInitialBundlePrice(singlePriceAmount);
      setLoading(false);
    };

    load();
  }, [ metafieldConfig.collectionId, metafieldConfig.bundlePrice, metafieldConfig.pricingMode, data?.metafields, query ]);

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

  const onPricingModeChange = (value) => {
    setPricingMode(value === PRICING_MODE_MARKETS ? PRICING_MODE_MARKETS : PRICING_MODE_SINGLE);
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

  const onBundlePriceChange = (value) => {
    setBundlePrice(Number(value));
  };

  async function applyExtensionMetafieldChange() {
    if (!collection?.id) {
      throw new Error('Collection is required');
    }

    const validationError = validatePricingConfig({
      pricingMode,
      marketRows,
      bundlePrice,
      marketsLoadError,
    });
    if (validationError) {
      throw new Error(validationError);
    }

    const discountTitle = await getDiscountTitle(data?.id, query);
    const config = buildFunctionConfiguration({
      collectionIds: [ collection.id ],
      discountTitle,
      pricingMode,
      marketRows,
      bundlePrice,
      shopCurrencyCode,
    });

    await applyMetafieldChange({
      type: 'updateMetafield',
      namespace: '$app',
      key: 'function-configuration',
      value: JSON.stringify(config),
      valueType: 'json',
    });

    setInitialCollection(collection);
    setInitialMarketRows(marketRows);
    setInitialBundlePrice(bundlePrice);
    setInitialPricingMode(pricingMode);
  }

  const resetForm = () => {
    setCollection(initialCollection);
    setMarketRows(initialMarketRows);
    setBundlePrice(initialBundlePrice);
    setPricingMode(initialPricingMode);
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
    bundlePrice,
    collection,
    ensureProductDiscountClass,
    i18n,
    initialBundlePrice,
    initialCollection,
    initialMarketRows,
    initialPricingMode,
    loading,
    marketRows,
    marketsLoadError,
    onBundlePriceChange,
    onMarketEnabledChange,
    onMarketPriceChange,
    onPricingModeChange,
    onSelectCollection,
    pricingMode,
    removeCollection,
    resetForm,
    shopCurrencyCode,
  };
}

function parseMetafield(value) {
  try {
    const parsed = JSON.parse(value || '{}');
    const collectionId = Array.isArray(parsed.collectionIds) && parsed.collectionIds.length
      ? parsed.collectionIds[ 0 ]
      : parsed.collectionId ?? '';

    const markets = parsed.markets && typeof parsed.markets === 'object' ? parsed.markets : {};
    const pricingMode = inferPricingMode(parsed, markets);

    return {
      collectionId,
      markets,
      bundlePrice: parsed.bundlePrice != null ? String(parsed.bundlePrice) : '',
      pricingMode,
    };
  } catch {
    return {
      collectionId: '',
      markets: {},
      bundlePrice: '',
      pricingMode: PRICING_MODE_SINGLE,
    };
  }
}

function inferPricingMode(parsed, markets) {
  if (parsed?.pricingMode === PRICING_MODE_MARKETS) {
    return PRICING_MODE_MARKETS;
  }

  if (parsed?.pricingMode === PRICING_MODE_SINGLE) {
    return PRICING_MODE_SINGLE;
  }

  if (Object.keys(markets).length > 0) {
    return PRICING_MODE_MARKETS;
  }

  return PRICING_MODE_SINGLE;
}

function buildMarketRows(allMarkets, savedMarkets) {
  const hasSavedMarkets = Object.keys(savedMarkets ?? {}).length > 0;

  return allMarkets.map((market) => {
    const saved = savedMarkets?.[ market.id ];

    return {
      marketId: market.id,
      name: market.name,
      currencyCode: saved?.currencyCode ?? market.currencyCode ?? '',
      enabled: hasSavedMarkets ? saved?.enabled === true : false,
      bundlePrice: saved?.bundlePrice != null ? saved.bundlePrice : '',
    };
  });
}

function serializeMarketsConfig(marketRows) {
  /** @type {Record<string, { enabled: boolean, bundlePrice?: string, currencyCode?: string }>} */
  const markets = {};

  for (const row of marketRows) {
    const entry = { enabled: row.enabled === true };
    if (row.currencyCode) {
      entry.currencyCode = row.currencyCode;
    }
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

function graphQlErrorsMessage(errors) {
  if (!Array.isArray(errors) || !errors.length) {
    return null;
  }

  const messages = errors
    .map((entry) => (typeof entry?.message === 'string' ? entry.message : ''))
    .filter(Boolean);

  return messages.length ? messages.join(' ') : null;
}

function validatePricingConfig({ pricingMode, marketRows, bundlePrice, marketsLoadError }) {
  if (pricingMode === PRICING_MODE_SINGLE) {
    const amount = typeof bundlePrice === 'number'
      ? bundlePrice
      : parseFloat(String(bundlePrice ?? ''));

    if (!Number.isFinite(amount) || amount <= 0) {
      return 'Bundle price must be greater than zero';
    }

    return null;
  }

  if (marketsLoadError) {
    return marketsLoadError;
  }

  if (!marketRows.length) {
    return 'No markets are configured in Shopify';
  }

  return validateMarketRows(marketRows);
}

function buildFunctionConfiguration({ collectionIds, discountTitle, pricingMode, marketRows, bundlePrice, shopCurrencyCode }) {
  const payload = {
    collectionIds,
    itemCount: 2,
    discountTitle,
    pricingMode,
    ...(shopCurrencyCode ? { shopCurrencyCode } : {}),
  };

  if (pricingMode === PRICING_MODE_SINGLE) {
    const amount = typeof bundlePrice === 'number'
      ? bundlePrice
      : parseFloat(String(bundlePrice ?? ''));

    return {
      ...payload,
      bundlePrice: amount.toFixed(2),
    };
  }

  return {
    ...payload,
    markets: serializeMarketsConfig(marketRows),
  };
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

function allMarketsFromResult(result) {
  return (result?.markets ?? []).map((market) => ({
    id: market.id,
    name: market.name,
    currencyCode: market.currencyCode ?? '',
  }));
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
      shop {
        currencyCode
      }
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

  const error = graphQlErrorsMessage(result?.errors);

  return {
    currencyCode: result?.data?.shop?.currencyCode ?? '',
    markets: (result?.data?.markets?.nodes ?? []).map((market) => ({
      id: market.id,
      name: market.name,
      currencyCode: market.currencySettings?.baseCurrency?.currencyCode ?? '',
    })),
    error,
  };
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
