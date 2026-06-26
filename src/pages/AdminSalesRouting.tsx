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
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Plus, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';

type Rule = {
  id: string;
  name: string;
  priority: number;
  match_country: string | null;
  match_industry: string | null;
  match_source: string | null;
  match_keyword: string | null;
  assigned_to: string | null;
  strategy: 'fixed' | 'round_robin';
  pool_user_ids: string[];
  last_assigned_index: number;
  min_score: number;
  is_active: boolean;
};

type UserOpt = { id: string; label: string };

const empty = (): Partial<Rule> => ({
  name: '', priority: 100, match_country: '', match_industry: '',
  match_source: '', match_keyword: '', assigned_to: '', strategy: 'fixed',
  pool_user_ids: [], min_score: 0, is_active: true,
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
      supabase.from('users_profile').select('id, display_name').eq('active', true).order('display_name'),
    ]);
    if (r.error) toast.error(r.error.message); else setRules((r.data ?? []) as Rule[]);
    if (!u.error) setUsers((u.data ?? []).map((x: any) => ({ id: x.id, label: x.display_name })));
    setBusy(false);
  };
  useEffect(() => { void load(); }, []);

  const save = async () => {
    if (!edit.name?.trim()) { toast.error('Name ist Pflicht'); return; }
    if (edit.strategy === 'fixed' && !edit.assigned_to) { toast.error('Bei „fest" muss ein Mitarbeiter gewählt sein'); return; }
    if (edit.strategy === 'round_robin' && (!edit.pool_user_ids || edit.pool_user_ids.length === 0)) {
      toast.error('Round-Robin braucht mindestens einen Mitarbeiter im Pool'); return;
    }
    const payload: any = {
      name: edit.name,
      priority: edit.priority ?? 100,
      match_country: edit.match_country || null,
      match_industry: edit.match_industry || null,
      match_source: edit.match_source || null,
      match_keyword: edit.match_keyword || null,
      assigned_to: edit.strategy === 'fixed' ? edit.assigned_to : null,
      strategy: edit.strategy,
      pool_user_ids: edit.strategy === 'round_robin' ? edit.pool_user_ids : [],
      min_score: edit.min_score ?? 0,
      is_active: edit.is_active ?? true,
    };
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

  const userLabel = (id: string | null | undefined) => id ? (users.find(u => u.id === id)?.label ?? id.slice(0, 8)) : '—';

  const togglePoolUser = (uid: string) => {
    const pool = new Set(edit.pool_user_ids ?? []);
    if (pool.has(uid)) pool.delete(uid); else pool.add(uid);
    setEdit({ ...edit, pool_user_ids: Array.from(pool) });
  };

  return (
    <AppLayout>
      <div className="space-y-4 max-w-[1200px]">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-foreground">Vertriebs-Auto-Routing</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Neue Leads werden automatisch zugewiesen — fest an eine Person oder per Round-Robin im Team-Pool.
              Optional erst ab einem bestimmten Lead-Score.
            </p>
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
                    <TableHead className="text-xs">Strategie</TableHead>
                    <TableHead className="text-xs">Match</TableHead>
                    <TableHead className="text-xs">Min. Score</TableHead>
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
                      <TableCell className="text-xs">
                        {r.strategy === 'round_robin'
                          ? <Badge variant="outline" className="text-[10px] gap-1"><Users className="h-3 w-3" />Round-Robin · {r.pool_user_ids?.length ?? 0}</Badge>
                          : <Badge variant="secondary" className="text-[10px]">Fest</Badge>}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {[r.match_country && `Land=${r.match_country}`, r.match_industry && `Branche=${r.match_industry}`, r.match_source && `Quelle=${r.match_source}`, r.match_keyword && `Stichwort="${r.match_keyword}"`].filter(Boolean).join(' · ') || '–'}
                      </TableCell>
                      <TableCell className="text-xs tabular-nums">{r.min_score ?? 0}</TableCell>
                      <TableCell className="text-xs">
                        {r.strategy === 'round_robin'
                          ? <span className="text-muted-foreground">{(r.pool_user_ids ?? []).slice(0, 2).map(userLabel).join(', ')}{(r.pool_user_ids?.length ?? 0) > 2 && ` +${r.pool_user_ids.length - 2}`}</span>
                          : userLabel(r.assigned_to)}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" onClick={() => remove(r.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {rules.length === 0 && <TableRow><TableCell colSpan={8} className="text-xs text-muted-foreground text-center py-6">Noch keine Regeln</TableCell></TableRow>}
                </TableBody>
              </Table></div>
            )}
          </CardContent>
        </Card>

        <Dialog open={dlg} onOpenChange={setDlg}>
          <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
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
                <div className="space-y-1"><Label className="text-xs">Quelle</Label><Input className="h-8 text-xs" placeholder="manuell / csv / linkedin …" value={edit.match_source ?? ''} onChange={(e) => setEdit({ ...edit, match_source: e.target.value })} /></div>
                <div className="space-y-1"><Label className="text-xs">Stichwort (Name/Notiz)</Label><Input className="h-8 text-xs" value={edit.match_keyword ?? ''} onChange={(e) => setEdit({ ...edit, match_keyword: e.target.value })} /></div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Mindest-Score des Leads</Label>
                <Input type="number" className="h-8 text-xs" value={edit.min_score ?? 0} onChange={(e) => setEdit({ ...edit, min_score: Number(e.target.value) })} />
                <p className="text-[10px] text-muted-foreground">Regel greift nur, wenn der Lead-Score ≥ diesem Wert ist. 0 = immer.</p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Zuweisungs-Strategie *</Label>
                <Select value={edit.strategy ?? 'fixed'} onValueChange={(v) => setEdit({ ...edit, strategy: v as 'fixed' | 'round_robin' })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed" className="text-xs">Fest – immer derselbe Mitarbeiter</SelectItem>
                    <SelectItem value="round_robin" className="text-xs">Round-Robin – reihum im Pool</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {edit.strategy === 'round_robin' ? (
                <div className="space-y-1">
                  <Label className="text-xs">Pool-Mitarbeiter (Reihenfolge = Auswahlreihenfolge)</Label>
                  <div className="border border-border rounded p-2 max-h-48 overflow-y-auto space-y-1">
                    {users.map(u => {
                      const checked = (edit.pool_user_ids ?? []).includes(u.id);
                      return (
                        <label key={u.id} className="flex items-center gap-2 text-xs cursor-pointer py-0.5">
                          <Checkbox checked={checked} onCheckedChange={() => togglePoolUser(u.id)} />
                          <span>{u.label}</span>
                        </label>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-muted-foreground">{(edit.pool_user_ids ?? []).length} Mitarbeiter im Pool. Letzter Index: {edit.last_assigned_index ?? -1}</p>
                </div>
              ) : (
                <div className="space-y-1">
                  <Label className="text-xs">Zuweisen an *</Label>
                  <Select value={edit.assigned_to ?? ''} onValueChange={(v) => setEdit({ ...edit, assigned_to: v })}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Mitarbeiter wählen" /></SelectTrigger>
                    <SelectContent>{users.map(u => <SelectItem key={u.id} value={u.id} className="text-xs">{u.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
              <div className="flex items-center gap-2"><Switch checked={edit.is_active ?? true} onCheckedChange={(v) => setEdit({ ...edit, is_active: v })} /><Label className="text-xs">Aktiv</Label></div>
              <p className="text-xs text-muted-foreground">Leere Match-Felder = beliebig. Die erste passende Regel mit niedrigster Prio-Zahl greift.</p>
            </div>
            <DialogFooter><Button size="sm" onClick={save}>Speichern</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
