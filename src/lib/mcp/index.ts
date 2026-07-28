import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listCasesTool from "./tools/list-cases";
import getCaseSummaryTool from "./tools/get-case-summary";
import listProjectsTool from "./tools/list-projects";
import listSupportTicketsTool from "./tools/list-support-tickets";
import claimCaseTool from "./tools/claim-case";
import setCaseStatusTool from "./tools/set-case-status";
import postCaseCommentTool from "./tools/post-case-comment";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "mtcon-masterliste-mcp",
  title: "MTCON Masterliste",
  version: "0.2.0",
  instructions:
    "Tools for MTCON Masterliste. Read tools inspect cases, projects, and internal support tickets. Write tools let the signed-in user claim/release Vorgänge, change their status, and post chat messages or notes. Existing app roles, visibility rules, and backend RLS remain authoritative.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    listCasesTool,
    getCaseSummaryTool,
    listProjectsTool,
    listSupportTicketsTool,
    claimCaseTool,
    setCaseStatusTool,
    postCaseCommentTool,
  ],
});