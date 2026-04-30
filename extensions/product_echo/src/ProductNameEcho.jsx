/** @jsxImportSource preact */
// Admin UI extensions are limited to 64 KB scripts; Preact fits, React + react-dom does not.
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';

export default async () => {
  render(<Extension />, document.body);

  function Extension() {
    const { close, data, i18n } = shopify;
    const id = data.selected?.[ 0 ]?.id;
    const [ line, setLine ] = useState(() => i18n.translate('loading'));

    useEffect(() => {
      if (!id) {
        setLine(i18n.translate('no-product'));
        return;
      }

      let cancelled = false;

      async function load() {
        try {
          const response = await fetch('shopify:admin/api/graphql.json', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query: `
                query ProductTitle($id: ID!) {
                  product(id: $id) {
                    title
                  }
                }
              `,
              variables: { id },
            }),
          });

          const result = await response.json();
          if (cancelled) return;

          if (result.errors?.length) {
            console.log('productEchoGraphqlErrors', result.errors);
            setLine(i18n.translate('load-error'));
            return;
          }

          const title = result.data?.product?.title ?? '';
          setLine(i18n.translate('echo-with-title', { title }));
        } catch (err) {
          if (cancelled) return;
          console.log('productEchoFetchError', err);
          setLine(i18n.translate('load-error'));
        }
      }

      load();

      return () => {
        cancelled = true;
      };
    }, [ id ]);

    return (
      <s-admin-action heading={ i18n.translate('name') }>
        <s-button slot="primaryAction" onClick={ () => { close(); } }>
          { i18n.translate('done') }
        </s-button>
        <s-box padding-block-start="base">
          <s-text>{ line }</s-text>
        </s-box>
      </s-admin-action>
    );
  }
};
