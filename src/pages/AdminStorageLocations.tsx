import { useEffect, useMemo, useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { MapPin, Plus, Search, Lock, Unlock, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

type LocationType = 'regal' | 'kanban' | 'sperrlager' | 'archiv' | 'versand' | 'sonstiges';

type StorageLocation = {
  id: string;
  lager: string;
  lagerpl: string;
  behaelter: string;
  code: string;
  type: LocationType;
  fifo_required: boolean;
  is_blocked: boolean;
  capacity: number | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

const TYPE_LABEL: Record<LocationType, string> = {
  regal: 'Regal',
  kanban: 'Kanban',
  sperrlager: 'Sperrlager',
  archiv: 'Archiv',
  versand: 'Versand',
  sonstiges: 'Sonstiges',
};

const TYPE_VARIANT: Record<LocationType, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  regal: 'secondary',
  kanban: 'default',
  sperrlager: 'destructive',
  archiv: 'outline',
  versand: 'outline',
  sonstiges: 'outline',
};

export default function AdminStorageLocations() {
  const { user } = useAuth();
  const [rows, setRows] = useState<StorageLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | LocationType>('all');
  const [lagerFilter, setLagerFilter] = useState<string>('all');
  const [editing, setEditing] = useState<StorageLocation | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const blankForm = {
    lager: '',
    lagerpl: '0',
    behaelter: '0',
    type: 'regal' as LocationType,
    fifo_required: false,
    is_blocked: false,
    capacity: '' as string,
    note: '',
  };
  const [form, setForm] = useState(blankForm);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('storage_locations')
      .select('*')
      .order('lager', { ascending: true })
      .order('lagerpl', { ascending: true })
      .order('behaelter', { ascending: true });
    if (error) {
      toast.error('Laden fehlgeschlagen: ' + error.message);
    } else {
      setRows((data ?? []) as StorageLocation[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const lagerOptions = useMemo(() => {
    const s = new Set<string>();
    rows.forEach(r => s.add(r.lager));
    return Array.from(s).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const qLow = q.trim().toLowerCase();
    return rows.filter(r => {
      if (typeFilter !== 'all' && r.type !== typeFilter) return false;
      if (lagerFilter !== 'all' && r.lager !== lagerFilter) return false;
      if (!qLow) return true;
      return (
        r.code.toLowerCase().includes(qLow) ||
        r.lager.toLowerCase().includes(qLow) ||
        r.lagerpl.toLowerCase().includes(qLow) ||
        r.behaelter.toLowerCase().includes(qLow) ||
        (r.note ?? '').toLowerCase().includes(qLow)
      );
    });
  }, [rows, q, typeFilter, lagerFilter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { total: rows.length, blocked: 0 };
    (['regal', 'kanban', 'sperrlager', 'archiv', 'versand', 'sonstiges'] as LocationType[]).forEach(t => (c[t] = 0));
    rows.forEach(r => {
      c[r.type] = (c[r.type] || 0) + 1;
      if (r.is_blocked) c.blocked++;
    });
    return c;
  }, [rows]);

  const openCreate = () => {
    setEditing(null);
    setForm(blankForm);
    setDialogOpen(true);
  };

  const openEdit = (row: StorageLocation) => {
    setEditing(row);
    setForm({
      lager: row.lager,
      lagerpl: row.lagerpl,
      behaelter: row.behaelter,
      type: row.type,
      fifo_required: row.fifo_required,
      is_blocked: row.is_blocked,
      capacity: row.capacity != null ? String(row.capacity) : '',
      note: row.note ?? '',
    });
    setDialogOpen(true);
  };

  const save = async () => {
    const lager = form.lager.trim().toUpperCase();
    if (!lager) {
      toast.error('Lager ist erforderlich');
      return;
    }
    const payload = {
      lager,
      lagerpl: (form.lagerpl || '0').trim() || '0',
      behaelter: (form.behaelter || '0').trim() || '0',
      type: form.type,
      fifo_required: form.fifo_required,
      is_blocked: form.is_blocked,
      capacity: form.capacity ? Number(form.capacity) : null,
      note: form.note.trim() || null,
      updated_by: user?.id ?? null,
    };
    if (editing) {
      const { error } = await supabase.from('storage_locations').update(payload).eq('id', editing.id);
      if (error) {
        toast.error('Speichern fehlgeschlagen: ' + error.message);
        return;
      }
      toast.success('Lagerplatz aktualisiert');
    } else {
      const { error } = await supabase
        .from('storage_locations')
        .insert({ ...payload, created_by: user?.id ?? null });
      if (error) {
        toast.error('Anlegen fehlgeschlagen: ' + error.message);
        return;
      }
      toast.success('Lagerplatz angelegt');
    }
    setDialogOpen(false);
    load();
  };

  const toggleBlock = async (row: StorageLocation) => {
    const { error } = await supabase
      .from('storage_locations')
      .update({ is_blocked: !row.is_blocked, updated_by: user?.id ?? null })
      .eq('id', row.id);
    if (error) {
      toast.error('Aktion fehlgeschlagen: ' + error.message);
      return;
    }
    toast.success(row.is_blocked ? 'Lagerplatz freigegeben' : 'Lagerplatz gesperrt');
    load();
  };

  const remove = async (row: StorageLocation) => {
    if (!confirm(`Lagerplatz "${row.code}" wirklich löschen?`)) return;
    const { error } = await supabase.from('storage_locations').delete().eq('id', row.id);
    if (error) {
      toast.error('Löschen fehlgeschlagen: ' + error.message);
      return;
    }
    toast.success('Lagerplatz gelöscht');
    load();
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Lagerplätze
            </h1>
            <p className="text-xs text-muted-foreground mt-1">
              Stammdaten für alle physischen Lagerplätze – Basis für Einlagerung, Etiketten und Sperrlogik.
            </p>
          </div>
          <Button onClick={openCreate} size="sm">
            <Plus className="h-4 w-4 mr-1" /> Neuer Lagerplatz
          </Button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
          <StatCard label="Gesamt" value={counts.total} />
          <StatCard label="Regal" value={counts.regal} />
          <StatCard label="Kanban" value={counts.kanban} />
          <StatCard label="Sperrlager" value={counts.sperrlager} tone="destructive" />
          <StatCard label="Archiv" value={counts.archiv} />
          <StatCard label="Versand" value={counts.versand} />
          <StatCard label="Gesperrt" value={counts.blocked} tone="destructive" />
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Suche Code / Lager / Notiz" value={q} onChange={e => setQ(e.target.value)} className="pl-8" />
          </div>
          <Select value={lagerFilter} onValueChange={setLagerFilter}>
            <SelectTrigger className="w-full sm:w-[200px]"><SelectValue placeholder="Lager" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Lager</SelectItem>
              {lagerOptions.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={v => setTypeFilter(v as any)}>
            <SelectTrigger className="w-full sm:w-[180px]"><SelectValue placeholder="Typ" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Typen</SelectItem>
              {(Object.keys(TYPE_LABEL) as LocationType[]).map(t => (
                <SelectItem key={t} value={t}>{TYPE_LABEL[t]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[10px] uppercase">Code</TableHead>
                <TableHead className="text-[10px] uppercase">Typ</TableHead>
                <TableHead className="text-[10px] uppercase">FIFO</TableHead>
                <TableHead className="text-[10px] uppercase">Kapazität</TableHead>
                <TableHead className="text-[10px] uppercase">Status</TableHead>
                <TableHead className="text-[10px] uppercase">Notiz</TableHead>
                <TableHead className="text-[10px] uppercase text-right">Aktionen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Lade…</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Keine Lagerplätze gefunden.</TableCell></TableRow>
              ) : filtered.map(r => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.code}</TableCell>
                  <TableCell><Badge variant={TYPE_VARIANT[r.type]}>{TYPE_LABEL[r.type]}</Badge></TableCell>
                  <TableCell className="text-xs">{r.fifo_required ? 'Ja' : '—'}</TableCell>
                  <TableCell className="text-xs tabular-nums">{r.capacity ?? '—'}</TableCell>
                  <TableCell>
                    {r.is_blocked
                      ? <Badge variant="destructive" className="gap-1"><Lock className="h-3 w-3" />Gesperrt</Badge>
                      : <Badge variant="outline" className="gap-1"><Unlock className="h-3 w-3" />Aktiv</Badge>}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[260px] truncate">{r.note ?? '—'}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => toggleBlock(r)} title={r.is_blocked ? 'Freigeben' : 'Sperren'}>
                        {r.is_blocked ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => openEdit(r)} title="Bearbeiten">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => remove(r)} title="Löschen">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Lagerplatz bearbeiten' : 'Neuer Lagerplatz'}</DialogTitle>
            <DialogDescription>
              Struktur folgt der ISSOS-Logik: <span className="font-mono">Lager / Lagerplatz / Behälter</span>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-xs">Lager *</Label>
                <Input value={form.lager} onChange={e => setForm(f => ({ ...f, lager: e.target.value }))} placeholder="z.B. HR2" />
              </div>
              <div>
                <Label className="text-xs">Lagerplatz</Label>
                <Input value={form.lagerpl} onChange={e => setForm(f => ({ ...f, lagerpl: e.target.value }))} placeholder="z.B. B" />
              </div>
              <div>
                <Label className="text-xs">Behälter</Label>
                <Input value={form.behaelter} onChange={e => setForm(f => ({ ...f, behaelter: e.target.value }))} placeholder="z.B. 168" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Typ</Label>
                <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v as LocationType }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(TYPE_LABEL) as LocationType[]).map(t => (
                      <SelectItem key={t} value={t}>{TYPE_LABEL[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Kapazität (optional)</Label>
                <Input
                  type="number"
                  value={form.capacity}
                  onChange={e => setForm(f => ({ ...f, capacity: e.target.value }))}
                  placeholder="z.B. 12"
                />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-md border p-2">
              <div>
                <Label className="text-xs">FIFO-Pflicht</Label>
                <p className="text-[11px] text-muted-foreground">Bei Entnahme älteste Charge zuerst</p>
              </div>
              <Switch checked={form.fifo_required} onCheckedChange={v => setForm(f => ({ ...f, fifo_required: v }))} />
            </div>
            <div className="flex items-center justify-between rounded-md border p-2">
              <div>
                <Label className="text-xs">Gesperrt</Label>
                <p className="text-[11px] text-muted-foreground">Verhindert weitere Einlagerung</p>
              </div>
              <Switch checked={form.is_blocked} onCheckedChange={v => setForm(f => ({ ...f, is_blocked: v }))} />
            </div>
            <div>
              <Label className="text-xs">Notiz</Label>
              <Textarea rows={2} value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Abbrechen</Button>
            <Button onClick={save}>{editing ? 'Speichern' : 'Anlegen'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone?: 'destructive' }) {
  return (
    <div className="rounded-md border bg-card px-3 py-2">
      <div className="text-[10px] uppercase text-muted-foreground tracking-wide">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${tone === 'destructive' ? 'text-destructive' : ''}`}>{value}</div>
    </div>
  );
}
