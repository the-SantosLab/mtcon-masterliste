import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { AppLayout } from '@/components/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
  Check, Clock, CircleDot, Activity, Layers, Boxes, Cpu, Zap, Truck, Wrench,
  Users, Building2, Briefcase, Settings2, ShieldCheck, Sparkles,
  Database, Network, Brain, Target, Radio, AlertTriangle, Gauge, Filter,
  Search, GitCompare, X, MessageSquare, Paperclip,
  Pin, PinOff, Download, Eye, EyeOff, Keyboard, Save, TrendingUp,
} from 'lucide-react';


type Dept = { id: string; name: string };
type Task = {
  id: string;
  case_id: string;
  title: string;
  description: string | null;
  status: 'open' | 'in_progress' | 'done';
  completed: boolean;
  completed_at: string | null;
  sort_order: number;
  department_id: string | null;
  assigned_to: string | null;
  created_at: string;
};
type CaseRow = {
  id: string;
  case_no: string | null;
  project_name: string | null;
  status: string;
  created_at: string;
};
type Profile = { id: string; display_name: string | null };
type ActivityRow = {
  id: string;
  case_id: string;
  action: string;
  field: string | null;
  old_value: string | null;
  new_value: string | null;
  message: string | null;
  actor_id: string | null;
  created_at: string;
};

const ACCENTS = [
  { name: 'amber',   hue: '32 100% 58%',  glow: 'rgba(255,160,40,0.55)' },
  { name: 'cyan',    hue: '195 100% 60%', glow: 'rgba(60,200,255,0.55)' },
  { name: 'emerald', hue: '142 80% 52%',  glow: 'rgba(70,230,140,0.55)' },
  { name: 'blue',    hue: '215 100% 62%', glow: 'rgba(80,150,255,0.55)' },
  { name: 'violet',  hue: '270 90% 70%',  glow: 'rgba(170,120,255,0.55)' },
  { name: 'rose',    hue: '340 95% 65%',  glow: 'rgba(255,90,160,0.55)' },
];

const DEPT_ICONS = [Cpu, Boxes, Truck, Wrench, Users, Building2, Briefcase, Settings2, ShieldCheck, Sparkles, Zap, Activity, Layers];
const accentFor = (i: number) => ACCENTS[i % ACCENTS.length];

const TIMEFRAMES = [
  { id: '24h', label: '24h', ms: 24 * 3600_000 },
  { id: '7d',  label: '7T',  ms: 7 * 24 * 3600_000 },
  { id: '30d', label: '30T', ms: 30 * 24 * 3600_000 },
  { id: 'all', label: 'Alle', ms: Infinity },
] as const;
type TimeframeId = typeof TIMEFRAMES[number]['id'];

// Hours of "age" (since created_at) before a task is warn / critical
const SLA_WARN_H = 48;
const SLA_CRIT_H = 120;

const hoursSince = (iso: string) => (Date.now() - new Date(iso).getTime()) / 3_600_000;
const fmtAgo = (iso: string) => {
  const m = (Date.now() - new Date(iso).getTime()) / 60_000;
  if (m < 1) return 'jetzt';
  if (m < 60) return `${Math.round(m)}m`;
  if (m < 1440) return `${Math.round(m / 60)}h`;
  return `${Math.round(m / 1440)}T`;
};

export default function Cockpit() {
  const navigate = useNavigate();
  const [departments, setDepartments] = useState<Dept[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [newestActivityId, setNewestActivityId] = useState<string | null>(null);
  const [selectedDept, setSelectedDept] = useState<string | null>(null);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [compareIds, setCompareIds] = useState<string[]>([]); // multi-case compare
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [deptCapacity, setDeptCapacity] = useState<Record<string, number>>({});
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMode, setPickerMode] = useState<'select' | 'compare'>('select');
  const [bootDone, setBootDone] = useState(false);

  // Mini-drawer data per node (lazy)
  const [drawerChat, setDrawerChat] = useState<Array<{ id: string; author_id: string | null; body: string; created_at: string }>>([]);
  const [drawerAttachments, setDrawerAttachments] = useState<number>(0);
  const [drawerLoading, setDrawerLoading] = useState(false);

  // Filters
  const [timeframe, setTimeframe] = useState<TimeframeId>('7d');
  const [onlyCritical, setOnlyCritical] = useState(false);
  const [myOnly, setMyOnly] = useState(false);

  // Extended functional features
  const [pinnedIds, setPinnedIds] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('cockpit:pinned') || '[]'); } catch { return []; }
  });
  const [personLayer, setPersonLayer] = useState<boolean>(() => localStorage.getItem('cockpit:personLayer') === '1');
  const [savedViews, setSavedViews] = useState<Array<{ name: string; timeframe: TimeframeId; onlyCritical: boolean; myOnly: boolean; pinnedIds: string[] }>>(() => {
    try { return JSON.parse(localStorage.getItem('cockpit:views') || '[]'); } catch { return []; }
  });
  const [helpOpen, setHelpOpen] = useState(false);
  const [simAdd, setSimAdd] = useState<Record<string, number>>({}); // dept_id → extra capacity
  const alertedTaskIdsRef = useRef<Set<string>>(new Set());

  // Pipeline SVG flow refs
  const pipelineWrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null));
  }, []);

  // Boot sequence — hide after a short delay
  useEffect(() => {
    const t = window.setTimeout(() => setBootDone(true), 1700);
    return () => window.clearTimeout(t);
  }, []);

  // Command-K shortcut & global hotkeys (1-9 dept, c compare, e export, r refresh, ? help)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      const inField = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPickerMode('select');
        setPickerOpen(true);
        return;
      }
      if (inField || e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^[1-9]$/.test(e.key)) {
        const idx = parseInt(e.key, 10) - 1;
        setDepartments((deps) => {
          if (deps[idx]) setSelectedDept((cur) => (cur === deps[idx].id ? null : deps[idx].id));
          return deps;
        });
        return;
      }
      if (e.key === '?' || (e.shiftKey && e.key === '/')) { e.preventDefault(); setHelpOpen(true); }
      if (e.key.toLowerCase() === 'c') { setPickerMode('compare'); setPickerOpen(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Persist preferences
  useEffect(() => { localStorage.setItem('cockpit:pinned', JSON.stringify(pinnedIds)); }, [pinnedIds]);
  useEffect(() => { localStorage.setItem('cockpit:personLayer', personLayer ? '1' : '0'); }, [personLayer]);
  useEffect(() => { localStorage.setItem('cockpit:views', JSON.stringify(savedViews)); }, [savedViews]);



  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [deptRes, taskRes, caseRes, profRes, actRes, dmRes] = await Promise.all([
        supabase.from('departments').select('id,name').eq('is_active', true).order('sort_order'),
        supabase
          .from('case_tasks')
          .select('id,case_id,title,description,status,completed,completed_at,sort_order,department_id,assigned_to,created_at')
          .is('archived_at', null),
        supabase
          .from('cases')
          .select('id,case_no,project_name,status,created_at')
          .eq('deleted', false)
          .order('created_at', { ascending: false })
          .limit(500),
        supabase.from('users_profile').select('id,display_name'),
        supabase
          .from('case_activity')
          .select('id,case_id,action,field,old_value,new_value,message,actor_id,created_at')
          .order('created_at', { ascending: false })
          .limit(40),
        supabase.from('department_members').select('department_id'),
      ]);

      if (cancelled) return;
      setDepartments((deptRes.data as Dept[]) || []);
      setTasks(((taskRes.data as any[]) || []) as Task[]);
      setCases(((caseRes.data as any[]) || []) as CaseRow[]);
      const map: Record<string, Profile> = {};
      ((profRes.data as Profile[]) || []).forEach((p) => (map[p.id] = p));
      setProfiles(map);
      setActivity(((actRes.data as any[]) || []) as ActivityRow[]);
      const cap: Record<string, number> = {};
      ((dmRes.data as Array<{ department_id: string }>) || []).forEach((r) => {
        if (r.department_id) cap[r.department_id] = (cap[r.department_id] || 0) + 1;
      });
      setDeptCapacity(cap);

      if (!selectedCaseId && caseRes.data && caseRes.data.length) {
        setSelectedCaseId((caseRes.data[0] as any).id);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Realtime: tasks
  useEffect(() => {
    const ch = supabase
      .channel('cockpit-tasks')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'case_tasks' }, (payload: any) => {
        setTasks((prev) => {
          if (payload.eventType === 'DELETE') return prev.filter((t) => t.id !== payload.old.id);
          const row = payload.new as Task;
          const idx = prev.findIndex((t) => t.id === row.id);
          if (idx === -1) return [...prev, row];
          const next = [...prev];
          next[idx] = row;
          return next;
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  // Realtime: activity ticker
  useEffect(() => {
    const ch = supabase
      .channel('cockpit-activity')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'case_activity' }, (payload: any) => {
        const row = payload.new as ActivityRow;
        setActivity((prev) => [row, ...prev].slice(0, 40));
        setNewestActivityId(row.id);
        // clear "new" highlight after the animation
        window.setTimeout(() => setNewestActivityId((cur) => (cur === row.id ? null : cur)), 1200);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  // SLA alerts: toast on every new task that crosses critical age while open
  useEffect(() => {
    const seen = alertedTaskIdsRef.current;
    for (const t of tasks) {
      if (t.completed || t.status === 'done') continue;
      if (hoursSince(t.created_at) < SLA_CRIT_H) continue;
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      const cNo = cases.find((c) => c.id === t.case_id)?.case_no ?? '—';
      toast.warning(`SLA kritisch · ${cNo}`, { description: t.title, duration: 6000 });
    }
  }, [tasks, cases]);

  const timeframeMs = TIMEFRAMES.find((t) => t.id === timeframe)!.ms;
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      // Open-only universe for stats; we still keep "done" for ticker context
      if (t.status === 'done' || t.completed) return false;
      if (timeframeMs !== Infinity && hoursSince(t.created_at) * 3_600_000 > timeframeMs) return false;
      if (onlyCritical && hoursSince(t.created_at) < SLA_CRIT_H) return false;
      if (myOnly && currentUserId && t.assigned_to !== currentUserId) return false;
      return true;
    });
  }, [tasks, timeframeMs, onlyCritical, myOnly, currentUserId]);

  const deptStats = useMemo(() => {
    const stats: Record<string, { open: number; inProgress: number; done: number; avgAgeH: number; criticalCount: number; oldestH: number }> = {};
    for (const d of departments) stats[d.id] = { open: 0, inProgress: 0, done: 0, avgAgeH: 0, criticalCount: 0, oldestH: 0 };

    // done totals (all-time, for "erledigt" KPI)
    for (const t of tasks) {
      if (!t.department_id || !(t.department_id in stats)) continue;
      if (t.status === 'done' || t.completed) stats[t.department_id].done += 1;
    }
    // open / age (respect filters)
    const ageBuckets: Record<string, number[]> = {};
    for (const t of filteredTasks) {
      if (!t.department_id || !(t.department_id in stats)) continue;
      stats[t.department_id].open += 1;
      if (t.status === 'in_progress') stats[t.department_id].inProgress += 1;
      const age = hoursSince(t.created_at);
      if (age >= SLA_CRIT_H) stats[t.department_id].criticalCount += 1;
      if (age > stats[t.department_id].oldestH) stats[t.department_id].oldestH = age;
      (ageBuckets[t.department_id] ??= []).push(age);
    }
    for (const dId of Object.keys(ageBuckets)) {
      const arr = ageBuckets[dId];
      stats[dId].avgAgeH = arr.reduce((a, b) => a + b, 0) / arr.length;
    }
    return stats;
  }, [tasks, filteredTasks, departments]);

  // Bottleneck = dept with highest avg age among those with >=1 open task
  const bottleneckDeptId = useMemo(() => {
    let bestId: string | null = null;
    let bestAge = 0;
    for (const d of departments) {
      const s = deptStats[d.id];
      if (!s || s.open === 0) continue;
      if (s.avgAgeH > bestAge) { bestAge = s.avgAgeH; bestId = d.id; }
    }
    return bestAge >= SLA_WARN_H ? bestId : null;
  }, [departments, deptStats]);

  const maxOldest = useMemo(() => {
    let m = 0;
    for (const d of departments) if (deptStats[d.id]?.oldestH > m) m = deptStats[d.id].oldestH;
    return m || 1;
  }, [departments, deptStats]);

  // Pipeline-Heatmap: historische Übergangsfrequenz zwischen aufeinanderfolgenden Dept-Paaren
  const heatmap = useMemo(() => {
    const byCase = new Map<string, Task[]>();
    for (const t of tasks) {
      (byCase.get(t.case_id) ?? byCase.set(t.case_id, []).get(t.case_id)!).push(t);
    }
    const pairCount = new Map<string, number>();
    for (const arr of byCase.values()) {
      arr.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      for (let i = 0; i < arr.length - 1; i++) {
        const a = arr[i].department_id, b = arr[i + 1].department_id;
        if (!a || !b || a === b) continue;
        const key = `${a}->${b}`;
        pairCount.set(key, (pairCount.get(key) || 0) + 1);
      }
    }
    return pairCount;
  }, [tasks]);
  const heatLevel = (a: string | null, b: string | null) => {
    if (!a || !b) return 0;
    const c = heatmap.get(`${a}->${b}`) || 0;
    if (c >= 12) return 4;
    if (c >= 6) return 3;
    if (c >= 2) return 2;
    if (c >= 1) return 1;
    return 0;
  };

  // Prognose-ETA pro Abteilung — Median der historischen Bearbeitungsdauer abgeschlossener Aufgaben (in Stunden)
  const etaByDept = useMemo(() => {
    const buckets: Record<string, number[]> = {};
    for (const t of tasks) {
      if (!t.department_id) continue;
      if (!t.completed_at) continue;
      const h = (new Date(t.completed_at).getTime() - new Date(t.created_at).getTime()) / 3_600_000;
      if (!isFinite(h) || h <= 0) continue;
      (buckets[t.department_id] ??= []).push(h);
    }
    const out: Record<string, number> = {};
    for (const k of Object.keys(buckets)) {
      const a = buckets[k].sort((x, y) => x - y);
      out[k] = a[Math.floor(a.length / 2)];
    }
    return out;
  }, [tasks]);
  const etaForDept = (id: string | null) => (id ? etaByDept[id] : undefined);

  // Phase-Dauer pro Vorgang (für Compare Δ)
  const phaseDurations = useMemo(() => {
    const out: Record<string, Record<string, number>> = {};
    for (const t of tasks) {
      if (!t.department_id || !t.completed_at) continue;
      const h = (new Date(t.completed_at).getTime() - new Date(t.created_at).getTime()) / 3_600_000;
      (out[t.case_id] ??= {});
      out[t.case_id][t.department_id] = h;
    }
    return out;
  }, [tasks]);

  // Lade Chat-Preview + Anhänge-Anzahl beim Öffnen eines Pipeline-Knotens
  useEffect(() => {
    if (!selectedNodeId || !selectedCaseId) {
      setDrawerChat([]); setDrawerAttachments(0); return;
    }
    let cancelled = false;
    setDrawerLoading(true);
    (async () => {
      const [chatRes, attRes] = await Promise.all([
        supabase
          .from('case_chat_messages')
          .select('id,author_id,body,created_at')
          .eq('case_id', selectedCaseId)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(5),
        supabase
          .from('case_chat_attachments')
          .select('id', { count: 'exact', head: true })
          .eq('case_id', selectedCaseId),
      ]);
      if (cancelled) return;
      setDrawerChat(((chatRes.data as any[]) || []).reverse());
      setDrawerAttachments(attRes.count ?? 0);
      setDrawerLoading(false);
    })();
    return () => { cancelled = true; };
  }, [selectedNodeId, selectedCaseId]);



  const deptOpenTasks = useMemo(() => {
    if (!selectedDept) return [];
    const caseMap = new Map(cases.map((c) => [c.id, c]));
    return filteredTasks
      .filter((t) => t.department_id === selectedDept)
      .sort((a, b) => hoursSince(b.created_at) - hoursSince(a.created_at))
      .slice(0, 10)
      .map((t) => ({ task: t, case: caseMap.get(t.case_id), ageH: hoursSince(t.created_at) }));
  }, [selectedDept, filteredTasks, cases]);

  const selectedCaseTasks = useMemo(() => {
    if (!selectedCaseId) return [];
    return tasks
      .filter((t) => t.case_id === selectedCaseId)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || (a.created_at || '').localeCompare(b.created_at || ''));
  }, [tasks, selectedCaseId]);

  const currentIdx = useMemo(() => selectedCaseTasks.findIndex((t) => !t.completed && t.status !== 'done'), [selectedCaseTasks]);

  const deptName = (id: string | null) => (id ? departments.find((d) => d.id === id)?.name ?? '—' : '—');
  const userName = (id: string | null) => (id ? profiles[id]?.display_name ?? '—' : '—');
  const caseNo = (id: string) => cases.find((c) => c.id === id)?.case_no ?? '—';

  const selectedDeptIdx = selectedDept ? departments.findIndex((d) => d.id === selectedDept) : -1;
  const selectedDeptAccent = selectedDeptIdx >= 0 ? accentFor(selectedDeptIdx) : ACCENTS[1];

  const slaClass = (h: number) =>
    h >= SLA_CRIT_H ? 'cockpit-sla--crit' : h >= SLA_WARN_H ? 'cockpit-sla--warn' : 'cockpit-sla--ok';
  const slaLabel = (h: number) => `${Math.round(h)}h`;

  const totalActive = filteredTasks.length;

  const togglePin = (id: string) => {
    setPinnedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 5) { toast.error('Maximal 5 angepinnte Vorgänge'); return prev; }
      return [...prev, id];
    });
  };
  const isPinned = (id: string) => pinnedIds.includes(id);

  const exportCsv = () => {
    const rows = [['case_no', 'project_name', 'department', 'task', 'status', 'age_h', 'assignee']];
    for (const t of filteredTasks) {
      const c = cases.find((x) => x.id === t.case_id);
      rows.push([
        c?.case_no ?? '', c?.project_name ?? '', deptName(t.department_id), t.title,
        t.status, Math.round(hoursSince(t.created_at)).toString(), userName(t.assigned_to),
      ]);
    }
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `cockpit-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success(`${filteredTasks.length} Aufgaben exportiert`);
  };

  const saveCurrentView = () => {
    const name = window.prompt('Name der Cockpit-Ansicht');
    if (!name) return;
    setSavedViews((prev) => [...prev.filter((v) => v.name !== name), { name, timeframe, onlyCritical, myOnly, pinnedIds }]);
    toast.success(`Ansicht „${name}" gespeichert`);
  };
  const applyView = (name: string) => {
    const v = savedViews.find((x) => x.name === name);
    if (!v) return;
    setTimeframe(v.timeframe); setOnlyCritical(v.onlyCritical); setMyOnly(v.myOnly); setPinnedIds(v.pinnedIds || []);
    toast.success(`Ansicht „${name}" geladen`);
  };
  const deleteView = (name: string) => setSavedViews((prev) => prev.filter((v) => v.name !== name));


  // -------- Render --------
  const renderDeptPanel = () => (
    <div
      className="cockpit-panel cockpit-hud mt-2"
      style={{
        // @ts-ignore
        '--accent': `hsl(${selectedDeptAccent.hue})`,
        '--accent-glow': selectedDeptAccent.glow,
      } as React.CSSProperties}
    >
      <span className="cockpit-hud__bl" /><span className="cockpit-hud__br" />
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <span className="cockpit-node__bullet-icon" />
          <div className="text-[11px] tracking-[0.3em] uppercase text-white/55">offene Aufgaben</div>
          <div className="text-sm text-white/90 font-medium">{deptName(selectedDept)}</div>
        </div>
        <div className="text-[10px] uppercase tracking-[0.28em] text-white/40">Top 10 · älteste zuerst</div>
      </div>
      {deptOpenTasks.length === 0 ? (
        <div className="text-sm text-white/50 py-8 text-center">Keine offenen Aufgaben.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-[0.22em] text-white/45 border-b border-white/10">
                <th className="py-2 pr-3 font-normal">Vorgang</th>
                <th className="py-2 pr-3 font-normal">Aufgabe</th>
                <th className="py-2 pr-3 font-normal">SLA</th>
                <th className="py-2 pr-3 font-normal">Status</th>
              </tr>
            </thead>
            <tbody>
              {deptOpenTasks.map(({ task, case: c, ageH }) => (
                <tr key={task.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.03]">
                  <td className="py-2.5 pr-3 font-mono text-xs text-white/70">
                    {c ? (
                      <button
                        onClick={() => navigate(`/cases/${c.id}`)}
                        className="hover:text-cyan-300 hover:underline transition-colors cursor-pointer text-left"
                      >
                        {c.case_no}
                      </button>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="py-2.5 pr-3 truncate max-w-[420px] text-white/85">{task.title}</td>
                  <td className="py-2.5 pr-3">
                    <span className={cn('cockpit-sla', slaClass(ageH))}>{slaLabel(ageH)}</span>
                  </td>
                  <td className="py-2.5 pr-3">
                    <span className={cn('cockpit-status', task.status === 'in_progress' ? 'cockpit-status--active' : 'cockpit-status--open')}>
                      {task.status === 'in_progress' ? 'in Arbeit' : 'offen'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  return (
    <AppLayout>
      <div className="cockpit-shell relative min-h-[calc(100vh-1rem)] overflow-hidden">
        <div aria-hidden className="cockpit-grid" />
        <div aria-hidden className="cockpit-aurora cockpit-aurora-1" />
        <div aria-hidden className="cockpit-aurora cockpit-aurora-2" />
        <div aria-hidden className="cockpit-aurora cockpit-aurora-3" />
        <div aria-hidden className="cockpit-scanlines" />

        <div className="relative p-6 md:p-10 space-y-10 max-w-[1500px] mx-auto">
          {/* HEADER */}
          <header className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2 text-[10px] tracking-[0.32em] text-white/55 uppercase">
                <span className="inline-block h-px w-8 bg-white/30" />
                Mission Control
                <span className="cockpit-pulse" />
              </div>
              <h1 className="cockpit-title mt-2">COCKPIT</h1>
              <p className="text-sm text-white/55 max-w-xl mt-2">
                Live-Übersicht über alle Abteilungen, Durchsatz und den Vorgangsfluss durch die Organisation.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="cockpit-chip">
                <CircleDot className="h-3 w-3" /> {totalActive} aktive Aufgaben
              </div>
              {bottleneckDeptId && (
                <div className="cockpit-chip" style={{ color: '#fb7185', borderColor: 'rgba(251,113,133,0.5)', background: 'rgba(251,113,133,0.08)' }}>
                  <AlertTriangle className="h-3 w-3" /> Bottleneck: {deptName(bottleneckDeptId)}
                </div>
              )}
              <div className="cockpit-chip cockpit-chip--beta">BETA</div>
            </div>
          </header>

          {/* FILTER BAR */}
          <div className="cockpit-filterbar">
            <span className="cockpit-filterbar__label flex items-center gap-1.5"><Filter className="h-3 w-3" /> Filter</span>
            <div className="flex items-center gap-1.5">
              {TIMEFRAMES.map((tf) => (
                <button
                  key={tf.id}
                  type="button"
                  onClick={() => setTimeframe(tf.id)}
                  className={cn('cockpit-toggle', timeframe === tf.id && 'cockpit-toggle--on')}
                  style={{
                    // @ts-ignore
                    '--accent': 'hsl(195 100% 60%)',
                    '--accent-glow': 'rgba(60,200,255,0.55)',
                  } as React.CSSProperties}
                >
                  {tf.label}
                </button>
              ))}
            </div>
            <span className="h-5 w-px bg-white/10 mx-1" />
            <button
              type="button"
              onClick={() => setOnlyCritical((v) => !v)}
              className={cn('cockpit-toggle', onlyCritical && 'cockpit-toggle--on')}
              style={{
                // @ts-ignore
                '--accent': 'hsl(0 90% 65%)',
                '--accent-glow': 'rgba(251,113,133,0.6)',
              } as React.CSSProperties}
            >
              <AlertTriangle className="h-3 w-3" /> SLA kritisch
            </button>
            <button
              type="button"
              onClick={() => setMyOnly((v) => !v)}
              disabled={!currentUserId}
              className={cn('cockpit-toggle', myOnly && 'cockpit-toggle--on')}
              style={{
                // @ts-ignore
                '--accent': 'hsl(142 80% 52%)',
                '--accent-glow': 'rgba(70,230,140,0.6)',
              } as React.CSSProperties}
            >
              <Users className="h-3 w-3" /> Mein Cockpit
            </button>
            <span className="ml-auto text-[10px] uppercase tracking-[0.28em] text-white/40">
              SLA-Schwellen · Warn {SLA_WARN_H}h · Krit {SLA_CRIT_H}h
            </span>
          </div>

          {/* MAIN GRID: Departments + Activity Ticker */}
          <section className="grid gap-8 lg:grid-cols-[1fr_320px]">
            {/* LEFT — DEPARTMENTS */}
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <span className="h-px flex-1 bg-gradient-to-r from-transparent via-white/15 to-transparent" />
                <h2 className="text-[11px] tracking-[0.38em] text-white/55 uppercase">Departments</h2>
                <span className="h-px flex-1 bg-gradient-to-r from-transparent via-white/15 to-transparent" />
              </div>

              {loading ? (
                <div className="text-sm text-white/50 text-center py-10">// initialisiere Telemetrie …</div>
              ) : (
                <div className="grid gap-x-12 gap-y-8 grid-cols-1 sm:grid-cols-2 pl-7">
                  {departments.map((d, i) => {
                    const s = deptStats[d.id] ?? { open: 0, inProgress: 0, done: 0, avgAgeH: 0, criticalCount: 0, oldestH: 0 };
                    const active = selectedDept === d.id;
                    const isBottleneck = bottleneckDeptId === d.id;
                    const accent = accentFor(i);
                    const Icon = DEPT_ICONS[i % DEPT_ICONS.length];
                    const isSelectedInRow =
                      selectedDeptIdx !== -1 && Math.floor(selectedDeptIdx / 2) === Math.floor(i / 2);
                    const renderPanelAfterDesktop =
                      isSelectedInRow && (i % 2 === 1 || i === departments.length - 1);
                    const renderPanelAfterMobile = selectedDept === d.id;
                    const meterPct = Math.min(100, Math.round((s.oldestH / maxOldest) * 100));
                    return (
                      <React.Fragment key={d.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedDept(active ? null : d.id)}
                          className={cn(
                            'cockpit-node cockpit-hud group',
                            active && 'cockpit-node--active',
                            isBottleneck && 'cockpit-node--bottleneck'
                          )}
                          style={{
                            // @ts-ignore
                            '--accent': `hsl(${accent.hue})`,
                            '--accent-glow': accent.glow,
                          } as React.CSSProperties}
                        >
                          <span className="cockpit-hud__bl" /><span className="cockpit-hud__br" />
                          <div className="cockpit-node__badge">
                            <Icon className="h-7 w-7" strokeWidth={1.6} />
                          </div>

                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="cockpit-node__index">{String(i + 1).padStart(2, '0')}</div>
                              <div className="cockpit-node__name" data-text={d.name}>{d.name}</div>
                            </div>
                            {s.open > 0 && (
                              <span className={cn('cockpit-sla', slaClass(s.avgAgeH))} title="Durchschnittsalter offener Aufgaben">
                                <Gauge className="h-3 w-3" /> Ø {slaLabel(s.avgAgeH)}
                              </span>
                            )}
                          </div>

                          <div className="cockpit-node__bullets">
                            <div className="cockpit-node__bullet">
                              <span className="cockpit-node__bullet-icon" />
                              <span><span className="cockpit-node__bullet-value">{s.open}</span> offene Vorgänge</span>
                            </div>
                            <div className="cockpit-node__bullet">
                              <span className="cockpit-node__bullet-icon" />
                              <span><span className="cockpit-node__bullet-value">{s.inProgress}</span> in Bearbeitung</span>
                            </div>
                            <div className="cockpit-node__bullet">
                              <span className="cockpit-node__bullet-icon" />
                              <span><span className="cockpit-node__bullet-value">{s.criticalCount}</span> SLA-kritisch</span>
                            </div>
                          </div>

                          <div className="cockpit-node__meter" title={`Ältester Vorgang: ${slaLabel(s.oldestH)}`}>
                            <span style={{ width: `${meterPct}%` }} />
                          </div>
                          {(() => {
                            const cap = deptCapacity[d.id] || 0;
                            const load = s.open;
                            const pct = cap > 0 ? Math.min(150, Math.round((load / cap) * 100)) : 0;
                            const over = cap > 0 && load > cap;
                            return (
                              <div className="cockpit-node__wip">
                                <span>WIP</span>
                                <div className={cn('cockpit-node__wip-bar', over && 'cockpit-node__wip-bar--over')}>
                                  <span style={{ width: `${Math.min(100, pct)}%` }} />
                                </div>
                                <span className="cockpit-node__wip-val">
                                  {load}{cap > 0 ? `/${cap}` : ''}
                                </span>
                              </div>
                            );
                          })()}

                        </button>
                        {selectedDept && renderPanelAfterMobile && (
                          <div key={`panel-mobile-${d.id}-${selectedDept}`} className="sm:hidden col-span-full cockpit-panel--enter">
                            {renderDeptPanel()}
                          </div>
                        )}
                        {selectedDept && renderPanelAfterDesktop && (
                          <div key={`panel-desktop-${d.id}-${selectedDept}`} className="hidden sm:block col-span-full cockpit-panel--enter">
                            {renderDeptPanel()}
                          </div>
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>
              )}
            </div>

            {/* RIGHT — ACTIVITY TICKER */}
            <aside className="cockpit-ticker cockpit-hud self-start lg:sticky lg:top-6">
              <span className="cockpit-hud__bl" /><span className="cockpit-hud__br" />
              <div className="cockpit-ticker__head">
                <span className="flex items-center gap-2"><Radio className="h-3 w-3 text-emerald-400" /> Live · Aktivität</span>
                <span className="text-white/40">{activity.length}</span>
              </div>
              <div className="cockpit-ticker__body">
                {activity.length === 0 ? (
                  <div className="text-xs text-white/40 py-10 text-center">// keine Aktivität …</div>
                ) : (
                  activity.map((a) => {
                    const isNew = a.id === newestActivityId;
                    const cNo = caseNo(a.case_id);
                    const who = a.actor_id ? profiles[a.actor_id]?.display_name ?? '—' : 'System';
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => a.case_id && navigate(`/cases/${a.case_id}`)}
                        className={cn('cockpit-ticker__row w-full text-left', isNew && 'cockpit-ticker__row--new')}
                      >
                        <span className="cockpit-ticker__time">{fmtAgo(a.created_at)}</span>
                        <span className="truncate">
                          <span className="font-mono text-xs text-cyan-300/90">{cNo}</span>
                          <span className="text-white/45"> · </span>
                          <span className="text-white/80">{a.message || a.field || a.action}</span>
                          <span className="text-white/35"> · {who}</span>
                        </span>
                        <span className="cockpit-ticker__action">{a.action}</span>
                      </button>
                    );
                  })
                )}
              </div>
            </aside>
          </section>

          {/* LIFECYCLE PIPELINE */}
          <section className="space-y-6">
            <div className="flex items-center gap-3">
              <span className="h-px flex-1 bg-gradient-to-r from-transparent via-white/15 to-transparent" />
              <h2 className="text-[11px] tracking-[0.38em] text-white/55 uppercase">Vorgangs-Pipeline</h2>
              <span className="h-px flex-1 bg-gradient-to-r from-transparent via-white/15 to-transparent" />
            </div>

            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="text-xs text-white/55 tracking-wide">
                EINE LINIE · EIN ZIEL — Nahtlos vernetzte Prozesse von Sales bis Lieferung.
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => { setPickerMode('select'); setPickerOpen(true); }}
                  className="cockpit-toggle"
                  style={{
                    // @ts-ignore
                    '--accent': 'hsl(195 100% 60%)',
                    '--accent-glow': 'rgba(60,200,255,0.6)',
                  } as React.CSSProperties}
                >
                  <Search className="h-3 w-3" /> Vorgang suchen
                  <span className="font-mono text-[9px] opacity-60 ml-1">⌘K</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setPickerMode('compare'); setPickerOpen(true); }}
                  className={cn('cockpit-toggle', compareIds.length > 0 && 'cockpit-toggle--on')}
                  style={{
                    // @ts-ignore
                    '--accent': 'hsl(270 90% 70%)',
                    '--accent-glow': 'rgba(170,120,255,0.6)',
                  } as React.CSSProperties}
                >
                  <GitCompare className="h-3 w-3" /> Vergleichen
                  {compareIds.length > 0 && <span className="font-mono text-[10px]">+{compareIds.length}</span>}
                </button>
              </div>
            </div>

            {compareIds.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="cockpit-filterbar__label">Vergleich</span>
                {[selectedCaseId, ...compareIds].filter(Boolean).map((cid, idx) => {
                  const accent = accentFor(idx + 1);
                  return (
                    <span
                      key={cid as string}
                      className="cockpit-compare-pill"
                      style={{
                        // @ts-ignore
                        '--accent': `hsl(${accent.hue})`,
                      } as React.CSSProperties}
                    >
                      {caseNo(cid as string)}
                      {idx > 0 && (
                        <X
                          className="h-3 w-3 cockpit-compare-pill__close"
                          onClick={() => setCompareIds((prev) => prev.filter((x) => x !== cid))}
                        />
                      )}
                    </span>
                  );
                })}
              </div>
            )}

            {/* Primary pipeline */}
            <PipelineLane
              key={selectedCaseId ?? 'none'}
              tasks={selectedCaseTasks}
              accentBaseHue={200}
              selectedNodeId={selectedNodeId}
              onSelectNode={(id) => setSelectedNodeId(id)}
              deptName={deptName}
              heatLevel={heatLevel}
              caseLabel={selectedCaseId ? caseNo(selectedCaseId) : null}
              extraDrawer={
                selectedNodeId
                  ? (() => {
                      const t = selectedCaseTasks.find((x) => x.id === selectedNodeId);
                      if (!t) return null;
                      const done = t.completed || t.status === 'done';
                      return (
                        <div className="mt-4 cockpit-subpanel">
                          <div className="grid gap-4 sm:grid-cols-2">
                            <Field label="Abteilung" value={deptName(t.department_id)} />
                            <Field label="Zugewiesen" value={userName(t.assigned_to)} />
                            <Field label="Status" value={done ? 'erledigt' : t.status === 'in_progress' ? 'in Arbeit' : 'offen'} />
                            <Field label="Abgeschlossen am" value={t.completed_at ? new Date(t.completed_at).toLocaleString('de-DE') : t.status === 'in_progress' ? 'in Arbeit' : 'noch nicht gestartet'} />
                            <div className="sm:col-span-2">
                              <div className="cockpit-field__label">Beschreibung</div>
                              <div className="whitespace-pre-wrap text-sm text-white/80">{t.description || '—'}</div>
                            </div>
                          </div>

                          <div className="cockpit-drawer-section">
                            <h4 className="flex items-center gap-2">
                              <MessageSquare className="h-3 w-3" /> Chat-Vorschau
                              <span className="ml-auto flex items-center gap-1 text-[10px] text-white/45 normal-case tracking-normal">
                                <Paperclip className="h-3 w-3" /> {drawerAttachments} Anhänge
                              </span>
                            </h4>
                            {drawerLoading ? (
                              <div className="text-xs text-white/45">// lade …</div>
                            ) : drawerChat.length === 0 ? (
                              <div className="text-xs text-white/45">Keine Nachrichten zu diesem Vorgang.</div>
                            ) : (
                              <div>
                                {drawerChat.map((m) => (
                                  <div key={m.id} className="cockpit-chat-msg">
                                    <span className="cockpit-chat-msg__author">{userName(m.author_id)}</span>
                                    <span className="cockpit-chat-msg__body">{m.body}</span>
                                    <span className="cockpit-chat-msg__time">{fmtAgo(m.created_at)}</span>
                                  </div>
                                ))}
                                {selectedCaseId && (
                                  <button
                                    type="button"
                                    onClick={() => navigate(`/cases/${selectedCaseId}`)}
                                    className="mt-2 text-[10px] uppercase tracking-[0.22em] text-cyan-300 hover:underline"
                                  >
                                    → kompletten Vorgang öffnen
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()
                  : null
              }
            />

            {/* Compare lanes */}
            {compareIds.map((cid, idx) => (
              <CompareLane
                key={cid}
                caseId={cid}
                tasks={tasks}
                deptName={deptName}
                heatLevel={heatLevel}
                accentBaseHue={[40, 280, 340, 160][idx % 4]}
                caseLabel={caseNo(cid)}
              />
            ))}
          </section>


          {/* FEATURE BAR */}
          <div className="cockpit-featurebar">
            <div className="cockpit-featurebar__item"><Database className="h-3.5 w-3.5" /> Echtzeit-Daten</div>
            <div className="cockpit-featurebar__item"><Network className="h-3.5 w-3.5" /> Vernetzte Systeme</div>
            <div className="cockpit-featurebar__item"><Brain className="h-3.5 w-3.5" /> Intelligente Prozesse</div>
            <div className="cockpit-featurebar__item"><Target className="h-3.5 w-3.5" /> Gemeinsamer Erfolg</div>
          </div>

          {/* COMMAND PALETTE */}
          <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
            <DialogContent className="cockpit-cmd-dialog p-0 max-w-xl bg-[#0b1322] border border-cyan-400/30">
              <Command className="bg-transparent text-white">
                <CommandInput
                  placeholder={pickerMode === 'compare' ? 'Vorgang zum Vergleich hinzufügen…' : 'Vorgang suchen (Nr. oder Projekt)…'}
                  className="text-sm"
                />
                <CommandList className="max-h-[360px]">
                  <CommandEmpty>Keine Treffer.</CommandEmpty>
                  <CommandGroup heading={pickerMode === 'compare' ? 'Vergleichen' : 'Vorgänge'}>
                    {cases.map((c) => {
                      const disabled =
                        pickerMode === 'compare' &&
                        (c.id === selectedCaseId || compareIds.includes(c.id));
                      return (
                        <CommandItem
                          key={c.id}
                          value={`${c.case_no ?? ''} ${c.project_name ?? ''}`}
                          disabled={disabled}
                          onSelect={() => {
                            if (pickerMode === 'compare') {
                              if (!disabled) setCompareIds((prev) => [...prev, c.id].slice(0, 3));
                            } else {
                              setSelectedCaseId(c.id);
                              setSelectedNodeId(null);
                            }
                            setPickerOpen(false);
                          }}
                          className="text-white/85 aria-selected:bg-cyan-500/10"
                        >
                          <span className="font-mono text-xs text-cyan-300 mr-3">{c.case_no ?? '—'}</span>
                          <span className="truncate">{c.project_name ?? '—'}</span>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </CommandList>
              </Command>
            </DialogContent>
          </Dialog>
        </div>

        {!bootDone && (
          <div className="cockpit-boot" aria-hidden>
            <div className="cockpit-boot__line">// COCKPIT v1.0 — initialisiere subsysteme</div>
            <div className="cockpit-boot__line">// telemetrie · netzwerk · pipeline … <span className="text-emerald-300">OK</span></div>
            <div className="cockpit-boot__line">// engage.</div>
          </div>
        )}
      </div>
    </AppLayout>
  );

}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="cockpit-field__label">{label}</div>
      <div className="text-sm text-white/85">{value}</div>
    </div>
  );
}

/**
 * Animated SVG overlay drawn behind the pipeline. Renders a luminous flow line
 * across all nodes; a particle pulses up to the current step to communicate flow direction.
 * Lightweight, no extra deps.
 */
function PipelineFlow({ count, currentIdx }: { count: number; currentIdx: number }) {
  if (count < 2) return null;
  const STEP_W = 132; // matches .cockpit-step width
  const CONN_W = 36;  // matches .cockpit-connector width
  const NODE_Y = 36;  // vertical center of the hex (height 64 / 2 + padding)
  const totalW = count * STEP_W + (count - 1) * CONN_W;
  // Build polyline through node centers
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i < count; i++) {
    points.push({ x: i * (STEP_W + CONN_W) + STEP_W / 2, y: NODE_Y });
  }
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const litUntil = currentIdx === -1 ? count - 1 : currentIdx;
  const litPts = points.slice(0, litUntil + 1);
  const dLit = litPts.length > 1 ? litPts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') : '';

  return (
    <svg
      className="cockpit-flow"
      width={totalW}
      height={72}
      viewBox={`0 0 ${totalW} 72`}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id="cockpitFlowGradient" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="hsl(195 100% 65%)" />
          <stop offset="100%" stopColor="hsl(142 90% 60%)" />
        </linearGradient>
      </defs>
      <path d={d} />
      {dLit && <path d={dLit} className="lit" />}
      {dLit && (
        <circle r="3.5" className="particle">
          <animateMotion dur="3.2s" repeatCount="indefinite" path={dLit} rotate="auto" />
        </circle>
      )}
    </svg>
  );
}

/** Renders a single horizontal pipeline (used for primary + compare lanes). */
function PipelineLane({
  tasks,
  accentBaseHue,
  selectedNodeId,
  onSelectNode,
  deptName,
  heatLevel,
  caseLabel,
  extraDrawer,
}: {
  tasks: Task[];
  accentBaseHue: number;
  selectedNodeId: string | null;
  onSelectNode: (id: string) => void;
  deptName: (id: string | null) => string;
  heatLevel: (a: string | null, b: string | null) => number;
  caseLabel: string | null;
  extraDrawer?: React.ReactNode;
}) {
  const currentIdx = tasks.findIndex((t) => !t.completed && t.status !== 'done');
  return (
    <div className="cockpit-panel cockpit-hud">
      <span className="cockpit-hud__bl" /><span className="cockpit-hud__br" />
      {caseLabel && (
        <div className="cockpit-lane-label">
          <span className="font-mono text-cyan-300">{caseLabel}</span>
        </div>
      )}
      {tasks.length === 0 ? (
        <div className="text-sm text-white/50 py-10 text-center">Keine Aufgaben für diesen Vorgang.</div>
      ) : (
        <>
          <div className="overflow-x-auto pb-4 relative">
            <PipelineFlow count={tasks.length} currentIdx={currentIdx} />
            <ol className="cockpit-pipeline relative" style={{ zIndex: 1 }}>
              {tasks.map((t, i) => {
                const done = t.completed || t.status === 'done';
                const current = !done && i === currentIdx;
                const upcoming = !done && !current;
                const active = selectedNodeId === t.id;
                const progress = tasks.length > 1 ? i / (tasks.length - 1) : 0;
                const hue = accentBaseHue - progress * 60;
                const accentHsl = `${hue} 90% 58%`;
                const accentGlow = `hsla(${hue}, 90%, 58%, 0.55)`;
                const nextHue = accentBaseHue - ((i + 1) / Math.max(1, tasks.length - 1)) * 60;
                const heat = i < tasks.length - 1 ? heatLevel(t.department_id, tasks[i + 1].department_id) : 0;
                return (
                  <li key={t.id} className="flex items-start">
                    <button
                      type="button"
                      onClick={() => onSelectNode(t.id)}
                      className={cn('cockpit-step', active && 'cockpit-step--active', upcoming && 'cockpit-step--upcoming')}
                      style={{
                        // @ts-ignore
                        '--accent': `hsl(${accentHsl})`,
                        '--accent-glow': accentGlow,
                      } as React.CSSProperties}
                    >
                      <div className="cockpit-step__hex">
                        {done ? <Check className="h-6 w-6" strokeWidth={2.2} /> : current ? <Clock className="h-5 w-5" /> : <span className="text-[11px] font-mono">{String(i + 1).padStart(2, '0')}</span>}
                      </div>
                      <div className="cockpit-step__label">
                        <div className="cockpit-step__label-status">
                          {done ? 'erledigt' : current ? 'aktuell' : 'ausstehend'}
                        </div>
                        <div className="cockpit-step__label-title" data-text={t.title}>{t.title}</div>
                        <div className="cockpit-step__label-dept">{deptName(t.department_id)}</div>
                      </div>
                    </button>
                    {i < tasks.length - 1 && (
                      <div
                        className={cn(
                          'cockpit-connector',
                          (done || tasks[i + 1].completed || tasks[i + 1].status === 'done') && 'cockpit-connector--lit'
                        )}
                        data-heat={heat || undefined}
                        style={{
                          // @ts-ignore
                          '--from': `hsl(${accentHsl})`,
                          '--to': `hsl(${nextHue} 90% 58%)`,
                        } as React.CSSProperties}
                      />
                    )}
                  </li>
                );
              })}
            </ol>
          </div>

          {extraDrawer}
        </>
      )}
    </div>
  );
}

/** Read-only compare lane: scopes tasks to a single case and renders a PipelineLane. */
function CompareLane({
  caseId,
  tasks,
  deptName,
  heatLevel,
  accentBaseHue,
  caseLabel,
}: {
  caseId: string;
  tasks: Task[];
  deptName: (id: string | null) => string;
  heatLevel: (a: string | null, b: string | null) => number;
  accentBaseHue: number;
  caseLabel: string;
}) {
  const scoped = useMemo(
    () => tasks.filter((t) => t.case_id === caseId).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [tasks, caseId]
  );
  return (
    <PipelineLane
      tasks={scoped}
      accentBaseHue={accentBaseHue}
      selectedNodeId={null}
      onSelectNode={() => {}}
      deptName={deptName}
      heatLevel={heatLevel}
      caseLabel={caseLabel}
    />
  );
}

