# Bundle-aware Spend & Save % (Shopify Function)

Simulates **collection-pair** bundles to compute an artificial cart spend, unlocks a multi-tier percentage from CSV, then applies that % only to **eligible units that did not form a pair**.

Pairing math is imported from [`collection-pair-discount/src/collectionPairing.js`](../collection-pair-discount/src/collectionPairing.js):

- `getPairs(units, itemCount)` → array of unit tuples in each bundle
- `getPostPairsSubtotal(units, pairs, bundlePriceCents)` → speculative spend after pairs

## Behaviour

1. `getPairs` on bundle-collection units
2. Unlock tiers from `getPostPairsSubtotal` (pair discounts assumed applied)
3. Pick the highest unlocked `spend|percent` tier
4. Emit product `%` on eligible-pool units that were **not** paired (`selectionStrategy: ALL`)
5. Lines with `_hoodie_bundle_exclude` are skipped from pairing and from receiving Spend & Save

## Config metafield (`$app` / `function-configuration`)

```json
{
  "collectionIds": [
    "gid://shopify/Collection/HOODIE",
    "gid://shopify/Collection/SALE"
  ],
  "bundleCollectionIds": ["gid://shopify/Collection/HOODIE"],
  "eligibleCollectionIds": ["gid://shopify/Collection/SALE"],
  "itemCount": 2,
  "discountTitle": "Spend & Save",
  "pricingMode": "single",
  "shopCurrencyCode": "AUD",
  "bundlePrice": "100.00",
  "spendSavePercentCsv": "75|15,150|20,200|30"
}
```

`collectionIds` must be the union of bundle + eligible IDs (binds to `$collectionIds` for `inCollections`). Empty `eligibleCollectionIds` means all products.

## Tests

```bash
nvm use 25
npm install
npm test
```
