// MTIQ Prozess-Tablet (Visitenkarte)
// Aktionen:
//  - create   : Tablet aus den Extraktions-Daten (mtiq-business-card-intake) anlegen
//  - step     : MTIQ den aktuellen Schritt ausführen lassen (Ergebnis -> awaiting_review)
//  - approve  : Schritt vom Menschen freigegeben -> done, nächster Schritt aktiv
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type StepStatus = "locked" | "ready" | "running" | "awaiting_review" | "done" | "error";
interface StepEntry { n: number; title: string; status: StepStatus; result: any; approved_by?: string | null; approved_at?: string | null; error?: string | null; }

const STEP_TITLES = [
  "Erfassung & Strukturierung",
  "Validierung & Anreicherung",
  "Dublettenprüfung",
  "Klassifizierung & Priorisierung",
  "CRM-Anlage",
  "Begrüßungs- / Follow-up-Mail",
  "Kontext & Historie",
  "Workflow-Übergabe",
];

function emptySteps(initial: any): StepEntry[] {
  return STEP_TITLES.map((title, i) => ({
    n: i + 1,
    title,
    status: i === 0 ? "awaiting_review" : "locked",
    result: i === 0 ? initial : null,
  }));
}

function domainOf(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = String(value).trim().toLowerCase();
  if (!v) return null;
  if (v.includes("@")) return v.split("@").pop() || null;
  try { const u = new URL(v.startsWith("http") ? v : `https://${v}`); return u.hostname.replace(/^www\./, ""); } catch { return null; }
}
function tokensOf(name: string | null | undefined): string[] {
  if (!name) return [];
  return name.toLowerCase()
    .replace(/\b(gmbh|ag|kg|ohg|ug|co\.?|inc|ltd|llc|sa|bv|gbr|e\.k\.|& ?co)\b/g, " ")
    .split(/[\s,.&\-]+/).map(t => t.trim()).filter(t => t.length >= 3);
}

async function aiJson(systemPrompt: string, userPrompt: string, apiKey: string): Promise<any> {
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
      response_format: { type: "json_object" },
    }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`AI gateway ${r.status}: ${t.slice(0, 200)}`);
  }
  const j = await r.json();
  const raw = j?.choices?.[0]?.message?.content ?? "{}";
  try { return typeof raw === "string" ? JSON.parse(raw) : raw; }
  catch { const m = String(raw).match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : {}; }
}

function mapKindToCompany(kind: string): { type: string; partner_role: string } {
  switch ((kind || "").toLowerCase()) {
    case "kunde":        return { type: "kunde",       partner_role: "customer" };
    case "lieferant":    return { type: "kunde",       partner_role: "supplier" };
    case "partner":
    case "vertriebspartner":
    case "distributor":  return { type: "distributor", partner_role: "both" };
    default:             return { type: "mitbewerber", partner_role: "lead" };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userRes } = await userClient.auth.getUser();
    if (!userRes?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userId = userRes.user.id;
    const admin = createClient(supabaseUrl, serviceKey);

    const body = await req.json();
    const action: "create" | "step" | "approve" = body?.action;
    if (!action) throw new Error("action required");

    // ---------- CREATE ----------
    if (action === "create") {
      const extracted = body?.extracted ?? {};
      const source = body?.source_file_path ?? null;
      const { data, error } = await admin.from("mtiq_tablets").insert({
        kind: "business_card",
        status: "in_progress",
        current_step: 1,
        extracted,
        steps: emptySteps(extracted),
        source_file_path: source,
        created_by: userId,
      }).select("*").single();
      if (error) throw error;
      return new Response(JSON.stringify({ tablet: data }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Load tablet
    const tabletId: string = body?.tablet_id;
    if (!tabletId) throw new Error("tablet_id required");
    const { data: tablet, error: loadErr } = await admin.from("mtiq_tablets").select("*").eq("id", tabletId).maybeSingle();
    if (loadErr || !tablet) throw new Error("Tablet nicht gefunden");

    const steps: StepEntry[] = Array.isArray(tablet.steps) ? tablet.steps : [];
    const extracted = { ...(tablet.extracted || {}), ...(body?.edits || {}) };

    // ---------- APPROVE ----------
    if (action === "approve") {
      const stepN: number = body?.step;
      if (!stepN || stepN < 1 || stepN > 8) throw new Error("invalid step");
      const idx = stepN - 1;
      steps[idx] = { ...steps[idx], status: "done", approved_by: userId, approved_at: new Date().toISOString() };
      // override with edits (e.g. user-edited step1 fields)
      if (stepN === 1 && body?.edits) {
        steps[idx].result = { ...(steps[idx].result || {}), ...body.edits };
      }
      const next = stepN < 8 ? stepN + 1 : 8;
      if (stepN < 8) {
        steps[next - 1] = { ...steps[next - 1], status: "ready" };
      }
      const isDone = stepN === 8;
      const { data: upd, error: updErr } = await admin.from("mtiq_tablets").update({
        steps, current_step: next, extracted, status: isDone ? "done" : "in_progress",
      }).eq("id", tabletId).select("*").single();
      if (updErr) throw updErr;
      return new Response(JSON.stringify({ tablet: upd }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ---------- STEP ----------
    if (action === "step") {
      const stepN: number = body?.step;
      if (!stepN || stepN < 1 || stepN > 8) throw new Error("invalid step");
      const idx = stepN - 1;
      steps[idx] = { ...steps[idx], status: "running", error: null };
      await admin.from("mtiq_tablets").update({ steps }).eq("id", tabletId);

      let result: any = null;
      try {
        if (stepN === 1) {
          // Strukturierung – einfach extrahierte Daten zurückgeben
          result = { ...extracted };
        } else if (stepN === 2) {
          // Validierung & Anreicherung
          const email = extracted.email || "";
          const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
          const emailDomain = domainOf(extracted.email);
          const webDomain = domainOf(extracted.website);
          const domainMatch = emailDomain && webDomain ? emailDomain === webDomain : null;
          const phone = (extracted.phone || extracted.mobile || "").replace(/[^\d+]/g, "");
          const phoneValid = phone.length >= 6;
          const enrichment = await aiJson(
            `Du bist MTIQ-Anreicherer. Antworte nur mit JSON:
{"industry":"Branche oder null","size":"Mitarbeiterzahl-Schätzung oder null","hq":"Hauptstandort oder null","linkedin":"LinkedIn-Firmenprofil URL oder null","summary":"1 Satz Geschäftstätigkeit"}`,
            `Firma: ${extracted.company_name ?? "?"}\nWebsite: ${extracted.website ?? "?"}\nLand: ${extracted.country ?? "?"}\nStadt: ${extracted.city ?? "?"}`,
            LOVABLE_API_KEY,
          ).catch((e) => ({ error: String(e).slice(0, 200) }));
          result = { email_valid: emailValid, phone_valid: phoneValid, domain_match: domainMatch, enrichment };
        } else if (stepN === 3) {
          // Dublettenprüfung
          const emailDomain = domainOf(extracted.email);
          const webDomain = domainOf(extracted.website);
          const domain = emailDomain || webDomain;
          const tokens = tokensOf(extracted.company_name);
          const map = new Map<string, { company: any; score: number; reasons: string[] }>();
          const bump = (c: any, s: number, r: string) => { const cur = map.get(c.id); if (cur) { cur.score += s; cur.reasons.push(r); } else map.set(c.id, { company: c, score: s, reasons: [r] }); };
          if (extracted.email) {
            const { data } = await admin.from("companies").select("id,name,customer_no,email,website,billing_city").ilike("email", extracted.email).limit(5);
            (data || []).forEach(c => bump(c, 10, `gleiche E-Mail`));
          }
          if (domain) {
            const { data } = await admin.from("companies").select("id,name,customer_no,email,website,billing_city").ilike("website", `%${domain}%`).limit(10);
            (data || []).forEach(c => bump(c, 6, `Domain ${domain}`));
          }
          if (tokens.length) {
            const orExpr = tokens.map(t => `name.ilike.%${t}%`).join(",");
            const { data } = await admin.from("companies").select("id,name,customer_no,email,website,billing_city").or(orExpr).limit(15);
            (data || []).forEach(c => { const lower = (c.name || "").toLowerCase(); const hits = tokens.filter(t => lower.includes(t)).length; if (hits > 0) bump(c, hits * 3, `Name-Treffer`); });
          }
          let contact_match: any = null;
          if (extracted.email) {
            const { data: cm } = await admin.from("contacts").select("id,first_name,last_name,email,company_id").ilike("email", extracted.email).limit(1).maybeSingle();
            if (cm) contact_match = cm;
          }
          const candidates = Array.from(map.values()).sort((a, b) => b.score - a.score).slice(0, 5)
            .map(c => ({ id: c.company.id, name: c.company.name, customer_no: c.company.customer_no, city: c.company.billing_city, score: c.score, reasons: c.reasons }));
          result = { candidates, contact_match, has_duplicates: candidates.length > 0 || !!contact_match };
        } else if (stepN === 4) {
          // Klassifizierung & Scoring
          const classification = await aiJson(
            `Du bist MTIQ-Klassifikator. Antworte nur mit JSON:
{"kind":"kunde|lieferant|partner|interessent","score":0-100,"reason":"kurze Begründung"}`,
            `Person: ${extracted.first_name ?? ""} ${extracted.last_name ?? ""} – ${extracted.position ?? ""}\nFirma: ${extracted.company_name ?? ""}\nWebsite: ${extracted.website ?? ""}\nNotizen: ${extracted.notes ?? ""}`,
            LOVABLE_API_KEY,
          ).catch((e) => ({ kind: "interessent", score: 50, reason: `Auto-Fallback (${String(e).slice(0, 100)})` }));
          result = classification;
        } else if (stepN === 5) {
          // CRM-Anlage
          const step3Result = steps[2]?.result || {};
          const step4Result = steps[3]?.result || {};
          const attachCompanyId: string | null = body?.attach_company_id ?? null;
          let companyId = tablet.company_id || attachCompanyId;
          let customerNo: string | null = null;

          if (!companyId) {
            // neue Firma anlegen
            const name = (extracted.company_name || "").trim();
            if (!name) throw new Error("Firmenname fehlt – bitte in Schritt 1 ergänzen.");
            const mapping = mapKindToCompany(step4Result?.kind || "interessent");
            const { data: noData, error: noErr } = await admin.rpc("gen_next_customer_no");
            if (noErr) throw noErr;
            customerNo = String(noData);
            const { data: comp, error: cErr } = await admin.from("companies").insert({
              name,
              type: mapping.type,
              partner_role: mapping.partner_role,
              customer_no: customerNo,
              email: extracted.email || null,
              phone: extracted.mobile || extracted.phone || null,
              website: extracted.website || null,
              vat_id: extracted.vat_id || null,
              billing_street: extracted.street || null,
              billing_zip: extracted.zip || null,
              billing_city: extracted.city || null,
              billing_country: extracted.country || null,
              notes: extracted.notes || null,
              owner_id: userId,
              created_by: userId,
              last_changed_by: userId,
              is_active: true,
              shipping_same_as_billing: true,
            }).select("id, customer_no").single();
            if (cErr) throw cErr;
            companyId = comp.id;
            customerNo = comp.customer_no;
          } else {
            const { data: comp } = await admin.from("companies").select("customer_no").eq("id", companyId).maybeSingle();
            customerNo = comp?.customer_no ?? null;
          }

          // Kontakt
          let contactId: string | null = tablet.contact_id;
          const lastName = (extracted.last_name || "").trim();
          const firstName = (extracted.first_name || "").trim();
          if (!contactId && (lastName || firstName || extracted.email)) {
            const { data: ct, error: ctErr } = await admin.from("contacts").insert({
              company_id: companyId,
              first_name: firstName || "—",
              last_name: lastName || (extracted.email ? extracted.email.split("@")[0] : "—"),
              email: extracted.email || null,
              phone: extracted.mobile || extracted.phone || null,
              position: extracted.position || null,
            }).select("id").single();
            if (ctErr) throw ctErr;
            contactId = ct.id;
          }
          await admin.from("mtiq_tablets").update({ company_id: companyId, contact_id: contactId }).eq("id", tabletId);
          result = { company_id: companyId, contact_id: contactId, customer_no: customerNo, created_new: !attachCompanyId && !tablet.company_id };
        } else if (stepN === 6) {
          // Mail-Entwurf
          const draft = await aiJson(
            `Du bist MTIQ und schreibst zwei deutschsprachige E-Mail-Entwürfe nach einem persönlichen Treffen / einer Messe.
Antworte nur mit JSON:
{"greeting":{"subject":"Betreff","body":"komplette Mail mit Anrede und Grußformel"},"followup":{"subject":"Betreff","body":"komplette Mail"}}`,
            `Empfänger: ${extracted.first_name ?? ""} ${extracted.last_name ?? ""} (${extracted.position ?? "–"}), ${extracted.company_name ?? ""}.\nBranche: ${steps[1]?.result?.enrichment?.industry ?? "unbekannt"}\nZusammenfassung: ${steps[1]?.result?.enrichment?.summary ?? ""}`,
            LOVABLE_API_KEY,
          ).catch((e) => ({ error: String(e).slice(0, 200) }));
          result = draft;
        } else if (stepN === 7) {
          // Kontext & Historie
          const { data: profile } = await admin.from("users_profile").select("first_name, last_name, short_code").eq("id", userId).maybeSingle();
          const companyId = tablet.company_id;
          let activityId: string | null = null;
          if (companyId) {
            const { data: act } = await admin.from("crm_activities").insert({
              kind: "note",
              subject: "Visitenkarte erfasst (MTIQ)",
              notes: `Erfasst über MTIQ Prozess-Tablet am ${new Date().toLocaleString("de-DE")}\nQuelle: ${tablet.source_file_path || "Upload im Panel"}`,
              company_id: companyId,
              contact_id: tablet.contact_id,
              owner_id: userId,
              created_by: userId,
            }).select("id").maybeSingle();
            activityId = act?.id ?? null;
          }
          result = {
            captured_by: profile ? `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() : "Unbekannt",
            captured_at: new Date().toISOString(),
            source: tablet.source_file_path || "MTIQ Panel",
            activity_id: activityId,
          };
        } else if (stepN === 8) {
          // Workflow-Übergabe – Wiedervorlage als case_task an Ersteller
          const due = new Date(); due.setDate(due.getDate() + 3);
          const { data: task } = await admin.from("case_tasks").insert({
            title: `Wiedervorlage Visitenkarte: ${extracted.first_name ?? ""} ${extracted.last_name ?? ""} (${extracted.company_name ?? ""})`,
            description: `Automatisch erzeugt aus MTIQ Prozess-Tablet ${tablet.id}.`,
            assigned_to: userId,
            created_by: userId,
            due_date: due.toISOString().slice(0, 10),
            status: "open",
            priority: "normal",
          }).select("id").maybeSingle().then((r) => r).catch(() => ({ data: null }) as any);
          result = {
            handover: "Wiedervorlage erstellt",
            task_id: task?.id ?? null,
            due_date: due.toISOString().slice(0, 10),
            pipeline_hint: "Verfügbar im CRM unter Aktivitäten und Aufgaben.",
          };
        }

        steps[idx] = { ...steps[idx], status: "awaiting_review", result, error: null };
      } catch (e) {
        steps[idx] = { ...steps[idx], status: "error", error: (e as Error).message };
      }

      const { data: upd, error: updErr } = await admin.from("mtiq_tablets").update({ steps, extracted }).eq("id", tabletId).select("*").single();
      if (updErr) throw updErr;
      return new Response(JSON.stringify({ tablet: upd }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    throw new Error("unknown action");
  } catch (e) {
    console.error("mtiq-tablet error", e);
    return new Response(JSON.stringify({ error: (e as Error).message ?? "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
