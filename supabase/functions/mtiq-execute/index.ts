// MTIQ AI – execute user-confirmed proposed actions with the user's JWT (RLS applies)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Action = { id: string; tool: string; args: any; vorgang_id: string; status?: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const client = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userRes } = await client.auth.getUser();
    const user = userRes?.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json();
    const message_id: string = body.message_id;
    const decision: "confirm" | "cancel" = body.decision ?? "confirm";

    if (!message_id) {
      return new Response(JSON.stringify({ error: "message_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: msg, error: msgErr } = await client.from("ai_messages")
      .select("id, vorgang_id, user_id, metadata")
      .eq("id", message_id).maybeSingle();
    if (msgErr || !msg) {
      return new Response(JSON.stringify({ error: "Nachricht nicht gefunden" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (msg.user_id !== user.id) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const meta = (msg.metadata ?? {}) as any;
    const actions: Action[] = meta.proposed_actions ?? [];
    if (!actions.length) {
      return new Response(JSON.stringify({ error: "Keine Aktionen zu diesem Vorschlag" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const pending = actions.filter(a => (a.status ?? "pending") === "pending");
    if (!pending.length) {
      return new Response(JSON.stringify({ error: "Bereits verarbeitet" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const vorgang_id = msg.vorgang_id;

    if (decision === "cancel") {
      const updated = actions.map(a => a.status === "pending" ? { ...a, status: "cancelled" } : a);
      await client.from("ai_messages").update({ metadata: { ...meta, proposed_actions: updated } }).eq("id", message_id);
      await client.from("ai_messages").insert({
        vorgang_id, user_id: user.id, role: "assistant",
        content: "Vorschlag verworfen.",
        metadata: { kind: "cancellation" },
      });
      return new Response(JSON.stringify({ ok: true, cancelled: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const results: { id: string; ok: boolean; summary: string; error?: string }[] = [];

    for (const a of pending) {
      try {
        const args = a.args ?? {};
        if (a.vorgang_id !== vorgang_id) throw new Error("Vorgang-ID Mismatch");

        if (a.tool === "set_case_status") {
          const { error } = await client.from("cases").update({ status: args.status, last_changed_by: user.id, last_changed_at: new Date().toISOString() }).eq("id", vorgang_id);
          if (error) throw error;
          results.push({ id: a.id, ok: true, summary: `Status → ${args.status}` });
        } else if (a.tool === "set_case_urgency") {
          const { error } = await client.from("cases").update({ urgency: args.urgency, last_changed_by: user.id, last_changed_at: new Date().toISOString() }).eq("id", vorgang_id);
          if (error) throw error;
          results.push({ id: a.id, ok: true, summary: `Chilis → ${args.urgency}🌶` });
        } else if (a.tool === "create_subtask") {
          const { error } = await client.from("case_tasks").insert({
            case_id: vorgang_id, title: args.title, description: args.description ?? null,
            due_at: args.due_at ?? null, urgency: args.urgency ?? 0, status: "open", created_by: user.id,
          });
          if (error) throw error;
          results.push({ id: a.id, ok: true, summary: `Unteraufgabe angelegt: ${args.title}` });
        } else if (a.tool === "update_subtask") {
          const patch: any = {};
          if (args.status !== undefined) patch.status = args.status;
          if (args.title !== undefined) patch.title = args.title;
          if (args.urgency !== undefined) patch.urgency = args.urgency;
          const { error } = await client.from("case_tasks").update(patch).eq("id", args.subtask_id).eq("case_id", vorgang_id);
          if (error) throw error;
          results.push({ id: a.id, ok: true, summary: `Unteraufgabe aktualisiert (${Object.keys(patch).join(", ")})` });
        } else if (a.tool === "add_case_note") {
          const { error } = await client.from("case_notes").insert({
            case_id: vorgang_id, body: args.body, author_id: user.id, pinned: !!args.pinned,
          });
          if (error) throw error;
          results.push({ id: a.id, ok: true, summary: `Notiz hinzugefügt` });
        } else if (a.tool === "post_case_chat") {
          const { error } = await client.from("case_chat_messages").insert({
            case_id: vorgang_id, author_id: user.id, body: args.body,
          });
          if (error) throw error;
          results.push({ id: a.id, ok: true, summary: `Vorgang-Chat-Nachricht gepostet` });
        } else {
          throw new Error(`Unbekanntes Tool: ${a.tool}`);
        }
      } catch (e) {
        results.push({ id: a.id, ok: false, summary: `Fehler bei ${a.tool}`, error: (e as Error).message });
      }
    }

    const updated = actions.map(a => {
      const r = results.find(x => x.id === a.id);
      if (!r) return a;
      return { ...a, status: r.ok ? "executed" : "failed", result_summary: r.summary, error: r.error ?? null };
    });

    await client.from("ai_messages").update({ metadata: { ...meta, proposed_actions: updated } }).eq("id", message_id);

    const summary = results.map(r => `${r.ok ? "✓" : "✗"} ${r.summary}`).join("\n");
    await client.from("ai_messages").insert({
      vorgang_id, user_id: user.id, role: "assistant",
      content: results.every(r => r.ok) ? `Erledigt:\n${summary}` : `Teilweise ausgeführt:\n${summary}`,
      metadata: { kind: "execution_result", results },
    });

    return new Response(JSON.stringify({ ok: true, results }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("mtiq-execute error", e);
    return new Response(JSON.stringify({ error: (e as Error).message ?? "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
