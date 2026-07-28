import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { errorResult, jsonResult, supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_case_summary",
  title: "Get case summary",
  description: "Get one visible case with its current metadata and subtasks for the signed-in user.",
  inputSchema: {
    case_id: z.string().optional().describe("Case UUID. Use either case_id or case_no."),
    case_no: z.string().optional().describe("Case number. Use either case_id or case_no."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ case_id, case_no }, ctx) => {
    const scoped = supabaseForUser(ctx);
    if ("error" in scoped) return scoped.error;

    const id = case_id?.trim();
    const number = case_no?.trim();
    if (!id && !number) return errorResult("Bitte case_id oder case_no angeben.");

    let caseRequest = scoped.client
      .from("cases")
      .select("id, case_no, project_name, client_name, customer_no, status, due_at, created_at, note, closure_summary, assignee_id, department_id, project_id")
      .eq("deleted", false)
      .limit(1);

    caseRequest = id ? caseRequest.eq("id", id) : caseRequest.eq("case_no", number);

    const { data: caseRow, error: caseError } = await caseRequest.maybeSingle();
    if (caseError) return errorResult(caseError.message);
    if (!caseRow) return errorResult("Vorgang nicht gefunden oder nicht sichtbar.");

    const { data: tasks, error: tasksError } = await scoped.client
      .from("case_tasks")
      .select("id, title, description, status, completed, sort_order, assignee_id, due_at")
      .eq("case_id", caseRow.id)
      .order("sort_order", { ascending: true });

    if (tasksError) return errorResult(tasksError.message);

    return jsonResult(`Vorgang ${caseRow.case_no}: ${caseRow.project_name}`, {
      case: caseRow,
      tasks: tasks ?? [],
    });
  },
});