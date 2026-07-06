// MTIQ Duplikat-Scan: analysiert offene Vorgänge und identifiziert mögliche Duplikate.
// Nutzt Kandidatenpaarbildung (gleicher Kunde/Projekt oder Titel-Überlappung), dann LLM-Bewertung.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type CaseRow = {
  id: string; case_no: string | null; project_name: string | null; client_name: string | null;
  customer_no: string | null; project_id: string | null; department_id: string | null;
  status: string; note: string | null; created_at: string;
};

function tokenize(s: string | null): Set<string> {
  return new Set((s ?? "").toLowerCase().replace(/[^\wäöüß ]+/g, " ").split(/\s+/).filter(w => w.length > 3));
}
function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
    const auth = req.headers.get("Authorization") ?? "";
    const client = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
    const { data: userData } = await client.auth.getUser();
    const user = userData?.user;
    if (!user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const body = await req.json().catch(() => ({}));
    const maxCases = Math.min(Number(body.limit ?? 400), 800);
    const minSim = Number(body.min_similarity ?? 0.35);

    const { data: rows, error } = await client
      .from("cases")
      .select("id, case_no, project_name, client_name, customer_no, project_id, department_id, status, note, created_at")
      .eq("deleted", false)
      .not("status", "in", "(abgeschlossen,archiv,verworfen)")
      .order("created_at", { ascending: false })
      .limit(maxCases);
    if (error) throw error;
    const cases = (rows ?? []) as CaseRow[];

    // Kandidatenpaare bilden: gleicher Kunde ODER gleiches Projekt ODER Titel-Jaccard >= minSim
    const tokensById = new Map<string, Set<string>>();
    for (const c of cases) tokensById.set(c.id, tokenize(`${c.project_name ?? ""} ${c.note ?? ""}`));

    const pairs: { a: CaseRow; b: CaseRow; sim: number; reason: string[] }[] = [];
    for (let i = 0; i < cases.length; i++) {
      for (let j = i + 1; j < cases.length; j++) {
        const a = cases[i], b = cases[j];
        const reasons: string[] = [];
        const sameCustomer = !!(a.customer_no && b.customer_no && a.customer_no === b.customer_no);
        const sameProject = !!(a.project_id && b.project_id && a.project_id === b.project_id);
        const sim = jaccard(tokensById.get(a.id)!, tokensById.get(b.id)!);
        if (sameCustomer) reasons.push("gleicher Kunde");
        if (sameProject) reasons.push("gleiches Projekt");
        if (sim >= minSim) reasons.push(`Titel-Ähnlichkeit ${(sim * 100).toFixed(0)}%`);
        if (!reasons.length) continue;
        // Kombi-Bedingung: mind. Ähnlichkeit oder (gleicher Kunde UND Ähnlichkeit >= minSim/2)
        if (sim >= minSim || (sameCustomer && sim >= minSim / 2) || (sameProject && sim >= minSim / 2)) {
          pairs.push({ a, b, sim, reason: reasons });
        }
      }
    }
    // Sortieren, cappen
    pairs.sort((x, y) => y.sim - x.sim);
    const capped = pairs.slice(0, 40);

    if (capped.length === 0) {
      return new Response(JSON.stringify({ pairs: [], total_scanned: cases.length }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // LLM-Bewertung als Batch
    const promptPairs = capped.map((p, i) => ({
      index: i,
      a: { case_no: p.a.case_no, title: p.a.project_name, kunde: p.a.client_name, kundennr: p.a.customer_no, projekt_id: p.a.project_id, note: (p.a.note ?? "").slice(0, 300) },
      b: { case_no: p.b.case_no, title: p.b.project_name, kunde: p.b.client_name, kundennr: p.b.customer_no, projekt_id: p.b.project_id, note: (p.b.note ?? "").slice(0, 300) },
      hinweise: p.reason,
    }));

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "Du bist MTIQ. Bewerte, ob zwei Vorgänge tatsächlich denselben Sachverhalt beschreiben (Duplikat). Antworte NUR als JSON-Array. Keine Prosa." },
          { role: "user", content: `Bewerte jedes Paar. Für jedes Paar liefere: {"index": n, "duplicate": true|false, "confidence": 0..1, "reason": "kurze Begründung", "keep": "a"|"b" (welcher als Ziel behalten werden sollte, i.d.R. der ältere/mit mehr Kontext)}. Liste offener Paare:\n${JSON.stringify(promptPairs)}` },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (aiResp.status === 429 || aiResp.status === 402) {
      return new Response(JSON.stringify({ error: aiResp.status === 429 ? "Zu viele Anfragen. Bitte später erneut versuchen." : "AI-Guthaben aufgebraucht." }), { status: aiResp.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!aiResp.ok) {
      const t = await aiResp.text();
      console.error("AI gateway error", aiResp.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const aiJson = await aiResp.json();
    let parsed: any = {};
    try { parsed = JSON.parse(aiJson?.choices?.[0]?.message?.content ?? "{}"); } catch { parsed = {}; }
    const evaluations: any[] = Array.isArray(parsed) ? parsed : (parsed.results ?? parsed.pairs ?? parsed.data ?? []);

    const out = capped.map((p, i) => {
      const ev = evaluations.find((e: any) => Number(e?.index) === i) ?? {};
      return {
        a: { id: p.a.id, case_no: p.a.case_no, title: p.a.project_name, kunde: p.a.client_name, status: p.a.status, created_at: p.a.created_at },
        b: { id: p.b.id, case_no: p.b.case_no, title: p.b.project_name, kunde: p.b.client_name, status: p.b.status, created_at: p.b.created_at },
        signals: p.reason,
        similarity: Number(p.sim.toFixed(3)),
        duplicate: !!ev.duplicate,
        confidence: Number(ev.confidence ?? 0),
        reason: String(ev.reason ?? ""),
        target: ev.keep === "b" ? p.b.id : p.a.id,
      };
    }).filter(x => x.duplicate && x.confidence >= 0.4)
      .sort((a, b) => b.confidence - a.confidence);

    return new Response(JSON.stringify({ pairs: out, total_scanned: cases.length, evaluated: capped.length }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("mtiq-duplicate-scan error", e);
    return new Response(JSON.stringify({ error: e?.message ?? "internal" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
