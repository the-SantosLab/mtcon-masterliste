// Postmark Inbound Webhook -> ISSOS / APS-Delta Intake
// Stores each attachment of an APS-Delta email as a separate row in
// public.issos_documents, with the original file in the private
// `issos-documents` storage bucket. The trigger email itself is also
// archived as an .eml snapshot so the source is fully traceable.
//
// Auth: Basic Auth (username "postmark", password = POSTMARK_WEBHOOK_SECRET)
// Routed here from `receive-email-mtiq` when MailboxHash matches
// "issos"/"aps-delta" or the recipient address starts with issos@/aps-delta@,
// or the subject/body strongly indicates APS-Delta content.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("POSTMARK_WEBHOOK_SECRET")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

const SYSTEM_PROMPT = `Du analysierst eine APS-Delta- / ISSOS-Eingangsdatei (PDF, CSV, XLSX o. ä.) eines MtCon-Lieferanten oder -Systems.
Antworte AUSSCHLIESSLICH mit JSON nach folgendem Schema:
{
  "document_type": "Kurzklassifikation, z.B. 'APS Delta Liste', 'Bedarfsmeldung', 'Lieferplan-Delta', 'Sonstiges'",
  "snapshot_date": "Stichtag des Dokuments YYYY-MM-DD oder null",
  "sender_hint": "Erkennbarer Absender/Werk/Standort oder null",
  "summary": "1-3 Sätze, was inhaltlich enthalten ist",
  "tags": ["max 8 kurze Stichworte"],
  "reasoning": "1-2 Sätze, warum dies als APS-Delta/ISSOS-Dokument eingeordnet wird"
}
Wenn Daten nicht ableitbar sind, nutze null. Halluziniere keine Zahlen.`;

function unauthorized() {
  return new Response("Unauthorized", {
    status: 401,
    headers: { ...corsHeaders, "WWW-Authenticate": 'Basic realm="postmark"' },
  });
}

function checkAuth(req: Request): boolean {
  const h = req.headers.get("authorization") || "";
  if (!h.toLowerCase().startsWith("basic ")) return false;
  try {
    const decoded = atob(h.slice(6).trim());
    const idx = decoded.indexOf(":");
    if (idx === -1) return false;
    return decoded.slice(idx + 1) === WEBHOOK_SECRET && WEBHOOK_SECRET.length > 0;
  } catch {
    return false;
  }
}

function safeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180) || "anhang.bin";
}

function b64ToUint8(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function safeDate(v: any): string | null {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

async function extractWithAI(att: { b64: string; name: string; mime: string }, context: string): Promise<any> {
  if (!LOVABLE_API_KEY) return {};
  try {
    const isPdf = att.mime.toLowerCase().includes("pdf") || att.name.toLowerCase().endsWith(".pdf");
    const userContent: any[] = [
      { type: "text", text: `Kontext der E-Mail:\n${context}\n\nAnalysiere die folgende Datei (${att.name}). Nur JSON.` },
    ];
    if (isPdf && att.b64) {
      userContent.push({
        type: "file",
        file: { filename: att.name, file_data: `data:application/pdf;base64,${att.b64}` },
      });
    }
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: isPdf ? "google/gemini-2.5-pro" : "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!resp.ok) {
      console.error("AI gateway error", resp.status, await resp.text());
      return {};
    }
    const json = await resp.json();
    const raw = json?.choices?.[0]?.message?.content ?? "{}";
    try {
      return typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch {
      const m = String(raw).match(/\{[\s\S]*\}/);
      return m ? JSON.parse(m[0]) : {};
    }
  } catch (e) {
    console.error("AI extract failed", e);
    return {};
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  if (!checkAuth(req)) return unauthorized();

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400, headers: corsHeaders });
  }

  const messageId: string | null = payload?.MessageID || payload?.MessageId || null;
  const subject: string = payload?.Subject || "(kein Betreff)";
  const fromEmail: string = payload?.FromFull?.Email || payload?.From || "unknown";
  const fromName: string | null = payload?.FromFull?.Name || null;
  const bodyPlain: string = payload?.TextBody || "";
  const bodyHtml: string = payload?.HtmlBody || "";
  const emailContext = `Von: ${fromName ? `${fromName} <${fromEmail}>` : fromEmail}
Betreff: ${subject}
${(bodyPlain || bodyHtml.replace(/<[^>]+>/g, " ")).slice(0, 1500)}`;
  const attachments: any[] = Array.isArray(payload?.Attachments) ? payload.Attachments : [];

  // Dedup: same message id already imported?
  if (messageId) {
    const { data: dup } = await admin
      .from("issos_documents")
      .select("id")
      .eq("source_email_message_id", messageId)
      .limit(1);
    if (dup && dup.length > 0) {
      return new Response(JSON.stringify({ status: "duplicate", count: dup.length }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  const intakeId = crypto.randomUUID();
  const year = new Date().getFullYear().toString();
  const created: Array<{ id: string; file: string }> = [];
  const errors: any[] = [];

  // 1) Persist every attachment as its own issos_documents row
  for (const att of attachments) {
    try {
      const filename = safeFilename(att?.Name || "anhang.bin");
      const mime: string = att?.ContentType || "application/octet-stream";
      const b64: string = att?.Content || "";
      if (!b64) continue;
      const bytes = b64ToUint8(b64);
      const fileSize = bytes.byteLength;
      const uid = crypto.randomUUID();
      const storagePath = `${year}/${intakeId}/${uid}-${filename}`;

      const { error: upErr } = await admin.storage
        .from("issos-documents")
        .upload(storagePath, bytes, { contentType: mime, upsert: false });
      if (upErr) throw new Error(`upload: ${upErr.message}`);

      const ai = await extractWithAI({ b64, name: filename, mime }, emailContext);

      const { data: row, error: insErr } = await admin
        .from("issos_documents")
        .insert({
          intake_id: intakeId,
          source_email_from: fromName ? `${fromName} <${fromEmail}>` : fromEmail,
          source_email_subject: subject,
          source_email_message_id: messageId,
          received_at: new Date().toISOString(),
          storage_path: storagePath,
          file_name: filename,
          mime_type: mime,
          file_size: fileSize,
          sender_hint: typeof ai?.sender_hint === "string" ? ai.sender_hint.slice(0, 200) : null,
          snapshot_date: safeDate(ai?.snapshot_date),
          document_type: typeof ai?.document_type === "string" ? ai.document_type.slice(0, 120) : "APS Delta",
          summary: typeof ai?.summary === "string" ? ai.summary.slice(0, 2000) : null,
          tags: Array.isArray(ai?.tags) ? ai.tags.slice(0, 12).map((t: any) => String(t).slice(0, 60)) : [],
          ai_reasoning: typeof ai?.reasoning === "string" ? ai.reasoning.slice(0, 1000) : null,
          status: "new",
        })
        .select("id")
        .single();
      if (insErr) {
        await admin.storage.from("issos-documents").remove([storagePath]);
        throw new Error(`insert: ${insErr.message}`);
      }
      created.push({ id: row.id, file: filename });
    } catch (e) {
      console.error("issos attachment failed", e);
      errors.push({ file: att?.Name, error: String(e) });
    }
  }

  // 2) Archive the trigger email as .eml so the source remains traceable
  try {
    const headerLines = [
      `From: ${fromName ? `${fromName} <${fromEmail}>` : fromEmail}`,
      `Subject: ${subject}`,
      `Date: ${payload?.Date || new Date().toUTCString()}`,
      messageId ? `Message-ID: ${messageId}` : null,
      "Content-Type: text/plain; charset=utf-8",
      "",
    ].filter(Boolean).join("\r\n");
    const emlContent = headerLines + "\r\n" + (bodyPlain || bodyHtml || "");
    const emlBytes = new TextEncoder().encode(emlContent);
    const safeSubject = safeFilename(subject || "trigger-email").slice(0, 80);
    const emlPath = `${year}/${intakeId}/trigger-${Date.now()}-${safeSubject}.eml`;
    const { error: emlErr } = await admin.storage
      .from("issos-documents")
      .upload(emlPath, emlBytes, { contentType: "message/rfc822", upsert: false });
    if (!emlErr) {
      await admin.from("issos_documents").insert({
        intake_id: intakeId,
        source_email_from: fromName ? `${fromName} <${fromEmail}>` : fromEmail,
        source_email_subject: subject,
        source_email_message_id: messageId,
        received_at: new Date().toISOString(),
        storage_path: emlPath,
        file_name: `Trigger-E-Mail – ${safeSubject}.eml`,
        mime_type: "message/rfc822",
        file_size: emlBytes.byteLength,
        document_type: "Trigger-E-Mail",
        summary: bodyPlain ? bodyPlain.slice(0, 600) : null,
        status: "new",
      });
    }
  } catch (e) {
    console.error("issos trigger eml failed", e);
  }

  return new Response(JSON.stringify({ status: "ok", intake_id: intakeId, created, errors }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
