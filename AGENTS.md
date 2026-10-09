# Project Architecture Rules

- All standard tab bars use the shared `TabsList` horizontal overflow behavior so long navigation remains reachable without wrapping.
- CRM sales subnavigation deep-links with URL query parameters into existing list filters and creation dialogs to avoid duplicate workflows.
- The global search renders in a document-body portal above shell navigation so sidebar stacking contexts cannot obscure it.