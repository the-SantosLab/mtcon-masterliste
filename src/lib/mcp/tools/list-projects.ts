import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { clampLimit, errorResult, jsonResult, sanitizeSearch, supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_projects",
  title: "List projects",
  description: "List visible projects for the signed-in user, optionally filtered by search text or status.",
  inputSchema: {
    query: z.string().optional().describe("Optional search text for project number, code, or name."),
    status: z.string().optional().describe("Optional exact project status filter."),
    limit: z.number().optional().describe("Maximum number of rows to return. The server clamps this to a safe range."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query, status, limit }, ctx) => {
    const scoped = supabaseForUser(ctx);
    if ("error" in scoped) return scoped.error;

    const safeLimit = clampLimit(limit);
    const search = sanitizeSearch(query);
    let request = scoped.client
      .from("projects")
      .select("id, project_number, project_code, name, status, owner_id, department_id, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(safeLimit);

    if (status?.trim()) request = request.eq("status", status.trim());
    if (search) request = request.or(`project_number.ilike.%${search}%,project_code.ilike.%${search}%,name.ilike.%${search}%`);

    const { data, error } = await request;
    if (error) return errorResult(error.message);

    const rows = data ?? [];
    return jsonResult(
      rows.length ? `Gefundene Projekte: ${rows.length}` : "Keine sichtbaren Projekte gefunden.",
      { projects: rows },
    );
  },
});