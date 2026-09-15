# Bulk edit metafields

Admin action for bulk product metafield edits from the product index (or a single product’s More actions).

## Flow
1. Select products > More actions > **Bulk edit metafields**
2. Add one or more **changes** (metafield + Add/Update/Remove/Clear + values)
3. See a **sample of current values** for each selected metafield
4. **Review** - dry-run stats and examples per change
5. **Apply all changes** - sequential writes; session-only result summary (no re-run)

## Features
- All product metafield types (pickers for product/collection/variant/metaobject; GID paste for other refs; measurement/money/rating/link/json editors)
- Multi-rule batching
- CSV / paste import for list values
- Dry-run confirmation before write
