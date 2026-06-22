/** @jsxImportSource preact */
import '@shopify/ui-extensions/preact';
import { render } from 'preact';

export default async () => {
  render(<Extension />, document.body);
};

function Extension() {
  const { close } = shopify;

  return (
    <s-admin-action heading="Sync inventory">
      <s-button slot="primary-action" onClick={ () => { close(); } }>
        Close
      </s-button>
      <s-box padding-block-start="base">
        <s-text>WIP: Sync inventory</s-text>
      </s-box>
    </s-admin-action>
  );
}
