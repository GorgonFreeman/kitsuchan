
import '@shopify/ui-extensions/preact';
import { render } from 'preact';
import { useState, useEffect, useMemo } from 'preact/hooks';

const PRICING_MODE_SINGLE = 'single';
const PRICING_MODE_MARKETS = 'markets';
const DEFAULT_PERCENT_CSV = '75|15,150|20,200|30';

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

function CollectionPicker({ label, collection, i18n, onSelect, onRemove, help }) {
  return (
    <s-stack gap="small">
      <s-text type="strong">{ label }</s-text>
      <s-button onClick={ onSelect }>{ i18n.translate('collectionButtonLabel') }</s-button>
      { collection ? (
        <s-stack direction="inline" alignItems="center" justifyContent="space-between">
          <s-link
            href={ `shopify://admin/collections/${ collection.id.split('/').pop() }` }
            target="_blank"
          >
            { collection.title }
          </s-link>
          <s-button variant="tertiary" onClick={ onRemove }>
            <s-icon type="x-circle" />
          </s-button>
        </s-stack>
      ) : (
        <s-paragraph color="subdued">{ i18n.translate('noCollection') }</s-paragraph>
      ) }
      { help ? <s-paragraph color="subdued">{ help }</s-paragraph> : null }
    </s-stack>
  );
}

function App() {
  const {
    applyExtensionMetafieldChange,
    bundleCollection,
    bundlePrice,
    discountMessage,
    eligibleCollection,
    ensureProductDiscountClass,
    i18n,
    initialBundlePrice,
    initialDiscountMessage,
    initialPricingMode,
    initialSpendSavePercentCsv,
    loading,
    marketRows,
    marketsLoadError,
    onBundlePriceChange,
    onDiscountMessageChange,
    onMarketEnabledChange,
    onMarketPriceChange,
    onPricingModeChange,
    onSelectBundleCollection,
    onSelectEligibleCollection,
    pricingMode,
    removeBundleCollection,
    removeEligibleCollection,
    resetForm,
    shopCurrencyCode,
    spendSavePercentCsv,
    setSpendSavePercentCsv,
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

          <s-heading>{ i18n.translate('bundleHeading') }</s-heading>
          <s-paragraph color="subdued">{ i18n.translate('bundleHelpText') }</s-paragraph>

          <CollectionPicker
            label={ i18n.translate('bundleCollectionLabel') }
            collection={ bundleCollection }
            i18n={ i18n }
            onSelect={ onSelectBundleCollection }
            onRemove={ removeBundleCollection }
          />

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
              : i18n.translate('marketsPriceNote') }
          </s-paragraph>

          <s-heading>{ i18n.translate('spendSaveHeading') }</s-heading>
          <CollectionPicker
            label={ i18n.translate('eligibleCollectionLabel') }
            collection={ eligibleCollection }
            i18n={ i18n }
            onSelect={ onSelectEligibleCollection }
            onRemove={ removeEligibleCollection }
            help={ i18n.translate('eligibleCollectionHelp') }
          />
          <s-text-field
            label={ i18n.translate('spendSavePercentCsvLabel') }
            name="spendSavePercentCsv"
            value={ spendSavePercentCsv }
            defaultValue={ initialSpendSavePercentCsv }
            onChange={(event) => setSpendSavePercentCsv(event.currentTarget.value)}
          />
          <s-paragraph color="subdued">{ i18n.translate('spendSavePercentCsvHelp') }</s-paragraph>
          <s-text-field
            label={ i18n.translate('discountMessageLabel') }
            name="discountMessage"
            value={ discountMessage }
            defaultValue={ initialDiscountMessage }
            onChange={(event) => onDiscountMessageChange(event.currentTarget.value)}
          />
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

  const [ bundleCollection, setBundleCollection ] = useState(null);
  const [ eligibleCollection, setEligibleCollection ] = useState(null);
  const [ initialBundleCollection, setInitialBundleCollection ] = useState(null);
  const [ initialEligibleCollection, setInitialEligibleCollection ] = useState(null);
  const [ marketRows, setMarketRows ] = useState([]);
  const [ initialMarketRows, setInitialMarketRows ] = useState([]);
  const [ bundlePrice, setBundlePrice ] = useState(0);
  const [ initialBundlePrice, setInitialBundlePrice ] = useState(0);
  const [ pricingMode, setPricingMode ] = useState(PRICING_MODE_SINGLE);
  const [ initialPricingMode, setInitialPricingMode ] = useState(PRICING_MODE_SINGLE);
  const [ spendSavePercentCsv, setSpendSavePercentCsv ] = useState(DEFAULT_PERCENT_CSV);
  const [ initialSpendSavePercentCsv, setInitialSpendSavePercentCsv ] = useState(DEFAULT_PERCENT_CSV);
  const [ discountMessage, setDiscountMessage ] = useState('');
  const [ initialDiscountMessage, setInitialDiscountMessage ] = useState('');
  const [ shopCurrencyCode, setShopCurrencyCode ] = useState('');
  const [ marketsLoadError, setMarketsLoadError ] = useState(null);
  const [ loading, setLoading ] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setMarketsLoadError(null);

      const ids = [
        metafieldConfig.bundleCollectionId,
        metafieldConfig.eligibleCollectionId,
      ].filter(Boolean);
      const uniqueIds = [ ...new Set(ids) ];
      const collectionsById = new Map();
      await Promise.all(uniqueIds.map(async (id) => {
        const collection = await getCollection(id, query);
        if (collection) collectionsById.set(id, collection);
      }));

      const [ marketsResult ] = await Promise.all([
        getMarkets(query),
      ]);

      const nextBundle = metafieldConfig.bundleCollectionId
        ? collectionsById.get(metafieldConfig.bundleCollectionId) ?? null
        : null;
      const nextEligible = metafieldConfig.eligibleCollectionId
        ? collectionsById.get(metafieldConfig.eligibleCollectionId) ?? null
        : null;

      setInitialBundleCollection(nextBundle);
      setBundleCollection(nextBundle);
      setInitialEligibleCollection(nextEligible);
      setEligibleCollection(nextEligible);
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
      setSpendSavePercentCsv(metafieldConfig.spendSavePercentCsv);
      setInitialSpendSavePercentCsv(metafieldConfig.spendSavePercentCsv);
      setDiscountMessage(metafieldConfig.discountTitle);
      setInitialDiscountMessage(metafieldConfig.discountTitle);
      setLoading(false);
    };

    load();
  }, [ metafieldConfig, data?.metafields, query ]);

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

  const onDiscountMessageChange = (value) => {
    setDiscountMessage(value);
  };

  async function applyExtensionMetafieldChange() {
    if (!bundleCollection?.id) {
      throw new Error('Bundle collection is required');
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

    if (!parseCsvPreview(spendSavePercentCsv).length) {
      throw new Error('Tiers CSV must include at least one spend|percent pair');
    }

    const titleFromDiscount = await getDiscountTitle(data?.id, query);
    const config = buildFunctionConfiguration({
      bundleCollectionIds: [ bundleCollection.id ],
      eligibleCollectionIds: eligibleCollection?.id ? [ eligibleCollection.id ] : [],
      discountTitle: discountMessage.trim() || titleFromDiscount,
      pricingMode,
      marketRows,
      bundlePrice,
      shopCurrencyCode,
      spendSavePercentCsv: spendSavePercentCsv.trim(),
    });

    await applyMetafieldChange({
      type: 'updateMetafield',
      namespace: '$app',
      key: 'function-configuration',
      value: JSON.stringify(config),
      valueType: 'json',
    });

    setInitialBundleCollection(bundleCollection);
    setInitialEligibleCollection(eligibleCollection);
    setInitialMarketRows(marketRows);
    setInitialBundlePrice(bundlePrice);
    setInitialPricingMode(pricingMode);
    setInitialSpendSavePercentCsv(spendSavePercentCsv);
    setInitialDiscountMessage(discountMessage);
  }

  const resetForm = () => {
    setBundleCollection(initialBundleCollection);
    setEligibleCollection(initialEligibleCollection);
    setMarketRows(initialMarketRows);
    setBundlePrice(initialBundlePrice);
    setPricingMode(initialPricingMode);
    setSpendSavePercentCsv(initialSpendSavePercentCsv);
    setDiscountMessage(initialDiscountMessage);
  };

  const pickCollection = async (current) => {
    const selection = await resourcePicker({
      type: 'collection',
      selectionIds: current ? [ { id: current.id } ] : [],
      action: 'select',
      multiple: false,
      filter: {
        archived: true,
        variants: true,
      },
    });
    return selection?.[ 0 ] ?? null;
  };

  return {
    applyExtensionMetafieldChange,
    bundleCollection,
    bundlePrice,
    discountMessage,
    eligibleCollection,
    ensureProductDiscountClass,
    i18n,
    initialBundlePrice,
    initialDiscountMessage,
    initialPricingMode,
    initialSpendSavePercentCsv,
    loading,
    marketRows,
    marketsLoadError,
    onBundlePriceChange,
    onDiscountMessageChange,
    onMarketEnabledChange,
    onMarketPriceChange,
    onPricingModeChange,
    onSelectBundleCollection: async () => setBundleCollection(await pickCollection(bundleCollection)),
    onSelectEligibleCollection: async () => setEligibleCollection(await pickCollection(eligibleCollection)),
    pricingMode,
    removeBundleCollection: () => setBundleCollection(null),
    removeEligibleCollection: () => setEligibleCollection(null),
    resetForm,
    shopCurrencyCode,
    spendSavePercentCsv,
    setSpendSavePercentCsv,
  };
}

function parseMetafield(value) {
  try {
    const parsed = JSON.parse(value || '{}');
    const bundleCollectionId = Array.isArray(parsed.bundleCollectionIds) && parsed.bundleCollectionIds.length
      ? parsed.bundleCollectionIds[ 0 ]
      : Array.isArray(parsed.collectionIds) && parsed.collectionIds.length
        ? parsed.collectionIds[ 0 ]
        : parsed.collectionId ?? '';
    const eligibleCollectionId = Array.isArray(parsed.eligibleCollectionIds) && parsed.eligibleCollectionIds.length
      ? parsed.eligibleCollectionIds[ 0 ]
      : '';
    const markets = parsed.markets && typeof parsed.markets === 'object' ? parsed.markets : {};

    return {
      bundleCollectionId,
      eligibleCollectionId,
      markets,
      bundlePrice: parsed.bundlePrice != null ? String(parsed.bundlePrice) : '',
      pricingMode: inferPricingMode(parsed, markets),
      spendSavePercentCsv: typeof parsed.spendSavePercentCsv === 'string' && parsed.spendSavePercentCsv.trim()
        ? parsed.spendSavePercentCsv
        : DEFAULT_PERCENT_CSV,
      discountTitle: typeof parsed.discountTitle === 'string' ? parsed.discountTitle : '',
    };
  } catch {
    return {
      bundleCollectionId: '',
      eligibleCollectionId: '',
      markets: {},
      bundlePrice: '',
      pricingMode: PRICING_MODE_SINGLE,
      spendSavePercentCsv: DEFAULT_PERCENT_CSV,
      discountTitle: '',
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

function buildFunctionConfiguration({
  bundleCollectionIds,
  eligibleCollectionIds,
  discountTitle,
  pricingMode,
  marketRows,
  bundlePrice,
  shopCurrencyCode,
  spendSavePercentCsv,
}) {
  const collectionIds = [ ...new Set([
    ...bundleCollectionIds,
    ...eligibleCollectionIds,
  ]) ];

  const payload = {
    collectionIds,
    bundleCollectionIds,
    eligibleCollectionIds,
    itemCount: 2,
    discountTitle,
    pricingMode,
    spendSavePercentCsv,
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

function parseCsvPreview(csv) {
  if (!csv || typeof csv !== 'string') {
    return [];
  }

  const tiers = [];
  for (const part of csv.split(',')) {
    const [ spendRaw, valueRaw ] = part.split('|').map((s) => s.trim());
    const minShopAmount = parseFloat(spendRaw ?? '');
    const value = parseFloat(valueRaw ?? '');
    if (!Number.isFinite(minShopAmount) || minShopAmount < 0) continue;
    if (!Number.isFinite(value) || value <= 0) continue;
    tiers.push({ minShopAmount, value });
  }
  return tiers;
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
    query BundleAwareSpendSaveMarkets($first: Int!) {
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
