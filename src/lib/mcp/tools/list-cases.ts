import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { clampLimit, errorResult, jsonResult, sanitizeSearch, supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_cases",
  title: "List cases",
  description: "List visible Masterliste cases for the signed-in user, optionally filtered by search text or status.",
  inputSchema: {
    query: z.string().optional().describe("Optional search text for case number, project name, or client name."),
    status: z.string().optional().describe("Optional exact case status filter."),
    limit: z.number().optional().describe("Maximum number of rows to return. The server clamps this to a safe range."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query, status, limit }, ctx) => {
    const scoped = supabaseForUser(ctx);
    if ("error" in scoped) return scoped.error;

    const safeLimit = clampLimit(limit);
    const search = sanitizeSearch(query);
    let request = scoped.client
      .from("cases")
      .select("id, case_no, project_name, client_name, status, due_at, created_at, assignee_id, department_id")
      .eq("deleted", false)
      .order("created_at", { ascending: false })
      .limit(safeLimit);

    if (status?.trim()) request = request.eq("status", status.trim());
    if (search) request = request.or(`case_no.ilike.%${search}%,project_name.ilike.%${search}%,client_name.ilike.%${search}%`);

    const { data, error } = await request;
    if (error) return errorResult(error.message);

    const rows = data ?? [];
    return jsonResult(
      rows.length ? `Gefundene Vorgänge: ${rows.length}` : "Keine sichtbaren Vorgänge gefunden.",
      { cases: rows },
    );
  },
});