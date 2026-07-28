import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { errorResult, jsonResult, supabaseForUser } from "../supabase";

export default defineTool({
  name: "post_case_comment",
  title: "Post case comment",
  description:
    "Post a comment on a Masterliste case (Vorgang). Choose `target` = 'chat' to post into the Vorgang-Chat (default), or 'note' to add an internal note. Backend RLS applies.",
  inputSchema: {
    case_id: z.string().optional().describe("Case UUID. Use either case_id or case_no."),
    case_no: z.string().optional().describe("Case number, e.g. VOR-2026-0123."),
    body: z.string().describe("Comment text. Plain text or markdown."),
    target: z.enum(["chat", "note"]).optional().describe("Where to post. Defaults to 'chat'."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async ({ case_id, case_no, body, target }, ctx) => {
    const scoped = supabaseForUser(ctx);
    if ("error" in scoped) return scoped.error;

    const id = case_id?.trim();
    const number = case_no?.trim();
    const text = body?.trim();
    const dest = target ?? "chat";
    if (!id && !number) return errorResult("Bitte case_id oder case_no angeben.");
    if (!text) return errorResult("Kommentartext darf nicht leer sein.");

    let lookup = scoped.client
      .from("cases")
      .select("id, case_no")
      .eq("deleted", false)
      .limit(1);
    lookup = id ? lookup.eq("id", id) : lookup.eq("case_no", number);
    const { data: caseRow, error: lookupErr } = await lookup.maybeSingle();
    if (lookupErr) return errorResult(lookupErr.message);
    if (!caseRow) return errorResult("Vorgang nicht gefunden oder nicht sichtbar.");

    const userId = scoped.userId;

    if (dest === "note") {
      const { data, error } = await scoped.client
        .from("case_notes")
        .insert({ case_id: caseRow.id, author_id: userId, body: text })
        .select("id, created_at")
        .single();
      if (error) return errorResult(error.message);
      return jsonResult(`Notiz auf ${caseRow.case_no} gespeichert.`, { case_id: caseRow.id, note: data });
    }

    const { data, error } = await scoped.client
      .from("case_chat_messages")
      .insert({ case_id: caseRow.id, author_id: userId, body: text })
      .select("id, created_at")
      .single();
    if (error) return errorResult(error.message);
    return jsonResult(`Chat-Nachricht auf ${caseRow.case_no} gepostet.`, { case_id: caseRow.id, message: data });
  },
});
