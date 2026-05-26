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
  Clock, Archive, FolderOpen, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { SortableHeader, type SortState, nextSort, sortBy } from '@/components/SortableHeader';
import { UrgencyPicker } from '@/components/UrgencyPicker';
import { getUrgencyRowClass } from '@/lib/case-utils';

type ProjectSortKey = 'project_number' | 'name' | 'status' | 'owner' | 'dept' | 'created_at' | 'urgency';

type ViewMode = 'compact' | 'normal';

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
  const viewMode: ViewMode = preferences.compactTables ? 'compact' : 'normal';
  const compact = preferences.compactTables;
  const cellCls = compact ? 'px-2 py-1 text-sm' : 'px-4 py-2.5 text-xs';

  const [projects, setProjects] = useState<Project[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [owners, setOwners] = useState<{ id: string; short_code: string; display_name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [ownerFilter, setOwnerFilter] = useState('all');
  const [deptFilter, setDeptFilter] = useState('all');
  const [sort, setSort] = useState<SortState<ProjectSortKey>>(() => {
    try {
      const col = localStorage.getItem('projectsSort_column') as ProjectSortKey | null;
      const dir = localStorage.getItem('projectsSort_direction') as 'asc' | 'desc' | null;
      if (col && dir) return { column: col, direction: dir };
    } catch {}
    return { column: 'created_at', direction: 'desc' };
  });
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
    const list = (data || []) as Project[];
    const ownerIds = Array.from(new Set(list.map(p => p.owner_id).filter(Boolean))) as string[];
    let ownerMap: Record<string, string> = {};
    if (ownerIds.length) {
      const { data: profs } = await supabase
        .from('users_profile')
        .select('id, short_code, display_name')
        .in('id', ownerIds);
      ownerMap = Object.fromEntries((profs || []).map((u: any) => [u.id, u.short_code]));
      setOwners((profs || []) as any);
    }
    const deptMap = Object.fromEntries(departments.map(d => [d.id, d.name]));
    setProjects(
      list.map(p => ({
        ...p,
        dept_name: deptMap[p.department_id ?? ''] ?? null,
        owner_code: p.owner_id ? ownerMap[p.owner_id] ?? null : null,
      }))
    );
    setLoading(false);
  };

  useEffect(() => {
    supabase.from('departments').select('id, name, code').order('name')
      .then(r => setDepartments((r.data || []) as Department[]));
  }, []);

  useEffect(() => { fetchProjects(); }, [departments]);

  const handleSort = (col: ProjectSortKey) => {
    setSort(prev => {
      const next = nextSort(prev, col);
      try {
        if (next.column && next.direction) {
          localStorage.setItem('projectsSort_column', next.column);
          localStorage.setItem('projectsSort_direction', next.direction);
        } else {
          localStorage.removeItem('projectsSort_column');
          localStorage.removeItem('projectsSort_direction');
        }
      } catch {}
      return next;
    });
  };

  const resetFilters = () => {
    setSearch(''); setStatusFilter('all'); setOwnerFilter('all'); setDeptFilter('all');
  };
  const filtersActive = !!search || statusFilter !== 'all' || ownerFilter !== 'all' || deptFilter !== 'all';

  const filteredRaw = projects.filter(p => {
    if (statusFilter !== 'all' && p.status !== statusFilter) return false;
    if (ownerFilter !== 'all') {
      if (ownerFilter === '_none' && p.owner_id) return false;
      if (ownerFilter !== '_none' && p.owner_id !== ownerFilter) return false;
    }
    if (deptFilter !== 'all') {
      if (deptFilter === '_none' && p.department_id) return false;
      if (deptFilter !== '_none' && p.department_id !== deptFilter) return false;
    }
    if (search) {
      const s = search.toLowerCase();
      if (![p.name, p.project_number, p.project_code, p.description].some(v => v?.toLowerCase().includes(s))) return false;
    }
    return true;
  });

  const filtered = sort.column && sort.direction ? sortBy(filteredRaw, (p) => {
    switch (sort.column) {
      case 'project_number': return p.project_number;
      case 'name': return p.name;
      case 'status': return p.status;
      case 'owner': return p.owner_code ?? null;
      case 'dept': return p.dept_name ?? null;
      case 'created_at': return new Date(p.created_at).getTime();
      case 'urgency': return (p as any).urgency ?? 0;
      default: return null;
    }
  }, sort.direction) : filteredRaw;


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
            <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Status</SelectItem>
              <SelectItem value="active">Aktiv</SelectItem>
              <SelectItem value="completed">Abgeschlossen</SelectItem>
              <SelectItem value="archived">Archiviert</SelectItem>
            </SelectContent>
          </Select>
          <Select value={ownerFilter} onValueChange={setOwnerFilter}>
            <SelectTrigger className="w-[150px] h-8 text-xs"><SelectValue placeholder="Verantwortlich" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Verantwortlichen</SelectItem>
              <SelectItem value="_none">Ohne Verantwortlichen</SelectItem>
              {owners.map(o => <SelectItem key={o.id} value={o.id}>{o.short_code}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={deptFilter} onValueChange={setDeptFilter}>
            <SelectTrigger className="w-[160px] h-8 text-xs"><SelectValue placeholder="Abteilung" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Abteilungen</SelectItem>
              <SelectItem value="_none">Ohne Abteilung</SelectItem>
              {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
            </SelectContent>
          </Select>
          {filtersActive && (
            <button
              onClick={resetFilters}
              className="flex items-center gap-1.5 h-8 px-3 rounded-md border border-input bg-background text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors shrink-0"
            >
              <X className="h-3.5 w-3.5" />Zurücksetzen
            </button>
          )}
        </div>

        {/* Table */}
        <div className="rounded-md border border-border bg-card overflow-auto max-h-[calc(100vh-260px)]">
          {viewMode === 'compact' ? (
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className={cn(cellCls, 'sticky top-0 z-10 bg-card text-left font-medium text-muted-foreground w-6')}></th>
                  <SortableHeader column="project_number" sort={sort} onSort={handleSort} className={cn(cellCls, 'sticky top-0 z-10 bg-card text-left font-medium text-muted-foreground')}>Nr.</SortableHeader>
                  <SortableHeader column="name" sort={sort} onSort={handleSort} className={cn(cellCls, 'sticky top-0 z-10 bg-card text-left font-medium text-muted-foreground')}>Projektname</SortableHeader>
                  <SortableHeader column="owner" sort={sort} onSort={handleSort} className={cn(cellCls, 'sticky top-0 z-10 bg-card text-left font-medium text-muted-foreground')}>Bearbeiter</SortableHeader>
                  <SortableHeader column="created_at" sort={sort} onSort={handleSort} className={cn(cellCls, 'sticky top-0 z-10 bg-card text-left font-medium text-muted-foreground')}>Erstellt</SortableHeader>
                  <SortableHeader column="urgency" sort={sort} onSort={handleSort} className={cn(cellCls, 'sticky top-0 z-10 bg-card text-left font-medium text-muted-foreground')}>Dringlichkeit</SortableHeader>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  <tr><td colSpan={6} className={cn(cellCls, 'py-8 text-center text-muted-foreground')}>Laden…</td></tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className={cn(cellCls, 'py-12 text-center')}>
                      <Folder className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
                      <p className="text-muted-foreground">Keine abteilungsübergreifenden Vorgänge gefunden</p>
                    </td>
                  </tr>
                ) : filtered.map(p => (
                  <tr key={p.id} className={cn('hover:bg-muted/40 transition-colors', getUrgencyRowClass((p as any).urgency))}>
                    <td className={cellCls}>
                      <span className={cn('inline-block h-1.5 w-1.5 rounded-full', STATUS_COLORS[p.status] ?? 'bg-muted-foreground')} />
                    </td>
                    <td className={cn(cellCls, 'font-mono')}>
                      <Link to={`/projects/${p.id}`} className="text-primary hover:underline">{p.project_number}</Link>
                    </td>
                    <td className={cellCls}>
                      <Link to={`/projects/${p.id}`} className="text-foreground hover:text-primary transition-colors truncate">{p.name}</Link>
                    </td>
                    <td className={cn(cellCls, 'text-muted-foreground font-mono')}>{p.owner_code || '–'}</td>
                    <td className={cn(cellCls, 'text-muted-foreground tabular-nums')}>{format(new Date(p.created_at), 'dd.MM.yyyy')}</td>
                    <td className={cellCls}><UrgencyPicker value={(p as any).urgency} table="projects" rowId={p.id} size="sm" derived overridden={!!(p as any).urgency_override} canOverride={isAdmin} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <SortableHeader column="project_number" sort={sort} onSort={handleSort} className={cn(cellCls, 'sticky top-0 z-10 bg-card text-left font-medium text-muted-foreground')}>Projekt-Nr.</SortableHeader>
                  <SortableHeader column="name" sort={sort} onSort={handleSort} className={cn(cellCls, 'sticky top-0 z-10 bg-card text-left font-medium text-muted-foreground')}>Name</SortableHeader>
                  <SortableHeader column="dept" sort={sort} onSort={handleSort} className={cn(cellCls, 'sticky top-0 z-10 bg-card text-left font-medium text-muted-foreground')}>Abteilung</SortableHeader>
                  <SortableHeader column="status" sort={sort} onSort={handleSort} className={cn(cellCls, 'sticky top-0 z-10 bg-card text-left font-medium text-muted-foreground')}>Status</SortableHeader>
                  <th className={cn(cellCls, 'sticky top-0 z-10 bg-card text-left font-medium text-muted-foreground')}>Sichtbarkeit</th>
                  <SortableHeader column="created_at" sort={sort} onSort={handleSort} className={cn(cellCls, 'sticky top-0 z-10 bg-card text-left font-medium text-muted-foreground')}>Erstellt</SortableHeader>
                  <SortableHeader column="urgency" sort={sort} onSort={handleSort} className={cn(cellCls, 'sticky top-0 z-10 bg-card text-left font-medium text-muted-foreground')}>Dringlichkeit</SortableHeader>
                  <th className={cn(cellCls, 'sticky top-0 z-10 bg-card text-left font-medium text-muted-foreground')}></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  <tr><td colSpan={8} className={cn(cellCls, 'py-8 text-center text-muted-foreground')}>Laden…</td></tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className={cn(cellCls, 'py-12 text-center')}>
                      <Folder className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
                      <p className="text-muted-foreground">Keine abteilungsübergreifenden Vorgänge gefunden</p>
                    </td>
                  </tr>
                ) : filtered.map(p => (
                  <tr key={p.id} className={cn('hover:bg-muted/40 transition-colors', getUrgencyRowClass((p as any).urgency))}>
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
                    <td className={cellCls}><UrgencyPicker value={(p as any).urgency} table="projects" rowId={p.id} size="sm" derived overridden={!!(p as any).urgency_override} canOverride={isAdmin} /></td>
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
          )}
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
