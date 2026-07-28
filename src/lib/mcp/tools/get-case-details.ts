import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { clampLimit, errorResult, jsonResult, supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_case_details",
  title: "Get case details",
  description:
    "Detaillierte Metadaten eines einzelnen Vorgangs (Status, Fälligkeit, Zuweisung, Abteilung, Bearbeitungsvermerke) inklusive letzter Änderungen aus dem Aktivitätsprotokoll. Sichtbarkeit folgt den RLS-Regeln des eingeloggten Users.",
  inputSchema: {
    case_id: z.string().optional().describe("Vorgangs-UUID. Entweder case_id oder case_no angeben."),
    case_no: z.string().optional().describe("Vorgangsnummer (z. B. VOR-2026-0784)."),
    activity_limit: z
      .number()
      .int()
      .optional()
      .describe("Maximale Anzahl letzter Aktivitäten (1-50, Standard 10)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ case_id, case_no, activity_limit }, ctx) => {
    const scoped = supabaseForUser(ctx);
    if ("error" in scoped) return scoped.error;

    const id = case_id?.trim();
    const number = case_no?.trim();
    if (!id && !number) return errorResult("Bitte case_id oder case_no angeben.");

    const limit = clampLimit(activity_limit, 10, 50);

    let caseRequest = scoped.client
      .from("cases")
      .select(
        "id, case_no, project_name, client_name, customer_no, status, urgency, effective_urgency, priority_order, received_at, due_at, planned_week, started_at, completed_at, closed_at, archived_at, assignee_id, department_id, project_id, internal_area_code, product_code, project_article_no, quantity, estimated_hours, note, closure_summary, closure_outputs, sequential_mode, lock_mode, watchers, watcher_departments, visibility, version, created_by, created_at, last_changed_by, last_changed_at, closed_by, archived_by",
      )
      .eq("deleted", false)
      .limit(1);

    caseRequest = id ? caseRequest.eq("id", id) : caseRequest.eq("case_no", number);

    const { data: caseRow, error: caseError } = await caseRequest.maybeSingle();
    if (caseError) return errorResult(caseError.message);
    if (!caseRow) return errorResult("Vorgang nicht gefunden oder nicht sichtbar.");

    const { data: activity, error: activityError } = await scoped.client
      .from("case_activity")
      .select("id, action, field, old_value, new_value, message, actor_id, task_id, created_at")
      .eq("case_id", caseRow.id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (activityError) return errorResult(activityError.message);

    const lastActivityAt = activity?.[0]?.created_at ?? null;

    return jsonResult(
      `Vorgang ${caseRow.case_no} — Status ${caseRow.status}` +
        (caseRow.last_changed_at ? `, zuletzt geändert ${caseRow.last_changed_at}` : ""),
      {
        case: caseRow,
        last_changed_at: caseRow.last_changed_at,
        last_changed_by: caseRow.last_changed_by,
        last_activity_at: lastActivityAt,
        recent_activity: activity ?? [],
      },
    );
  },
});
