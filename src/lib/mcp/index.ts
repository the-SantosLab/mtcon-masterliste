import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listCasesTool from "./tools/list-cases";
import getCaseSummaryTool from "./tools/get-case-summary";
import listProjectsTool from "./tools/list-projects";
import listSupportTicketsTool from "./tools/list-support-tickets";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "mtcon-masterliste-mcp",
  title: "MTCON Masterliste",
  version: "0.1.0",
  instructions:
    "Read-only tools for MTCON Masterliste. Use them to inspect cases, projects, and internal support tickets that the signed-in user is allowed to see. Existing app roles, visibility rules, and backend policies remain authoritative.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listCasesTool, getCaseSummaryTool, listProjectsTool, listSupportTicketsTool],
});