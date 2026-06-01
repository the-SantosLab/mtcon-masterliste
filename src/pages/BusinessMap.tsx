import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type NodeChange,
  type NodeMouseHandler,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, Search, RotateCcw, X } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { buildGraph, KIND_COLOR, KIND_LABEL, type MapNodeData, type MapNodeKind } from "@/lib/map/buildGraph";
import { MapNode } from "@/components/map/MapNode";
import { CreateCustomNodeDialog } from "@/components/map/CreateCustomNodeDialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const NODE_TYPES = { mapNode: MapNode };

const FILTER_GROUPS: Record<string, MapNodeKind[]> = {
  Alle: ["case", "project", "company", "deal", "contact", "person", "department", "custom"],
  Org: ["person", "department", "company"],
  Delivery: ["case", "project"],
  Revenue: ["deal", "contact", "company"],
  Prozesse: ["custom"],
};

type Filter = keyof typeof FILTER_GROUPS;

function MapInner() {
  const navigate = useNavigate();
  const { fitView, setCenter, getNode } = useReactFlow();
  const [loading, setLoading] = useState(true);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<MapNodeData>>([]);
  const [edges, setEdges] = useEdgesState([]);
  const [filter, setFilter] = useState<Filter>("Alle");
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<Node<MapNodeData> | null>(null);
  const dragTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const [cases, projects, companies, deals, contacts, profiles, departments, customNodes, customEdges, positions] =
      await Promise.all([
        supabase.from("cases").select("id, project_name, case_no, status, project_id, assignee_id, department_id").eq("deleted", false).limit(500),
        supabase.from("projects").select("id, name, status").limit(500),
        supabase.from("companies").select("id, name, type, industry").limit(500),
        supabase.from("deals").select("id, title, stage, company_id, primary_contact_id").limit(500),
        supabase.from("contacts").select("id, first_name, last_name, position, company_id").limit(500),
        supabase.from("users_profile").select("id, display_name, short_code").limit(500),
        supabase.from("departments").select("id, name").limit(200),
        supabase.from("map_custom_nodes").select("*"),
        supabase.from("map_custom_edges").select("*"),
        supabase.from("map_node_positions").select("*"),
      ]);

    const posMap: Record<string, { x: number; y: number }> = {};
    for (const p of positions.data ?? []) posMap[`${p.node_type}:${p.node_id}`] = { x: p.x, y: p.y };

    const { nodes: ns, edges: es } = buildGraph({
      cases: cases.data ?? [],
      projects: projects.data ?? [],
      companies: companies.data ?? [],
      deals: deals.data ?? [],
      contacts: contacts.data ?? [],
      profiles: profiles.data ?? [],
      departments: departments.data ?? [],
      customNodes: customNodes.data ?? [],
      customEdges: customEdges.data ?? [],
      positions: posMap,
    });

    setNodes(ns);
    setEdges(es);
    setLoading(false);
    requestAnimationFrame(() => fitView({ duration: 400, padding: 0.2 }));
  }, [setNodes, setEdges, fitView]);

  useEffect(() => { load(); }, [load]);

  // Persist drag positions
  const handleNodesChange = useCallback((changes: NodeChange<Node<MapNodeData>>[]) => {
    onNodesChange(changes);
    for (const ch of changes) {
      if (ch.type === "position" && !ch.dragging && ch.position) {
        const [node_type, node_id] = ch.id.split(":");
        if (!node_type || !node_id) continue;
        clearTimeout(dragTimers.current[ch.id]);
        const { x, y } = ch.position;
        dragTimers.current[ch.id] = setTimeout(async () => {
          await supabase.from("map_node_positions").upsert({ node_type, node_id, x, y });
        }, 350);
      }
    }
  }, [onNodesChange]);

  // Filter visibility
  const visibleNodes = useMemo(() => {
    const allowed = new Set(FILTER_GROUPS[filter]);
    const q = search.trim().toLowerCase();
    return nodes.map((n) => {
      const d = n.data;
      const passKind = allowed.has(d.kind);
      const passSearch = !q || d.title.toLowerCase().includes(q) || (d.subtitle ?? "").toLowerCase().includes(q);
      return { ...n, hidden: !(passKind && passSearch) };
    });
  }, [nodes, filter, search]);

  const visibleEdges = useMemo(() => {
    const hidden = new Set(visibleNodes.filter((n) => n.hidden).map((n) => n.id));
    return edges.map((e) => ({ ...e, hidden: hidden.has(e.source) || hidden.has(e.target) }));
  }, [edges, visibleNodes]);

  const onNodeClick: NodeMouseHandler = useCallback((_, node) => {
    setSelected(node as Node<MapNodeData>);
  }, []);

  const focusSearch = (q: string) => {
    setSearch(q);
    if (!q.trim()) return;
    const hit = nodes.find((n) => n.data.title.toLowerCase().includes(q.toLowerCase()));
    if (hit) setCenter(hit.position.x + 100, hit.position.y + 46, { zoom: 1.2, duration: 400 });
  };

  const resetLayout = async () => {
    if (!confirm("Layout für alle zurücksetzen?")) return;
    await supabase.from("map_node_positions").delete().neq("node_id", "00000000-0000-0000-0000-000000000000");
    await load();
  };

  const edgeCount = visibleEdges.filter((e) => !e.hidden).length;
  const nodeCount = visibleNodes.filter((n) => !n.hidden).length;

  return (
    <div className="relative flex h-[calc(100vh-3.5rem)] w-screen max-w-none flex-col bg-[hsl(230_30%_6%)] -m-3 sm:-m-5 lg:-m-8" style={{ width: "calc(100% + 4rem)" }}>
      {/* fill parent padding */}
      <style>{`@media (max-width: 640px){ .biz-map-fill{ width: calc(100% + 1.5rem) !important; } } @media (min-width: 641px) and (max-width: 1024px){ .biz-map-fill{ width: calc(100% + 2.5rem) !important; } }`}</style>
      {/* Background mesh */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(circle at 50% 50%, hsl(265 80% 50% / 0.15), transparent 55%), radial-gradient(circle at 15% 90%, hsl(190 90% 50% / 0.1), transparent 50%), radial-gradient(circle at 85% 10%, hsl(320 80% 55% / 0.1), transparent 50%)",
        }}
      />

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between gap-3 border-b border-white/5 px-4 py-3 backdrop-blur-xl">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => navigate(-1)}
            className="rounded p-1.5 text-white/60 hover:text-white hover:bg-white/5"
            aria-label="Zurück"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <div className="text-[10px] tracking-[0.3em] uppercase text-white/45">Business Map</div>
            <div className="text-sm font-semibold text-white truncate">
              {loading ? "Lade…" : `${nodeCount} Nodes · ${edgeCount} Verbindungen`}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/40" />
            <Input
              value={search}
              onChange={(e) => focusSearch(e.target.value)}
              placeholder="Node suchen…"
              className="h-8 w-56 pl-7 bg-white/5 border-white/10 text-xs text-white placeholder:text-white/40"
            />
          </div>
          <Button size="sm" variant="ghost" onClick={resetLayout} className="text-white/60 hover:text-white">
            <RotateCcw className="h-3.5 w-3.5 mr-1" /> Layout
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)} className="bg-white/10 hover:bg-white/20 text-white">
            <Plus className="h-3.5 w-3.5 mr-1" /> Node
          </Button>
        </div>
      </div>

      {/* Filter pills */}
      <div className="relative z-10 flex items-center justify-between gap-3 border-b border-white/5 px-4 py-2 backdrop-blur-xl">
        <div className="flex items-center gap-1">
          {(Object.keys(FILTER_GROUPS) as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="px-3 py-1 text-[11px] rounded-full transition-colors"
              style={{
                background: filter === f ? "hsl(0 0% 100% / 0.08)" : "transparent",
                color: filter === f ? "hsl(0 0% 100%)" : "hsl(0 0% 100% / 0.45)",
                border: "1px solid hsl(0 0% 100% / 0.06)",
              }}
            >
              {f}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          {(Object.keys(KIND_LABEL) as MapNodeKind[]).map((k) => (
            <div key={k} className="flex items-center gap-1.5 text-[10px] tracking-wider uppercase text-white/45">
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ background: `hsl(${KIND_COLOR[k]})`, boxShadow: `0 0 6px hsl(${KIND_COLOR[k]})` }}
              />
              {KIND_LABEL[k]}
            </div>
          ))}
        </div>
      </div>

      {/* Canvas */}
      <div className="relative flex-1 min-h-0">
        <ReactFlow
          nodes={visibleNodes}
          edges={visibleEdges}
          nodeTypes={NODE_TYPES}
          onNodesChange={handleNodesChange}
          onNodeClick={onNodeClick}
          fitView
          minZoom={0.15}
          maxZoom={2.5}
          proOptions={{ hideAttribution: true }}
          defaultEdgeOptions={{ style: { stroke: "hsl(0 0% 100% / 0.18)", strokeWidth: 1 } }}
        >
          <Background gap={32} size={1} color="hsl(0 0% 100% / 0.06)" />
          <Controls
            className="!bg-[hsl(230_40%_10%/0.8)] !border-white/10 !rounded-lg !backdrop-blur-xl"
            showInteractive={false}
          />
          <MiniMap
            className="!bg-[hsl(230_40%_10%/0.8)] !border-white/10"
            nodeColor={(n) => `hsl(${(n.data as MapNodeData)?.color ?? "0 0% 50%"})`}
            maskColor="hsl(230 30% 6% / 0.7)"
            pannable
            zoomable
          />
        </ReactFlow>

        {/* Detail drawer */}
        {selected && (
          <div className="absolute top-4 right-4 z-20 w-80 rounded-xl border border-white/10 bg-[hsl(230_40%_10%/0.92)] backdrop-blur-2xl p-4 shadow-2xl">
            <div className="flex items-start justify-between">
              <div>
                <div
                  className="text-[10px] font-semibold tracking-[0.25em]"
                  style={{ color: `hsl(${selected.data.color})` }}
                >
                  {selected.data.kind === "custom" ? (selected.data.customKind || "SYSTEM").toUpperCase() : KIND_LABEL[selected.data.kind]}
                </div>
                <div className="mt-1 text-sm font-semibold text-white">{selected.data.title}</div>
                {selected.data.subtitle && (
                  <div className="mt-0.5 text-xs text-white/55">{selected.data.subtitle}</div>
                )}
              </div>
              <button onClick={() => setSelected(null)} className="text-white/45 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            {selected.data.href && (
              <Button
                size="sm"
                className="mt-3 w-full bg-white/10 hover:bg-white/20 text-white"
                onClick={() => navigate(selected.data.href!)}
              >
                Öffnen
              </Button>
            )}
          </div>
        )}
      </div>

      <CreateCustomNodeDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={load}
      />
    </div>
  );
}

export default function BusinessMap() {
  return (
    <AppLayout>
      <ReactFlowProvider>
        <MapInner />
      </ReactFlowProvider>
    </AppLayout>
  );
}
