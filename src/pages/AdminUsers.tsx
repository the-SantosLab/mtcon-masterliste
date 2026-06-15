import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import type { Tables, Enums } from '@/integrations/supabase/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Navigate } from 'react-router-dom';
import { Pencil, UserPlus, Loader2, Search, RefreshCw, Eye, EyeOff, Trash2, KeyRound, ImageIcon, ShieldOff } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { UserCsvImport } from '@/components/UserCsvImport';
import { PersonioSync } from '@/components/PersonioSync';

import { UserAvatar } from '@/components/UserAvatar';
import { cn } from '@/lib/utils';

type ProfileWithRole = Tables<'users_profile'> & {
  role: Enums<'app_role'> | null;
  roleId: string | null;
  department_name?: string | null;
  email?: string | null;
};

interface Department { id: string; name: string; code: string; }

const emptyNew = { email: '', display_name: '', short_code: '', role: 'staff', department_id: '', password: '' };

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
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newShortCode, setNewShortCode] = useState('');
  const [newAvatarUrl, setNewAvatarUrl] = useState<string>('');

  // Available avatars from storage bucket
  const [avatarOptions, setAvatarOptions] = useState<{ name: string; url: string }[]>([]);
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const [loadingAvatars, setLoadingAvatars] = useState(false);

  const fetchAvatars = async () => {
    setLoadingAvatars(true);
    try {
      const { data, error } = await supabase.storage.from('avatars').list('', { limit: 200, sortBy: { column: 'name', order: 'asc' } });
      if (error) throw error;
      const items = (data || [])
        .filter((f: any) => f.name && !f.name.endsWith('/') && /\.(png|jpe?g|webp|gif)$/i.test(f.name))
        .map((f: any) => {
          const { data: pub } = supabase.storage.from('avatars').getPublicUrl(f.name);
          return { name: f.name, url: pub.publicUrl };
        });
      setAvatarOptions(items);
    } catch (err: any) {
      toast.error('Avatare konnten nicht geladen werden: ' + err.message);
    } finally {
      setLoadingAvatars(false);
    }
  };

  // Search state
  const [search, setSearch] = useState('');

  // Create state
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(emptyNew);
  const [showPassword, setShowPassword] = useState(false);

  // Delete state
  const [deleting, setDeleting] = useState<ProfileWithRole | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Password reset state (admin)
  const [resetPwUser, setResetPwUser] = useState<ProfileWithRole | null>(null);
  const [resetPw, setResetPw] = useState('');
  const [resetPwShow, setResetPwShow] = useState(false);
  const [resetPwLoading, setResetPwLoading] = useState(false);

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

    // Fetch emails from edge function
    let emailMap: Record<string, string> = {};
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/list-user-emails`, {
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
      });
      if (res.ok) emailMap = await res.json();
    } catch { /* ignore */ }

    setUsers(profiles.map((p: any) => {
      const r = roles.find(r => r.user_id === p.id);
      const dept = depts.find(d => d.id === p.department_id);
      return { ...p, role: r?.role || null, roleId: r?.id || null, department_name: dept?.name || null, email: emailMap[p.id] || null };
    }));
    setLoading(false);
  };

  useEffect(() => { fetchUsers(); }, []);

  if (!authLoading && !isAdmin) return <Navigate to="/" replace />;

  const handleDelete = async () => {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ user_id: deleting.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Fehler beim Löschen');
      toast.success(`Mitarbeiter "${deleting.display_name}" wurde gelöscht`);
      setDeleting(null);
      fetchUsers();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!resetPwUser || !resetPw || resetPw.length < 8) return;
    setResetPwLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/reset-user-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ user_id: resetPwUser.id, new_password: resetPw }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Fehler');
      toast.success(`Passwort für "${resetPwUser.display_name}" wurde geändert`);
      setResetPwUser(null);
      setResetPw('');
      setResetPwShow(false);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setResetPwLoading(false);
    }
  };

  const generateResetPw = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
    let pw = '';
    for (let i = 0; i < 14; i++) pw += chars[Math.floor(Math.random() * chars.length)];
    setResetPw(pw);
    setResetPwShow(true);
  };

  const openEdit = (u: ProfileWithRole) => {
    setEditing(u);
    setNewRole(u.role || 'staff');
    setNewActive(u.active);
    setNewDeptId((u as any).department_id || '');
    setNewDisplayName(u.display_name);
    setNewShortCode(u.short_code);
    setNewAvatarUrl((u as any).avatar_url || '');
    fetchAvatars();
  };

  const saveEdit = async () => {
    if (!editing) return;

    const effectiveRole = newRole;
    const effectiveActive = newActive;

    const { error: profileErr } = await supabase.from('users_profile').update({
      active: effectiveActive,
      department_id: newDeptId || null,
      display_name: newDisplayName,
      short_code: newShortCode,
      is_admin: effectiveRole === 'admin',
      avatar_url: newAvatarUrl || null,
    } as any).eq('id', editing.id);
    if (profileErr) { toast.error('Profil-Update fehlgeschlagen: ' + profileErr.message); return; }

    // Insert-first / delete-after, damit ein Admin, der sich selbst bearbeitet,
    // seine Admin-Rolle nicht zwischenzeitlich verliert (sonst RLS-Verstoß).
    const { data: existingRoles } = await supabase
      .from('user_roles').select('role').eq('user_id', editing.id);
    const hasTarget = (existingRoles || []).some(r => r.role === effectiveRole);
    if (!hasTarget) {
      const { error: insErr } = await supabase.from('user_roles')
        .insert({ user_id: editing.id, role: effectiveRole as Enums<'app_role'> });
      if (insErr) { toast.error('Rolle konnte nicht gesetzt werden: ' + insErr.message); return; }
    }
    const { error: delErr } = await supabase.from('user_roles')
      .delete().eq('user_id', editing.id).neq('role', effectiveRole as Enums<'app_role'>);
    if (delErr) { toast.error('Alte Rolle konnte nicht entfernt werden: ' + delErr.message); return; }

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
          password: form.password || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Fehler beim Anlegen');
      const msg = form.password
        ? `Mitarbeiter "${form.display_name}" wurde angelegt. Login: ${form.email} / vergebenes Passwort.`
        : `Mitarbeiter "${form.display_name}" wurde angelegt. Der Benutzer muss über "Passwort vergessen" sein Passwort setzen.`;
      toast.success(msg);
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

  const generatePassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
    let pw = '';
    for (let i = 0; i < 14; i++) pw += chars[Math.floor(Math.random() * chars.length)];
    setForm(f => ({ ...f, password: pw }));
    setShowPassword(true);
  };

  const filteredUsers = users.filter(u => {
    if (!search) return true;
    const q = search.toLowerCase();
    return u.display_name.toLowerCase().includes(q) || u.short_code.toLowerCase().includes(q);
  });

  return (
    <AppLayout>
      <div className="space-y-4 max-w-6xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-foreground">Team & Berechtigungen</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Mitarbeiter, Rollen, Abteilungen und Zugriffsrechte verwalten</p>
          </div>
          <Button onClick={() => setCreateOpen(true)} size="sm" className="h-8 text-xs gap-1.5">
            <UserPlus className="h-3.5 w-3.5" />
            Neuer Mitarbeiter
          </Button>
        </div>

        <Tabs defaultValue="users" className="space-y-4">
          <TabsList className="h-8">
            <TabsTrigger value="users" className="text-xs h-6">Mitarbeiter</TabsTrigger>
            <TabsTrigger value="import" className="text-xs h-6">CSV-Import</TabsTrigger>
            <TabsTrigger value="personio" className="text-xs h-6">Personio</TabsTrigger>
            
          </TabsList>

          <TabsContent value="users" className="space-y-4 mt-0">

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Name oder Kürzel suchen…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="h-8 text-xs pl-9 max-w-xs"
          />
        </div>

        <div className="rounded-md border border-border bg-card overflow-hidden hidden md:block">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground w-12">Bild</th>
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
                <tr><td colSpan={7} className="p-4 text-center text-muted-foreground text-xs">Laden…</td></tr>
              ) : filteredUsers.map(u => (
                <tr key={u.id} className="hover:bg-muted/40 transition-colors">
                  <td className="px-4 py-1.5">
                    <UserAvatar user={u as any} size="sm" tooltip={false} />
                  </td>
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
                    <div className="flex items-center gap-2">
                      <button onClick={() => openEdit(u)} className="text-muted-foreground hover:text-foreground transition-colors">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => setDeleting(u)} className="text-muted-foreground hover:text-destructive transition-colors">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="space-y-2 md:hidden">
          {loading ? (
            <p className="text-center text-muted-foreground text-xs py-4">Laden…</p>
          ) : filteredUsers.map(u => (
            <div key={u.id} className="rounded-md border border-border bg-card px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-foreground">{u.display_name}</span>
                <div className="flex items-center gap-2">
                  <button onClick={() => openEdit(u)} className="text-muted-foreground hover:text-foreground transition-colors">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => setDeleting(u)} className="text-muted-foreground hover:text-destructive transition-colors">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <span className="text-muted-foreground">Kürzel</span>
                <span className="font-mono text-foreground">{u.short_code}</span>
                <span className="text-muted-foreground">Rolle</span>
                <span className="capitalize text-foreground">{u.role || '–'}</span>
                <span className="text-muted-foreground">Abteilung</span>
                <span className="text-foreground">{u.department_name || '–'}</span>
                <span className="text-muted-foreground">Status</span>
                <span className={`inline-flex items-center gap-1.5 ${u.active ? 'text-foreground' : 'text-muted-foreground'}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${u.active ? 'bg-[hsl(var(--status-done))]' : 'bg-[hsl(var(--status-rejected))]'}`} />
                  {u.active ? 'Aktiv' : 'Inaktiv'}
                </span>
              </div>
            </div>
          ))}
        </div>
          </TabsContent>

          <TabsContent value="import" className="mt-0">
            <div className="rounded-md border border-border bg-card p-4">
              <UserCsvImport departments={departments} onDone={fetchUsers} />
            </div>
          </TabsContent>

          <TabsContent value="personio" className="mt-0">
            <div className="rounded-md border border-border bg-card p-4">
              <PersonioSync onDone={fetchUsers} />
            </div>
          </TabsContent>

        </Tabs>

        {/* Edit dialog */}
        <Dialog open={!!editing} onOpenChange={o => !o && setEditing(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle className="text-sm font-semibold">{editing?.display_name} bearbeiten</DialogTitle></DialogHeader>
            <div className="space-y-4">
              {editing?.email && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">E-Mail</Label>
                  <p className="text-xs font-mono text-foreground bg-muted/50 rounded px-3 py-2">{editing.email}</p>
                </div>
              )}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Vollständiger Name</Label>
                <Input value={newDisplayName} onChange={e => setNewDisplayName(e.target.value)} className="h-8 text-xs" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Kürzel</Label>
                <Input value={newShortCode} onChange={e => setNewShortCode(e.target.value)} className="h-8 text-xs font-mono" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Profilbild</Label>
                <div className="flex items-start gap-3 rounded-md border border-border bg-muted/30 p-3">
                  <UserAvatar
                    user={{ id: editing?.id, display_name: newDisplayName, short_code: newShortCode, avatar_url: newAvatarUrl }}
                    size="lg"
                    tooltip={false}
                  />
                  <div className="flex-1 min-w-0 space-y-2">
                    <p className="text-[11px] text-muted-foreground truncate">
                      {newAvatarUrl ? newAvatarUrl.split('/').pop() : 'Kein Bild zugewiesen'}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="outline" size="sm" className="h-7 text-[11px] gap-1.5" onClick={() => { setAvatarPickerOpen(true); fetchAvatars(); }}>
                        <ImageIcon className="h-3 w-3" />
                        Bild auswählen
                      </Button>
                      {newAvatarUrl && (
                        <Button type="button" variant="ghost" size="sm" className="h-7 text-[11px] text-muted-foreground" onClick={() => setNewAvatarUrl('')}>
                          Entfernen
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
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
              <div className="flex gap-2">
                <Button onClick={saveEdit} className="flex-1 h-8 text-xs">Speichern</Button>
                <Button
                  variant="outline"
                  onClick={() => { setResetPwUser(editing); setResetPw(''); setResetPwShow(false); }}
                  className="h-8 text-xs gap-1.5"
                >
                  <KeyRound className="h-3 w-3" />
                  Passwort
                </Button>
              </div>
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

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Passwort</Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Min. 8 Zeichen (optional)"
                      value={form.password}
                      onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                      className="h-8 text-xs font-mono pr-8"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(v => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={generatePassword} className="h-8 text-xs gap-1 shrink-0">
                    <RefreshCw className="h-3 w-3" />
                    Generieren
                  </Button>
                </div>
                {form.password && form.password.length > 0 && form.password.length < 8 && (
                  <p className="text-[11px] text-[hsl(var(--status-rejected))]">Passwort muss mindestens 8 Zeichen lang sein</p>
                )}
              </div>

              <p className="text-[11px] text-muted-foreground bg-muted/60 rounded px-3 py-2 leading-relaxed">
                {form.password && form.password.length >= 8
                  ? 'Der Benutzer kann sich sofort mit dem vergebenen Passwort einloggen.'
                  : 'Ohne Passwort muss der Benutzer über „Passwort vergessen" sein eigenes Passwort setzen.'}
              </p>

              <Button onClick={handleCreate} disabled={creating} className="w-full h-8 text-xs gap-1.5">
                {creating ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Anlegen…</> : 'Mitarbeiter anlegen'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Delete confirmation */}
        <AlertDialog open={!!deleting} onOpenChange={o => !o && setDeleting(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="text-sm font-semibold">Mitarbeiter löschen</AlertDialogTitle>
              <AlertDialogDescription className="text-xs">
                Möchten Sie <strong>{deleting?.display_name}</strong> wirklich unwiderruflich löschen? 
                Alle zugehörigen Daten (Rollen, Benachrichtigungen, Projektmitgliedschaften) werden entfernt. 
                Zugewiesene Vorgänge werden freigegeben.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="h-8 text-xs">Abbrechen</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                disabled={deleteLoading}
                className="h-8 text-xs bg-destructive text-destructive-foreground hover:bg-destructive/90 gap-1.5"
              >
                {deleteLoading ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Löschen…</> : 'Endgültig löschen'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Password reset dialog */}
        <Dialog open={!!resetPwUser} onOpenChange={o => { if (!o) { setResetPwUser(null); setResetPw(''); setResetPwShow(false); } }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="text-sm font-semibold">Passwort ändern — {resetPwUser?.display_name}</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Vergeben Sie ein neues Passwort für diesen Mitarbeiter.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Neues Passwort</Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      type={resetPwShow ? 'text' : 'password'}
                      placeholder="Min. 8 Zeichen"
                      value={resetPw}
                      onChange={e => setResetPw(e.target.value)}
                      className="h-8 text-xs font-mono pr-8"
                    />
                    <button
                      type="button"
                      onClick={() => setResetPwShow(v => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {resetPwShow ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={generateResetPw} className="h-8 text-xs gap-1 shrink-0">
                    <RefreshCw className="h-3 w-3" />
                    Generieren
                  </Button>
                </div>
                {resetPw && resetPw.length > 0 && resetPw.length < 8 && (
                  <p className="text-[11px] text-[hsl(var(--status-rejected))]">Passwort muss mindestens 8 Zeichen lang sein</p>
                )}
              </div>
              <Button
                onClick={handleResetPassword}
                disabled={resetPwLoading || !resetPw || resetPw.length < 8}
                className="w-full h-8 text-xs gap-1.5"
              >
                {resetPwLoading ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Speichern…</> : 'Passwort speichern'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Avatar picker */}
        <Dialog open={avatarPickerOpen} onOpenChange={setAvatarPickerOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="text-sm font-semibold">Profilbild auswählen</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Bilder aus dem <span className="font-mono">avatars</span>-Speicher. Hochgeladen werden Bilder direkt im Backend.
              </DialogDescription>
            </DialogHeader>
            {loadingAvatars ? (
              <div className="py-12 text-center text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline mr-2" />Laden…</div>
            ) : avatarOptions.length === 0 ? (
              <div className="py-10 text-center text-xs text-muted-foreground">Keine Bilder im Bucket gefunden.</div>
            ) : (
              <div className="grid grid-cols-4 sm:grid-cols-5 gap-3 max-h-[60vh] overflow-y-auto p-1">
                {avatarOptions.map(img => {
                  const selected = newAvatarUrl === img.url;
                  return (
                    <button
                      key={img.name}
                      type="button"
                      onClick={() => { setNewAvatarUrl(img.url); setAvatarPickerOpen(false); }}
                      className={cn(
                        'group relative rounded-md overflow-hidden border bg-muted/40 transition-all',
                        selected ? 'border-primary ring-2 ring-primary/40' : 'border-border hover:border-primary/40',
                      )}
                    >
                      <img src={img.url} alt={img.name} loading="lazy" className="w-full aspect-square object-cover" />
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-1.5">
                        <p className="text-[9px] font-mono text-white/90 truncate">{img.name}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
