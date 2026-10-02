import '@shopify/ui-extensions/preact';
import { render } from 'preact';
import { useState, useEffect, useMemo } from 'preact/hooks';

const DEFAULT_PERCENT = 50;
const DEFAULT_PAID_COUNT = 1;
const DEFAULT_MESSAGE = 'Buy X Get Y% Off';

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
    discountMessage,
    eligibleCollection,
    ensureProductDiscountClass,
    i18n,
    initialDiscountMessage,
    initialPaidCount,
    initialPercent,
    loading,
    onDiscountMessageChange,
    onPaidCountChange,
    onPercentChange,
    onSelectBundleCollection,
    onSelectEligibleCollection,
    onSelectQualifyCollection,
    paidCount,
    percent,
    qualifyCollection,
    removeBundleCollection,
    removeEligibleCollection,
    removeQualifyCollection,
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

          <s-heading>{ i18n.translate('bundleHeading') }</s-heading>
          <s-paragraph color="subdued">{ i18n.translate('bundleHelpText') }</s-paragraph>
          <CollectionPicker
            label={ i18n.translate('bundleCollectionLabel') }
            collection={ bundleCollection }
            i18n={ i18n }
            onSelect={ onSelectBundleCollection }
            onRemove={ removeBundleCollection }
          />

          <s-heading>{ i18n.translate('promoHeading') }</s-heading>
          <s-number-field
            label={ i18n.translate('paidCountLabel') }
            name="paidCount"
            value={ String(paidCount) }
            defaultValue={ String(initialPaidCount) }
            min={ 1 }
            step={ 1 }
            onChange={(event) => onPaidCountChange(event.currentTarget.value)}
          />
          <s-paragraph color="subdued">{ i18n.translate('paidCountHelp') }</s-paragraph>
          <CollectionPicker
            label={ i18n.translate('qualifyCollectionLabel') }
            collection={ qualifyCollection }
            i18n={ i18n }
            onSelect={ onSelectQualifyCollection }
            onRemove={ removeQualifyCollection }
            help={ i18n.translate('qualifyCollectionHelp') }
          />
          <CollectionPicker
            label={ i18n.translate('eligibleCollectionLabel') }
            collection={ eligibleCollection }
            i18n={ i18n }
            onSelect={ onSelectEligibleCollection }
            onRemove={ removeEligibleCollection }
            help={ i18n.translate('eligibleCollectionHelp') }
          />
          <s-number-field
            label={ i18n.translate('percentLabel') }
            name="percent"
            value={ String(percent) }
            defaultValue={ String(initialPercent) }
            min={ 1 }
            max={ 100 }
            step={ 1 }
            onChange={(event) => onPercentChange(event.currentTarget.value)}
          />
          <s-paragraph color="subdued">{ i18n.translate('percentHelp') }</s-paragraph>
          <s-text-field
            label={ i18n.translate('discountMessageLabel') }
            name="discountMessage"
            value={ discountMessage }
            defaultValue={ initialDiscountMessage }
            onChange={(event) => onDiscountMessageChange(event.currentTarget.value)}
          />
          <s-paragraph color="subdued">{ i18n.translate('discountMessageHelp') }</s-paragraph>
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
  const [ qualifyCollection, setQualifyCollection ] = useState(null);
  const [ eligibleCollection, setEligibleCollection ] = useState(null);
  const [ initialBundleCollection, setInitialBundleCollection ] = useState(null);
  const [ initialQualifyCollection, setInitialQualifyCollection ] = useState(null);
  const [ initialEligibleCollection, setInitialEligibleCollection ] = useState(null);
  const [ paidCount, setPaidCount ] = useState(DEFAULT_PAID_COUNT);
  const [ initialPaidCount, setInitialPaidCount ] = useState(DEFAULT_PAID_COUNT);
  const [ percent, setPercent ] = useState(DEFAULT_PERCENT);
  const [ initialPercent, setInitialPercent ] = useState(DEFAULT_PERCENT);
  const [ discountMessage, setDiscountMessage ] = useState(DEFAULT_MESSAGE);
  const [ initialDiscountMessage, setInitialDiscountMessage ] = useState(DEFAULT_MESSAGE);
  const [ loading, setLoading ] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);

      const ids = [
        metafieldConfig.bundleCollectionId,
        metafieldConfig.qualifyCollectionId,
        metafieldConfig.eligibleCollectionId,
      ].filter(Boolean);
      const uniqueIds = [ ...new Set(ids) ];
      const collectionsById = new Map();
      await Promise.all(uniqueIds.map(async (id) => {
        const collection = await getCollection(id, query);
        if (collection) collectionsById.set(id, collection);
      }));

      const nextBundle = metafieldConfig.bundleCollectionId
        ? collectionsById.get(metafieldConfig.bundleCollectionId) ?? null
        : null;
      const nextQualify = metafieldConfig.qualifyCollectionId
        ? collectionsById.get(metafieldConfig.qualifyCollectionId) ?? null
        : null;
      const nextEligible = metafieldConfig.eligibleCollectionId
        ? collectionsById.get(metafieldConfig.eligibleCollectionId) ?? null
        : null;

      setInitialBundleCollection(nextBundle);
      setBundleCollection(nextBundle);
      setInitialQualifyCollection(nextQualify);
      setQualifyCollection(nextQualify);
      setInitialEligibleCollection(nextEligible);
      setEligibleCollection(nextEligible);
      setPaidCount(metafieldConfig.paidCount);
      setInitialPaidCount(metafieldConfig.paidCount);
      setPercent(metafieldConfig.percent);
      setInitialPercent(metafieldConfig.percent);
      setDiscountMessage(metafieldConfig.discountTitle || DEFAULT_MESSAGE);
      setInitialDiscountMessage(metafieldConfig.discountTitle || DEFAULT_MESSAGE);
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

  const onPaidCountChange = (value) => {
    const next = Number(value);
    setPaidCount(Number.isFinite(next) && next >= 1 ? Math.floor(next) : DEFAULT_PAID_COUNT);
  };

  const onPercentChange = (value) => {
    const next = Number(value);
    setPercent(Number.isFinite(next) ? next : DEFAULT_PERCENT);
  };

  const onDiscountMessageChange = (value) => {
    setDiscountMessage(value);
  };

  const pickCollection = async () => {
    const selected = await resourcePicker({ type: 'collection', multiple: false });
    if (!selected || !selected.length) return null;
    const [ collection ] = selected;
    return { id: collection.id, title: collection.title };
  };

  const onSelectBundleCollection = async () => {
    const collection = await pickCollection();
    if (collection) setBundleCollection(collection);
  };

  const onSelectQualifyCollection = async () => {
    const collection = await pickCollection();
    if (collection) setQualifyCollection(collection);
  };

  const onSelectEligibleCollection = async () => {
    const collection = await pickCollection();
    if (collection) setEligibleCollection(collection);
  };

  const removeBundleCollection = () => setBundleCollection(null);
  const removeQualifyCollection = () => setQualifyCollection(null);
  const removeEligibleCollection = () => setEligibleCollection(null);

  const applyExtensionMetafieldChange = async () => {
    if (!bundleCollection?.id) {
      throw new Error('Bundle collection is required');
    }

    const paid = Number(paidCount);
    if (!Number.isFinite(paid) || paid < 1) {
      throw new Error('Paid count X must be at least 1');
    }

    const pct = Number(percent);
    if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
      throw new Error('Percent must be between 1 and 100');
    }

    const titleFromDiscount = data?.discount?.title || DEFAULT_MESSAGE;
    const collectionIds = [ ...new Set([
      bundleCollection.id,
      ...(qualifyCollection?.id ? [ qualifyCollection.id ] : []),
      ...(eligibleCollection?.id ? [ eligibleCollection.id ] : []),
    ].filter(Boolean)) ];

    const value = {
      collectionIds,
      bundleCollectionIds: [ bundleCollection.id ],
      qualifyCollectionIds: qualifyCollection?.id ? [ qualifyCollection.id ] : [],
      eligibleCollectionIds: eligibleCollection?.id ? [ eligibleCollection.id ] : [],
      itemCount: 2,
      paidCount: Math.floor(paid),
      percent: Math.floor(pct),
      discountTitle: discountMessage.trim() || titleFromDiscount,
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
    setInitialQualifyCollection(qualifyCollection);
    setInitialEligibleCollection(eligibleCollection);
    setInitialPaidCount(Math.floor(paid));
    setInitialPercent(Math.floor(pct));
    setInitialDiscountMessage(discountMessage.trim() || titleFromDiscount);
  };

  const resetForm = () => {
    setBundleCollection(initialBundleCollection);
    setQualifyCollection(initialQualifyCollection);
    setEligibleCollection(initialEligibleCollection);
    setPaidCount(initialPaidCount);
    setPercent(initialPercent);
    setDiscountMessage(initialDiscountMessage);
  };

  return {
    applyExtensionMetafieldChange,
    bundleCollection,
    discountMessage,
    eligibleCollection,
    ensureProductDiscountClass,
    i18n,
    initialDiscountMessage,
    initialPaidCount,
    initialPercent,
    loading,
    onDiscountMessageChange,
    onPaidCountChange,
    onPercentChange,
    onSelectBundleCollection,
    onSelectEligibleCollection,
    onSelectQualifyCollection,
    paidCount,
    percent,
    qualifyCollection,
    removeBundleCollection,
    removeEligibleCollection,
    removeQualifyCollection,
    resetForm,
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

    const paidRaw = Number(parsed.paidCount ?? DEFAULT_PAID_COUNT);
    const paidCount = Number.isFinite(paidRaw) && paidRaw >= 1
      ? Math.floor(paidRaw)
      : DEFAULT_PAID_COUNT;

    const percentRaw = Number(parsed.percent ?? DEFAULT_PERCENT);
    const percent = Number.isFinite(percentRaw) && percentRaw > 0
      ? Math.min(100, percentRaw)
      : DEFAULT_PERCENT;

    return {
      bundleCollectionId: firstId([ 'bundleCollectionIds', 'hoodieCollectionIds', 'collectionId' ]),
      qualifyCollectionId: firstId([ 'qualifyCollectionIds' ]),
      eligibleCollectionId: firstId([ 'eligibleCollectionIds' ]),
      paidCount,
      percent,
      discountTitle: typeof parsed.discountTitle === 'string' ? parsed.discountTitle : DEFAULT_MESSAGE,
    };
  } catch {
    return emptyConfig();
  }
}

function emptyConfig() {
  return {
    bundleCollectionId: null,
    qualifyCollectionId: null,
    eligibleCollectionId: null,
    paidCount: DEFAULT_PAID_COUNT,
    percent: DEFAULT_PERCENT,
    discountTitle: DEFAULT_MESSAGE,
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
