import '@shopify/ui-extensions/preact';
import { render } from 'preact';
import { useState, useEffect, useMemo } from 'preact/hooks';

const REDEMPTIONS_ONE = 'one';
const REDEMPTIONS_MULTIPLE = 'multiple';

export default async () => {
  render(<App />, document.body);
};

function App() {
  const {
    applyExtensionMetafieldChange,
    discountTitle,
    i18n,
    initialDiscountTitle,
    initialLineProperty,
    initialMinSpend,
    initialRedemptions,
    lineProperty,
    minSpend,
    onDiscountTitleChange,
    onLinePropertyChange,
    onMinSpendChange,
    onRedemptionsChange,
    redemptions,
    resetForm,
    shopCurrencyCode,
  } = useExtensionData();

  const [ error, setError ] = useState();

  useEffect(() => {
    ensureProductDiscountClass().catch(() => {
      setError(i18n.translate('error'));
    });
  }, [ i18n ]);

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
          <s-text-field
            label={ i18n.translate('discountMessageLabel') }
            name="discountTitle"
            value={ discountTitle }
            defaultValue={ initialDiscountTitle }
            onChange={(event) => onDiscountTitleChange(event.currentTarget.value)}
          />
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
  const { applyMetafieldChange, data, i18n, query } = shopify;

  const metafieldValue = data?.metafields?.find(
    (metafield) => metafield.key === 'function-configuration',
  )?.value;

  const metafieldConfig = useMemo(
    () => parseMetafield(metafieldValue),
    [ metafieldValue ],
  );

  const [ lineProperty, setLineProperty ] = useState(metafieldConfig.lineProperty);
  const [ initialLineProperty, setInitialLineProperty ] = useState(metafieldConfig.lineProperty);
  const [ minSpend, setMinSpend ] = useState(metafieldConfig.minSpend);
  const [ initialMinSpend, setInitialMinSpend ] = useState(metafieldConfig.minSpend);
  const [ discountTitle, setDiscountTitle ] = useState(metafieldConfig.discountTitle);
  const [ initialDiscountTitle, setInitialDiscountTitle ] = useState(metafieldConfig.discountTitle);
  const [ redemptions, setRedemptions ] = useState(metafieldConfig.redemptions);
  const [ initialRedemptions, setInitialRedemptions ] = useState(metafieldConfig.redemptions);
  const [ shopCurrencyCode, setShopCurrencyCode ] = useState('');

  useEffect(() => {
    setLineProperty(metafieldConfig.lineProperty);
    setInitialLineProperty(metafieldConfig.lineProperty);
    setMinSpend(metafieldConfig.minSpend);
    setInitialMinSpend(metafieldConfig.minSpend);
    setDiscountTitle(metafieldConfig.discountTitle);
    setInitialDiscountTitle(metafieldConfig.discountTitle);
    setRedemptions(metafieldConfig.redemptions);
    setInitialRedemptions(metafieldConfig.redemptions);
  }, [
    metafieldConfig.lineProperty,
    metafieldConfig.minSpend,
    metafieldConfig.discountTitle,
    metafieldConfig.redemptions,
  ]);

  useEffect(() => {
    let cancelled = false;

    getShopCurrencyCode(query)
      .then((currencyCode) => {
        if (!cancelled) {
          setShopCurrencyCode(currencyCode);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setShopCurrencyCode('');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [ query ]);

  async function applyExtensionMetafieldChange() {
    const trimmedLineProperty = lineProperty.trim();
    if (!trimmedLineProperty) {
      throw new Error(i18n.translate('linePropertyRequired'));
    }

    const amount = typeof minSpend === 'number'
      ? minSpend
      : parseFloat(String(minSpend ?? ''));
    if (!Number.isFinite(amount) || amount < 0) {
      throw new Error(i18n.translate('minSpendInvalid'));
    }

    const config = {
      lineProperty: trimmedLineProperty,
      minSpend: amount.toFixed(2),
      discountTitle: discountTitle.trim(),
      redemptions: redemptions === REDEMPTIONS_MULTIPLE
        ? REDEMPTIONS_MULTIPLE
        : REDEMPTIONS_ONE,
    };

    await applyMetafieldChange({
      type: 'updateMetafield',
      namespace: '$app',
      key: 'function-configuration',
      value: JSON.stringify(config),
      valueType: 'json',
    });

    setInitialLineProperty(config.lineProperty);
    setInitialMinSpend(amount);
    setInitialDiscountTitle(config.discountTitle);
    setInitialRedemptions(config.redemptions);
    setLineProperty(config.lineProperty);
    setMinSpend(amount);
    setDiscountTitle(config.discountTitle);
    setRedemptions(config.redemptions);
  }

  const resetForm = () => {
    setLineProperty(initialLineProperty);
    setMinSpend(initialMinSpend);
    setDiscountTitle(initialDiscountTitle);
    setRedemptions(initialRedemptions);
  };

  return {
    applyExtensionMetafieldChange,
    discountTitle,
    i18n,
    initialDiscountTitle,
    initialLineProperty,
    initialMinSpend,
    initialRedemptions,
    lineProperty,
    minSpend,
    onDiscountTitleChange: setDiscountTitle,
    onLinePropertyChange: setLineProperty,
    onMinSpendChange: (value) => setMinSpend(Number(value)),
    onRedemptionsChange: (value) => setRedemptions(
      value === REDEMPTIONS_MULTIPLE ? REDEMPTIONS_MULTIPLE : REDEMPTIONS_ONE,
    ),
    redemptions,
    resetForm,
    shopCurrencyCode,
  };
}

async function ensureProductDiscountClass() {
  const discountClasses = shopify.discounts?.discountClasses?.value ?? [];
  if (discountClasses.includes('product') && discountClasses.length === 1) {
    return;
  }

  const result = await shopify.discounts?.updateDiscountClasses?.([ 'product' ]);
  if (!result?.success) {
    throw new Error('Unable to update discount classes');
  }
}

function parseMetafield(value) {
  try {
    const parsed = JSON.parse(value || '{}');
    const minSpendAmount = parsed.minSpend != null
      ? Number(parsed.minSpend)
      : 0;

    return {
      lineProperty: typeof parsed.lineProperty === 'string' ? parsed.lineProperty : '',
      minSpend: Number.isFinite(minSpendAmount) ? minSpendAmount : 0,
      discountTitle: typeof parsed.discountTitle === 'string' ? parsed.discountTitle : '',
      redemptions: parsed.redemptions === REDEMPTIONS_MULTIPLE
        ? REDEMPTIONS_MULTIPLE
        : REDEMPTIONS_ONE,
    };
  } catch {
    return {
      lineProperty: '',
      minSpend: 0,
      discountTitle: '',
      redemptions: REDEMPTIONS_ONE,
    };
  }
}

async function getShopCurrencyCode(adminApiQuery) {
  const gql = `#graphql
    query FreeGiftShopCurrency {
      shop {
        currencyCode
      }
    }
  `;
  const result = await adminApiQuery(gql);
  return result?.data?.shop?.currencyCode ?? '';
}
