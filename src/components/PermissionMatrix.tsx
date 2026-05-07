import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type Permission = 'none' | 'read' | 'write';

interface UserRow { id: string; display_name: string; short_code: string; }
interface DeptRow { id: string; name: string; code: string | null; owner_id: string | null; }
interface PermRow { user_id: string; department_id: string; permission: Permission; }

const PERM_OPTIONS: { value: Permission; label: string; color: string }[] = [
  { value: 'none', label: 'Kein Zugriff', color: 'bg-muted text-muted-foreground' },
  { value: 'read', label: 'Lesen', color: 'bg-[hsl(var(--status-planning))]/20 text-foreground' },
  { value: 'write', label: 'Lesen + Schreiben', color: 'bg-[hsl(var(--status-done))]/20 text-foreground' },
];

export function PermissionMatrix() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [depts, setDepts] = useState<DeptRow[]>([]);
  const [perms, setPerms] = useState<Map<string, Permission>>(new Map());
  const [emails, setEmails] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [updatingKey, setUpdatingKey] = useState<string | null>(null);

  const key = (u: string, d: string) => `${u}::${d}`;

  const load = async () => {
    const [u, d, p, eRes] = await Promise.all([
      supabase.from('users_profile').select('id, display_name, short_code').eq('active', true).order('display_name'),
      supabase.from('departments').select('id, name, code, owner_id').eq('is_active', true).order('sort_order').order('name'),
      supabase.from('department_permissions').select('user_id, department_id, permission'),
      supabase.functions.invoke('list-user-emails', { method: 'GET' }),
    ]);
    setUsers((u.data || []) as UserRow[]);
    setDepts(((d.data || []) as DeptRow[]).filter(x => !x.owner_id));
    const map = new Map<string, Permission>();
    (p.data || []).forEach((r: any) => map.set(key(r.user_id, r.department_id), r.permission));
    setPerms(map);
    if (!eRes.error && eRes.data) {
      setEmails(eRes.data as Record<string, string>);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const setPerm = async (userId: string, deptId: string, value: Permission) => {
    const k = key(userId, deptId);
    const prev = perms.get(k) || 'none';
    if (prev === value) return;
    setUpdatingKey(k);
    const next = new Map(perms);
    next.set(k, value);
    setPerms(next);

    if (value === 'none') {
      const { error } = await supabase
        .from('department_permissions')
        .delete()
        .eq('user_id', userId)
        .eq('department_id', deptId);
      if (error) {
        toast.error(error.message);
        const rb = new Map(perms); rb.set(k, prev); setPerms(rb);
      }
    } else {
      const { error } = await supabase
        .from('department_permissions')
        .upsert(
          { user_id: userId, department_id: deptId, permission: value },
          { onConflict: 'user_id,department_id' },
        );
      if (error) {
        toast.error(error.message);
        const rb = new Map(perms); rb.set(k, prev); setPerms(rb);
      }
    }
    setUpdatingKey(null);
  };

  const filteredUsers = users.filter(u => {
    if (!search) return true;
    const q = search.toLowerCase();
    const email = (emails[u.id] || '').toLowerCase();
    return u.display_name.toLowerCase().includes(q) || u.short_code.toLowerCase().includes(q) || email.includes(q);
  });

  if (loading) return <p className="text-xs text-muted-foreground p-4">Laden…</p>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="relative w-72">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Mitarbeiter suchen…"
            className="h-8 pl-7 text-xs"
          />
        </div>
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          {PERM_OPTIONS.map(o => (
            <span key={o.value} className="inline-flex items-center gap-1">
              <span className={cn('inline-block h-2.5 w-2.5 rounded-sm', o.color.split(' ')[0])} />
              {o.label}
            </span>
          ))}
        </div>
      </div>

      <div className="rounded-md border border-border overflow-auto max-h-[70vh]">
        <table className="text-xs border-collapse">
          <thead className="bg-muted/50 sticky top-0 z-10">
            <tr>
              <th className="text-left font-medium text-muted-foreground px-3 py-2 sticky left-0 bg-muted/80 backdrop-blur z-20 min-w-[220px]">
                Mitarbeiter
              </th>
              {depts.map(d => (
                <th key={d.id} className="font-medium text-muted-foreground px-2 py-2 text-left whitespace-nowrap min-w-[150px] border-l border-border">
                  <div className="flex flex-col">
                    <span className="text-foreground">{d.name}</span>
                    {d.code && <span className="text-[9px] font-mono text-muted-foreground">{d.code}</span>}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map(u => (
              <tr key={u.id} className="border-t border-border hover:bg-muted/20">
                <td className="px-3 py-1.5 sticky left-0 bg-card z-10 border-r border-border">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-foreground font-medium">{u.display_name}</span>
                    <span className="text-[9px] font-mono text-muted-foreground">{u.short_code}</span>
                    {emails[u.id] && (
                      <span className="text-[9px] text-muted-foreground truncate max-w-[180px]">{emails[u.id]}</span>
                    )}
                  </div>
                </td>
                {depts.map(d => {
                  const k = key(u.id, d.id);
                  const value = perms.get(k) || 'none';
                  const isUpdating = updatingKey === k;
                  return (
                    <td key={d.id} className="px-1.5 py-1 border-l border-border">
                      <div className="relative">
                        <select
                          value={value}
                          onChange={e => setPerm(u.id, d.id, e.target.value as Permission)}
                          disabled={isUpdating}
                          className={cn(
                            'w-full h-7 px-1.5 text-[11px] rounded border border-border bg-background appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring',
                            PERM_OPTIONS.find(o => o.value === value)?.color,
                          )}
                        >
                          {PERM_OPTIONS.map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                        {isUpdating && (
                          <Loader2 className="absolute right-1 top-1/2 -translate-y-1/2 h-3 w-3 animate-spin text-muted-foreground" />
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[10px] text-muted-foreground">
        Hinweis: Die Matrix dient aktuell der Verwaltung und Übersicht. Die Anwendung der Stufen auf Vorgangs-Lese-/Schreibrechte
        erfolgt erst nach expliziter Aktivierung.
      </p>
    </div>
  );
}
