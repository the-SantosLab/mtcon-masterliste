import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { CalendarRange, ChevronLeft, ChevronRight, Pencil } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

type Dept = { id: string; name: string };
type Profile = { id: string; full_name: string | null; department_id: string | null };
type CaseRow = { id: string; case_no: string | null; title: string | null; assigned_to: string | null; department_id: string | null; estimated_hours: number | null; planned_week: string | null; status: string };
type Cap = { id: string; user_id: string; week_start: string; capacity_hours: number };

// Monday of the week of given date (ISO)
function isoMonday(d: Date) {
  const x = new Date(d); const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day); x.setHours(0,0,0,0);
  return x;
}
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate()+n); return x; }
function fmtIso(d: Date) { return d.toISOString().slice(0,10); }
function kwLabel(d: Date) {
  const target = new Date(d); target.setHours(0,0,0,0);
  target.setDate(target.getDate() + 3 - ((target.getDay()+6)%7));
  const week1 = new Date(target.getFullYear(),0,4);
  const kw = 1 + Math.round(((target.getTime()-week1.getTime())/86400000 - 3 + ((week1.getDay()+6)%7))/7);
  return `KW ${kw}`;
}

export default function AdminCapacityPlan() {
  const { isAdmin } = useAuth();
  const [depts, setDepts] = useState<Dept[]>([]);
  const [deptId, setDeptId] = useState<string>('');
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [caps, setCaps] = useState<Cap[]>([]);
  const [weekStart, setWeekStart] = useState<Date>(() => isoMonday(new Date()));
  const [editCap, setEditCap] = useState<{ user_id: string; week_start: string; capacity_hours: number } | null>(null);
  const [editCase, setEditCase] = useState<CaseRow | null>(null);

  const weeks = useMemo(() => Array.from({length: 6}, (_, i) => addDays(weekStart, i*7)), [weekStart]);

  useEffect(() => {
    (async () => {
      const { data: d } = await supabase.from('departments').select('id, name').order('name');
      setDepts(d || []);
      const konstr = (d || []).find((x: any) => x.name.toLowerCase().includes('konstr'));
      setDeptId(konstr?.id || (d?.[0]?.id ?? ''));
    })();
  }, []);

  useEffect(() => {
    if (!deptId) return;
    (async () => {
      const [{ data: p }, { data: c }, { data: cap }] = await Promise.all([
        supabase.from('users_profile').select('id, full_name, department_id').eq('department_id', deptId).order('full_name'),
        (supabase.from('cases').select('id, case_no, title, assigned_to, department_id, estimated_hours, planned_week, status').eq('department_id', deptId).neq('status','completed').limit(500)) as any,
        (supabase.from('capacity_entries' as any).select('*').gte('week_start', fmtIso(weekStart)).lte('week_start', fmtIso(addDays(weekStart, 6*7)))) as any,
      ]);
      setProfiles(p || []); setCases(c || []); setCaps(cap || []);
    })();
  }, [deptId, weekStart]);

  const capMap = useMemo(() => {
    const m = new Map<string, Cap>();
    caps.forEach(c => m.set(`${c.user_id}|${c.week_start}`, c));
    return m;
  }, [caps]);

  const loadMap = useMemo(() => {
    const m = new Map<string, number>();
    cases.forEach(c => {
      if (!c.assigned_to || !c.planned_week || !c.estimated_hours) return;
      const k = `${c.assigned_to}|${c.planned_week}`;
      m.set(k, (m.get(k) || 0) + Number(c.estimated_hours));
    });
    return m;
  }, [cases]);

  const unplanned = useMemo(() => cases.filter(c => !c.planned_week || !c.estimated_hours || !c.assigned_to), [cases]);

  const saveCap = async () => {
    if (!editCap) return;
    const { error } = await (supabase.from('capacity_entries' as any).upsert({
      user_id: editCap.user_id, week_start: editCap.week_start,
      capacity_hours: editCap.capacity_hours, department_id: deptId,
    }, { onConflict: 'user_id,week_start' })) as any;
    if (error) return toast.error(error.message);
    const { data } = await (supabase.from('capacity_entries' as any).select('*').gte('week_start', fmtIso(weekStart)).lte('week_start', fmtIso(addDays(weekStart, 6*7)))) as any;
    setCaps(data || []);
    setEditCap(null);
    toast.success('Kapazität gespeichert');
  };

  const saveCase = async () => {
    if (!editCase) return;
    const { error } = await (supabase.from('cases').update({
      estimated_hours: editCase.estimated_hours, planned_week: editCase.planned_week, assigned_to: editCase.assigned_to,
    }).eq('id', editCase.id)) as any;
    if (error) return toast.error(error.message);
    setCases(cs => cs.map(c => c.id === editCase.id ? editCase : c));
    setEditCase(null);
    toast.success('Geplant');
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2"><CalendarRange className="h-5 w-5" /> Kapazitätsplan</h1>
            <p className="text-sm text-muted-foreground mt-1">Auslastung Konstruktion (oder andere Abteilung) — 6 Wochen rollend, Soll vs. Ist.</p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={deptId} onValueChange={setDeptId}>
              <SelectTrigger className="w-48 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{depts.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={() => setWeekStart(addDays(weekStart, -7))}><ChevronLeft className="h-4 w-4" /></Button>
            <Button size="sm" variant="outline" onClick={() => setWeekStart(isoMonday(new Date()))} className="text-xs">Heute</Button>
            <Button size="sm" variant="outline" onClick={() => setWeekStart(addDays(weekStart, 7))}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>

        <Card className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/30 text-[10px] uppercase text-muted-foreground">
              <tr>
                <th className="text-left p-3 font-medium sticky left-0 bg-muted/30 min-w-[180px]">Mitarbeiter</th>
                {weeks.map(w => (
                  <th key={fmtIso(w)} className="text-center p-3 font-medium min-w-[110px]">
                    <div>{kwLabel(w)}</div>
                    <div className="text-muted-foreground font-mono text-[9px] normal-case">{fmtIso(w)}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {profiles.length === 0 ? <tr><td colSpan={weeks.length+1} className="p-6 text-center text-muted-foreground">Keine Mitarbeiter in dieser Abteilung</td></tr>
              : profiles.map(p => (
                <tr key={p.id} className="border-t border-border/40">
                  <td className="p-3 sticky left-0 bg-background">{p.full_name || '—'}</td>
                  {weeks.map(w => {
                    const ws = fmtIso(w);
                    const cap = capMap.get(`${p.id}|${ws}`);
                    const load = loadMap.get(`${p.id}|${ws}`) || 0;
                    const capH = cap?.capacity_hours ?? 40;
                    const pct = capH ? Math.round((load / capH) * 100) : 0;
                    const tone = pct > 100 ? 'bg-rose-500/20 border-rose-500/40 text-rose-200'
                      : pct > 85 ? 'bg-amber-500/20 border-amber-500/40 text-amber-200'
                      : pct > 0 ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-200'
                      : 'bg-muted/20 border-border/30 text-muted-foreground';
                    return (
                      <td key={ws} className="p-1 text-center">
                        <button
                          disabled={!isAdmin}
                          onClick={() => setEditCap({ user_id: p.id, week_start: ws, capacity_hours: capH })}
                          className={`w-full rounded border ${tone} px-2 py-1.5 ${isAdmin ? 'hover:opacity-80' : 'cursor-default'}`}
                        >
                          <div className="tabular-nums text-xs font-medium">{load.toFixed(1)} / {capH}</div>
                          <div className="text-[10px] opacity-80">{pct} %</div>
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-medium">Unverplante Vorgänge ({unplanned.length})</div>
            <div className="text-[10px] text-muted-foreground">Klick zum Planen — Stunden, KW, Bearbeiter setzen.</div>
          </div>
          <div className="space-y-1.5 max-h-80 overflow-y-auto">
            {unplanned.length === 0 ? <div className="text-xs text-muted-foreground p-3 text-center">Alle Vorgänge sind verplant</div>
            : unplanned.map(c => (
              <button key={c.id} onClick={() => setEditCase(c)} className="w-full text-left p-2 rounded border border-border/40 hover:bg-muted/20 flex items-center justify-between text-xs">
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-[10px] text-muted-foreground">{c.case_no || c.id.slice(0,8)}</div>
                  <div className="truncate">{c.title || '—'}</div>
                </div>
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                  <span>{c.estimated_hours != null ? `${c.estimated_hours} h` : 'keine h'}</span>
                  <span>{c.planned_week || 'keine KW'}</span>
                  <span>{c.assigned_to ? profiles.find(p => p.id === c.assigned_to)?.full_name || '—' : 'nicht zugewiesen'}</span>
                  <Pencil className="h-3 w-3" />
                </div>
              </button>
            ))}
          </div>
        </Card>

        <Dialog open={!!editCap} onOpenChange={(o) => !o && setEditCap(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Kapazität bearbeiten</DialogTitle></DialogHeader>
            {editCap && (
              <div className="space-y-3">
                <div className="text-xs text-muted-foreground">{profiles.find(p => p.id === editCap.user_id)?.full_name} · {editCap.week_start}</div>
                <div><Label className="text-xs">Stunden / Woche</Label>
                  <Input type="number" step="0.5" value={editCap.capacity_hours} onChange={e => setEditCap({ ...editCap, capacity_hours: Number(e.target.value) })} />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditCap(null)}>Abbrechen</Button>
              <Button onClick={saveCap}>Speichern</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!editCase} onOpenChange={(o) => !o && setEditCase(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Vorgang planen</DialogTitle></DialogHeader>
            {editCase && (
              <div className="space-y-3">
                <div className="text-xs"><span className="font-mono text-muted-foreground">{editCase.case_no}</span> · {editCase.title}</div>
                <div><Label className="text-xs">Bearbeiter</Label>
                  <Select value={editCase.assigned_to || ''} onValueChange={v => setEditCase({ ...editCase, assigned_to: v || null })}>
                    <SelectTrigger><SelectValue placeholder="Wählen…" /></SelectTrigger>
                    <SelectContent>{profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name || '—'}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label className="text-xs">Geschätzte Stunden</Label>
                  <Input type="number" step="0.5" value={editCase.estimated_hours ?? ''} onChange={e => setEditCase({ ...editCase, estimated_hours: e.target.value === '' ? null : Number(e.target.value) })} />
                </div>
                <div><Label className="text-xs">Geplante KW (Montag)</Label>
                  <Input type="date" value={editCase.planned_week || ''} onChange={e => {
                    const d = e.target.value ? isoMonday(new Date(e.target.value)) : null;
                    setEditCase({ ...editCase, planned_week: d ? fmtIso(d) : null });
                  }} />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditCase(null)}>Abbrechen</Button>
              <Button onClick={saveCase}>Speichern</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
