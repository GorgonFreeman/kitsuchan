v1: Set + Delete only (scalars + list scalars). Add/Remove items later.

1. Select your products
1. More actions menu
1. "Bulk edit metafields" summons a popup
1. Select metafield from a dropdown of defined metafields
   - Given button options based on which metafield is selected - "Delete" "Set" for all, "Add items" "Remove items" for lists
   - Depending on metafield type, given an input field.
   - If Delete, just "To delete namespace.key for X products, type "delete".
   - If set, a type-aware input field.
   - If list, each item becomes a pill, and pressing X removes it.
   - Entering the same thing twice, it doesn't save.
   - Submit button becomes active once a valid input is entered. Disabled before anything is entered.
1. If error, show error text and allow user to change input.
1. If success, show spinner and say "Editing metafields…"
1. Success/error screen.
   - When showing an error say "Note that some changes may have gone through. Please review for partial updates."
