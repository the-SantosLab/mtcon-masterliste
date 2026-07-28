# MCP-Tools — Referenz für Vorgangs-Aktionen

Diese Tools werden vom MTCON-Masterliste-MCP-Server bereitgestellt und laufen mit dem OAuth-Token des eingeloggten Users. Es gelten dieselben RLS-, Sichtbarkeits- und Rollenregeln wie in der UI. Alle Tools identifizieren einen Vorgang wahlweise über `case_id` (UUID) oder `case_no` (z. B. `VOR-2026-0784`).

Gemeinsame Rückgabestruktur (MCP `ToolHandlerResult`):
- `content[0].text` — kurze, menschenlesbare Zusammenfassung
- `structuredContent` — maschinenlesbares JSON (unten je Tool dokumentiert)
- `isError: true` bei Fehlern; `content[0].text` enthält dann die Fehlermeldung auf Deutsch

---

## 1) `claim_case` — Vorgang übernehmen oder freigeben

Weist einen Vorgang dem eingeloggten User zu bzw. gibt ihn frei.

### Parameter

| Name       | Typ       | Pflicht | Beschreibung |
|------------|-----------|---------|--------------|
| `case_id`  | string    | einer von beiden | UUID des Vorgangs |
| `case_no`  | string    | einer von beiden | Vorgangsnummer, z. B. `VOR-2026-0123` |
| `release`  | boolean   | nein    | `true` = freigeben (nur wenn aktuell mir zugewiesen). Default `false` |

### Verhalten
- **Übernehmen**: Nur möglich, wenn der Vorgang unassigned ist. Ist er bereits einer anderen Person zugewiesen → Fehler. Ist er bereits mir zugewiesen → Erfolg mit `already_assigned: true` (idempotent).
- **Freigeben**: Nur möglich, wenn der Vorgang aktuell mir zugewiesen ist.
- Setzt `last_changed_by` / `last_changed_at` und schreibt einen Eintrag ins `case_activity`-Log (`CLAIM` bzw. `UNCLAIM`).

### `structuredContent`
- Übernahme: `{ "case": { "id": "…", "case_no": "…", "project_name": "…" } }`
- Bereits zugewiesen: `{ "case_id": "…", "already_assigned": true }`
- Freigabe: `{ "case_id": "…", "released": true }`

### Beispiele

```json
// Übernehmen per Nummer
{ "name": "claim_case", "arguments": { "case_no": "VOR-2026-0784" } }
```

```json
// Freigeben per UUID
{ "name": "claim_case", "arguments": { "case_id": "3f2a…", "release": true } }
```

---

## 2) `set_case_status` — Status ändern

Ändert den Status eines Vorgangs. Erlaubte Werte:

`nicht_begonnen`, `in_planung`, `in_arbeit`, `in_verzug`, `abgeschlossen`, `verworfen`, `archiv`, `ready_for_review`, `blocked`

### Parameter

| Name       | Typ    | Pflicht | Beschreibung |
|------------|--------|---------|--------------|
| `case_id`  | string | einer von beiden | UUID des Vorgangs |
| `case_no`  | string | einer von beiden | Vorgangsnummer |
| `status`   | string | ja      | Neuer Status (siehe Liste) |
| `note`     | string | nein    | Kurze Bemerkung, landet im Aktivitätslog |

### Verhalten
- Unbekannter Status → Fehler mit vollständiger Liste erlaubter Werte.
- **`abgeschlossen`** ist nur möglich, wenn keine offenen `case_tasks` mehr vorhanden sind (Status ≠ `done`). Sonst Fehler `„… offene Unteraufgabe(n).“`.
- Bei `abgeschlossen` werden zusätzlich `completed_at`, `closed_by`, `closed_at` gesetzt.
- Aktivitätslog: `action = STATUS` bzw. `CLOSE`, mit `field=status`, `old_value`, `new_value` und optional `message = note`.

### `structuredContent`
```json
{ "case": { "id": "…", "case_no": "VOR-2026-0784", "status": "in_arbeit" } }
```

### Beispiele

```json
// Auf "in Arbeit" setzen
{ "name": "set_case_status",
  "arguments": { "case_no": "VOR-2026-0784", "status": "in_arbeit" } }
```

```json
// Vorgang abschließen mit Vermerk (nur wenn keine offenen Unteraufgaben)
{ "name": "set_case_status",
  "arguments": { "case_no": "VOR-2026-0784",
                 "status": "abgeschlossen",
                 "note": "Kundenfreigabe per E-Mail vom 28.07." } }
```

```json
// Blockieren
{ "name": "set_case_status",
  "arguments": { "case_id": "3f2a…", "status": "blocked", "note": "Wartet auf Lieferantenrückmeldung" } }
```

---

## 3) `post_case_comment` — Chat-Nachricht oder interne Notiz

Postet einen Beitrag am Vorgang. Zielort per `target` wählbar.

### Parameter

| Name       | Typ                 | Pflicht | Beschreibung |
|------------|---------------------|---------|--------------|
| `case_id`  | string              | einer von beiden | UUID des Vorgangs |
| `case_no`  | string              | einer von beiden | Vorgangsnummer |
| `body`     | string              | ja      | Inhalt (Plain Text oder Markdown). Leer → Fehler |
| `target`   | `"chat"` \| `"note"` | nein   | `chat` (Default) = Vorgangs-Chat, `note` = interne Notiz |

### Verhalten
- `chat` → Insert in `case_chat_messages` (`author_id = user`).
- `note` → Insert in `case_notes` (`author_id = user`).
- Sichtbarkeit für den Chat: RLS via `can_access_case_chat`. Sichtbarkeit für Notizen: Standard-RLS des Vorgangs.

### `structuredContent`
- Chat: `{ "case_id": "…", "message": { "id": "…", "created_at": "…" } }`
- Notiz: `{ "case_id": "…", "note": { "id": "…", "created_at": "…" } }`

### Beispiele

```json
// Standard: in den Vorgangs-Chat posten
{ "name": "post_case_comment",
  "arguments": { "case_no": "VOR-2026-0784",
                 "body": "Zeichnung geprüft, alles freigegeben." } }
```

```json
// Interne Notiz
{ "name": "post_case_comment",
  "arguments": { "case_no": "VOR-2026-0784",
                 "target": "note",
                 "body": "Interner Hinweis: Preisliste 2026 wurde verwendet." } }
```

---

## Fehlerbilder (alle Tools)

| Fehlermeldung | Ursache |
|---|---|
| `Nicht authentifiziert.` | Kein gültiges OAuth-Token übermittelt |
| `Bitte case_id oder case_no angeben.` | Beide Identifier leer |
| `Vorgang nicht gefunden oder nicht sichtbar.` | ID falsch **oder** RLS blockiert den Zugriff |
| `Vorgang ist bereits einer anderen Person zugewiesen.` | `claim_case` ohne `release` auf fremd zugewiesenen Vorgang |
| `Vorgang ist einer anderen Person zugewiesen.` | `claim_case` mit `release=true`, aber nicht mir zugewiesen |
| `Vorgang wurde in der Zwischenzeit vergeben.` | Race Condition beim Übernehmen |
| `Ungültiger Status. Erlaubt: …` | `set_case_status` mit unbekanntem Wert |
| `Vorgang kann nicht abgeschlossen werden: N offene Unteraufgabe(n).` | Abschluss bei offenen Subtasks blockiert |
| `Aktualisierung nicht erlaubt.` | RLS/Policy verweigert das Update |
| `Kommentartext darf nicht leer sein.` | `post_case_comment` mit leerem `body` |

---

## Typischer Ablauf aus einem Agent

1. `list_cases` oder `get_case_details` → Vorgang finden (`case_no`, aktueller Status, Assignee).
2. `claim_case` (falls unassigned) → Übernahme sichern.
3. Fachliche Arbeit; ggf. `post_case_comment` mit Zwischenstand.
4. `set_case_status` → `in_arbeit` / `ready_for_review` / `abgeschlossen`.
5. `get_case_details` → Ergebnis inkl. `last_changed_at` und Aktivitätslog verifizieren.
