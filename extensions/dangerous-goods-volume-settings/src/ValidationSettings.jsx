import '@shopify/ui-extensions/preact';
import { render } from 'preact';
import { useState } from 'preact/hooks';

const METAFIELD_NAMESPACE = '$app:dangerous-goods-volume';
const METAFIELD_KEY = 'function-configuration';
const DEFAULT_MESSAGE = 'Cart exceeds the dangerous goods volume limit.';

export default async () => {
  const existingDefinition = await getMetafieldDefinition();
  if (!existingDefinition) {
    const metafieldDefinition = await createMetafieldDefinition();
    if (!metafieldDefinition) {
      throw new Error('Failed to create metafield definition');
    }
  }

  const configuration = parseConfiguration(
    shopify.data.validation?.metafields?.find(
      (metafield) => metafield.key === METAFIELD_KEY,
    )?.value,
  );

  render(
    <Extension configuration={ configuration } />,
    document.body,
  );
};

function Extension({ configuration }) {
  const [ volumeThreshold, setVolumeThreshold ] = useState(
    configuration.volumeThreshold,
  );
  const [ message, setMessage ] = useState(configuration.message);
  const [ errors, setErrors ] = useState([]);
  const { i18n } = shopify;

  const applyMetafieldUpdate = async () => {
    setErrors([]);

    const parsedThreshold = Number(volumeThreshold);
    if (!Number.isFinite(parsedThreshold) || parsedThreshold < 0) {
      setErrors([ i18n.translate('thresholdInvalid') ]);
      return;
    }

    const trimmedMessage = typeof message === 'string' ? message.trim() : '';
    if (!trimmedMessage) {
      setErrors([ i18n.translate('messageRequired') ]);
      return;
    }

    const result = await shopify.applyMetafieldChange({
      type: 'updateMetafield',
      namespace: METAFIELD_NAMESPACE,
      key: METAFIELD_KEY,
      value: JSON.stringify({
        volumeThreshold: parsedThreshold,
        message: trimmedMessage,
      }),
      valueType: 'json',
    });

    if (result.type === 'error') {
      setErrors([ result.message ]);
    }
  };

  return (
    <s-function-settings
      onSubmit={(event) => {
        event.waitUntil?.(applyMetafieldUpdate());
      }}
    >
      <ErrorBanner errors={ errors } />
      <s-heading>{ i18n.translate('title') }</s-heading>
      <s-section>
        <s-stack gap="base">
          <s-paragraph color="subdued">{ i18n.translate('helpText') }</s-paragraph>
          <s-number-field
            label={ i18n.translate('volumeThresholdLabel') }
            name="volumeThreshold"
            value={ String(volumeThreshold ?? '') }
            defaultValue={ String(configuration.volumeThreshold ?? '') }
            min={ 0 }
            step={ 1 }
            onChange={(event) => setVolumeThreshold(event.currentTarget.value)}
          />
          <s-text-field
            label={ i18n.translate('messageLabel') }
            name="message"
            value={ message }
            defaultValue={ configuration.message }
            onChange={(event) => setMessage(event.currentTarget.value)}
          />
        </s-stack>
      </s-section>
    </s-function-settings>
  );
}

function ErrorBanner({ errors }) {
  if (!errors.length) {
    return null;
  }

  return (
    <s-stack gap="base">
      { errors.map((error, index) => (
        <s-banner key={ index } heading="Error" tone="critical">
          { error }
        </s-banner>
      )) }
    </s-stack>
  );
}

function parseConfiguration(value) {
  try {
    const parsed = JSON.parse(value || '{}');
    return {
      volumeThreshold: parsed.volumeThreshold ?? '',
      message: typeof parsed.message === 'string' && parsed.message.trim()
        ? parsed.message
        : DEFAULT_MESSAGE,
    };
  } catch {
    return {
      volumeThreshold: '',
      message: DEFAULT_MESSAGE,
    };
  }
}

async function getMetafieldDefinition() {
  const query = `#graphql
    query GetMetafieldDefinition {
      metafieldDefinitions(
        first: 1
        ownerType: VALIDATION
        namespace: "${ METAFIELD_NAMESPACE }"
        key: "${ METAFIELD_KEY }"
      ) {
        nodes {
          id
        }
      }
    }
  `;

  const result = await shopify.query(query);
  return result?.data?.metafieldDefinitions?.nodes[ 0 ];
}

async function createMetafieldDefinition() {
  const definition = {
    access: {
      admin: 'MERCHANT_READ_WRITE',
    },
    key: METAFIELD_KEY,
    name: 'Dangerous goods volume configuration',
    namespace: METAFIELD_NAMESPACE,
    ownerType: 'VALIDATION',
    type: 'json',
  };

  const query = `#graphql
    mutation CreateMetafieldDefinition($definition: MetafieldDefinitionInput!) {
      metafieldDefinitionCreate(definition: $definition) {
        createdDefinition {
          id
        }
      }
    }
  `;

  const result = await shopify.query(query, { variables: { definition } });
  return result?.data?.metafieldDefinitionCreate?.createdDefinition;
}
