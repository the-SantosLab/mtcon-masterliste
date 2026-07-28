import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ToolContext, ToolHandlerResult } from "@lovable.dev/mcp-js";

type ClientResult =
  | { client: SupabaseClient; userId: string }
  | { error: ToolHandlerResult };

export function errorResult(message: string): ToolHandlerResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

export function jsonResult(text: string, structuredContent: Record<string, unknown>): ToolHandlerResult {
  return {
    content: [{ type: "text", text }],
    structuredContent,
  };
}

export function clampLimit(value: number | undefined, fallback = 20, max = 50) {
  if (!Number.isFinite(value)) return fallback;
  const rounded = Math.trunc(value ?? fallback);
  return Math.min(Math.max(rounded, 1), max);
}

export function sanitizeSearch(value: string | undefined) {
  return value?.trim().replace(/[,%]/g, " ").replace(/\s+/g, " ") || undefined;
}

export function supabaseForUser(ctx: ToolContext): ClientResult {
  if (!ctx.isAuthenticated()) return { error: errorResult("Nicht authentifiziert.") };

  const token = ctx.getToken();
  const userId = ctx.getUserId();
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!token || !userId) return { error: errorResult("OAuth-Token ist ungültig.") };
  if (!url || !key) return { error: errorResult("Backend-Umgebung ist nicht vollständig konfiguriert.") };

  return {
    userId,
    client: createClient(url, key, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    }),
  };
}