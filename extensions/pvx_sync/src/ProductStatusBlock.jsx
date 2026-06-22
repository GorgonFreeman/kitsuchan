/** @jsxImportSource preact */
import '@shopify/ui-extensions/preact';
import { render } from 'preact';

export default async () => {
  render(<Extension />, document.body);
};

function Extension() {
  const { i18n } = shopify;

  return (
    <s-admin-block heading={ i18n.translate('status-block-heading') }>
      <s-text>{ i18n.translate('status-block-placeholder') }</s-text>
    </s-admin-block>
  );
}
