import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { useEffect, useState } from "preact/hooks";

export default async () => {
  render(<Extension />, document.body);
};

function Extension() {
  const {
    i18n,
    close,
    data,
    extension: { target },
  } = shopify;
  console.log({ data });
  const [productTitle, setProductTitle] = useState("");
  useEffect(() => {
    (async function getProductInfo() {
      const getProductQuery = {
        query: `query Product($id: ID!) {
          product(id: $id) {
            title
          }
        }`,
        variables: { id: data.selected[0].id },
      };

      const res = await fetch("shopify:admin/api/graphql.json", {
        method: "POST",
        body: JSON.stringify(getProductQuery),
      });

      if (!res.ok) {
        console.error("Network error");
      }

      const productData = await res.json();
      setProductTitle(productData.data.product.title);
    })();
  }, [data.selected]);
  return (
    <s-admin-action>
      <s-stack direction="block">
        {/* Set the translation values for each supported language in the locales directory */}
        <s-text type="strong">{i18n.translate("welcome", { target })}</s-text>
        <s-text>Current product: {productTitle}</s-text>
      </s-stack>
      <s-button
        slot="primary-action"
        onClick={() => {
          close();
        }}
      >
        Done
      </s-button>
      <s-button
        slot="secondary-actions"
        onClick={() => {
          close();
        }}
      >
        Close
      </s-button>
    </s-admin-action>
  );
}

