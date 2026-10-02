import '@shopify/ui-extensions/preact';
import { render } from 'preact';
import { useState, useEffect, useMemo } from 'preact/hooks';

const REDEMPTIONS_ONE = 'one';
const REDEMPTIONS_MULTIPLE = 'multiple';
const DEFAULT_LINE_PROPERTY = '_free_gift_hoodie';
const DEFAULT_MIN_SPEND = 75;
const DEFAULT_MESSAGE = 'Free gift';

export default async () => {
  render(<App />, document.body);
};

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
    discountTitle,
    ensureProductDiscountClass,
    i18n,
    initialBundlePrice,
    initialDiscountTitle,
    initialLineProperty,
    initialMinSpend,
    initialRedemptions,
    lineProperty,
    loading,
    minSpend,
    onBundlePriceChange,
    onDiscountTitleChange,
    onLinePropertyChange,
    onMinSpendChange,
    onRedemptionsChange,
    onSelectBundleCollection,
    redemptions,
    removeBundleCollection,
    resetForm,
    shopCurrencyCode,
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

          <s-heading>{ i18n.translate('bundleHeading') }</s-heading>
          <s-paragraph color="subdued">{ i18n.translate('bundleHelpText') }</s-paragraph>
          <CollectionPicker
            label={ i18n.translate('bundleCollectionLabel') }
            collection={ bundleCollection }
            i18n={ i18n }
            onSelect={ onSelectBundleCollection }
            onRemove={ removeBundleCollection }
          />
          <s-number-field
            label={ `${ i18n.translate('bundlePriceLabel') } (${ shopCurrencyCode || '—' })` }
            name="bundlePrice"
            value={ String(bundlePrice) }
            defaultValue={ String(initialBundlePrice) }
            min={ 0 }
            step={ 0.01 }
            onChange={(event) => onBundlePriceChange(event.currentTarget.value)}
          />
          <s-paragraph color="subdued">{ i18n.translate('bundlePriceNote') }</s-paragraph>

          <s-heading>{ i18n.translate('giftHeading') }</s-heading>
          <s-text-field
            label={ i18n.translate('linePropertyLabel') }
            name="lineProperty"
            value={ lineProperty }
            defaultValue={ initialLineProperty }
            onChange={(event) => onLinePropertyChange(event.currentTarget.value)}
          />
          <s-number-field
            label={ `${ i18n.translate('minSpendLabel') } (${ shopCurrencyCode || '—' })` }
            name="minSpend"
            value={ String(minSpend) }
            defaultValue={ String(initialMinSpend) }
            min={ 0 }
            step={ 0.01 }
            onChange={(event) => onMinSpendChange(event.currentTarget.value)}
          />
          <s-paragraph color="subdued">{ i18n.translate('minSpendHelp') }</s-paragraph>
          <s-text-field
            label={ i18n.translate('discountMessageLabel') }
            name="discountTitle"
            value={ discountTitle }
            defaultValue={ initialDiscountTitle }
            onChange={(event) => onDiscountTitleChange(event.currentTarget.value)}
          />
          <s-paragraph color="subdued">{ i18n.translate('discountMessageHelp') }</s-paragraph>
          <s-select
            label={ i18n.translate('redemptionsLabel') }
            name="redemptions"
            value={ redemptions }
            onChange={(event) => onRedemptionsChange(event.currentTarget.value)}
          >
            <s-option value={ REDEMPTIONS_ONE }>{ i18n.translate('redemptionsOne') }</s-option>
            <s-option value={ REDEMPTIONS_MULTIPLE }>{ i18n.translate('redemptionsMultiple') }</s-option>
          </s-select>
          <s-paragraph color="subdued">
            { redemptions === REDEMPTIONS_MULTIPLE
              ? i18n.translate('redemptionsMultipleNote')
              : i18n.translate('redemptionsOneNote') }
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

  const [ bundleCollection, setBundleCollection ] = useState(null);
  const [ initialBundleCollection, setInitialBundleCollection ] = useState(null);
  const [ bundlePrice, setBundlePrice ] = useState(100);
  const [ initialBundlePrice, setInitialBundlePrice ] = useState(100);
  const [ lineProperty, setLineProperty ] = useState(DEFAULT_LINE_PROPERTY);
  const [ initialLineProperty, setInitialLineProperty ] = useState(DEFAULT_LINE_PROPERTY);
  const [ minSpend, setMinSpend ] = useState(DEFAULT_MIN_SPEND);
  const [ initialMinSpend, setInitialMinSpend ] = useState(DEFAULT_MIN_SPEND);
  const [ discountTitle, setDiscountTitle ] = useState(DEFAULT_MESSAGE);
  const [ initialDiscountTitle, setInitialDiscountTitle ] = useState(DEFAULT_MESSAGE);
  const [ redemptions, setRedemptions ] = useState(REDEMPTIONS_ONE);
  const [ initialRedemptions, setInitialRedemptions ] = useState(REDEMPTIONS_ONE);
  const [ shopCurrencyCode, setShopCurrencyCode ] = useState('');
  const [ loading, setLoading ] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      let nextBundle = null;
      if (metafieldConfig.bundleCollectionId) {
        nextBundle = await getCollection(metafieldConfig.bundleCollectionId, query);
      }
      const currencyCode = await getShopCurrencyCode(query);

      setInitialBundleCollection(nextBundle);
      setBundleCollection(nextBundle);
      setBundlePrice(metafieldConfig.bundlePrice);
      setInitialBundlePrice(metafieldConfig.bundlePrice);
      setLineProperty(metafieldConfig.lineProperty);
      setInitialLineProperty(metafieldConfig.lineProperty);
      setMinSpend(metafieldConfig.minSpend);
      setInitialMinSpend(metafieldConfig.minSpend);
      setDiscountTitle(metafieldConfig.discountTitle);
      setInitialDiscountTitle(metafieldConfig.discountTitle);
      setRedemptions(metafieldConfig.redemptions);
      setInitialRedemptions(metafieldConfig.redemptions);
      setShopCurrencyCode(currencyCode);
      setLoading(false);
    };

    load();
  }, [ metafieldConfig, query ]);

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

  const onSelectBundleCollection = async () => {
    const selected = await resourcePicker({ type: 'collection', multiple: false });
    if (!selected || !selected.length) return;
    const [ collection ] = selected;
    setBundleCollection({ id: collection.id, title: collection.title });
  };

  const removeBundleCollection = () => setBundleCollection(null);
  const onBundlePriceChange = (value) => setBundlePrice(Number(value));
  const onLinePropertyChange = (value) => setLineProperty(value);
  const onMinSpendChange = (value) => setMinSpend(Number(value));
  const onDiscountTitleChange = (value) => setDiscountTitle(value);
  const onRedemptionsChange = (value) => {
    setRedemptions(value === REDEMPTIONS_MULTIPLE ? REDEMPTIONS_MULTIPLE : REDEMPTIONS_ONE);
  };

  const applyExtensionMetafieldChange = async () => {
    if (!bundleCollection?.id) {
      throw new Error('Bundle collection is required');
    }

    const trimmedLineProperty = lineProperty.trim();
    if (!trimmedLineProperty) {
      throw new Error(i18n.translate('linePropertyRequired'));
    }

    const spendAmount = Number(minSpend);
    if (!Number.isFinite(spendAmount) || spendAmount < 0) {
      throw new Error(i18n.translate('minSpendInvalid'));
    }

    const priceAmount = Number(bundlePrice);
    if (!Number.isFinite(priceAmount) || priceAmount <= 0) {
      throw new Error('Bundle price must be greater than zero');
    }

    const titleFromDiscount = data?.discount?.title || DEFAULT_MESSAGE;
    const value = {
      collectionIds: [ bundleCollection.id ],
      bundleCollectionIds: [ bundleCollection.id ],
      itemCount: 2,
      pricingMode: 'single',
      shopCurrencyCode: shopCurrencyCode || '',
      bundlePrice: priceAmount.toFixed(2),
      lineProperty: trimmedLineProperty,
      minSpend: spendAmount.toFixed(2),
      discountTitle: discountTitle.trim() || titleFromDiscount,
      redemptions: redemptions === REDEMPTIONS_MULTIPLE
        ? REDEMPTIONS_MULTIPLE
        : REDEMPTIONS_ONE,
    };

    const result = await applyMetafieldChange({
      type: 'updateMetafield',
      namespace: '$app',
      key: 'function-configuration',
      value: JSON.stringify(value),
      valueType: 'json',
    });

    if (result?.type === 'error') {
      throw new Error(result.message || 'Unable to save settings');
    }

    setInitialBundleCollection(bundleCollection);
    setInitialBundlePrice(priceAmount);
    setInitialLineProperty(value.lineProperty);
    setInitialMinSpend(spendAmount);
    setInitialDiscountTitle(value.discountTitle);
    setInitialRedemptions(value.redemptions);
  };

  const resetForm = () => {
    setBundleCollection(initialBundleCollection);
    setBundlePrice(initialBundlePrice);
    setLineProperty(initialLineProperty);
    setMinSpend(initialMinSpend);
    setDiscountTitle(initialDiscountTitle);
    setRedemptions(initialRedemptions);
  };

  return {
    applyExtensionMetafieldChange,
    bundleCollection,
    bundlePrice,
    discountTitle,
    ensureProductDiscountClass,
    i18n,
    initialBundlePrice,
    initialDiscountTitle,
    initialLineProperty,
    initialMinSpend,
    initialRedemptions,
    lineProperty,
    loading,
    minSpend,
    onBundlePriceChange,
    onDiscountTitleChange,
    onLinePropertyChange,
    onMinSpendChange,
    onRedemptionsChange,
    onSelectBundleCollection,
    redemptions,
    removeBundleCollection,
    resetForm,
    shopCurrencyCode,
  };
}

function parseMetafield(value) {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (!parsed || typeof parsed !== 'object') {
      return emptyConfig();
    }

    const firstId = (keys) => {
      for (const key of keys) {
        const raw = parsed[ key ];
        if (Array.isArray(raw) && typeof raw[ 0 ] === 'string') return raw[ 0 ];
        if (typeof raw === 'string' && raw) return raw;
      }
      return null;
    };

    const bundlePrice = Number(parsed.bundlePrice ?? 100);
    const minSpend = Number(parsed.minSpend ?? DEFAULT_MIN_SPEND);

    return {
      bundleCollectionId: firstId([ 'bundleCollectionIds', 'hoodieCollectionIds', 'collectionId' ]),
      bundlePrice: Number.isFinite(bundlePrice) && bundlePrice > 0 ? bundlePrice : 100,
      lineProperty: typeof parsed.lineProperty === 'string' && parsed.lineProperty.trim()
        ? parsed.lineProperty.trim()
        : DEFAULT_LINE_PROPERTY,
      minSpend: Number.isFinite(minSpend) && minSpend >= 0 ? minSpend : DEFAULT_MIN_SPEND,
      discountTitle: typeof parsed.discountTitle === 'string' && parsed.discountTitle.trim()
        ? parsed.discountTitle.trim()
        : DEFAULT_MESSAGE,
      redemptions: parsed.redemptions === REDEMPTIONS_MULTIPLE
        ? REDEMPTIONS_MULTIPLE
        : REDEMPTIONS_ONE,
    };
  } catch {
    return emptyConfig();
  }
}

function emptyConfig() {
  return {
    bundleCollectionId: null,
    bundlePrice: 100,
    lineProperty: DEFAULT_LINE_PROPERTY,
    minSpend: DEFAULT_MIN_SPEND,
    discountTitle: DEFAULT_MESSAGE,
    redemptions: REDEMPTIONS_ONE,
  };
}

async function getCollection(id, query) {
  try {
    const result = await query(`#graphql
      query Collection($id: ID!) {
        collection(id: $id) {
          id
          title
        }
      }
    `, { variables: { id } });
    return result?.data?.collection ?? null;
  } catch {
    return null;
  }
}

async function getShopCurrencyCode(query) {
  try {
    const result = await query(`#graphql
      query ShopCurrency {
        shop {
          currencyCode
        }
      }
    `);
    return result?.data?.shop?.currencyCode ?? '';
  } catch {
    return '';
  }
}
