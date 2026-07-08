/** @jsxImportSource preact */
import '@shopify/ui-extensions/preact';
import { render } from 'preact';
import { useState } from 'preact/hooks';

export default async () => {
  render(<Extension />, document.body);
};

function gidToId(gid) {
  if (!gid) return '';
  const parts = String(gid).split('/');
  return parts[ parts.length - 1 ] ?? '';
}

function Extension() {
  const { close, data, i18n } = shopify;

  const order = data.selected?.[ 0 ];
  const orderId = order?.id ?? '';
  const orderIdShort = gidToId(orderId);

  const [ status, setStatus ] = useState('idle');
  const [ errorMessage, setErrorMessage ] = useState('');
  const [ orderDetails, setOrderDetails ] = useState(null);

  async function fetchDetails() {
    if (!orderId) return;
    setStatus('fetching');
    setErrorMessage('');
    setOrderDetails(null);

    try {
      const response = await fetch('shopify:admin/api/graphql.json', {
        method: 'POST',
        body: JSON.stringify({
          query: `query Order($id: ID!) {
            order(id: $id) {
              name
              email
              displayFinancialStatus
              displayFulfillmentStatus
            }
          }`,
          variables: { id: orderId },
        }),
      });

      const body = await response.json();
      if (!response.ok || body.errors?.length) {
        throw new Error(body.errors?.[ 0 ]?.message ?? `HTTP ${ response.status }`);
      }

      setOrderDetails(body.data?.order ?? null);
      setStatus('success');
    } catch (err) {
      console.log('pvxOrderSyncError', err);
      setErrorMessage(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  }

  const isFetching = status === 'fetching';
  const isSuccess = status === 'success';
  const isError = status === 'error';
  const hasOrder = Boolean(orderId);

  return (
    <s-admin-action heading={ i18n.translate('order-sync-action-name') }>
      { isSuccess ? (
        <s-button slot="primary-action" onClick={ () => { close(); } }>
          { i18n.translate('done') }
        </s-button>
      ) : (
        <s-button
          slot="primary-action"
          disabled={ !hasOrder || isFetching }
          loading={ isFetching }
          onClick={ fetchDetails }
        >
          { i18n.translate('order-sync-fetch-details') }
        </s-button>
      ) }
      <s-button slot="secondary-actions" onClick={ () => { close(); } }>
        { i18n.translate('close') }
      </s-button>

      <s-stack direction="block" gap="base">
        <s-text>
          { hasOrder
            ? i18n.translate('order-sync-description', { id: orderIdShort })
            : i18n.translate('order-sync-no-order') }
        </s-text>

        { !hasOrder && (
          <s-banner tone="warning">
            <s-text>{ i18n.translate('order-sync-no-order') }</s-text>
          </s-banner>
        ) }

        { isFetching && (
          <s-stack direction="inline" gap="base" align-items="center">
            <s-spinner />
            <s-text>{ i18n.translate('order-sync-fetching', { id: orderIdShort }) }</s-text>
          </s-stack>
        ) }

        { isSuccess && orderDetails && (
          <s-box padding="base" border="base" borderRadius="base">
            <s-stack direction="block" gap="small">
              <s-text type="strong">{ orderDetails.name }</s-text>
              { orderDetails.email && (
                <s-text color="subdued">{ orderDetails.email }</s-text>
              ) }
              <s-text>
                { i18n.translate('order-sync-financial-status', {
                  status: orderDetails.displayFinancialStatus ?? '—',
                }) }
              </s-text>
              <s-text>
                { i18n.translate('order-sync-fulfillment-status', {
                  status: orderDetails.displayFulfillmentStatus ?? '—',
                }) }
              </s-text>
            </s-stack>
          </s-box>
        ) }

        { isError && (
          <s-banner tone="critical">
            <s-text>{ i18n.translate('order-sync-error', { message: errorMessage }) }</s-text>
          </s-banner>
        ) }
      </s-stack>
    </s-admin-action>
  );
}
