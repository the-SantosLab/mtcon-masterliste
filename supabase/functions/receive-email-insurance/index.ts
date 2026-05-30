// Postmark Inbound Webhook -> Insurance Policy Intake
// Receives an email with PDF attachment(s), extracts policy fields via AI,
// stores PDF in `insurance-documents` bucket, creates draft `insurance_policies` row.
//
// Auth: Basic Auth (username "postmark", password = POSTMARK_WEBHOOK_SECRET)
// Routed here from `receive-email-mtiq` when MailboxHash = "insurance" or
// the recipient address starts with "insurance@" / "versicherung@".

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

const SYSTEM_PROMPT = `Du bist ein Assistent zur Extraktion strukturierter Daten aus deutschen Versicherungspolicen (PDF).
Gib NUR valides JSON zurück, exakt mit diesem Schema:
{
  "name": "Kurzname der Police (z.B. 'Betriebshaftpflicht Sach')",
  "provider": "Versicherungsgesellschaft oder null",
  "policy_number": "Policennummer/Versicherungsschein-Nr oder null",
  "insured_object": "Versichertes Objekt/Risiko oder null",
  "description": "Kurze Beschreibung in 1-2 Sätzen oder null",
  "start_date": "YYYY-MM-DD oder null",
  "end_date": "YYYY-MM-DD oder null",
  "renewal_date": "YYYY-MM-DD oder null",
  "notice_period_days": Zahl oder null,
  "premium_amount": Zahl oder null,
  "premium_currency": "EUR|USD|... default EUR",
  "premium_interval": "yearly|monthly|quarterly|one_time" ,
  "contact_name": "Ansprechpartner beim Versicherer oder null",
  "contact_email": "E-Mail oder null",
  "contact_phone": "Telefon oder null",
  "tags": ["Stichwort1", "Stichwort2"],
  "category_hint": "EXAKT einer der folgenden Werte: Versicherungen, Cyber, KFZ, Personen, Sonstige, Transportversicherung, Betriebliche Krankenversicherung, Betriebshaftpflicht, Sachversicherung",
  "reasoning": "1-2 Sätze, warum diese Kategorie gewählt wurde"
}
Wenn Daten nicht im Dokument stehen, nutze null. Halluziniere nichts.`;

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
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180) || "anhang.pdf";
}

function b64ToUint8(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function extractWithAI(pdfB64: string, filename: string): Promise<any> {
  if (!LOVABLE_API_KEY) return {};
  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: `Analysiere folgende Versicherungspolice (Dateiname: ${filename}). Antworte nur mit JSON.` },
              { type: "file", file: { filename, file_data: `data:application/pdf;base64,${pdfB64}` } },
            ],
          },
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

async function categoryIdByName(name: string | null): Promise<string | null> {
  if (!name) return null;
  const { data } = await admin
    .from("insurance_categories")
    .select("id, name")
    .ilike("name", name.trim())
    .maybeSingle();
  if (data) return data.id;
  // fallback: Sonstige
  const { data: fb } = await admin
    .from("insurance_categories")
    .select("id")
    .eq("name", "Sonstige")
    .maybeSingle();
  return fb?.id ?? null;
}

function clamp<T>(v: T | undefined | null, def: T | null = null): T | null {
  return (v ?? def) as T | null;
}

function safeDate(v: any): string | null {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

function safeNum(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
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
  const attachments: any[] = Array.isArray(payload?.Attachments) ? payload.Attachments : [];

  const pdfs = attachments.filter((a) => {
    const ct = String(a?.ContentType || "").toLowerCase();
    const nm = String(a?.Name || "").toLowerCase();
    return ct === "application/pdf" || nm.endsWith(".pdf");
  });

  if (pdfs.length === 0) {
    return new Response(JSON.stringify({ status: "no_pdf", message: "Keine PDF-Anhänge gefunden" }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const year = new Date().getFullYear().toString();
  const created: Array<{ policy_id: string; file: string }> = [];
  const errors: any[] = [];

  for (const att of pdfs) {
    try {
      const filename = safeFilename(att?.Name || "police.pdf");
      const b64: string = att?.Content || "";
      if (!b64) continue;
      const bytes = b64ToUint8(b64);
      const fileSize = bytes.byteLength;
      const uid = crypto.randomUUID();
      const storagePath = `intake/${year}/${uid}-${filename}`;

      // Dedup: same messageId + filename already imported?
      if (messageId) {
        const { data: dup } = await admin
          .from("insurance_policies")
          .select("id")
          .eq("source", "email_intake")
          .ilike("notes", `%${messageId}%`)
          .limit(1);
        if (dup && dup.length > 0) {
          continue;
        }
      }

      // 1) Upload
      const { error: upErr } = await admin.storage
        .from("insurance-documents")
        .upload(storagePath, bytes, { contentType: "application/pdf", upsert: false });
      if (upErr) throw new Error(`storage upload: ${upErr.message}`);

      // 2) AI extraction
      const ai = await extractWithAI(b64, filename);

      // 3) Map category
      const categoryId = await categoryIdByName(ai?.category_hint);

      const intervalAllowed = ["yearly", "monthly", "quarterly", "one_time"];
      const interval = intervalAllowed.includes(String(ai?.premium_interval))
        ? ai.premium_interval
        : "yearly";

      const noteHeader = [
        `[KI-Import aus E-Mail]`,
        `Von: ${fromEmail}`,
        `Betreff: ${subject}`,
        messageId ? `MessageID: ${messageId}` : null,
        ai?.reasoning ? `KI-Begründung: ${ai.reasoning}` : null,
      ].filter(Boolean).join("\n");

      // 4) Insert policy (draft)
      const insertPayload: any = {
        name: String(ai?.name || filename.replace(/\.pdf$/i, "")).slice(0, 300),
        provider: clamp(ai?.provider),
        policy_number: clamp(ai?.policy_number),
        description: clamp(ai?.description),
        insured_object: clamp(ai?.insured_object),
        start_date: safeDate(ai?.start_date),
        end_date: safeDate(ai?.end_date),
        renewal_date: safeDate(ai?.renewal_date),
        notice_period_days: safeNum(ai?.notice_period_days) ?? 90,
        premium_amount: safeNum(ai?.premium_amount),
        premium_currency: clamp(ai?.premium_currency, "EUR") || "EUR",
        premium_interval: interval,
        contact_name: clamp(ai?.contact_name),
        contact_email: clamp(ai?.contact_email),
        contact_phone: clamp(ai?.contact_phone),
        tags: Array.isArray(ai?.tags) ? ai.tags.slice(0, 12).map((t: any) => String(t)) : [],
        category_id: categoryId,
        status: "draft",
        source: "email_intake",
        notes: noteHeader,
      };

      const { data: pol, error: polErr } = await admin
        .from("insurance_policies")
        .insert(insertPayload)
        .select("id")
        .single();
      if (polErr) {
        // Cleanup uploaded file on failure
        await admin.storage.from("insurance-documents").remove([storagePath]);
        throw new Error(`policy insert: ${polErr.message}`);
      }

      // 5) Link document
      const { error: docErr } = await admin.from("insurance_documents").insert({
        policy_id: pol.id,
        storage_path: storagePath,
        file_name: filename,
        file_size: fileSize,
        mime_type: "application/pdf",
        doc_kind: "police",
        is_current: true,
      });
      if (docErr) {
        console.error("doc link failed", docErr);
      }

      created.push({ policy_id: pol.id, file: filename });
    } catch (e) {
      console.error("intake attachment failed", e);
      errors.push({ file: att?.Name, error: String(e) });
    }
  }

  return new Response(JSON.stringify({ status: "ok", created, errors }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
