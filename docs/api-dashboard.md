# Masterliste REST-API (`api-dashboard`)

Basis-URL: `https://<projekt>.supabase.co/functions/v1/api-dashboard`

## Authentifizierung

- Alle Aufrufe: `Authorization: Bearer <DASHBOARD_API_KEY>`
- Alle **schreibenden** Aufrufe zusätzlich: `x-actor-id: <users_profile.id>`
  (muss ein aktiver Nutzer sein; wird als Ersteller/Bearbeiter und im Aktivitätsprotokoll gespeichert)

Ein Aufruf ohne `resource` liefert das Verzeichnis aller Ressourcen und Methoden

## Ressourcen

| Ressource | Methoden |
|---|---|
| `cases` | `GET` (Liste, `?id=` Einzelvorgang), `POST`, `PATCH ?id=`, `DELETE ?id=` (Soft-Delete) |
| `case_tasks` | `GET ?case_id=`, `POST`, `PATCH ?id=`, `DELETE ?id=` |
| `case_notes` | `GET ?case_id=`, `POST` |
| `case_chat` | `GET ?case_id=`, `POST` |
| `case_watchers` | `GET ?id=`, `PATCH ?id=` |
| `case_activity` | `GET ?case_id=` |
| `tickets` | `GET` |
| `ticket_messages` | `GET ?ticket_id=`, `POST` |
| `projects` | `GET` (Liste, `?id=`), `POST`, `PATCH ?id=` |
| `users`, `departments`, `stats` | `GET` |

### Filter für `cases`
`status`, `department_id`, `assignee_id`, `q` (Suche in Nummer/Projekt/Kunde), `include_deleted`, `limit` (max 1000), `offset`

## Beispiele

Vorgang anlegen:
```bash
curl -X POST "$BASE?resource=cases" \
  -H "Authorization: Bearer $KEY" \
  -H "x-actor-id: 00000000-0000-0000-0000-000000000000" \
  -H "Content-Type: application/json" \
  -d '{"project_name":"Testvorgang","client_name":"Muster GmbH","due_at":"2026-09-01","urgency":2}'
```

Status ändern:
```bash
curl -X PATCH "$BASE?resource=cases&id=<case-id>" \
  -H "Authorization: Bearer $KEY" -H "x-actor-id: <user-id>" \
  -H "Content-Type: application/json" -d '{"status":"in_arbeit"}'
```

Unteraufgabe anlegen und abschließen:
```bash
curl -X POST "$BASE?resource=case_tasks" ... -d '{"case_id":"<id>","title":"Zeichnung prüfen","department_id":"<dept>"}'
curl -X PATCH "$BASE?resource=case_tasks&id=<task-id>" ... -d '{"completed":true}'
```

Watcher setzen:
```bash
curl -X PATCH "$BASE?resource=case_watchers&id=<case-id>" ... \
  -d '{"watchers":["<user-id>"],"watcher_departments":["<dept-id>"]}'
```

## Hinweise

- Die API läuft mit Service-Role und umgeht damit RLS. Der Schlüssel ist wie ein Admin-Zugang zu behandeln.
- Eingaben werden per Zod validiert; ungültige Felder liefern `400` mit Feldfehlern.
- Beim Setzen von `status = abgeschlossen` werden `completed_at`, `closed_at`, `closed_by` automatisch gesetzt.
- Datenbank-Trigger (Nummernvergabe, Benachrichtigungen, Audit-Log) greifen wie in der App.
