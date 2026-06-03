import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Navigate } from 'react-router-dom';
import { Pencil, Plus, Building2, X, UserPlus } from 'lucide-react';
import { UserAvatar } from '@/components/UserAvatar';
import { useLedDepartments } from '@/hooks/useDeptLead';

interface Department {
  id: string;
  name: string;
  code: string;
  manager_user_id: string | null;
  created_at: string;
}

interface Profile {
  id: string;
  display_name: string;
  short_code: string;
  avatar_url?: string | null;
  department_id?: string | null;
}

export default function AdminDepartments() {
  const { isAdmin, loading: authLoading } = useAuth();
  const { ledIds, isLead, loading: leadLoading } = useLedDepartments();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [members, setMembers] = useState<{ id: string; department_id: string; user_id: string; role: 'read' | 'write' | 'lead' }[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Department | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', code: '', manager_user_id: '' });
  const [addMemberFor, setAddMemberFor] = useState<string | null>(null);
  const [addMemberUserId, setAddMemberUserId] = useState<string>('');
  const [addMemberRole, setAddMemberRole] = useState<'read' | 'write' | 'lead'>('write');

  const fetchAll = async () => {
    const [deptRes, profRes, memRes] = await Promise.all([
      supabase.from('departments').select('*').order('name'),
      supabase.from('users_profile').select('id, display_name, short_code, avatar_url, department_id').eq('active', true).order('display_name'),
      (supabase as any).from('department_members').select('id, department_id, user_id, role'),
    ]);
    setDepartments(deptRes.data || []);
    setProfiles((profRes.data || []) as Profile[]);
    setMembers(((memRes as any).data || []) as { id: string; department_id: string; user_id: string; role: 'read' | 'write' | 'lead' }[]);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  if (!authLoading && !leadLoading && !isAdmin && !isLead) return <Navigate to="/" replace />;

  // Non-admin leads only see their own departments
  const visibleDepartments = isAdmin ? departments : departments.filter(d => ledIds.includes(d.id));
  const canManageDept = (deptId: string) => isAdmin || ledIds.includes(deptId);

  const openCreate = () => {
    setForm({ name: '', code: '', manager_user_id: '' });
    setCreating(true);
  };

  const openEdit = (d: Department) => {
    setEditing(d);
    setForm({ name: d.name, code: d.code, manager_user_id: d.manager_user_id || '' });
  };

  const saveCreate = async () => {
    if (!form.name.trim() || !form.code.trim()) return toast.error('Name und Kürzel erforderlich');
    const { error } = await supabase.from('departments').insert({
      name: form.name.trim(),
      code: form.code.trim().toUpperCase(),
      manager_user_id: form.manager_user_id || null,
    });
    if (error) return toast.error(error.message);
    toast.success('Abteilung angelegt');
    setCreating(false);
    fetchAll();
  };

  const saveEdit = async () => {
    if (!editing) return;
    const { error } = await supabase.from('departments').update({
      name: form.name.trim(),
      code: form.code.trim().toUpperCase(),
      manager_user_id: form.manager_user_id || null,
    }).eq('id', editing.id);
    if (error) return toast.error(error.message);
    toast.success('Abteilung aktualisiert');
    setEditing(null);
    fetchAll();
  };

  const managerName = (id: string | null) => profiles.find(p => p.id === id)?.display_name || '–';

  const formContent = (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Name</Label>
          <Input className="h-8 text-xs" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="z.B. Sales" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Kürzel</Label>
          <Input className="h-8 text-xs uppercase" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} placeholder="z.B. SALES" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Abteilungsleiter</Label>
        <Select value={form.manager_user_id || '_none'} onValueChange={v => setForm(f => ({ ...f, manager_user_id: v === '_none' ? '' : v }))}>
          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Kein Leiter" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="_none">Kein Leiter</SelectItem>
            {profiles.map(p => (
              <SelectItem key={p.id} value={p.id}>{p.display_name} ({p.short_code})</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  return (
    <AppLayout>
      <div className="space-y-4 max-w-3xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-foreground">Abteilungen</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isAdmin ? 'Abteilungen und Teamstruktur verwalten' : 'Mitglieder Ihrer Abteilung verwalten'}
            </p>
          </div>
          {isAdmin && (
            <Button size="sm" onClick={openCreate} className="h-8 text-xs gap-1.5">
              <Plus className="h-3.5 w-3.5" />Abteilung anlegen
            </Button>
          )}
        </div>

        {isAdmin && (
          <div className="rounded-md border border-border bg-card overflow-hidden">
            {loading ? (
              <div className="p-8 text-center text-xs text-muted-foreground">Laden…</div>
            ) : departments.length === 0 ? (
              <div className="p-8 text-center">
                <Building2 className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                <p className="text-xs text-muted-foreground">Noch keine Abteilungen angelegt</p>
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Name</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Kürzel</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Abteilungsleiter</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {departments.map(d => (
                    <tr key={d.id} className="hover:bg-muted/40 transition-colors">
                      <td className="px-4 py-2.5 font-medium text-foreground">{d.name}</td>
                      <td className="px-4 py-2.5 font-mono text-muted-foreground">{d.code}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{managerName(d.manager_user_id)}</td>
                      <td className="px-4 py-2.5">
                        <button onClick={() => openEdit(d)} className="text-muted-foreground hover:text-foreground transition-colors">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Team-Übersicht je Abteilung */}
        {!loading && visibleDepartments.length > 0 && (() => {
          const ROLE_LABEL: Record<'read' | 'write' | 'lead', string> = {
            read: 'Lesen', write: 'Schreiben', lead: 'Leitung',
          };
          const ROLE_CHIP: Record<'read' | 'write' | 'lead', string> = {
            read: 'bg-muted text-muted-foreground',
            write: 'bg-[hsl(var(--status-done))]/15 text-foreground',
            lead: 'bg-primary/15 text-primary',
          };
          const addMember = async (deptId: string) => {
            if (!addMemberUserId) return;
            const { error } = await (supabase as any).from('department_members').insert({
              department_id: deptId, user_id: addMemberUserId, role: addMemberRole,
            });
            if (error) return toast.error(error.message);
            toast.success('Mitglied hinzugefügt');
            setAddMemberFor(null); setAddMemberUserId(''); setAddMemberRole('write');
            fetchAll();
          };
          const removeMember = async (memberRowId: string) => {
            const { error } = await (supabase as any).from('department_members').delete().eq('id', memberRowId);
            if (error) return toast.error(error.message);
            toast.success('Mitglied entfernt');
            fetchAll();
          };
          const updateRole = async (memberRowId: string, role: 'read' | 'write' | 'lead') => {
            const { error } = await (supabase as any).from('department_members').update({ role }).eq('id', memberRowId);
            if (error) return toast.error(error.message);
            fetchAll();
          };
          return (
            <div className="space-y-4">
              <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Teams &amp; Rechte</h2>
              {visibleDepartments.map(d => {
                const rows = members
                  .filter(m => m.department_id === d.id)
                  .map(m => ({ row: m, profile: profiles.find(p => p.id === m.user_id) }))
                  .filter(x => x.profile)
                  .sort((a, b) => {
                    const order = { lead: 0, write: 1, read: 2 } as const;
                    return order[a.row.role] - order[b.row.role];
                  });
                if (rows.length === 0 && addMemberFor !== d.id && !canManageDept(d.id)) return null;
                const assignedIds = new Set(rows.map(r => r.profile!.id));
                const candidates = profiles.filter(p => !assignedIds.has(p.id));
                const canManage = canManageDept(d.id);
                return (
                  <div key={d.id} className="rounded-md border border-border bg-card p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                        <h3 className="text-sm font-medium text-foreground">{d.name}</h3>
                        <span className="text-[11px] text-muted-foreground">({rows.length})</span>
                      </div>
                      {canManage && (
                        <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1.5"
                          onClick={() => { setAddMemberFor(d.id); setAddMemberUserId(''); setAddMemberRole('write'); }}>
                          <UserPlus className="h-3 w-3" />Mitglied hinzufügen
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {rows.map(({ row, profile }) => (
                        <div key={row.id} className="flex items-center gap-3 rounded-md p-2 hover:bg-muted/40 transition-colors border border-border/40">
                          <UserAvatar user={profile as any} size="lg" tooltip={false} />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-foreground truncate">{profile!.display_name}</p>
                            <p className="text-[11px] font-mono text-muted-foreground">{profile!.short_code}</p>
                          </div>
                          {canManage ? (
                            <Select value={row.role} onValueChange={v => updateRole(row.id, v as any)}>
                              <SelectTrigger className={`h-6 px-2 text-[10px] gap-1 border-0 w-auto min-w-0 ${ROLE_CHIP[row.role]}`}>
                                <SelectValue>{ROLE_LABEL[row.role]}</SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="read" className="text-xs">Lesen</SelectItem>
                                <SelectItem value="write" className="text-xs">Schreiben</SelectItem>
                                <SelectItem value="lead" className="text-xs">Leitung</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className={`h-6 px-2 inline-flex items-center text-[10px] rounded ${ROLE_CHIP[row.role]}`}>{ROLE_LABEL[row.role]}</span>
                          )}
                          {canManage && (
                            <button onClick={() => removeMember(row.id)} className="text-muted-foreground hover:text-destructive transition-colors" title="Entfernen">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    {addMemberFor === d.id && (
                      <div className="mt-3 flex items-end gap-2 border-t border-border pt-3">
                        <div className="flex-1 space-y-1.5">
                          <Label className="text-[11px] text-muted-foreground">Mitarbeiter</Label>
                          <Select value={addMemberUserId} onValueChange={setAddMemberUserId}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Wählen…" /></SelectTrigger>
                            <SelectContent>
                              {candidates.map(p => (
                                <SelectItem key={p.id} value={p.id} className="text-xs">{p.display_name} ({p.short_code})</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5 w-32">
                          <Label className="text-[11px] text-muted-foreground">Rolle</Label>
                          <Select value={addMemberRole} onValueChange={v => setAddMemberRole(v as any)}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="read" className="text-xs">Lesen</SelectItem>
                              <SelectItem value="write" className="text-xs">Schreiben</SelectItem>
                              <SelectItem value="lead" className="text-xs">Leitung</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <Button size="sm" className="h-8 text-xs" onClick={() => addMember(d.id)} disabled={!addMemberUserId}>Hinzufügen</Button>
                        <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => { setAddMemberFor(null); setAddMemberUserId(''); }}>Abbrechen</Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* Create Dialog */}
        <Dialog open={creating} onOpenChange={o => !o && setCreating(false)}>
          <DialogContent>
            <DialogHeader><DialogTitle className="text-sm font-semibold">Neue Abteilung</DialogTitle></DialogHeader>
            {formContent}
            <Button onClick={saveCreate} className="w-full h-8 text-xs mt-2">Anlegen</Button>
          </DialogContent>
        </Dialog>

        {/* Edit Dialog */}
        <Dialog open={!!editing} onOpenChange={o => !o && setEditing(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle className="text-sm font-semibold">{editing?.name} bearbeiten</DialogTitle></DialogHeader>
            {formContent}
            <Button onClick={saveEdit} className="w-full h-8 text-xs mt-2">Speichern</Button>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
