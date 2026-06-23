/** @jsxImportSource preact */
import '@shopify/ui-extensions/preact';
import { render } from 'preact';

const BULK_TARGET = 'admin.product-index.selection-action.render';

export default async () => {
  render(<Extension />, document.body);
};

function gidToId(gid) {
  if (!gid) return '';
  const parts = String(gid).split('/');
  return parts[ parts.length - 1 ] ?? '';
}

function Extension() {
  const { close, data, i18n, extension } = shopify;
  const isBulk = String(extension.target) === BULK_TARGET;

  const selected = data.selected ?? [];
  const descriptionKey = isBulk ? 'inventory-sync-description-bulk' : 'inventory-sync-description';
  const emptyText = isBulk ? i18n.translate('no-products') : i18n.translate('no-product');

  return (
    <s-admin-action heading={ i18n.translate('inventory-sync-action-name') }>
      <s-button slot="primary-action" onClick={ () => { close(); } }>
        { i18n.translate('close') }
      </s-button>

      <s-stack direction="block" gap="base">
        <s-text>{ i18n.translate(descriptionKey, { count: selected.length }) }</s-text>

        { selected.length === 0 && (
          <s-banner tone="warning">
            <s-text>{ emptyText }</s-text>
          </s-banner>
        ) }

        { selected.map((item) => (
          <s-box key={ item.id } padding="base" border="base" borderRadius="base">
            <s-stack direction="block" gap="small">
              <s-text type="strong">
                { i18n.translate('inventory-sync-product-id', { id: gidToId(item.id) }) }
              </s-text>
              <s-text color="subdued">{ item.id }</s-text>
            </s-stack>
          </s-box>
        )) }
      </s-stack>
    </s-admin-action>
  );
}
