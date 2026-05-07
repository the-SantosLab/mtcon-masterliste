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
import { Pencil, Plus, Building2 } from 'lucide-react';

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
}

export default function AdminDepartments() {
  const { isAdmin, loading: authLoading } = useAuth();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Department | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', code: '', manager_user_id: '' });

  const fetchAll = async () => {
    const [deptRes, profRes] = await Promise.all([
      supabase.from('departments').select('*').order('name'),
      supabase.from('users_profile').select('id, display_name, short_code').eq('active', true).order('display_name'),
    ]);
    setDepartments(deptRes.data || []);
    setProfiles((profRes.data || []) as Profile[]);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  if (!authLoading && !isAdmin) return <Navigate to="/" replace />;

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
            <p className="text-xs text-muted-foreground mt-0.5">Abteilungen und Teamstruktur verwalten</p>
          </div>
          <Button size="sm" onClick={openCreate} className="h-8 text-xs gap-1.5">
            <Plus className="h-3.5 w-3.5" />Abteilung anlegen
          </Button>
        </div>

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
