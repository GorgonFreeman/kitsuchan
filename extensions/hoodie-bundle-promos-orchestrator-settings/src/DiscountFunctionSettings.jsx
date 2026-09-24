import '@shopify/ui-extensions/preact';
import { render } from 'preact';
import { useState, useEffect, useMemo } from 'preact/hooks';

const PROMO_TYPES = [
  { value: 'none', labelKey: 'promoNone' },
  { value: 'b2g1', labelKey: 'promoB2g1' },
  { value: 'b1g50', labelKey: 'promoB1g50' },
  { value: 'hoodie_sweatpants_50', labelKey: 'promoHoodieSweatpants' },
  { value: 'spend_save_percent', labelKey: 'promoSpendSavePercent' },
  { value: 'spend_save_fixed', labelKey: 'promoSpendSaveFixed' },
];

const DEFAULT_MESSAGES = {
  hoodieBundle: 'Hoodie Bundle 2 for $100',
  b2g1: 'Buy 2 Get 1 Free',
  b1g50: 'Buy 1 Get 1 50% Off',
  hoodieSweatpants50: '50% off sweatpants with hoodie',
  spendSavePercent: 'Spend & Save',
  spendSaveFixed: 'Spend & Save',
};

export default async () => {
  render(<App />, document.body);
};

function App() {
  const {
    applyExtensionMetafieldChange,
    bundlePrice,
    ensureDiscountClasses,
    hoodieCollection,
    i18n,
    initialBundlePrice,
    loading,
    messages,
    onBundlePriceChange,
    onMessageChange,
    onPromoTypeChange,
    onSelectHoodieCollection,
    onSelectSweatpantsCollection,
    promoType,
    removeHoodieCollection,
    removeSweatpantsCollection,
    resetForm,
    shopCurrencyCode,
    sweatpantsCollection,
  } = useExtensionData();

  const [error, setError] = useState();
  const needsSweatpants = promoType === 'hoodie_sweatpants_50';
  const isSpendSave =
    promoType === 'spend_save_percent' || promoType === 'spend_save_fixed';

  useEffect(() => {
    ensureDiscountClasses(isSpendSave).catch(() => {
      setError(i18n.translate('error'));
    });
  }, [ensureDiscountClasses, i18n, isSpendSave]);

  if (loading) {
    return <s-text>{i18n.translate('loading')}</s-text>;
  }

  return (
    <s-function-settings
      onSubmit={(event) => {
        event.waitUntil?.(
          applyExtensionMetafieldChange().catch((err) => {
            setError(err instanceof Error ? err.message : String(err));
          }),
        );
      }}
      onReset={resetForm}
    >
      <s-heading>{i18n.translate('title')}</s-heading>
      <s-section>
        <s-stack gap="base">
          {error ? <s-banner tone="critical">{error}</s-banner> : null}
          <s-paragraph color="subdued">{i18n.translate('helpText')}</s-paragraph>

          {/* Hoodie collection */}
          <s-stack gap="small">
            <s-text type="strong">{i18n.translate('hoodieCollectionLabel')}</s-text>
            <s-button onClick={onSelectHoodieCollection}>
              {i18n.translate('collectionButtonLabel')}
            </s-button>
            {hoodieCollection ? (
              <s-stack direction="inline" alignItems="center" justifyContent="space-between">
                <s-link
                  href={`shopify://admin/collections/${hoodieCollection.id.split('/').pop()}`}
                  target="_blank"
                >
                  {hoodieCollection.title}
                </s-link>
                <s-button variant="tertiary" onClick={removeHoodieCollection}>
                  <s-icon type="x-circle" />
                </s-button>
              </s-stack>
            ) : (
              <s-paragraph color="subdued">{i18n.translate('noCollection')}</s-paragraph>
            )}
          </s-stack>

          {/* Bundle price */}
          <s-number-field
            label={`${i18n.translate('bundlePriceLabel')} (${shopCurrencyCode || '—'})`}
            name="bundlePrice"
            value={String(bundlePrice)}
            defaultValue={String(initialBundlePrice)}
            min={0}
            step={0.01}
            onChange={(event) => onBundlePriceChange(event.currentTarget.value)}
          />
          <s-paragraph color="subdued">{i18n.translate('bundlePriceNote')}</s-paragraph>

          {/* Promo type */}
          <s-select
            label={i18n.translate('promoTypeLabel')}
            name="promoType"
            value={promoType}
            onChange={(event) => onPromoTypeChange(event.currentTarget.value)}
          >
            {PROMO_TYPES.map((opt) => (
              <s-option key={opt.value} value={opt.value}>
                {i18n.translate(opt.labelKey)}
              </s-option>
            ))}
          </s-select>

          {/* Sweatpants collection (when needed) */}
          {needsSweatpants ? (
            <s-stack gap="small">
              <s-text type="strong">{i18n.translate('sweatpantsCollectionLabel')}</s-text>
              <s-paragraph color="subdued">{i18n.translate('sweatpantsNote')}</s-paragraph>
              <s-button onClick={onSelectSweatpantsCollection}>
                {i18n.translate('collectionButtonLabel')}
              </s-button>
              {sweatpantsCollection ? (
                <s-stack direction="inline" alignItems="center" justifyContent="space-between">
                  <s-link
                    href={`shopify://admin/collections/${sweatpantsCollection.id.split('/').pop()}`}
                    target="_blank"
                  >
                    {sweatpantsCollection.title}
                  </s-link>
                  <s-button variant="tertiary" onClick={removeSweatpantsCollection}>
                    <s-icon type="x-circle" />
                  </s-button>
                </s-stack>
              ) : (
                <s-paragraph color="subdued">{i18n.translate('noCollection')}</s-paragraph>
              )}
            </s-stack>
          ) : null}

          {/* Messages */}
          <s-heading>{i18n.translate('messagesHeading')}</s-heading>
          <s-text-field
            label={i18n.translate('msgHoodieBundle')}
            name="msgHoodieBundle"
            value={messages.hoodieBundle}
            onChange={(event) => onMessageChange('hoodieBundle', event.currentTarget.value)}
          />
          {promoType === 'b2g1' ? (
            <s-text-field
              label={i18n.translate('msgB2g1')}
              name="msgB2g1"
              value={messages.b2g1}
              onChange={(event) => onMessageChange('b2g1', event.currentTarget.value)}
            />
          ) : null}
          {promoType === 'b1g50' ? (
            <s-text-field
              label={i18n.translate('msgB1g50')}
              name="msgB1g50"
              value={messages.b1g50}
              onChange={(event) => onMessageChange('b1g50', event.currentTarget.value)}
            />
          ) : null}
          {promoType === 'hoodie_sweatpants_50' ? (
            <s-text-field
              label={i18n.translate('msgHoodieSweatpants')}
              name="msgHoodieSweatpants"
              value={messages.hoodieSweatpants50}
              onChange={(event) =>
                onMessageChange('hoodieSweatpants50', event.currentTarget.value)
              }
            />
          ) : null}
          {promoType === 'spend_save_percent' ? (
            <s-text-field
              label={i18n.translate('msgSpendSavePercent')}
              name="msgSpendSavePercent"
              value={messages.spendSavePercent}
              onChange={(event) =>
                onMessageChange('spendSavePercent', event.currentTarget.value)
              }
            />
          ) : null}
          {promoType === 'spend_save_fixed' ? (
            <s-text-field
              label={i18n.translate('msgSpendSaveFixed')}
              name="msgSpendSaveFixed"
              value={messages.spendSaveFixed}
              onChange={(event) =>
                onMessageChange('spendSaveFixed', event.currentTarget.value)
              }
            />
          ) : null}
        </s-stack>
      </s-section>
    </s-function-settings>
  );
}

function useExtensionData() {
  const { applyMetafieldChange, data, i18n, query, resourcePicker } = shopify;

  const metafieldConfig = useMemo(
    () =>
      parseMetafield(
        data?.metafields?.find((metafield) => metafield.key === 'function-configuration')
          ?.value,
      ),
    [data?.metafields],
  );

  const [hoodieCollection, setHoodieCollection] = useState(null);
  const [initialHoodieCollection, setInitialHoodieCollection] = useState(null);
  const [sweatpantsCollection, setSweatpantsCollection] = useState(null);
  const [initialSweatpantsCollection, setInitialSweatpantsCollection] = useState(null);
  const [bundlePrice, setBundlePrice] = useState(100);
  const [initialBundlePrice, setInitialBundlePrice] = useState(100);
  const [promoType, setPromoType] = useState('none');
  const [initialPromoType, setInitialPromoType] = useState('none');
  const [messages, setMessages] = useState({ ...DEFAULT_MESSAGES });
  const [initialMessages, setInitialMessages] = useState({ ...DEFAULT_MESSAGES });
  const [shopCurrencyCode, setShopCurrencyCode] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);

      const [hoodie, sweatpants, shop] = await Promise.all([
        metafieldConfig.hoodieCollectionId
          ? getCollection(metafieldConfig.hoodieCollectionId, query)
          : Promise.resolve(null),
        metafieldConfig.sweatpantsCollectionId
          ? getCollection(metafieldConfig.sweatpantsCollectionId, query)
          : Promise.resolve(null),
        getShopCurrency(query),
      ]);

      setHoodieCollection(hoodie);
      setInitialHoodieCollection(hoodie);
      setSweatpantsCollection(sweatpants);
      setInitialSweatpantsCollection(sweatpants);
      setShopCurrencyCode(shop);

      const price = Number(metafieldConfig.hoodieBundlePrice) || 100;
      setBundlePrice(price);
      setInitialBundlePrice(price);

      setPromoType(metafieldConfig.promoType);
      setInitialPromoType(metafieldConfig.promoType);

      setMessages(metafieldConfig.messages);
      setInitialMessages(metafieldConfig.messages);

      setLoading(false);
    };

    load();
  }, [
    metafieldConfig.hoodieCollectionId,
    metafieldConfig.sweatpantsCollectionId,
    metafieldConfig.hoodieBundlePrice,
    metafieldConfig.promoType,
    data?.metafields,
    query,
  ]);

  const ensureDiscountClasses = async (includeOrder) => {
    const wanted = includeOrder ? ['product', 'order'] : ['product'];
    const current = shopify.discounts?.discountClasses?.value ?? [];
    const needsUpdate =
      wanted.some((c) => !current.includes(c)) ||
      (!includeOrder && current.includes('order') && current.length > 1);

    // Always ensure product is present; add order for spend & save.
    const next = includeOrder
      ? Array.from(new Set([...current.filter((c) => c === 'product' || c === 'order'), 'product', 'order']))
      : Array.from(new Set([...current.filter((c) => c === 'product'), 'product']));

    if (next.length === current.length && next.every((c) => current.includes(c))) {
      return;
    }

    const result = await shopify.discounts?.updateDiscountClasses?.(next);
    if (!result?.success) {
      throw new Error('Unable to update discount classes');
    }
  };

  async function applyExtensionMetafieldChange() {
    if (!hoodieCollection?.id) {
      throw new Error('Hoodie collection is required');
    }

    const amount =
      typeof bundlePrice === 'number' ? bundlePrice : parseFloat(String(bundlePrice ?? ''));
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('Bundle price must be greater than zero');
    }

    if (promoType === 'hoodie_sweatpants_50' && !sweatpantsCollection?.id) {
      throw new Error('Sweatpants collection is required for this promo');
    }

    const config = {
      hoodieCollectionIds: [hoodieCollection.id],
      sweatpantsCollectionIds: sweatpantsCollection?.id ? [sweatpantsCollection.id] : [],
      hoodieBundlePrice: amount,
      promoType,
      messages: {
        hoodieBundle: messages.hoodieBundle || DEFAULT_MESSAGES.hoodieBundle,
        b2g1: messages.b2g1 || DEFAULT_MESSAGES.b2g1,
        b1g50: messages.b1g50 || DEFAULT_MESSAGES.b1g50,
        hoodieSweatpants50:
          messages.hoodieSweatpants50 || DEFAULT_MESSAGES.hoodieSweatpants50,
        spendSavePercent: messages.spendSavePercent || DEFAULT_MESSAGES.spendSavePercent,
        spendSaveFixed: messages.spendSaveFixed || DEFAULT_MESSAGES.spendSaveFixed,
      },
      ...(shopCurrencyCode ? { shopCurrencyCode } : {}),
    };

    await applyMetafieldChange({
      type: 'updateMetafield',
      namespace: '$app',
      key: 'function-configuration',
      value: JSON.stringify(config),
      valueType: 'json',
    });

    setInitialHoodieCollection(hoodieCollection);
    setInitialSweatpantsCollection(sweatpantsCollection);
    setInitialBundlePrice(bundlePrice);
    setInitialPromoType(promoType);
    setInitialMessages({ ...messages });
  }

  const resetForm = () => {
    setHoodieCollection(initialHoodieCollection);
    setSweatpantsCollection(initialSweatpantsCollection);
    setBundlePrice(initialBundlePrice);
    setPromoType(initialPromoType);
    setMessages({ ...initialMessages });
  };

  const pickCollection = async (current) => {
    const selection = await resourcePicker({
      type: 'collection',
      selectionIds: current ? [{ id: current.id }] : [],
      action: 'select',
      multiple: false,
      filter: {
        archived: true,
        variants: true,
      },
    });
    return selection?.[0] ?? null;
  };

  return {
    applyExtensionMetafieldChange,
    bundlePrice,
    ensureDiscountClasses,
    hoodieCollection,
    i18n,
    initialBundlePrice,
    loading,
    messages,
    onBundlePriceChange: (value) => setBundlePrice(Number(value)),
    onMessageChange: (key, value) =>
      setMessages((prev) => ({ ...prev, [key]: value })),
    onPromoTypeChange: (value) => setPromoType(value || 'none'),
    onSelectHoodieCollection: async () => {
      setHoodieCollection(await pickCollection(hoodieCollection));
    },
    onSelectSweatpantsCollection: async () => {
      setSweatpantsCollection(await pickCollection(sweatpantsCollection));
    },
    promoType,
    removeHoodieCollection: () => setHoodieCollection(null),
    removeSweatpantsCollection: () => setSweatpantsCollection(null),
    resetForm,
    shopCurrencyCode,
    sweatpantsCollection,
  };
}

function parseMetafield(value) {
  try {
    const parsed = JSON.parse(value || '{}');
    const hoodieCollectionId = Array.isArray(parsed.hoodieCollectionIds) &&
      parsed.hoodieCollectionIds.length
      ? parsed.hoodieCollectionIds[0]
      : parsed.collectionId ??
        (Array.isArray(parsed.collectionIds) ? parsed.collectionIds[0] : '') ??
        '';

    const sweatpantsCollectionId = Array.isArray(parsed.sweatpantsCollectionIds) &&
      parsed.sweatpantsCollectionIds.length
      ? parsed.sweatpantsCollectionIds[0]
      : '';

    const promoType = typeof parsed.promoType === 'string' ? parsed.promoType : 'none';

    const nested =
      parsed.messages && typeof parsed.messages === 'object' ? parsed.messages : {};
    const messages = {
      hoodieBundle:
        nested.hoodieBundle ||
        parsed.hoodieBundleTitle ||
        DEFAULT_MESSAGES.hoodieBundle,
      b2g1: nested.b2g1 || parsed.discountTitle || DEFAULT_MESSAGES.b2g1,
      b1g50: nested.b1g50 || DEFAULT_MESSAGES.b1g50,
      hoodieSweatpants50: nested.hoodieSweatpants50 || DEFAULT_MESSAGES.hoodieSweatpants50,
      spendSavePercent: nested.spendSavePercent || DEFAULT_MESSAGES.spendSavePercent,
      spendSaveFixed: nested.spendSaveFixed || DEFAULT_MESSAGES.spendSaveFixed,
    };

    return {
      hoodieCollectionId,
      sweatpantsCollectionId,
      hoodieBundlePrice: parsed.hoodieBundlePrice ?? parsed.bundlePrice ?? 100,
      promoType,
      messages,
    };
  } catch {
    return {
      hoodieCollectionId: '',
      sweatpantsCollectionId: '',
      hoodieBundlePrice: 100,
      promoType: 'none',
      messages: { ...DEFAULT_MESSAGES },
    };
  }
}

async function getShopCurrency(adminApiQuery) {
  const gql = `#graphql
    query HoodiePromoShopCurrency {
      shop {
        currencyCode
      }
    }
  `;
  const result = await adminApiQuery(gql);
  return result?.data?.shop?.currencyCode ?? '';
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
  const result = await adminApiQuery(gql, { variables: { id: collectionGid } });
  return result?.data?.collection ?? null;
}
