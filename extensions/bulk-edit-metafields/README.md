# Bulk edit metafields

Admin action for bulk product metafield edits from the product index (or a single product’s More actions).

## Flow
1. Select products > More actions > **Bulk edit metafields**
2. Choose product scope: **Currently selected**, **Search / filter query**, or **All products**
3. Add one or more **changes** (metafield + Add/Update/Remove/Clear + values)
4. See a **sample of current values** for each selected metafield
5. **Review** - dry-run stats and examples per change
6. **Apply all changes** - sequential writes; session-only result summary (no re-run)

Tip: Shopify "Select all results" only passes ~50 IDs to app actions. Use **Search / filter query** with the same filter, then **Load products**, to update the full filtered set.

## Features
- All product metafield types (pickers for product/collection/variant/metaobject; GID paste for other refs; measurement/money/rating/link/json editors)
- Multi-rule batching
- CSV / paste import for list values
- Dry-run confirmation before write
