import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { errorResult, jsonResult, supabaseForUser } from "../supabase";

const ALLOWED = [
  "nicht_begonnen",
  "in_planung",
  "in_arbeit",
  "in_verzug",
  "abgeschlossen",
  "verworfen",
  "archiv",
  "ready_for_review",
  "blocked",
] as const;

export default defineTool({
  name: "set_case_status",
  title: "Set case status",
  description:
    "Change the status of a Masterliste case (Vorgang). Backend RLS and workflow rules apply. Allowed values: " +
    ALLOWED.join(", ") + ".",
  inputSchema: {
    case_id: z.string().optional().describe("Case UUID. Use either case_id or case_no."),
    case_no: z.string().optional().describe("Case number, e.g. VOR-2026-0123."),
    status: z.string().describe("New case status. See tool description for allowed values."),
    note: z.string().optional().describe("Optional short note added to the case activity log."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async ({ case_id, case_no, status, note }, ctx) => {
    const scoped = supabaseForUser(ctx);
    if ("error" in scoped) return scoped.error;

    const id = case_id?.trim();
    const number = case_no?.trim();
    const nextStatus = status?.trim();
    if (!id && !number) return errorResult("Bitte case_id oder case_no angeben.");
    if (!nextStatus || !(ALLOWED as readonly string[]).includes(nextStatus)) {
      return errorResult(`Ungültiger Status. Erlaubt: ${ALLOWED.join(", ")}.`);
    }

    let lookup = scoped.client
      .from("cases")
      .select("id, case_no, status")
      .eq("deleted", false)
      .limit(1);
    lookup = id ? lookup.eq("id", id) : lookup.eq("case_no", number);
    const { data: caseRow, error: lookupErr } = await lookup.maybeSingle();
    if (lookupErr) return errorResult(lookupErr.message);
    if (!caseRow) return errorResult("Vorgang nicht gefunden oder nicht sichtbar.");

    if (nextStatus === "abgeschlossen") {
      const { data: openTasks, error: tasksErr } = await scoped.client
        .from("case_tasks")
        .select("id")
        .eq("case_id", caseRow.id)
        .neq("status", "done");
      if (tasksErr) return errorResult(tasksErr.message);
      if (openTasks && openTasks.length > 0) {
        return errorResult(`Vorgang kann nicht abgeschlossen werden: ${openTasks.length} offene Unteraufgabe(n).`);
      }
    }

    const now = new Date().toISOString();
    const userId = scoped.userId;
    const patch: Record<string, unknown> = {
      status: nextStatus,
      last_changed_by: userId,
      last_changed_at: now,
    };
    if (nextStatus === "abgeschlossen") {
      patch.completed_at = now;
      patch.closed_by = userId;
      patch.closed_at = now;
    }

    const { data, error } = await scoped.client
      .from("cases")
      .update(patch)
      .eq("id", caseRow.id)
      .select("id, case_no, status");
    if (error) return errorResult(error.message);
    if (!data || data.length === 0) return errorResult("Aktualisierung nicht erlaubt.");

    await scoped.client.from("case_activity").insert({
      case_id: caseRow.id,
      action: nextStatus === "abgeschlossen" ? "CLOSE" : "STATUS",
      actor_id: userId,
      field: "status",
      old_value: caseRow.status,
      new_value: nextStatus,
      ...(note?.trim() ? { message: note.trim() } : {}),
    });

    return jsonResult(`Vorgang ${caseRow.case_no}: Status ${caseRow.status} → ${nextStatus}.`, { case: data[0] });
  },
});
