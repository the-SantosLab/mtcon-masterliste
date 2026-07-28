import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { errorResult, jsonResult, supabaseForUser } from "../supabase";

export default defineTool({
  name: "claim_case",
  title: "Claim case",
  description:
    "Assign a Masterliste case (Vorgang) to the signed-in user. If `release` is true, the user releases the case (only when currently assigned to them). RLS rules from the app apply.",
  inputSchema: {
    case_id: z.string().optional().describe("Case UUID. Use either case_id or case_no."),
    case_no: z.string().optional().describe("Case number, e.g. VOR-2026-0123."),
    release: z.boolean().optional().describe("Set true to release/unclaim the case instead of claiming it."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async ({ case_id, case_no, release }, ctx) => {
    const scoped = supabaseForUser(ctx);
    if ("error" in scoped) return scoped.error;

    const id = case_id?.trim();
    const number = case_no?.trim();
    if (!id && !number) return errorResult("Bitte case_id oder case_no angeben.");

    let lookup = scoped.client
      .from("cases")
      .select("id, case_no, project_name, assignee_id")
      .eq("deleted", false)
      .limit(1);
    lookup = id ? lookup.eq("id", id) : lookup.eq("case_no", number);
    const { data: caseRow, error: lookupErr } = await lookup.maybeSingle();
    if (lookupErr) return errorResult(lookupErr.message);
    if (!caseRow) return errorResult("Vorgang nicht gefunden oder nicht sichtbar.");

    const now = new Date().toISOString();
    const userId = scoped.userId;

    if (release) {
      if (caseRow.assignee_id && caseRow.assignee_id !== userId) {
        return errorResult("Vorgang ist einer anderen Person zugewiesen.");
      }
      const { error } = await scoped.client
        .from("cases")
        .update({ assignee_id: null, last_changed_by: userId, last_changed_at: now })
        .eq("id", caseRow.id);
      if (error) return errorResult(error.message);
      await scoped.client.from("case_activity").insert({ case_id: caseRow.id, action: "UNCLAIM", actor_id: userId });
      return jsonResult(`Vorgang ${caseRow.case_no} freigegeben.`, { case_id: caseRow.id, released: true });
    }

    if (caseRow.assignee_id && caseRow.assignee_id !== userId) {
      return errorResult("Vorgang ist bereits einer anderen Person zugewiesen.");
    }

    const { data, error } = await scoped.client
      .from("cases")
      .update({ assignee_id: userId, last_changed_by: userId, last_changed_at: now })
      .eq("id", caseRow.id)
      .is("assignee_id", null)
      .select("id, case_no, project_name");

    if (error) return errorResult(error.message);
    if (!data || data.length === 0) {
      if (caseRow.assignee_id === userId) {
        return jsonResult(`Vorgang ${caseRow.case_no} war bereits dir zugewiesen.`, { case_id: caseRow.id, already_assigned: true });
      }
      return errorResult("Vorgang wurde in der Zwischenzeit vergeben.");
    }
    await scoped.client.from("case_activity").insert({ case_id: caseRow.id, action: "CLAIM", actor_id: userId });
    return jsonResult(`Vorgang ${caseRow.case_no} übernommen.`, { case: data[0] });
  },
});
