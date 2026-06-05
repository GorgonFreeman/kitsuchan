import '@shopify/ui-extensions';

//@ts-ignore
declare module './src/WishlistStalenessCheck.jsx' {
  const shopify: import('@shopify/ui-extensions/admin.customer-details.action.render').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/WishlistBulkStalenessCheck.jsx' {
  const shopify: import('@shopify/ui-extensions/admin.customer-index.selection-action.render').Api;
  const globalThis: { shopify: typeof shopify };
}
