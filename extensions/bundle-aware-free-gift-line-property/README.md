# Bundle-aware free gift (line property)

Excludes **collection-pair** units first, then:

1. Unlocks free gifts from artificial post-pair spend + min spend / redemptions
2. Applies the **real** fixed discount on gift lines (matched by line item property)
3. Applies a **$0.01 vanity** fixed discount on every other non-paired line so this function competes as one group against product discount codes

## Config metafield (`$app` / `function-configuration`)

```json
{
  "collectionIds": ["gid://shopify/Collection/HOODIE"],
  "bundleCollectionIds": ["gid://shopify/Collection/HOODIE"],
  "itemCount": 2,
  "pricingMode": "single",
  "shopCurrencyCode": "AUD",
  "bundlePrice": "100.00",
  "lineProperty": "_free_gift_hoodie",
  "minSpend": "75.00",
  "discountTitle": "Free gift",
  "redemptions": "one"
}
```

`collectionIds` and `lineProperty` also bind GraphQL input variables.

## Tests

```bash
nvm use 25
npm install
npm test
```
