import '@shopify/ui-extensions/preact';
import { render } from 'preact';
import { useState, useEffect, useMemo } from 'preact/hooks';

const PROMO_OF_THE_DAY = [
  { value: 'none', labelKey: 'promoNone' },
  { value: 'spend_save_percent', labelKey: 'promoSpendSavePercent' },
  { value: 'spend_save_fixed', labelKey: 'promoSpendSaveFixed' },
  { value: 'b2g1', labelKey: 'promoB2g1' },
  { value: 'b1g50', labelKey: 'promoB1g50' },
  { value: 'b1hg50_sw', labelKey: 'promoB1hg50Sw' },
];

const DEFAULT_MESSAGES = {
  hoodieBundle: 'Hoodie Bundle 2 for $100',
  b2g1: 'Buy 2 Get 1 Free',
  b1g50: 'Buy 1 Get 1 50% Off',
  b1hg50Sw: '50% off sweatpants with hoodie',
  spendSavePercent: 'Spend & Save',
  spendSaveFixed: 'Spend & Save',
};

const DEFAULT_PERCENT_CSV = '75|20,150|25,200|30';
const DEFAULT_FIXED_CSV = '75|1500,150|4000,200|6000';

export default async () => {
  render(<App />, document.body);
};

function App() {
  const data = useExtensionData();
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
    onPercentChange,
    onPromoOfTheDayChange,
    onCsvChange,
    onSelectCollection,
    onRemoveCollection,
    promoOfTheDay,
    slots,
    resetForm,
    shopCurrencyCode,
    spendSaveFixedCsv,
    spendSavePercentCsv,
  } = data;

  const [error, setError] = useState();
  const isSpendSave =
    promoOfTheDay === 'spend_save_percent' || promoOfTheDay === 'spend_save_fixed';

  useEffect(() => {
    ensureDiscountClasses(isSpendSave).catch(() => {
      setError(i18n.translate('error'));
    });
  }, [ensureDiscountClasses, i18n, isSpendSave]);

  if (loading) {
    return <s-text>{ i18n.translate('loading') }</s-text>;
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
      <s-heading>{ i18n.translate('title') }</s-heading>
      <s-section>
        <s-stack gap="base">
          { error ? <s-banner tone="critical">{ error }</s-banner> : null }
          <s-paragraph color="subdued">{ i18n.translate('helpText') }</s-paragraph>

          <CollectionPicker
            label={ i18n.translate('hoodieCollectionLabel') }
            collection={ hoodieCollection }
            i18n={ i18n }
            onSelect={() => onSelectCollection('hoodie')}
            onRemove={() => onRemoveCollection('hoodie')}
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

          <s-select
            label={ i18n.translate('promoOfTheDayLabel') }
            name="promoOfTheDay"
            value={ promoOfTheDay }
            onChange={(event) => onPromoOfTheDayChange(event.currentTarget.value)}
          >
            { PROMO_OF_THE_DAY.map((opt) => (
              <s-option key={ opt.value } value={ opt.value }>
                { i18n.translate(opt.labelKey) }
              </s-option>
            )) }
          </s-select>

          { promoOfTheDay === 'b2g1' ? (
            <CollectionPromoSlotFields
              i18n={ i18n }
              helpKey="b2g1Help"
              slot={ slots.b2g1 }
              onSelectQualify={() => onSelectCollection('b2g1Qualify')}
              onSelectEligible={() => onSelectCollection('b2g1Eligible')}
              onRemoveQualify={() => onRemoveCollection('b2g1Qualify')}
              onRemoveEligible={() => onRemoveCollection('b2g1Eligible')}
              onPercentChange={(value) => onPercentChange('b2g1', value)}
            />
          ) : null }

          { promoOfTheDay === 'b1g50' ? (
            <CollectionPromoSlotFields
              i18n={ i18n }
              helpKey="b1g50Help"
              slot={ slots.b1g50 }
              onSelectQualify={() => onSelectCollection('b1g50Qualify')}
              onSelectEligible={() => onSelectCollection('b1g50Eligible')}
              onRemoveQualify={() => onRemoveCollection('b1g50Qualify')}
              onRemoveEligible={() => onRemoveCollection('b1g50Eligible')}
              onPercentChange={(value) => onPercentChange('b1g50', value)}
            />
          ) : null }

          { promoOfTheDay === 'b1hg50_sw' ? (
            <CollectionPromoSlotFields
              i18n={ i18n }
              helpKey="b1hg50SwHelp"
              slot={ slots.b1hg50Sw }
              onSelectQualify={() => onSelectCollection('b1hg50SwQualify')}
              onSelectEligible={() => onSelectCollection('b1hg50SwEligible')}
              onRemoveQualify={() => onRemoveCollection('b1hg50SwQualify')}
              onRemoveEligible={() => onRemoveCollection('b1hg50SwEligible')}
              onPercentChange={(value) => onPercentChange('b1hg50Sw', value)}
            />
          ) : null }

          { promoOfTheDay === 'spend_save_percent' ? (
            <s-stack gap="small">
              <s-text-field
                label={ i18n.translate('spendSavePercentCsvLabel') }
                name="spendSavePercentCsv"
                value={ spendSavePercentCsv }
                onChange={(event) => onCsvChange('percent', event.currentTarget.value)}
              />
              <s-paragraph color="subdued">{ i18n.translate('spendSavePercentCsvHelp') }</s-paragraph>
            </s-stack>
          ) : null }

          { promoOfTheDay === 'spend_save_fixed' ? (
            <s-stack gap="small">
              <s-text-field
                label={ i18n.translate('spendSaveFixedCsvLabel') }
                name="spendSaveFixedCsv"
                value={ spendSaveFixedCsv }
                onChange={(event) => onCsvChange('fixed', event.currentTarget.value)}
              />
              <s-paragraph color="subdued">{ i18n.translate('spendSaveFixedCsvHelp') }</s-paragraph>
            </s-stack>
          ) : null }

          <s-heading>{ i18n.translate('messagesHeading') }</s-heading>
          <s-text-field
            label={ i18n.translate('msgHoodieBundle') }
            name="msgHoodieBundle"
            value={ messages.hoodieBundle }
            onChange={(event) => onMessageChange('hoodieBundle', event.currentTarget.value)}
          />
          { promoOfTheDay === 'b2g1' ? (
            <s-text-field
              label={ i18n.translate('msgB2g1') }
              name="msgB2g1"
              value={ messages.b2g1 }
              onChange={(event) => onMessageChange('b2g1', event.currentTarget.value)}
            />
          ) : null }
          { promoOfTheDay === 'b1g50' ? (
            <s-text-field
              label={ i18n.translate('msgB1g50') }
              name="msgB1g50"
              value={ messages.b1g50 }
              onChange={(event) => onMessageChange('b1g50', event.currentTarget.value)}
            />
          ) : null }
          { promoOfTheDay === 'b1hg50_sw' ? (
            <s-text-field
              label={ i18n.translate('msgB1hg50Sw') }
              name="msgB1hg50Sw"
              value={ messages.b1hg50Sw }
              onChange={(event) => onMessageChange('b1hg50Sw', event.currentTarget.value)}
            />
          ) : null }
          { promoOfTheDay === 'spend_save_percent' ? (
            <s-text-field
              label={ i18n.translate('msgSpendSavePercent') }
              name="msgSpendSavePercent"
              value={ messages.spendSavePercent }
              onChange={(event) => onMessageChange('spendSavePercent', event.currentTarget.value)}
            />
          ) : null }
          { promoOfTheDay === 'spend_save_fixed' ? (
            <s-text-field
              label={ i18n.translate('msgSpendSaveFixed') }
              name="msgSpendSaveFixed"
              value={ messages.spendSaveFixed }
              onChange={(event) => onMessageChange('spendSaveFixed', event.currentTarget.value)}
            />
          ) : null }
        </s-stack>
      </s-section>
    </s-function-settings>
  );
}

function CollectionPromoSlotFields({
  i18n,
  helpKey,
  slot,
  onSelectQualify,
  onSelectEligible,
  onRemoveQualify,
  onRemoveEligible,
  onPercentChange,
}) {
  return (
    <s-stack gap="base">
      <s-paragraph color="subdued">{ i18n.translate(helpKey) }</s-paragraph>
      <CollectionPicker
        label={ i18n.translate('qualifyCollectionLabel') }
        collection={ slot.qualify }
        i18n={ i18n }
        onSelect={ onSelectQualify }
        onRemove={ onRemoveQualify }
      />
      <CollectionPicker
        label={ i18n.translate('eligibleCollectionLabel') }
        collection={ slot.eligible }
        i18n={ i18n }
        onSelect={ onSelectEligible }
        onRemove={ onRemoveEligible }
      />
      <s-number-field
        label={ i18n.translate('percentLabel') }
        name="promoPercent"
        value={ String(slot.percent) }
        min={ 1 }
        max={ 100 }
        step={ 1 }
        onChange={(event) => onPercentChange(event.currentTarget.value)}
      />
    </s-stack>
  );
}

function CollectionPicker({ label, collection, i18n, onSelect, onRemove }) {
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
    </s-stack>
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
  const [slots, setSlots] = useState({
    b2g1: { qualify: null, eligible: null, percent: 100 },
    b1g50: { qualify: null, eligible: null, percent: 50 },
    b1hg50Sw: { qualify: null, eligible: null, percent: 50 },
  });
  const [bundlePrice, setBundlePrice] = useState(100);
  const [initialBundlePrice, setInitialBundlePrice] = useState(100);
  const [promoOfTheDay, setPromoOfTheDay] = useState('none');
  const [spendSavePercentCsv, setSpendSavePercentCsv] = useState(DEFAULT_PERCENT_CSV);
  const [spendSaveFixedCsv, setSpendSaveFixedCsv] = useState(DEFAULT_FIXED_CSV);
  const [messages, setMessages] = useState({ ...DEFAULT_MESSAGES });
  const [shopCurrencyCode, setShopCurrencyCode] = useState('');
  const [loading, setLoading] = useState(true);

  const [initial, setInitial] = useState(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);

      const ids = [
        metafieldConfig.hoodieCollectionId,
        metafieldConfig.b2g1.qualifyId,
        metafieldConfig.b2g1.eligibleId,
        metafieldConfig.b1g50.qualifyId,
        metafieldConfig.b1g50.eligibleId,
        metafieldConfig.b1hg50Sw.qualifyId,
        metafieldConfig.b1hg50Sw.eligibleId,
      ].filter(Boolean);

      const uniqueIds = [...new Set(ids)];
      const collectionsById = new Map();
      await Promise.all(
        uniqueIds.map(async (id) => {
          const collection = await getCollection(id, query);
          if (collection) collectionsById.set(id, collection);
        }),
      );

      const pick = (id) => (id ? collectionsById.get(id) ?? null : null);

      const nextSlots = {
        b2g1: {
          qualify: pick(metafieldConfig.b2g1.qualifyId),
          eligible: pick(metafieldConfig.b2g1.eligibleId),
          percent: metafieldConfig.b2g1.percent,
        },
        b1g50: {
          qualify: pick(metafieldConfig.b1g50.qualifyId),
          eligible: pick(metafieldConfig.b1g50.eligibleId),
          percent: metafieldConfig.b1g50.percent,
        },
        b1hg50Sw: {
          qualify: pick(metafieldConfig.b1hg50Sw.qualifyId),
          eligible: pick(metafieldConfig.b1hg50Sw.eligibleId),
          percent: metafieldConfig.b1hg50Sw.percent,
        },
      };

      const hoodie = pick(metafieldConfig.hoodieCollectionId);
      const shop = await getShopCurrency(query);

      setHoodieCollection(hoodie);
      setSlots(nextSlots);
      setShopCurrencyCode(shop);

      const price = Number(metafieldConfig.hoodieBundlePrice) || 100;
      setBundlePrice(price);
      setInitialBundlePrice(price);
      setPromoOfTheDay(metafieldConfig.promoOfTheDay);
      setSpendSavePercentCsv(metafieldConfig.spendSavePercentCsv);
      setSpendSaveFixedCsv(metafieldConfig.spendSaveFixedCsv);
      setMessages(metafieldConfig.messages);

      setInitial({
        hoodie,
        slots: cloneSlots(nextSlots),
        bundlePrice: price,
        promoOfTheDay: metafieldConfig.promoOfTheDay,
        spendSavePercentCsv: metafieldConfig.spendSavePercentCsv,
        spendSaveFixedCsv: metafieldConfig.spendSaveFixedCsv,
        messages: { ...metafieldConfig.messages },
      });

      setLoading(false);
    };

    load();
  }, [metafieldConfig, query]);

  const ensureDiscountClasses = async (includeOrder) => {
    const current = shopify.discounts?.discountClasses?.value ?? [];
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
      throw new Error('Hoodie Bundle collection is required');
    }

    const amount =
      typeof bundlePrice === 'number' ? bundlePrice : parseFloat(String(bundlePrice ?? ''));
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('Bundle price must be greater than zero');
    }

    if (promoOfTheDay === 'b2g1') {
      assertPercent(slots.b2g1, 'B2G1');
    }
    if (promoOfTheDay === 'b1g50') {
      assertPercent(slots.b1g50, 'B1G50');
    }
    if (promoOfTheDay === 'b1hg50_sw') {
      assertSlot(slots.b1hg50Sw, 'B1HG50Sw');
    }
    if (promoOfTheDay === 'spend_save_percent' && !parseCsvPreview(spendSavePercentCsv, true).length) {
      throw new Error('Spend & Save % CSV must include at least one spend|percent tier');
    }
    if (promoOfTheDay === 'spend_save_fixed' && !parseCsvPreview(spendSaveFixedCsv, false).length) {
      throw new Error('Spend & Save $ CSV must include at least one spend|cents tier');
    }

    const config = {
      // Union of every collection ID referenced below — binds to $collectionIds for inCollections.
      collectionIds: uniqueIds([
        hoodieCollection.id,
        ...idsOrEmpty(slots.b2g1.qualify),
        ...idsOrEmpty(slots.b2g1.eligible),
        ...idsOrEmpty(slots.b1g50.qualify),
        ...idsOrEmpty(slots.b1g50.eligible),
        ...idsOrEmpty(slots.b1hg50Sw.qualify),
        ...idsOrEmpty(slots.b1hg50Sw.eligible),
      ]),
      hoodieCollectionIds: [hoodieCollection.id],
      hoodieBundlePrice: amount,
      promoOfTheDay,
      b2g1QualifyCollectionIds: idsOrEmpty(slots.b2g1.qualify),
      b2g1EligibleCollectionIds: idsOrEmpty(slots.b2g1.eligible),
      b2g1Percent: Number(slots.b2g1.percent) || 100,
      b1g50QualifyCollectionIds: idsOrEmpty(slots.b1g50.qualify),
      b1g50EligibleCollectionIds: idsOrEmpty(slots.b1g50.eligible),
      b1g50Percent: Number(slots.b1g50.percent) || 50,
      b1hg50SwQualifyCollectionIds: idsOrEmpty(slots.b1hg50Sw.qualify),
      b1hg50SwEligibleCollectionIds: idsOrEmpty(slots.b1hg50Sw.eligible),
      b1hg50SwPercent: Number(slots.b1hg50Sw.percent) || 50,
      spendSavePercentCsv: spendSavePercentCsv.trim(),
      spendSaveFixedCsv: spendSaveFixedCsv.trim(),
      messages: {
        hoodieBundle: messages.hoodieBundle || DEFAULT_MESSAGES.hoodieBundle,
        b2g1: messages.b2g1 || DEFAULT_MESSAGES.b2g1,
        b1g50: messages.b1g50 || DEFAULT_MESSAGES.b1g50,
        b1hg50Sw: messages.b1hg50Sw || DEFAULT_MESSAGES.b1hg50Sw,
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

    setInitial({
      hoodie: hoodieCollection,
      slots: cloneSlots(slots),
      bundlePrice,
      promoOfTheDay,
      spendSavePercentCsv,
      spendSaveFixedCsv,
      messages: { ...messages },
    });
    setInitialBundlePrice(bundlePrice);
  }

  const resetForm = () => {
    if (!initial) return;
    setHoodieCollection(initial.hoodie);
    setSlots(cloneSlots(initial.slots));
    setBundlePrice(initial.bundlePrice);
    setPromoOfTheDay(initial.promoOfTheDay);
    setSpendSavePercentCsv(initial.spendSavePercentCsv);
    setSpendSaveFixedCsv(initial.spendSaveFixedCsv);
    setMessages({ ...initial.messages });
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

  const collectionKeyMap = {
    hoodie: null,
    b2g1Qualify: ['b2g1', 'qualify'],
    b2g1Eligible: ['b2g1', 'eligible'],
    b1g50Qualify: ['b1g50', 'qualify'],
    b1g50Eligible: ['b1g50', 'eligible'],
    b1hg50SwQualify: ['b1hg50Sw', 'qualify'],
    b1hg50SwEligible: ['b1hg50Sw', 'eligible'],
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
    onPercentChange: (slotKey, value) => {
      setSlots((prev) => ({
        ...prev,
        [slotKey]: { ...prev[slotKey], percent: Number(value) },
      }));
    },
    onPromoOfTheDayChange: (value) => setPromoOfTheDay(value || 'none'),
    onCsvChange: (kind, value) => {
      if (kind === 'percent') setSpendSavePercentCsv(value);
      else setSpendSaveFixedCsv(value);
    },
    onSelectCollection: async (key) => {
      if (key === 'hoodie') {
        setHoodieCollection(await pickCollection(hoodieCollection));
        return;
      }
      const [slotKey, field] = collectionKeyMap[key];
      const current = slots[slotKey][field];
      const next = await pickCollection(current);
      setSlots((prev) => ({
        ...prev,
        [slotKey]: { ...prev[slotKey], [field]: next },
      }));
    },
    onRemoveCollection: (key) => {
      if (key === 'hoodie') {
        setHoodieCollection(null);
        return;
      }
      const [slotKey, field] = collectionKeyMap[key];
      setSlots((prev) => ({
        ...prev,
        [slotKey]: { ...prev[slotKey], [field]: null },
      }));
    },
    promoOfTheDay,
    slots,
    resetForm,
    shopCurrencyCode,
    spendSaveFixedCsv,
    spendSavePercentCsv,
  };
}

function cloneSlots(value) {
  return JSON.parse(JSON.stringify(value));
}

function uniqueIds(ids) {
  return [...new Set(ids.filter(Boolean))];
}

function assertPercent(slot, label) {
  const percent = Number(slot.percent);
  if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
    throw new Error(`${ label }: percent must be between 1 and 100`);
  }
}

function assertSlot(slot, label) {
  if (!slot.qualify?.id) throw new Error(`${ label }: qualifying collection is required`);
  if (!slot.eligible?.id) throw new Error(`${ label }: discount-eligible collection is required`);
  assertPercent(slot, label);
}

function idsOrEmpty(collection) {
  return collection?.id ? [collection.id] : [];
}

function parseCsvPreview(csv, discountIsPercent) {
  if (!csv || typeof csv !== 'string') return [];
  return csv.split(',').flatMap((part) => {
    const trimmed = part.trim();
    if (!trimmed) return [];
    const [spendRaw, discountRaw] = trimmed.split('|').map((s) => s.trim());
    const spend = Number(spendRaw);
    const value = Number(discountRaw);
    if (!Number.isFinite(spend) || spend < 0) return [];
    if (!Number.isFinite(value) || value <= 0) return [];
    if (discountIsPercent && value > 100) return [];
    return [{ spend, value }];
  });
}

function parseMetafield(value) {
  try {
    const parsed = JSON.parse(value || '{}');
    const firstId = (keys) => {
      for (const key of keys) {
        const v = parsed[key];
        if (Array.isArray(v) && v[0]) return v[0];
        if (typeof v === 'string' && v) return v;
      }
      return '';
    };

    const percentOf = (keys, fallback) => {
      for (const key of keys) {
        if (parsed[key] !== undefined && parsed[key] !== null && parsed[key] !== '') {
          const n = Number(parsed[key]);
          if (Number.isFinite(n) && n > 0) return n;
        }
      }
      return fallback;
    };

    const promoRaw = parsed.promoOfTheDay ?? parsed.promoType ?? 'none';
    const promoMap = {
      none: 'none',
      spend_save_percent: 'spend_save_percent',
      spend_save_fixed: 'spend_save_fixed',
      b2g1: 'b2g1',
      b1g50: 'b1g50',
      b1hg50_sw: 'b1hg50_sw',
      hoodie_sweatpants_50: 'b1hg50_sw',
    };

    const nested =
      parsed.messages && typeof parsed.messages === 'object' ? parsed.messages : {};

    return {
      hoodieCollectionId: firstId(['hoodieCollectionIds', 'collectionIds', 'collectionId']),
      hoodieBundlePrice: parsed.hoodieBundlePrice ?? parsed.bundlePrice ?? 100,
      promoOfTheDay: promoMap[String(promoRaw)] || 'none',
      b2g1: {
        qualifyId: firstId(['b2g1QualifyCollectionIds']),
        eligibleId: firstId(['b2g1EligibleCollectionIds']),
        percent: percentOf(['b2g1Percent'], 100),
      },
      b1g50: {
        qualifyId: firstId(['b1g50QualifyCollectionIds']),
        eligibleId: firstId(['b1g50EligibleCollectionIds']),
        percent: percentOf(['b1g50Percent'], 50),
      },
      b1hg50Sw: {
        qualifyId: firstId(['b1hg50SwQualifyCollectionIds', 'hoodieCollectionIds']),
        eligibleId: firstId(['b1hg50SwEligibleCollectionIds', 'sweatpantsCollectionIds']),
        percent: percentOf(['b1hg50SwPercent'], 50),
      },
      spendSavePercentCsv:
        typeof parsed.spendSavePercentCsv === 'string' && parsed.spendSavePercentCsv.trim()
          ? parsed.spendSavePercentCsv
          : DEFAULT_PERCENT_CSV,
      spendSaveFixedCsv:
        typeof parsed.spendSaveFixedCsv === 'string' && parsed.spendSaveFixedCsv.trim()
          ? parsed.spendSaveFixedCsv
          : DEFAULT_FIXED_CSV,
      messages: {
        hoodieBundle:
          nested.hoodieBundle || parsed.hoodieBundleTitle || DEFAULT_MESSAGES.hoodieBundle,
        b2g1: nested.b2g1 || DEFAULT_MESSAGES.b2g1,
        b1g50: nested.b1g50 || DEFAULT_MESSAGES.b1g50,
        b1hg50Sw:
          nested.b1hg50Sw || nested.hoodieSweatpants50 || DEFAULT_MESSAGES.b1hg50Sw,
        spendSavePercent: nested.spendSavePercent || DEFAULT_MESSAGES.spendSavePercent,
        spendSaveFixed: nested.spendSaveFixed || DEFAULT_MESSAGES.spendSaveFixed,
      },
    };
  } catch {
    return {
      hoodieCollectionId: '',
      hoodieBundlePrice: 100,
      promoOfTheDay: 'none',
      b2g1: { qualifyId: '', eligibleId: '', percent: 100 },
      b1g50: { qualifyId: '', eligibleId: '', percent: 50 },
      b1hg50Sw: { qualifyId: '', eligibleId: '', percent: 50 },
      spendSavePercentCsv: DEFAULT_PERCENT_CSV,
      spendSaveFixedCsv: DEFAULT_FIXED_CSV,
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
