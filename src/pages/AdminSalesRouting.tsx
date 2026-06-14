import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

type Rule = {
  id: string;
  name: string;
  priority: number;
  match_country: string | null;
  match_industry: string | null;
  match_source: string | null;
  match_keyword: string | null;
  assigned_to: string;
  is_active: boolean;
};

type UserOpt = { id: string; label: string };

const empty = (): Partial<Rule> => ({
  name: '', priority: 100, match_country: '', match_industry: '',
  match_source: '', match_keyword: '', assigned_to: '', is_active: true,
});

export default function AdminSalesRouting() {
  const { isAdmin, loading } = useAuth();
  const [rules, setRules] = useState<Rule[]>([]);
  const [users, setUsers] = useState<UserOpt[]>([]);
  const [busy, setBusy] = useState(false);
  const [dlg, setDlg] = useState(false);
  const [edit, setEdit] = useState<Partial<Rule>>(empty());

  if (!loading && !isAdmin) return <Navigate to="/" replace />;

  const load = async () => {
    setBusy(true);
    const [r, u] = await Promise.all([
      supabase.from('sales_routing_rules').select('*').order('priority').order('created_at'),
      supabase.from('users_profile').select('id, first_name, last_name, email').order('first_name'),
    ]);
    if (r.error) toast.error(r.error.message); else setRules((r.data ?? []) as Rule[]);
    if (!u.error) setUsers((u.data ?? []).map((x: any) => ({
      id: x.id, label: [x.first_name, x.last_name].filter(Boolean).join(' ') || x.email,
    })));
    setBusy(false);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!edit.name?.trim() || !edit.assigned_to) { toast.error('Name und Zuweisung sind Pflicht'); return; }
    const payload = {
      ...edit,
      match_country: edit.match_country || null,
      match_industry: edit.match_industry || null,
      match_source: edit.match_source || null,
      match_keyword: edit.match_keyword || null,
    } as any;
    const q = edit.id
      ? supabase.from('sales_routing_rules').update(payload).eq('id', edit.id)
      : supabase.from('sales_routing_rules').insert(payload);
    const { error } = await q;
    if (error) { toast.error(error.message); return; }
    toast.success('Regel gespeichert');
    setDlg(false); setEdit(empty()); load();
  };

  const remove = async (id: string) => {
    if (!confirm('Regel löschen?')) return;
    const { error } = await supabase.from('sales_routing_rules').delete().eq('id', id);
    if (error) toast.error(error.message); else { toast.success('Gelöscht'); load(); }
  };

  const toggle = async (r: Rule) => {
    const { error } = await supabase.from('sales_routing_rules').update({ is_active: !r.is_active }).eq('id', r.id);
    if (error) toast.error(error.message); else load();
  };

  const userLabel = (id: string) => users.find(u => u.id === id)?.label ?? id.slice(0, 8);

  return (
    <AppLayout>
      <div className="space-y-4 max-w-[1200px]">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-foreground">Vertriebs-Auto-Routing</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Neue Leads werden automatisch dem zuständigen Mitarbeiter zugewiesen.</p>
          </div>
          <Button size="sm" onClick={() => { setEdit(empty()); setDlg(true); }}>
            <Plus className="h-3.5 w-3.5 mr-2" /> Neue Regel
          </Button>
        </div>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Regeln (Priorität aufsteigend)</CardTitle></CardHeader>
          <CardContent>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : (
              <div className="overflow-x-auto -mx-2 px-2"><Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Aktiv</TableHead>
                    <TableHead className="text-xs">Prio</TableHead>
                    <TableHead className="text-xs">Name</TableHead>
                    <TableHead className="text-xs">Land</TableHead>
                    <TableHead className="text-xs">Branche</TableHead>
                    <TableHead className="text-xs">Quelle</TableHead>
                    <TableHead className="text-xs">Stichwort</TableHead>
                    <TableHead className="text-xs">Zuweisung</TableHead>
                    <TableHead className="text-xs w-16"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rules.map(r => (
                    <TableRow key={r.id} className="cursor-pointer" onClick={() => { setEdit(r); setDlg(true); }}>
                      <TableCell onClick={(e) => e.stopPropagation()}><Switch checked={r.is_active} onCheckedChange={() => toggle(r)} /></TableCell>
                      <TableCell className="text-xs">{r.priority}</TableCell>
                      <TableCell className="text-xs font-medium">{r.name}</TableCell>
                      <TableCell className="text-xs">{r.match_country || '–'}</TableCell>
                      <TableCell className="text-xs">{r.match_industry || '–'}</TableCell>
                      <TableCell className="text-xs">{r.match_source || '–'}</TableCell>
                      <TableCell className="text-xs">{r.match_keyword || '–'}</TableCell>
                      <TableCell className="text-xs">{userLabel(r.assigned_to)}</TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" onClick={() => remove(r.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {rules.length === 0 && <TableRow><TableCell colSpan={9} className="text-xs text-muted-foreground text-center py-6">Noch keine Regeln</TableCell></TableRow>}
                </TableBody>
              </Table></div>
            )}
          </CardContent>
        </Card>

        <Dialog open={dlg} onOpenChange={setDlg}>
          <DialogContent className="max-w-xl">
            <DialogHeader><DialogTitle className="text-sm">{edit.id ? 'Regel bearbeiten' : 'Neue Regel'}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1"><Label className="text-xs">Name *</Label><Input className="h-8 text-xs" value={edit.name ?? ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></div>
                <div className="space-y-1"><Label className="text-xs">Priorität</Label><Input type="number" className="h-8 text-xs" value={edit.priority ?? 100} onChange={(e) => setEdit({ ...edit, priority: Number(e.target.value) })} /></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1"><Label className="text-xs">Land</Label><Input className="h-8 text-xs" placeholder="z.B. DE" value={edit.match_country ?? ''} onChange={(e) => setEdit({ ...edit, match_country: e.target.value })} /></div>
                <div className="space-y-1"><Label className="text-xs">Branche</Label><Input className="h-8 text-xs" value={edit.match_industry ?? ''} onChange={(e) => setEdit({ ...edit, match_industry: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1"><Label className="text-xs">Quelle</Label><Input className="h-8 text-xs" placeholder="manuell / website / messe …" value={edit.match_source ?? ''} onChange={(e) => setEdit({ ...edit, match_source: e.target.value })} /></div>
                <div className="space-y-1"><Label className="text-xs">Stichwort (in Name/Notiz/E-Mail)</Label><Input className="h-8 text-xs" value={edit.match_keyword ?? ''} onChange={(e) => setEdit({ ...edit, match_keyword: e.target.value })} /></div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Zuweisen an *</Label>
                <Select value={edit.assigned_to ?? ''} onValueChange={(v) => setEdit({ ...edit, assigned_to: v })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Mitarbeiter wählen" /></SelectTrigger>
                  <SelectContent>{users.map(u => <SelectItem key={u.id} value={u.id} className="text-xs">{u.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2"><Switch checked={edit.is_active ?? true} onCheckedChange={(v) => setEdit({ ...edit, is_active: v })} /><Label className="text-xs">Aktiv</Label></div>
              <p className="text-xs text-muted-foreground">Leere Felder = beliebig. Es greift die erste passende Regel mit niedrigster Prio-Zahl.</p>
            </div>
            <DialogFooter><Button size="sm" onClick={save}>Speichern</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
