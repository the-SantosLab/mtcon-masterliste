import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { clampLimit, errorResult, jsonResult, sanitizeSearch, supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_support_tickets",
  title: "List support tickets",
  description: "List visible internal support tickets for the signed-in user, optionally filtered by search text or status.",
  inputSchema: {
    query: z.string().optional().describe("Optional search text for ticket number, title, or description."),
    status: z.string().optional().describe("Optional exact support ticket status filter."),
    limit: z.number().optional().describe("Maximum number of rows to return. The server clamps this to a safe range."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query, status, limit }, ctx) => {
    const scoped = supabaseForUser(ctx);
    if ("error" in scoped) return scoped.error;

    const safeLimit = clampLimit(limit);
    const search = sanitizeSearch(query);
    let request = scoped.client
      .from("support_tickets")
      .select("id, ticket_number, title, description, status, priority, source, route, assigned_to, reporter_user_id, case_id, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(safeLimit);

    if (status?.trim()) request = request.eq("status", status.trim());
    if (search) request = request.or(`ticket_number.ilike.%${search}%,title.ilike.%${search}%,description.ilike.%${search}%`);

    const { data, error } = await request;
    if (error) return errorResult(error.message);

    const rows = data ?? [];
    return jsonResult(
      rows.length ? `Gefundene Support-Tickets: ${rows.length}` : "Keine sichtbaren Support-Tickets gefunden.",
      { support_tickets: rows },
    );
  },
});