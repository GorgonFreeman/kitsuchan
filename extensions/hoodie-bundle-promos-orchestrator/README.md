# Hoodie Bundle Promos Orchestrator (Shopify Function)

One discount function that always runs **Hoodie Bundle** pairs first, then applies the selected **Promo of the Day** to remaining units.

## Promo of the Day

| Value | Behaviour |
|-------|-----------|
| `none` | Hoodie pairs only |
| `b2g1` | 2 qualifying paid units unlock 1 eligible unit at configured % (cheapest eligible first, multi-use) |
| `b1g50` | 1 qualifying paid unit unlocks 1 eligible unit at configured % (cheapest eligible first, multi-use) |
| `b1hg50_sw` | Same slot shape as B1G50 — typically hoodies qualify sweatpants |
| `spend_save_percent` | After hoodie pairs, order % off from CSV tiers (discounted hoodie prices count toward spend) |
| `spend_save_fixed` | Same with fixed $ off (CSV discount values are **cents**) |

Orchestration is always **bundles first → promo on leftovers**. No competing alternate plans.

JS branches on `promoOfTheDay`. The input query is static (Shopify cannot swap GraphQL documents at runtime) but uses a single `inCollections` call so **all** slot collection IDs can be checked without blowing the complexity budget.

## Configuration metafield (`$app` / `function-configuration`)

```json
{
  "collectionIds": [
    "gid://shopify/Collection/HOODIE",
    "gid://shopify/Collection/B2G1_Q",
    "gid://shopify/Collection/B2G1_E"
  ],
  "hoodieCollectionIds": ["gid://shopify/Collection/HOODIE"],
  "hoodieBundlePrice": 100,
  "promoOfTheDay": "b2g1",

  "b2g1QualifyCollectionIds": ["gid://shopify/Collection/B2G1_Q"],
  "b2g1EligibleCollectionIds": ["gid://shopify/Collection/B2G1_E"],
  "b2g1Percent": 100,

  "b1g50QualifyCollectionIds": [],
  "b1g50EligibleCollectionIds": [],
  "b1g50Percent": 50,

  "b1hg50SwQualifyCollectionIds": [],
  "b1hg50SwEligibleCollectionIds": [],
  "b1hg50SwPercent": 50,

  "spendSavePercentCsv": "75|20,150|25,200|30",
  "spendSaveFixedCsv": "75|1500,150|4000,200|6000",

  "messages": {
    "hoodieBundle": "Hoodie Bundle 2 for $100",
    "b2g1": "Buy 2 Get 1 Free",
    "b1g50": "Buy 1 Get 1 50% Off",
    "b1hg50Sw": "50% off sweatpants with hoodie",
    "spendSavePercent": "Spend & Save",
    "spendSaveFixed": "Spend & Save"
  }
}
```

`collectionIds` must be the **deduped union** of every collection ID referenced by hoodie + all three promo slots. It binds to `$collectionIds` for `inCollections`. Empty qualify/eligible lists mean **all products** (unrestricted).

### Inputs by promo

| Promo | Settings |
|-------|----------|
| Hoodie bundles (always) | Collection + fixed revised price in **shop currency** |
| B2G1 / B1G50 / B1HG50Sw | Qualifying collection, discount-eligible collection, percent |
| Spend & Save % | CSV `spend\|percent` (shop-currency spend) |
| Spend & Save $ | CSV `spend\|discount-cents` (shop-currency spend + cents off) |

Shop-currency amounts (bundle price, spend thresholds, fixed cents) are converted with `presentmentCurrencyRate`.

## Skipped line items

Lines with attribute `_hoodie_bundle_exclude` (any value) are ignored.

## Discount classes

- **Product** for hoodie bundles / B2G1 / B1G50 / B1HG50Sw
- **Order** as well for spend & save
