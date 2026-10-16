# Project Architecture Rules

- All standard tab bars use the shared `TabsList` horizontal overflow behavior so long navigation remains reachable without wrapping.
- CRM sales subnavigation deep-links with URL query parameters into existing list filters and creation dialogs to avoid duplicate workflows.
- The global search renders in a document-body portal above shell navigation so sidebar stacking contexts cannot obscure it.
- Sidebar presentation state (scroll position and expanded navigation) is retained per user across page remounts by the shared navigation hook, preventing route changes from resetting the menu.
- Subcontracting is a separate order type using a shared order/receipt view; stock changes run through role-checked atomic RPCs and the existing stock movement trigger, preventing client edits and double posting.
- Subcontract returns are booked only in Purchasing's goods receipt tab with an idempotency key; separate receipt records preserve existing required purchase-order references without changing normal purchasing behavior.