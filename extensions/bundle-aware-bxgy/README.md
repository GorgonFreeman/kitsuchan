# Bundle-aware BxGy (Shopify Function)

Exclude **collection-pair** units first, then apply Buy X Get Y%:

- **X** (`paidCount`) — paid items required per group from the qualifying collection (blank = all)
- **Y** (`percent`) — % off cheapest eligible unit(s) from the eligible collection (blank = all)
- Example: X=2, Y=100 → Buy 2 Get 1 Free; X=1, Y=50 → Buy 1 Get 1 50% Off

## Config

```json
{
  "collectionIds": ["gid://shopify/Collection/HOODIE"],
  "bundleCollectionIds": ["gid://shopify/Collection/HOODIE"],
  "qualifyCollectionIds": [],
  "eligibleCollectionIds": [],
  "itemCount": 2,
  "paidCount": 2,
  "percent": 100,
  "discountTitle": "Buy 2 Get 1 Free"
}
```

## Tests

```bash
nvm use 25
npm install
npm test
```
