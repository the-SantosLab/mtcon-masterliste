# Project Architecture Rules

- All standard tab bars use the shared `TabsList` horizontal overflow behavior so long navigation remains reachable without wrapping.
- CRM acquisition subnavigation uses dedicated workflow routes backed by shared CRM data and existing creation dialogs; other sales subnavigation uses URL filters to avoid duplicate workflows.
- Acquisition suggestions share a deterministic rule engine; MTIQ may refine only visible candidate IDs, and saving always requires user confirmation into existing CRM activities to prevent autonomous outreach.
- The global search renders in a document-body portal above shell navigation so sidebar stacking contexts cannot obscure it.
- Sidebar presentation state (scroll position and expanded navigation) is retained per user across page remounts by the shared navigation hook, preventing route changes from resetting the menu.
- Subcontracting uses one shared order/receipt view for standalone orders and linked workshop steps; stock changes run through role-checked atomic RPCs and the existing movement triggers to prevent double posting.
- Linked workshop subcontract steps transfer unconsumed material to a supplier warehouse and back to the workshop warehouse; a database trigger blocks workshop consumption, completion and cancellation until steps are returned or cancelled to prevent lost or duplicate stock.
- Subcontract returns are booked only in Purchasing's goods receipt tab with an idempotency key; separate receipt records preserve existing required purchase-order references without changing normal purchasing behavior.