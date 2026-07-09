import { useState, useMemo } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Users, X, Search, Building2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toastError } from '@/lib/errors';
import { cn } from '@/lib/utils';

interface Profile { id: string; display_name: string; short_code: string; }
interface Department { id: string; name: string; }

interface WatchersSectionProps {
  caseId: string;
  watchers: string[];
  profiles: Profile[];
  canEdit: boolean;
  onChange: () => void;
  entityTable?: 'cases' | 'projects';
  title?: string;
  description?: string;
  watcherDepartments?: string[];
  departments?: Department[];
}

export function WatchersSection({
  caseId, watchers, profiles, canEdit, onChange,
  entityTable = 'cases', title, description,
  watcherDepartments = [], departments = [],
}: WatchersSectionProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'people' | 'depts'>('people');
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);

  const supportsDepartments = entityTable === 'cases' && departments.length > 0;

  const watched = useMemo(
    () => watchers.map(id => profiles.find(p => p.id === id)).filter(Boolean) as Profile[],
    [watchers, profiles],
  );

  const watchedDepts = useMemo(
    () => watcherDepartments.map(id => departments.find(d => d.id === id)).filter(Boolean) as Department[],
    [watcherDepartments, departments],
  );

  const filteredProfiles = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return profiles;
    return profiles.filter(p =>
      p.display_name.toLowerCase().includes(q) || p.short_code.toLowerCase().includes(q),
    );
  }, [profiles, query]);

  const filteredDepts = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return departments;
    return departments.filter(d => d.name.toLowerCase().includes(q));
  }, [departments, query]);

  const update = async (patch: { watchers?: string[]; watcher_departments?: string[] }) => {
    setSaving(true);
    const { error } = await supabase.from(entityTable).update(patch as any).eq('id', caseId);
    setSaving(false);
    if (error) { toastError(error, entityTable === 'projects' ? 'project_watcher' : 'case_watcher'); return; }
    onChange();
  };

  const togglePerson = (id: string) => {
    const next = watchers.includes(id) ? watchers.filter(x => x !== id) : [...watchers, id];
    update({ watchers: next });
  };

  const toggleDept = (id: string) => {
    const next = watcherDepartments.includes(id) ? watcherDepartments.filter(x => x !== id) : [...watcherDepartments, id];
    update({ watcher_departments: next });
  };

  return (
    <div className="rounded-md border border-border bg-card px-5 py-2">
      <div className="flex items-center gap-2 mb-1">
        <Users className="h-3.5 w-3.5 text-muted-foreground" />
        <h3 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{title ?? 'Weitere Personen informieren'}</h3>
      </div>
      <p className="text-[11px] text-muted-foreground mb-2">
        {description ?? 'Diese Personen und Abteilungen erhalten Zugriff auf Notizen und werden per Email informiert.'}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        {watched.length === 0 && watchedDepts.length === 0 && (
          <span className="text-[13px] text-muted-foreground">Niemand</span>
        )}
        {watched.map(p => (
          <Badge key={p.id} variant="secondary" className="text-[11px] gap-1.5 pr-1">
            <span className="font-mono text-[10px] text-muted-foreground">{p.short_code}</span>
            {p.display_name}
            {canEdit && (
              <button onClick={() => togglePerson(p.id)} className="ml-0.5 rounded hover:bg-muted p-0.5" disabled={saving}>
                <X className="h-3 w-3" />
              </button>
            )}
          </Badge>
        ))}
        {watchedDepts.map(d => (
          <Badge key={d.id} variant="outline" className="text-[11px] gap-1.5 pr-1 border-primary/40">
            <Building2 className="h-3 w-3 text-muted-foreground" />
            {d.name}
            {canEdit && (
              <button onClick={() => toggleDept(d.id)} className="ml-0.5 rounded hover:bg-muted p-0.5" disabled={saving}>
                <X className="h-3 w-3" />
              </button>
            )}
          </Badge>
        ))}
        {canEdit && (
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 text-[11px]">+ Hinzufügen</Button>
            </PopoverTrigger>
            <PopoverContent className="w-[300px] p-0" align="start">
              {supportsDepartments && (
                <div className="flex border-b border-border">
                  <button
                    type="button"
                    onClick={() => setTab('people')}
                    className={cn('flex-1 text-[11px] py-1.5', tab === 'people' ? 'bg-muted font-medium' : 'text-muted-foreground')}
                  >Personen</button>
                  <button
                    type="button"
                    onClick={() => setTab('depts')}
                    className={cn('flex-1 text-[11px] py-1.5', tab === 'depts' ? 'bg-muted font-medium' : 'text-muted-foreground')}
                  >Abteilungen</button>
                </div>
              )}
              <div className="p-2 border-b border-border">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    autoFocus
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="Suchen…"
                    className="h-7 text-xs pl-7"
                  />
                </div>
              </div>
              <div className="max-h-[260px] overflow-y-auto py-1">
                {tab === 'people' ? (
                  filteredProfiles.length === 0 ? (
                    <p className="text-xs text-muted-foreground px-3 py-2">Keine Treffer</p>
                  ) : filteredProfiles.map(p => {
                    const active = watchers.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        onClick={() => togglePerson(p.id)}
                        disabled={saving}
                        className={cn(
                          'w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-muted/50 transition-colors',
                          active && 'bg-muted/30',
                        )}
                      >
                        <span className={cn('h-3 w-3 rounded border border-border flex items-center justify-center text-[9px]', active && 'bg-primary border-primary text-primary-foreground')}>
                          {active ? '✓' : ''}
                        </span>
                        <span className="font-mono text-[10px] text-muted-foreground">{p.short_code}</span>
                        <span className="flex-1 truncate">{p.display_name}</span>
                      </button>
                    );
                  })
                ) : (
                  filteredDepts.length === 0 ? (
                    <p className="text-xs text-muted-foreground px-3 py-2">Keine Treffer</p>
                  ) : filteredDepts.map(d => {
                    const active = watcherDepartments.includes(d.id);
                    return (
                      <button
                        key={d.id}
                        onClick={() => toggleDept(d.id)}
                        disabled={saving}
                        className={cn(
                          'w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-muted/50 transition-colors',
                          active && 'bg-muted/30',
                        )}
                      >
                        <span className={cn('h-3 w-3 rounded border border-border flex items-center justify-center text-[9px]', active && 'bg-primary border-primary text-primary-foreground')}>
                          {active ? '✓' : ''}
                        </span>
                        <Building2 className="h-3 w-3 text-muted-foreground" />
                        <span className="flex-1 truncate">{d.name}</span>
                      </button>
                    );
                  })
                )}
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>
    </div>
  );
}
