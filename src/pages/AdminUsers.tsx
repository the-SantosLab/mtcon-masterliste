import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import type { Tables, Enums } from '@/integrations/supabase/types';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Navigate } from 'react-router-dom';
import { Pencil } from 'lucide-react';

type ProfileWithRole = Tables<'users_profile'> & { role: Enums<'app_role'> | null; roleId: string | null };

export default function AdminUsers() {
  const { isAdmin, loading: authLoading } = useAuth();
  const [users, setUsers] = useState<ProfileWithRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ProfileWithRole | null>(null);
  const [newRole, setNewRole] = useState<string>('staff');
  const [newActive, setNewActive] = useState(true);

  if (!authLoading && !isAdmin) return <Navigate to="/" replace />;

  const fetch = async () => {
    const [profilesRes, rolesRes] = await Promise.all([
      supabase.from('users_profile').select('*').order('display_name'),
      supabase.from('user_roles').select('*'),
    ]);
    const profiles = profilesRes.data || [];
    const roles = rolesRes.data || [];
    setUsers(profiles.map(p => {
      const r = roles.find(r => r.user_id === p.id);
      return { ...p, role: r?.role || null, roleId: r?.id || null };
    }));
    setLoading(false);
  };

  useEffect(() => { fetch(); }, []);

  const openEdit = (u: ProfileWithRole) => {
    setEditing(u);
    setNewRole(u.role || 'staff');
    setNewActive(u.active);
  };

  const saveEdit = async () => {
    if (!editing) return;
    // Update active status
    await supabase.from('users_profile').update({ active: newActive }).eq('id', editing.id);
    // Update role
    if (editing.roleId) {
      await supabase.from('user_roles').update({ role: newRole as Enums<'app_role'> }).eq('id', editing.roleId);
    } else {
      await supabase.from('user_roles').insert({ user_id: editing.id, role: newRole as Enums<'app_role'> });
    }
    toast.success('Benutzer aktualisiert');
    setEditing(null);
    fetch();
  };

  return (
    <AppLayout>
      <div className="space-y-4 max-w-3xl">
        <div><h1 className="text-2xl font-bold text-foreground">Mitarbeiter</h1><p className="text-sm text-muted-foreground">Benutzer und Rollen verwalten</p></div>

        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border text-muted-foreground text-xs">
              <th className="px-4 py-3 text-left font-medium">Name</th>
              <th className="px-4 py-3 text-left font-medium">Kürzel</th>
              <th className="px-4 py-3 text-left font-medium">Rolle</th>
              <th className="px-4 py-3 text-left font-medium">Aktiv</th>
              <th className="px-4 py-3 text-left font-medium"></th>
            </tr></thead>
            <tbody className="divide-y divide-border">
              {loading ? <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">Laden…</td></tr>
                : users.map(u => (
                  <tr key={u.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 text-foreground">{u.display_name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{u.short_code}</td>
                    <td className="px-4 py-3 capitalize text-muted-foreground">{u.role || '–'}</td>
                    <td className="px-4 py-3">{u.active ? <span className="text-status-done text-xs">●</span> : <span className="text-destructive text-xs">●</span>}</td>
                    <td className="px-4 py-3"><Button variant="ghost" size="sm" onClick={() => openEdit(u)}><Pencil className="h-3 w-3" /></Button></td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        <Dialog open={!!editing} onOpenChange={o => !o && setEditing(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing?.display_name} bearbeiten</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Rolle</Label>
                <Select value={newRole} onValueChange={setNewRole}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="staff">Mitarbeiter</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={newActive} onCheckedChange={setNewActive} />
                <Label>Aktiv</Label>
              </div>
              <Button onClick={saveEdit} className="w-full">Speichern</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
