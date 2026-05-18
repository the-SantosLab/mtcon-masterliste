import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  Plus, Search, Folder, ChevronRight, CheckCircle2,
  Clock, Archive, FolderOpen, Rows3, Rows2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

type ViewMode = 'compact' | 'normal';
const VIEW_KEY = 'projekt_list_view_mode';

interface Department { id: string; name: string; code: string; }
interface Project {
  id: string;
  project_number: string;
  project_code: string | null;
  name: string;
  description: string | null;
  status: string;
  visibility: string;
  created_at: string;
  department_id: string | null;
  owner_id: string | null;
  dept_name?: string | null;
  owner_code?: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-[hsl(var(--status-working))]',
  completed: 'bg-[hsl(var(--status-done))]',
  archived: 'bg-[hsl(var(--status-archive))]',
};
const STATUS_LABELS: Record<string, string> = {
  active: 'Aktiv',
  completed: 'Abgeschlossen',
  archived: 'Archiviert',
};

function StatusDot({ status }: { status: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className={cn('h-1.5 w-1.5 rounded-full', STATUS_COLORS[status] ?? 'bg-muted-foreground')} />
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

export default function ProjectsList() {
  const { user, isAdmin, isViewer } = useAuth();
  const { preferences } = usePreferences();
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window === 'undefined') return 'normal';
    const v = window.localStorage.getItem(VIEW_KEY);
    return v === 'compact' ? 'compact' : 'normal';
  });
  useEffect(() => {
    try { window.localStorage.setItem(VIEW_KEY, viewMode); } catch {}
  }, [viewMode]);
  const compact = viewMode === 'compact' || preferences.compactTables;
  const cellCls = viewMode === 'compact'
    ? 'px-2 py-1 text-sm'
    : compact ? 'px-3 py-1.5 text-xs' : 'px-4 py-2.5 text-xs';

  const [projects, setProjects] = useState<Project[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: '', description: '', department_id: '', visibility: 'project_members',
  });

  const fetchProjects = async () => {
    const { data } = await supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: false });
    const deptMap = Object.fromEntries(departments.map(d => [d.id, d.name]));
    setProjects(
      ((data || []) as Project[]).map(p => ({
        ...p,
        dept_name: deptMap[p.department_id ?? ''] ?? null,
      }))
    );
    setLoading(false);
  };

  useEffect(() => {
    supabase.from('departments').select('id, name, code').order('name')
      .then(r => setDepartments((r.data || []) as Department[]));
  }, []);

  useEffect(() => { fetchProjects(); }, [departments]);

  const filtered = projects.filter(p => {
    if (statusFilter !== 'all' && p.status !== statusFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      if (![p.name, p.project_number, p.project_code, p.description].some(v => v?.toLowerCase().includes(s))) return false;
    }
    return true;
  });

  const createProject = async () => {
    if (!form.name.trim()) return toast.error('Projektname erforderlich');
    if (!user) return;
    setCreating(true);

    const { data, error } = await supabase.from('projects').insert({
      name: form.name.trim(),
      description: form.description || null,
      department_id: form.department_id || null,
      visibility: form.visibility as any,
      created_by: user.id,
      owner_id: user.id,
    }).select().single();

    if (error || !data) {
      toast.error('Fehler: ' + error?.message);
      setCreating(false);
      return;
    }

    // Also add creator as project member
    await supabase.from('project_members').insert({
      project_id: data.id,
      user_id: user.id,
      role: 'manager',
    });

    // Trigger folder creation via Edge Function
    try {
      const { data: fnData } = await supabase.functions.invoke('create-project-folders', {
        body: {
          project_id: data.id,
          project_number: data.project_number,
          project_code: data.project_code,
        },
      });
      if (fnData?.success) toast.success(`Projekt ${data.project_number} angelegt + ${fnData.folders} Ordner erstellt`);
      else toast.success(`Projekt ${data.project_number} angelegt`);
    } catch {
      toast.success(`Projekt ${data.project_number} angelegt`);
    }

    setCreateOpen(false);
    setCreating(false);
    setForm({ name: '', description: '', department_id: '', visibility: 'project_members' });
    fetchProjects();
  };

  return (
    <AppLayout>
      <div className="space-y-4 max-w-6xl">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-lg font-semibold text-foreground">Vorgänge abteilungsübergreifend / Projekte</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Alle abteilungsübergreifenden Vorgänge und Dateiablagen</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex items-center rounded-md border border-border bg-card p-0.5">
              <button
                type="button"
                onClick={() => setViewMode('compact')}
                title="Tabelle kompakt"
                aria-label="Tabelle kompakt"
                className={cn(
                  'inline-flex items-center justify-center h-7 w-7 rounded-sm transition-colors',
                  viewMode === 'compact' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Rows3 className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('normal')}
                title="Tabelle normal"
                aria-label="Tabelle normal"
                className={cn(
                  'inline-flex items-center justify-center h-7 w-7 rounded-sm transition-colors',
                  viewMode === 'normal' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Rows2 className="h-3.5 w-3.5" />
              </button>
            </div>
            {!isViewer && (
              <Button size="sm" onClick={() => setCreateOpen(true)} className="h-8 text-xs gap-1.5">
                <Plus className="h-3.5 w-3.5" />Neues Projekt
              </Button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Suche nach Name, Nummer…" className="pl-9 h-8 text-xs" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px] h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Status</SelectItem>
              <SelectItem value="active">Aktiv</SelectItem>
              <SelectItem value="completed">Abgeschlossen</SelectItem>
              <SelectItem value="archived">Archiviert</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <div className="rounded-md border border-border bg-card overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className={cn(cellCls, 'text-left font-medium text-muted-foreground')}>Projekt-Nr.</th>
                <th className={cn(cellCls, 'text-left font-medium text-muted-foreground')}>Name</th>
                <th className={cn(cellCls, 'text-left font-medium text-muted-foreground')}>Abteilung</th>
                <th className={cn(cellCls, 'text-left font-medium text-muted-foreground')}>Status</th>
                <th className={cn(cellCls, 'text-left font-medium text-muted-foreground')}>Sichtbarkeit</th>
                <th className={cn(cellCls, 'text-left font-medium text-muted-foreground')}>Erstellt</th>
                <th className={cn(cellCls, 'text-left font-medium text-muted-foreground')}></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={7} className={cn(cellCls, 'py-8 text-center text-muted-foreground')}>Laden…</td></tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className={cn(cellCls, 'py-12 text-center')}>
                    <Folder className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
                    <p className="text-muted-foreground">Keine abteilungsübergreifenden Vorgänge gefunden</p>
                  </td>
                </tr>
              ) : filtered.map(p => (
                <tr key={p.id} className="hover:bg-muted/40 transition-colors">
                  <td className={cn(cellCls, 'font-mono')}>
                    <Link to={`/projects/${p.id}`} className="text-primary hover:underline">{p.project_number}</Link>
                  </td>
                  <td className={cellCls}>
                    <div>
                      <Link to={`/projects/${p.id}`} className="text-foreground font-medium hover:text-primary transition-colors">{p.name}</Link>
                      {p.description && (
                        <p className="text-muted-foreground text-[11px] mt-0.5 truncate max-w-xs">{p.description}</p>
                      )}
                    </div>
                  </td>
                  <td className={cn(cellCls, 'text-muted-foreground')}>{p.dept_name || '–'}</td>
                  <td className={cellCls}><StatusDot status={p.status} /></td>
                  <td className={cn(cellCls, 'text-muted-foreground capitalize')}>
                    {p.visibility === 'project_members' ? 'Team' : p.visibility === 'department' ? 'Abteilung' : 'Privat'}
                  </td>
                  <td className={cn(cellCls, 'text-muted-foreground tabular-nums')}>
                    {format(new Date(p.created_at), 'dd.MM.yyyy')}
                  </td>
                  <td className={cellCls}>
                    <div className="flex items-center gap-3">
                      <Link
                        to={`/projects/${p.id}`}
                        className="text-muted-foreground hover:text-foreground transition-colors text-[11px]"
                      >
                        Details
                      </Link>
                      <Link
                        to={`/projects/${p.id}/files`}
                        className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors text-[11px]"
                      >
                        <FolderOpen className="h-3.5 w-3.5" />
                        Dateien
                        <ChevronRight className="h-3 w-3" />
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-muted-foreground">{filtered.length} Projekt{filtered.length !== 1 ? 'e' : ''}</p>
      </div>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={o => !o && setCreateOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">Neues Projekt anlegen</DialogTitle>
            <p className="text-[11px] text-muted-foreground">Die Projektnummer (PRJ-YYYY-xxxx) wird automatisch vergeben.</p>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Projektname *</Label>
              <Input
                className="h-8 text-xs"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="z.B. Website Redesign 2026"
                onKeyDown={e => e.key === 'Enter' && createProject()}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Beschreibung</Label>
              <Textarea
                className="text-xs resize-none"
                rows={2}
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Kurze Beschreibung des Projekts"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Abteilung</Label>
                <Select value={form.department_id || '_none'} onValueChange={v => setForm(f => ({ ...f, department_id: v === '_none' ? '' : v }))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Keine" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Keine</SelectItem>
                    {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Sichtbarkeit</Label>
                <Select value={form.visibility} onValueChange={v => setForm(f => ({ ...f, visibility: v }))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="project_members">Nur Team</SelectItem>
                    <SelectItem value="department">Abteilung</SelectItem>
                    <SelectItem value="private">Privat</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="rounded-md bg-muted/50 border border-border px-3 py-2 text-[11px] text-muted-foreground">
              Nach dem Anlegen werden automatisch <strong className="text-foreground">6 Ordner</strong> erstellt:<br />
              01_Verwaltung · 02_Briefing · 03_Kalkulation · 04_Dateien · 05_Lieferung · 99_Archiv
            </div>
            <Button onClick={createProject} className="w-full h-8 text-xs" disabled={creating}>
              {creating ? 'Wird angelegt…' : 'Projekt anlegen'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
