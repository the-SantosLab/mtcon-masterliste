import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import type { Tables, Enums } from '@/integrations/supabase/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Navigate } from 'react-router-dom';
import { Pencil, UserPlus, Loader2 } from 'lucide-react';

type ProfileWithRole = Tables<'users_profile'> & {
  role: Enums<'app_role'> | null;
  roleId: string | null;
  department_name?: string | null;
};

interface Department { id: string; name: string; code: string; }

const emptyNew = { email: '', display_name: '', short_code: '', role: 'staff', department_id: '' };

export default function AdminUsers() {
  const { isAdmin, loading: authLoading } = useAuth();
  const [users, setUsers] = useState<ProfileWithRole[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);

  // Edit state
  const [editing, setEditing] = useState<ProfileWithRole | null>(null);
  const [newRole, setNewRole] = useState<string>('staff');
  const [newActive, setNewActive] = useState(true);
  const [newDeptId, setNewDeptId] = useState<string>('');

  // Create state
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(emptyNew);

  const fetchUsers = async () => {
    const [profilesRes, rolesRes, deptsRes] = await Promise.all([
      supabase.from('users_profile').select('*').order('display_name'),
      supabase.from('user_roles').select('*'),
      supabase.from('departments').select('id, name, code').order('name'),
    ]);
    const profiles = (profilesRes.data || []) as any[];
    const roles = rolesRes.data || [];
    const depts = (deptsRes.data || []) as Department[];
    setDepartments(depts);
    setUsers(profiles.map((p: any) => {
      const r = roles.find(r => r.user_id === p.id);
      const dept = depts.find(d => d.id === p.department_id);
      return { ...p, role: r?.role || null, roleId: r?.id || null, department_name: dept?.name || null };
    }));
    setLoading(false);
  };

  useEffect(() => { fetchUsers(); }, []);

  if (!authLoading && !isAdmin) return <Navigate to="/" replace />;

  const openEdit = (u: ProfileWithRole) => {
    setEditing(u);
    setNewRole(u.role || 'staff');
    setNewActive(u.active);
    setNewDeptId((u as any).department_id || '');
  };

  const saveEdit = async () => {
    if (!editing) return;
    await supabase.from('users_profile').update({
      active: newActive,
      department_id: newDeptId || null,
    } as any).eq('id', editing.id);
    if (editing.roleId) {
      await supabase.from('user_roles').update({ role: newRole as Enums<'app_role'> }).eq('id', editing.roleId);
    } else {
      await supabase.from('user_roles').insert({ user_id: editing.id, role: newRole as Enums<'app_role'> });
    }
    toast.success('Benutzer aktualisiert');
    setEditing(null);
    fetchUsers();
  };

  const handleCreate = async () => {
    if (!form.email || !form.display_name || !form.short_code) {
      toast.error('E-Mail, Name und Kürzel sind Pflichtfelder');
      return;
    }
    setCreating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          email: form.email,
          display_name: form.display_name,
          short_code: form.short_code,
          role: form.role,
          department_id: form.department_id || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Fehler beim Anlegen');
      toast.success(`Mitarbeiter "${form.display_name}" wurde angelegt. Der Benutzer kann sich jetzt einloggen und sein Passwort per "Passwort vergessen" setzen.`);
      setCreateOpen(false);
      setForm(emptyNew);
      fetchUsers();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setCreating(false);
    }
  };

  const field = (key: keyof typeof form, label: string, placeholder?: string, type = 'text') => (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        type={type}
        placeholder={placeholder}
        value={form[key]}
        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
        className="h-8 text-xs"
      />
    </div>
  );

  return (
    <AppLayout>
      <div className="space-y-4 max-w-4xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-foreground">Mitarbeiter</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Benutzer, Rollen und Abteilungen verwalten</p>
          </div>
          <Button onClick={() => setCreateOpen(true)} size="sm" className="h-8 text-xs gap-1.5">
            <UserPlus className="h-3.5 w-3.5" />
            Neuer Mitarbeiter
          </Button>
        </div>

        <div className="rounded-md border border-border bg-card overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Name</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Kürzel</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Rolle</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Abteilung</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={6} className="p-4 text-center text-muted-foreground text-xs">Laden…</td></tr>
              ) : users.map(u => (
                <tr key={u.id} className="hover:bg-muted/40 transition-colors">
                  <td className="px-4 py-2.5 text-foreground text-sm">{u.display_name}</td>
                  <td className="px-4 py-2.5 font-mono text-muted-foreground">{u.short_code}</td>
                  <td className="px-4 py-2.5 capitalize text-muted-foreground">{u.role || '–'}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{u.department_name || '–'}</td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex items-center gap-1.5 text-xs ${u.active ? 'text-foreground' : 'text-muted-foreground'}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${u.active ? 'bg-[hsl(var(--status-done))]' : 'bg-[hsl(var(--status-rejected))]'}`} />
                      {u.active ? 'Aktiv' : 'Inaktiv'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <button onClick={() => openEdit(u)} className="text-muted-foreground hover:text-foreground transition-colors">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Edit dialog */}
        <Dialog open={!!editing} onOpenChange={o => !o && setEditing(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle className="text-sm font-semibold">{editing?.display_name} bearbeiten</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Rolle</Label>
                <Select value={newRole} onValueChange={setNewRole}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="staff">Mitarbeiter</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Abteilung</Label>
                <Select value={newDeptId || '_none'} onValueChange={v => setNewDeptId(v === '_none' ? '' : v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Keine Abteilung" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Keine Abteilung</SelectItem>
                    {departments.map(d => (
                      <SelectItem key={d.id} value={d.id}>{d.name} ({d.code})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={newActive} onCheckedChange={setNewActive} />
                <Label className="text-xs">Aktiv</Label>
              </div>
              <Button onClick={saveEdit} className="w-full h-8 text-xs">Speichern</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Create dialog */}
        <Dialog open={createOpen} onOpenChange={o => { setCreateOpen(o); if (!o) setForm(emptyNew); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="text-sm font-semibold">Neuen Mitarbeiter anlegen</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {field('email', 'E-Mail-Adresse *', 'name@firma.de', 'email')}
              {field('display_name', 'Vollständiger Name *', 'Max Mustermann')}
              {field('short_code', 'Kürzel *', 'M.Mustermann')}

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Rolle</Label>
                <Select value={form.role} onValueChange={v => setForm(f => ({ ...f, role: v }))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="staff">Mitarbeiter</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Abteilung</Label>
                <Select value={form.department_id || '_none'} onValueChange={v => setForm(f => ({ ...f, department_id: v === '_none' ? '' : v }))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Keine Abteilung" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Keine Abteilung</SelectItem>
                    {departments.map(d => (
                      <SelectItem key={d.id} value={d.id}>{d.name} ({d.code})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <p className="text-[11px] text-muted-foreground bg-muted/60 rounded px-3 py-2 leading-relaxed">
                Der Benutzer wird sofort angelegt. Zum Einloggen muss er auf der Login-Seite „Passwort vergessen" nutzen, um sein Passwort zu setzen.
              </p>

              <Button onClick={handleCreate} disabled={creating} className="w-full h-8 text-xs gap-1.5">
                {creating ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Anlegen…</> : 'Mitarbeiter anlegen'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
