// Shared helpers for MTIQ intake: similar-case retrieval, correction few-shot
// learning, and duplicate detection. All read-only — use a service-role client.
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export type SimilarCase = {
  id: string;
  case_no: string | null;
  project_name: string | null;
  client_name: string | null;
  customer_no: string | null;
  status: string | null;
  urgency: number | null;
  department_name: string | null;
};

export type Correction = {
  original: Record<string, unknown>;
  corrected: Record<string, unknown>;
};

const STOP_WORDS = new Set([
  "der", "die", "das", "und", "oder", "für", "von", "zum", "zur", "mit", "ohne",
  "ein", "eine", "einer", "eines", "den", "dem", "des", "im", "ist", "sind",
  "the", "and", "for", "of", "to", "in", "on", "at", "is", "are", "be", "an",
]);

function buildSearchTerms(text: string, maxTerms = 6): string {
  const tokens = (text || "")
    .toLowerCase()
    .replace(/[^\\p{L}\\p{N}\\s.@/-]/gu, " ")
    .split(/\s+/)
    .filter(w => w.length >= 3 && !STOP_WORDS.has(w));
  // Deduplicate, keep order, cap length
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tokens) {
    if (!seen.has(t)) { seen.add(t); out.push(t); }
    if (out.length >= maxTerms) break;
  }
  return out.join(" | ");
}

/**
 * Fetch up to `limit` cases that look similar to the given text using Postgres
 * websearch_to_tsquery against the GIN FTS index on cases.
 */
export async function getSimilarCases(
  supabaseUrl: string,
  serviceKey: string,
  text: string,
  limit = 20,
): Promise<SimilarCase[]> {
  const terms = buildSearchTerms(text);
  if (!terms) return [];
  const admin = createClient(supabaseUrl, serviceKey);
  try {
    const { data, error } = await admin
      .from("cases")
      .select("id, case_no, project_name, client_name, customer_no, status, urgency, departments:department_id(name)")
      .eq("deleted", false)
      .textSearch(
        // composite virtual column doesn't exist; use to_tsvector via .or with ilike fallback
        "project_name",
        terms,
        { type: "websearch", config: "german" },
      )
      .limit(limit);
    if (error) {
      // Fallback: ilike on first few terms
      return await ilikeFallback(admin, text, limit);
    }
    return (data ?? []).map((c: any) => ({
      id: c.id,
      case_no: c.case_no,
      project_name: c.project_name,
      client_name: c.client_name,
      customer_no: c.customer_no,
      status: c.status,
      urgency: c.urgency,
      department_name: c.departments?.name ?? null,
    }));
  } catch (_e) {
    return await ilikeFallback(admin, text, limit);
  }
}

async function ilikeFallback(admin: SupabaseClient, text: string, limit: number): Promise<SimilarCase[]> {
  const terms = buildSearchTerms(text, 3).split(" | ").filter(Boolean);
  if (!terms.length) return [];
  const ors = terms.map(t => `project_name.ilike.%${t}%,client_name.ilike.%${t}%,note.ilike.%${t}%`).join(",");
  const { data } = await admin
    .from("cases")
    .select("id, case_no, project_name, client_name, customer_no, status, urgency, departments:department_id(name)")
    .eq("deleted", false)
    .or(ors)
    .limit(limit);
  return (data ?? []).map((c: any) => ({
    id: c.id, case_no: c.case_no, project_name: c.project_name, client_name: c.client_name,
    customer_no: c.customer_no, status: c.status, urgency: c.urgency,
    department_name: c.departments?.name ?? null,
  }));
}

export function similarCasesPromptBlock(cases: SimilarCase[]): string {
  if (!cases.length) return "";
  const lines = cases.slice(0, 20).map(c => {
    const parts = [
      c.case_no ?? "-",
      c.project_name ?? "(ohne Titel)",
      c.client_name ? `Kunde: ${c.client_name}` : null,
      c.department_name ? `Abt.: ${c.department_name}` : null,
      c.status ? `Status: ${c.status}` : null,
    ].filter(Boolean);
    return `  • ${parts.join(" | ")}`;
  }).join("\n");
  return `\n\nÄhnliche bestehende Vorgänge (zur Orientierung — gleicher Stil, Abteilung, Tonalität):\n${lines}\n`;
}

/**
 * Find the most likely duplicate (if any) by checking customer_no + title overlap.
 * Returns null when nothing convincing is found.
 */
export function findDuplicate(
  cases: SimilarCase[],
  candidate: { title?: string; customer_no?: string | null; client_name?: string | null },
): SimilarCase | null {
  const cust = (candidate.customer_no ?? "").trim().toLowerCase();
  const client = (candidate.client_name ?? "").trim().toLowerCase();
  const title = (candidate.title ?? "").toLowerCase();
  const titleTokens = new Set(buildSearchTerms(title, 8).split(" | ").filter(Boolean));
  if (!titleTokens.size && !cust && !client) return null;

  let best: { c: SimilarCase; score: number } | null = null;
  for (const c of cases) {
    let score = 0;
    if (cust && (c.customer_no ?? "").toLowerCase() === cust) score += 3;
    if (client && (c.client_name ?? "").toLowerCase().includes(client)) score += 2;
    const projTokens = new Set(buildSearchTerms(c.project_name ?? "", 8).split(" | ").filter(Boolean));
    let overlap = 0;
    for (const t of titleTokens) if (projTokens.has(t)) overlap++;
    if (overlap >= 2) score += overlap;
    if (score >= 4 && (!best || score > best.score)) best = { c, score };
  }
  return best?.c ?? null;
}

/**
 * Pull the most recent 5 user corrections (original vs corrected) so the model
 * can learn from them as few-shot examples.
 */
export async function getRecentCorrections(
  supabaseUrl: string,
  serviceKey: string,
  limit = 5,
): Promise<Correction[]> {
  const admin = createClient(supabaseUrl, serviceKey);
  const { data, error } = await admin
    .from("mtiq_draft_corrections")
    .select("original_fields, corrected_fields")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data.map((r: any) => ({
    original: r.original_fields ?? {},
    corrected: r.corrected_fields ?? {},
  }));
}

export function correctionsPromptBlock(corrections: Correction[]): string {
  if (!corrections.length) return "";
  const samples = corrections.slice(0, 5).map((c, i) => {
    const orig = JSON.stringify(c.original, null, 0).slice(0, 600);
    const corr = JSON.stringify(c.corrected, null, 0).slice(0, 600);
    return `Beispiel ${i + 1}:\n  Mein Vorschlag: ${orig}\n  Korrektur: ${corr}`;
  }).join("\n\n");
  return `\n\nFrühere Korrekturen — so haben Nutzer meine Vorschläge angepasst (lerne daraus, mache es beim ersten Mal richtig):\n${samples}\n`;
}
