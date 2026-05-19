/** @jsxImportSource preact */
import '@shopify/ui-extensions/preact';
import { render } from 'preact';
import { useState } from 'preact/hooks';

const SYNC_URL = 'https://australia-southeast1-foxtware.cloudfunctions.net/apexCatalogueSyncReconsilePvx';
const BULK_TARGET = 'admin.product-index.selection-action.render';

export default async () => {
  render(<Extension />, document.body);
};

function Extension() {
  const { close, data, i18n, extension } = shopify;
  const isBulk = extension.target === BULK_TARGET;

  const productIds = (data.selected ?? [])
    .map((item) => (item?.id ?? '').split('/').pop())
    .filter(Boolean);
  const count = productIds.length;

  const [ status, setStatus ] = useState('idle');
  const [ errorMessage, setErrorMessage ] = useState('');

  async function runSync() {
    if (count === 0) return;
    setStatus('syncing');
    setErrorMessage('');
    try {
      const res = await fetch(SYNC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ options: { productIds } }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.success !== true) {
        throw new Error(body.error ?? body.message ?? `HTTP ${ res.status }`);
      }
      setStatus('success');
    } catch (err) {
      console.log('pvxSyncError', err);
      setErrorMessage(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  }

  const isSyncing = status === 'syncing';
  const isSuccess = status === 'success';
  const isError = status === 'error';
  const hasProducts = count > 0;

  const headingKey = isBulk ? 'heading-bulk' : 'heading';
  const descriptionText = isBulk
    ? i18n.translate('description-bulk', { count })
    : i18n.translate('description');
  const syncingText = isBulk
    ? i18n.translate('syncing-bulk', { count })
    : i18n.translate('syncing', { id: productIds[ 0 ] ?? '' });
  const successText = isBulk
    ? i18n.translate('success-bulk', { count })
    : i18n.translate('success', { id: productIds[ 0 ] ?? '' });
  const emptyText = isBulk ? i18n.translate('no-products') : i18n.translate('no-product');

  return (
    <s-admin-action heading={ i18n.translate(headingKey) }>
      { isSuccess ? (
        <s-button slot="primary-action" onClick={ () => { close(); } }>
          { i18n.translate('done') }
        </s-button>
      ) : (
        <s-button
          slot="primary-action"
          disabled={ !hasProducts || isSyncing }
          loading={ isSyncing }
          onClick={ runSync }
        >
          { i18n.translate('sync') }
        </s-button>
      ) }
      <s-button slot="secondary-actions" onClick={ () => { close(); } }>
        { i18n.translate('close') }
      </s-button>

      <s-stack direction="block" gap="base">
        <s-text>{ descriptionText }</s-text>

        { !hasProducts && (
          <s-banner tone="warning">
            <s-text>{ emptyText }</s-text>
          </s-banner>
        ) }

        { isSyncing && (
          <s-stack direction="inline" gap="base" align-items="center">
            <s-spinner />
            <s-text>{ syncingText }</s-text>
          </s-stack>
        ) }

        { isSuccess && (
          <s-banner tone="success">
            <s-text>{ successText }</s-text>
          </s-banner>
        ) }

        { isError && (
          <s-banner tone="critical">
            <s-text>{ i18n.translate('error', { message: errorMessage }) }</s-text>
          </s-banner>
        ) }
      </s-stack>
    </s-admin-action>
  );
}
