
import '@shopify/ui-extensions/preact';
import { render } from 'preact';
import { useState, useEffect, useMemo } from 'preact/hooks';

export default async () => {
  render(<App />, document.body);
};

function App() {
  const {
    applyExtensionMetafieldChange,
    bundlePrice,
    collection,
    ensureProductDiscountClass,
    i18n,
    initialBundlePrice,
    initialCollection,
    loading,
    onBundlePriceChange,
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
        event.waitUntil?.(applyExtensionMetafieldChange());
      }}
      onReset={resetForm}
    >
      <s-heading>{ i18n.translate('title') }</s-heading>
      <s-section>
        <s-stack gap="base">
          { error ? <s-banner tone="critical">{ error }</s-banner> : null }
          <s-paragraph color="subdued">{ i18n.translate('helpText') }</s-paragraph>
          <s-number-field
            label={ i18n.translate('bundlePriceLabel') }
            name="bundlePrice"
            value={ String(bundlePrice) }
            defaultValue={ String(initialBundlePrice) }
            min={ 0 }
            step={ 0.01 }
            onChange={(event) => onBundlePriceChange(event.currentTarget.value)}
          />
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

  const [ bundlePrice, setBundlePrice ] = useState(metafieldConfig.bundlePrice);
  const [ initialBundlePrice, setInitialBundlePrice ] = useState(metafieldConfig.bundlePrice);
  const [ collection, setCollection ] = useState(null);
  const [ initialCollection, setInitialCollection ] = useState(null);
  const [ loading, setLoading ] = useState(false);

  useEffect(() => {
    const fetchCollection = async () => {
      if (!metafieldConfig.collectionId) {
        setCollection(null);
        setInitialCollection(null);
        return;
      }

      setLoading(true);
      const selectedCollection = await getCollection(metafieldConfig.collectionId, query);
      setInitialCollection(selectedCollection);
      setCollection(selectedCollection);
      setLoading(false);
    };

    fetchCollection();
  }, [ metafieldConfig.collectionId, query ]);

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

  const onBundlePriceChange = (value) => {
    setBundlePrice(Number(value));
  };

  async function applyExtensionMetafieldChange() {
    if (!collection?.id) {
      throw new Error('Collection is required');
    }

    if (!Number.isFinite(bundlePrice) || bundlePrice <= 0) {
      throw new Error('Bundle price must be greater than zero');
    }

    await applyMetafieldChange({
      type: 'updateMetafield',
      namespace: '$app',
      key: 'function-configuration',
      value: JSON.stringify({
        collectionIds: [ collection.id ],
        itemCount: 2,
        bundlePrice: bundlePrice.toFixed(2),
      }),
      valueType: 'json',
    });

    setInitialBundlePrice(bundlePrice);
    setInitialCollection(collection);
  }

  const resetForm = () => {
    setBundlePrice(initialBundlePrice);
    setCollection(initialCollection);
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
    loading,
    onBundlePriceChange,
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
      bundlePrice: Number(parsed.bundlePrice ?? 0),
      collectionId,
    };
  } catch {
    return {
      bundlePrice: 0,
      collectionId: '',
    };
  }
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
