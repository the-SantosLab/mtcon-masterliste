// Postmark Inbound Webhook -> attach email to case
// Auth: Basic Auth (username "postmark", password = POSTMARK_WEBHOOK_SECRET)
// URL pattern in Postmark:
//   https://postmark:<POSTMARK_WEBHOOK_SECRET>@<project>.supabase.co/functions/v1/receive-email

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("POSTMARK_WEBHOOK_SECRET")!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

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
    const pass = decoded.slice(idx + 1);
    return pass === WEBHOOK_SECRET && WEBHOOK_SECRET.length > 0;
  } catch {
    return false;
  }
}

// Extract case number (VOR-YYYY-NNNN) from "vorgang+VOR-2025-0001@inbox..." or subject
function extractCaseNo(payload: any): string | null {
  const re = /VOR-\d{4}-\d{4,}/i;

  // 1. Plus-tag in any To/Cc/Bcc address
  const addrFields = ["ToFull", "CcFull", "BccFull"];
  for (const f of addrFields) {
    const arr = payload?.[f];
    if (Array.isArray(arr)) {
      for (const a of arr) {
        const email: string = a?.Email || "";
        const plus = email.match(/\+([^@]+)@/);
        if (plus) {
          const m = plus[1].match(re);
          if (m) return m[0].toUpperCase();
        }
        const m2 = email.match(re);
        if (m2) return m2[0].toUpperCase();
      }
    }
  }

  // 2. MailboxHash (Postmark parses "+xxx" into this)
  const hash: string = payload?.MailboxHash || "";
  if (hash) {
    const m = hash.match(re);
    if (m) return m[0].toUpperCase();
  }

  // 3. Subject fallback
  const subj: string = payload?.Subject || "";
  const m3 = subj.match(re);
  if (m3) return m3[0].toUpperCase();

  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }
  if (!checkAuth(req)) return unauthorized();

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400, headers: corsHeaders });
  }

  const messageId: string | null = payload?.MessageID || payload?.MessageId || null;
  const fromEmail: string = payload?.FromFull?.Email || payload?.From || "unknown@unknown";
  const fromName: string | null = payload?.FromFull?.Name || null;
  const toEmail: string = payload?.OriginalRecipient || payload?.ToFull?.[0]?.Email || "";
  const subject: string = payload?.Subject || "(kein Betreff)";
  const bodyPlain: string = payload?.TextBody || "";
  const bodyHtml: string = payload?.HtmlBody || "";
  const receivedAt: string = payload?.Date ? new Date(payload.Date).toISOString() : new Date().toISOString();

  const caseNo = extractCaseNo(payload);
  if (!caseNo) {
    console.log("receive-email: no case_no found", { messageId, toEmail, subject });
    return new Response(JSON.stringify({ status: "ignored", reason: "no_case_no" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Lookup case
  const { data: caseRow, error: caseErr } = await admin
    .from("cases")
    .select("id, case_no")
    .eq("case_no", caseNo)
    .maybeSingle();

  if (caseErr) {
    console.error("receive-email: case lookup failed", caseErr);
    return new Response(JSON.stringify({ error: "case_lookup_failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!caseRow) {
    console.log("receive-email: case not found", caseNo);
    return new Response(JSON.stringify({ status: "ignored", reason: "case_not_found", caseNo }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Dedup by message_id
  if (messageId) {
    const { data: existing } = await admin
      .from("case_emails")
      .select("id")
      .eq("message_id", messageId)
      .maybeSingle();
    if (existing) {
      return new Response(JSON.stringify({ status: "duplicate" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  // Insert email row (displayed inline in notes panel; no case_notes row needed)
  const noteId = null;

  const { data: emailRow, error: emailErr } = await admin
    .from("case_emails")
    .insert({
      case_id: caseRow.id,
      note_id: noteId,
      message_id: messageId,
      from_email: fromEmail,
      from_name: fromName,
      to_email: toEmail,
      subject,
      body_plain: bodyPlain,
      body_html: bodyHtml,
      received_at: receivedAt,
      raw: payload,
    })
    .select("id")
    .single();

  if (emailErr) {
    console.error("receive-email: email insert failed", emailErr);
    return new Response(JSON.stringify({ error: "email_insert_failed", detail: emailErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Attachments
  const atts: any[] = Array.isArray(payload?.Attachments) ? payload.Attachments : [];
  for (const att of atts) {
    try {
      const name: string = att.Name || "attachment.bin";
      const mime: string = att.ContentType || "application/octet-stream";
      const content: string = att.Content || ""; // base64
      const bytes = Uint8Array.from(atob(content), (c) => c.charCodeAt(0));
      const path = `${caseRow.id}/email/${emailRow.id}/${Date.now()}-${name}`;
      const { error: upErr } = await admin.storage
        .from("case-attachments")
        .upload(path, bytes, { contentType: mime, upsert: false });
      if (upErr) {
        console.error("receive-email: attachment upload failed", upErr.message);
        continue;
      }
      await admin.from("case_email_attachments").insert({
        email_id: emailRow.id,
        case_id: caseRow.id,
        file_name: name,
        mime_type: mime,
        size_bytes: bytes.byteLength,
        storage_path: path,
      });
    } catch (e) {
      console.error("receive-email: attachment error", e);
    }
  }

  // Activity log
  await admin.from("case_activity").insert({
    case_id: caseRow.id,
    action: "email_received",
    field: "email",
    new_value: subject,
    message: `E-Mail empfangen von ${fromEmail}`,
  });

  return new Response(
    JSON.stringify({ status: "ok", case_id: caseRow.id, email_id: emailRow.id }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
