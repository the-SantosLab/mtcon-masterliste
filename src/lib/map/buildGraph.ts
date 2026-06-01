import dagre from "dagre";
import type { Edge, Node } from "@xyflow/react";

export type MapNodeKind =
  | "case"
  | "project"
  | "company"
  | "deal"
  | "contact"
  | "person"
  | "department"
  | "custom";

export interface MapNodeData {
  kind: MapNodeKind;
  customKind?: string;
  title: string;
  subtitle?: string;
  color: string; // HSL triplet, e.g. "190 90% 55%"
  href?: string;
  raw?: any;
  [key: string]: unknown;
}

export const KIND_COLOR: Record<MapNodeKind, string> = {
  case: "38 95% 60%",
  project: "25 90% 55%",
  company: "150 70% 50%",
  deal: "320 85% 65%",
  contact: "265 80% 65%",
  person: "230 80% 70%",
  department: "200 60% 60%",
  custom: "180 70% 55%",
};

export const KIND_LABEL: Record<MapNodeKind, string> = {
  case: "VORGANG",
  project: "PROJEKT",
  company: "KUNDE",
  deal: "DEAL",
  contact: "KONTAKT",
  person: "TEAM",
  department: "ABTEILUNG",
  custom: "SYSTEM",
};

export interface BuildInputs {
  cases: any[];
  projects: any[];
  companies: any[];
  deals: any[];
  contacts: any[];
  profiles: any[];
  departments: any[];
  customNodes: any[];
  customEdges: any[];
  positions: Record<string, { x: number; y: number }>;
}

const nid = (kind: MapNodeKind | string, id: string) => `${kind}:${id}`;

export function buildGraph(input: BuildInputs): { nodes: Node<MapNodeData>[]; edges: Edge[] } {
  const nodes: Node<MapNodeData>[] = [];
  const edges: Edge[] = [];
  const ids = new Set<string>();

  const add = (n: Node<MapNodeData>) => {
    if (ids.has(n.id)) return;
    ids.add(n.id);
    nodes.push(n);
  };

  for (const c of input.companies) {
    add({
      id: nid("company", c.id),
      type: "mapNode",
      position: { x: 0, y: 0 },
      data: {
        kind: "company",
        title: c.name,
        subtitle: c.type || c.industry || "",
        color: KIND_COLOR.company,
        href: `/crm/companies/${c.id}`,
        raw: c,
      },
    });
  }
  for (const p of input.projects) {
    add({
      id: nid("project", p.id),
      type: "mapNode",
      position: { x: 0, y: 0 },
      data: {
        kind: "project",
        title: p.name,
        subtitle: p.status || "",
        color: KIND_COLOR.project,
        href: `/projects/${p.id}`,
        raw: p,
      },
    });
  }
  for (const c of input.cases) {
    add({
      id: nid("case", c.id),
      type: "mapNode",
      position: { x: 0, y: 0 },
      data: {
        kind: "case",
        title: c.project_name || c.case_no || "Vorgang",
        subtitle: c.status || "",
        color: KIND_COLOR.case,
        href: `/cases/${c.id}`,
        raw: c,
      },
    });
  }
  for (const d of input.deals) {
    add({
      id: nid("deal", d.id),
      type: "mapNode",
      position: { x: 0, y: 0 },
      data: {
        kind: "deal",
        title: d.title,
        subtitle: d.stage || "",
        color: KIND_COLOR.deal,
        href: `/crm/deals/${d.id}`,
        raw: d,
      },
    });
  }
  for (const c of input.contacts) {
    add({
      id: nid("contact", c.id),
      type: "mapNode",
      position: { x: 0, y: 0 },
      data: {
        kind: "contact",
        title: `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || "Kontakt",
        subtitle: c.position || "",
        color: KIND_COLOR.contact,
        raw: c,
      },
    });
  }
  for (const p of input.profiles) {
    add({
      id: nid("person", p.id),
      type: "mapNode",
      position: { x: 0, y: 0 },
      data: {
        kind: "person",
        title: p.display_name || p.short_code || "Person",
        subtitle: p.short_code || "",
        color: KIND_COLOR.person,
        raw: p,
      },
    });
  }
  for (const d of input.departments) {
    add({
      id: nid("department", d.id),
      type: "mapNode",
      position: { x: 0, y: 0 },
      data: {
        kind: "department",
        title: d.name,
        subtitle: "Abteilung",
        color: KIND_COLOR.department,
        raw: d,
      },
    });
  }
  for (const c of input.customNodes) {
    add({
      id: nid("custom", c.id),
      type: "mapNode",
      position: { x: 0, y: 0 },
      data: {
        kind: "custom",
        customKind: c.kind,
        title: c.title,
        subtitle: c.kind || "",
        color: c.color || KIND_COLOR.custom,
        raw: c,
      },
    });
  }

  // Auto edges from FK
  const edge = (id: string, src: string, tgt: string, label?: string) => {
    if (!ids.has(src) || !ids.has(tgt)) return;
    edges.push({
      id,
      source: src,
      target: tgt,
      label,
      animated: false,
      style: { stroke: "hsl(0 0% 100% / 0.25)", strokeWidth: 1 },
      labelStyle: { fill: "hsl(0 0% 100% / 0.5)", fontSize: 9, letterSpacing: 1 },
      labelBgStyle: { fill: "transparent" },
    });
  };

  for (const c of input.cases) {
    if (c.project_id) edge(`e-cp-${c.id}`, nid("project", c.project_id), nid("case", c.id), "enthält");
    if (c.assignee_id) edge(`e-ca-${c.id}`, nid("person", c.assignee_id), nid("case", c.id), "bearbeitet");
    if (c.department_id) edge(`e-cd-${c.id}`, nid("department", c.department_id), nid("case", c.id));
  }
  for (const d of input.deals) {
    if (d.company_id) edge(`e-dc-${d.id}`, nid("company", d.company_id), nid("deal", d.id), "deal");
    if (d.primary_contact_id) edge(`e-dk-${d.id}`, nid("contact", d.primary_contact_id), nid("deal", d.id));
  }
  for (const c of input.contacts) {
    if (c.company_id) edge(`e-kc-${c.id}`, nid("company", c.company_id), nid("contact", c.id));
  }
  for (const ce of input.customEdges) {
    edge(`ec-${ce.id}`, nid(ce.from_type as MapNodeKind, ce.from_id), nid(ce.to_type as MapNodeKind, ce.to_id), ce.label || undefined);
  }

  // Layout: stored positions first, dagre for the rest
  const needsLayout: Node<MapNodeData>[] = [];
  for (const n of nodes) {
    const pos = input.positions[n.id];
    if (pos) n.position = pos;
    else needsLayout.push(n);
  }

  if (needsLayout.length > 0) {
    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({ rankdir: "LR", nodesep: 60, ranksep: 120 });
    for (const n of needsLayout) g.setNode(n.id, { width: 200, height: 92 });
    for (const e of edges) {
      if (needsLayout.find((n) => n.id === e.source) || needsLayout.find((n) => n.id === e.target)) {
        g.setEdge(e.source, e.target);
      }
    }
    dagre.layout(g);
    for (const n of needsLayout) {
      const p = g.node(n.id);
      if (p) n.position = { x: p.x - 100, y: p.y - 46 };
    }
  }

  return { nodes, edges };
}
