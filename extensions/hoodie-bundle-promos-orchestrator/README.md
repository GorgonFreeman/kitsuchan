# Hoodie Bundle Promos Orchestrator (Shopify Function)

One discount function that runs the **Hoodie Bundle (any 2 from collection → $100)** alongside a daily promo, choosing the combination that maximises customer value.

## Promo types (`promoType` in function configuration metafield)

| Value | Behaviour |
|-------|-----------|
| `none` | Hoodie pairs only (cheapest 2 first), proportional attribution |
| `b2g1` | Buy 2 Get 1 Free (cheapest free, multi-use). Mutually exclusive with hoodie pairs; picks the plan with higher total discount |
| `b1g50` | Buy 1 Get 1 50% off (cheapest gets 50%, multi-use). Competes with hoodie pairs |
| `hoodie_sweatpants_50` | Full-price hoodie qualifies cheapest sweatpants for 50% off. Competes with hoodie pairs |
| `spend_save_percent` | Hoodie pairs first (product discounts); discounted prices count toward spend tiers → order % off |
| `spend_save_fixed` | Same as above → order fixed $ off |

## Spend & Save tiers (by presentment currency family)

**Percent**

| Market | Tier 1 | Tier 2 | Tier 3 |
|--------|--------|--------|--------|
| AU (AUD) | $75 → 20% | $150 → 25% | $200 → 30% |
| US (USD) | $50 → 20% | $100 → 25% | $150 → 30% |
| UK (GBP) | £40 → 20% | £75 → 25% | £100 → 30% |

**Fixed**

| Market | Tier 1 | Tier 2 | Tier 3 |
|--------|--------|--------|--------|
| AU | $75 → $15 | $150 → $40 | $200 → $60 |
| US | $50 → $10 | $100 → $25 | $150 → $45 |
| UK | £40 → £10 | £75 → £20 | £100 → £30 |

## Configuration metafield (`$app` / `function-configuration`)

```json
{
  "hoodieCollectionIds": ["gid://shopify/Collection/..."],
  "sweatpantsCollectionIds": ["gid://shopify/Collection/..."],
  "hoodieBundlePrice": 100,
  "promoType": "none",
  "messages": {
    "hoodieBundle": "Hoodie Bundle 2 for $100",
    "b2g1": "Buy 2 Get 1 Free",
    "b1g50": "Buy 1 Get 1 50% Off",
    "hoodieSweatpants50": "50% off sweatpants with hoodie",
    "spendSavePercent": "Spend & Save",
    "spendSaveFixed": "Spend & Save"
  }
}
```

Each promo has its own checkout/order discount message via `messages.*`. Legacy single-title fields (`discountTitle`, `hoodieBundleTitle`) still work as fallbacks.

- `hoodieBundlePrice` is in **shop currency**; converted with `presentmentCurrencyRate` (no per-market bundle pricing).
- Input variables: pass `hoodieCollectionIds` and `sweatpantsCollectionIds` the same way the old extension passed `collectionIds`.

## Skipped line items

Lines with attribute `_hoodie_bundle_exclude` (any value) are ignored.

## Discount classes

- Enable **Product** for hoodie bundles / B2G1 / B1G50 / hoodie+sweatpants.
- Enable **Order** as well for spend & save (order-level after product discounts).

## How competition works

For promos that share units with hoodie pairs (`b2g1`, `b1g50`, `hoodie_sweatpants_50`):

1. Plan A: maximise hoodie pairs, then apply promo on leftovers.
2. Plan B: maximise the daily promo groups, then pair remaining hoodies.
3. Apply the plan with the larger total discount (cents).

Spend & save always applies hoodie pairs first; the post-discount unit prices feed the spend threshold.
