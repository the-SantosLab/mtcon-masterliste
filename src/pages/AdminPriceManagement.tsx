import { useEffect, useMemo, useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/use-toast';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, Calendar, History, Percent } from 'lucide-react';

type ArticleRow = {
  art_nr: string;
  matchcode: string | null;
  bezeich_1: string | null;
  is_blocked?: boolean | null;
  article_prices?: {
    standardpreis: number | null;
    durchschnittspreis: number | null;
    letzter_ep: number | null;
    einkaufspreis: number | null;
    waehrung: string | null;
  } | null;
};

const PRICE_FIELDS = [
  { key: 'standardpreis', label: 'Standardpreis (SP)' },
  { key: 'durchschnittspreis', label: 'Durchschnittspreis (DP)' },
  { key: 'letzter_ep', label: 'Letzter EP (LEP)' },
  { key: 'einkaufspreis', label: 'Einkaufspreis (EP)' },
] as const;

type FieldKey = (typeof PRICE_FIELDS)[number]['key'];

const fmt = (v: number | null | undefined) =>
  v == null ? '—' : new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(v);

export default function AdminPriceManagement() {
  const { isAdmin } = useAuth();
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<ArticleRow[]>([]);
  const [loading, setLoading] = useState(false);

  // Edit dialog
  const [editRow, setEditRow] = useState<ArticleRow | null>(null);
  const [editValues, setEditValues] = useState<Record<FieldKey, string>>({
    standardpreis: '',
    durchschnittspreis: '',
    letzter_ep: '',
    einkaufspreis: '',
  });
  const [editReason, setEditReason] = useState('');
  const [saving, setSaving] = useState(false);

  // History
  const [historyRows, setHistoryRows] = useState<any[]>([]);
  const [historyArtNr, setHistoryArtNr] = useState('');

  // Scheduled
  const [scheduled, setScheduled] = useState<any[]>([]);
  const [schedArtNr, setSchedArtNr] = useState('');
  const [schedField, setSchedField] = useState<FieldKey>('standardpreis');
  const [schedValue, setSchedValue] = useState('');
  const [schedDate, setSchedDate] = useState('');
  const [schedNote, setSchedNote] = useState('');

  // Bulk
  const [bulkField, setBulkField] = useState<FieldKey>('standardpreis');
  const [bulkMode, setBulkMode] = useState<'percent' | 'absolute'>('percent');
  const [bulkValue, setBulkValue] = useState('');
  const [bulkPreview, setBulkPreview] = useState<{ art_nr: string; current: number; next: number }[]>([]);
  const [bulkReason, setBulkReason] = useState('');

  const search$ = useMemo(() => search.trim(), [search]);

  async function load() {
    setLoading(true);
    let q = (supabase as any)
      .from('articles')
      .select('art_nr, matchcode, bezeich_1, is_blocked, article_prices(standardpreis, durchschnittspreis, letzter_ep, einkaufspreis, waehrung)')
      .order('art_nr')
      .limit(200);
    if (search$) {
      q = q.or(`art_nr.ilike.%${search$}%,matchcode.ilike.%${search$}%,bezeich_1.ilike.%${search$}%`);
    }
    const { data, error } = await q;
    setLoading(false);
    if (error) {
      toast({ title: 'Fehler', description: error.message, variant: 'destructive' });
      return;
    }
    setRows((data ?? []) as ArticleRow[]);
  }

  async function loadScheduled() {
    const { data } = await (supabase as any)
      .from('scheduled_price_changes')
      .select('*')
      .order('effective_date')
      .limit(200);
    setScheduled(data ?? []);
  }

  useEffect(() => {
    load();
    loadScheduled();
  }, []);

  function openEdit(row: ArticleRow) {
    setEditRow(row);
    const p = row.article_prices;
    setEditValues({
      standardpreis: p?.standardpreis?.toString() ?? '',
      durchschnittspreis: p?.durchschnittspreis?.toString() ?? '',
      letzter_ep: p?.letzter_ep?.toString() ?? '',
      einkaufspreis: p?.einkaufspreis?.toString() ?? '',
    });
    setEditReason('');
  }

  async function saveEdit() {
    if (!editRow) return;
    setSaving(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const update: Record<string, any> = { art_nr: editRow.art_nr };
      const logEntries: any[] = [];
      const old = editRow.article_prices ?? ({} as any);
      for (const f of PRICE_FIELDS) {
        const newStr = editValues[f.key].replace(',', '.').trim();
        const newNum = newStr === '' ? null : Number(newStr);
        if (newStr !== '' && !Number.isFinite(newNum!)) continue;
        const oldNum = (old?.[f.key] ?? null) as number | null;
        if (newNum !== oldNum) {
          update[f.key] = newNum;
          update[`${f.key}_dat`] = today;
          logEntries.push({
            art_nr: editRow.art_nr,
            field_name: f.key,
            old_value: oldNum,
            new_value: newNum,
            change_reason: editReason || null,
            effective_date: today,
          });
        }
      }
      if (logEntries.length === 0) {
        toast({ title: 'Keine Änderungen' });
        setSaving(false);
        return;
      }
      const { error: upErr } = await (supabase as any).from('article_prices').upsert(update, { onConflict: 'art_nr' });
      if (upErr) throw upErr;
      const { error: logErr } = await (supabase as any).from('price_change_log').insert(logEntries);
      if (logErr) throw logErr;
      toast({ title: 'Preise aktualisiert', description: `${logEntries.length} Feld(er)` });
      setEditRow(null);
      load();
    } catch (e: any) {
      toast({ title: 'Fehler', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  async function loadHistory(art_nr: string) {
    setHistoryArtNr(art_nr);
    const { data } = await (supabase as any)
      .from('price_change_log')
      .select('*')
      .eq('art_nr', art_nr)
      .order('created_at', { ascending: false })
      .limit(100);
    setHistoryRows(data ?? []);
  }

  async function addScheduled() {
    if (!schedArtNr || !schedValue || !schedDate) {
      toast({ title: 'Bitte alle Felder ausfüllen', variant: 'destructive' });
      return;
    }
    const v = Number(schedValue.replace(',', '.'));
    if (!Number.isFinite(v)) {
      toast({ title: 'Ungültiger Preis', variant: 'destructive' });
      return;
    }
    const { error } = await (supabase as any).from('scheduled_price_changes').insert({
      art_nr: schedArtNr,
      field_name: schedField,
      new_value: v,
      effective_date: schedDate,
      note: schedNote || null,
    });
    if (error) {
      toast({ title: 'Fehler', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Geplant' });
    setSchedArtNr('');
    setSchedValue('');
    setSchedDate('');
    setSchedNote('');
    loadScheduled();
  }

  async function deleteScheduled(id: string) {
    await (supabase as any).from('scheduled_price_changes').delete().eq('id', id);
    loadScheduled();
  }

  async function applyScheduled(s: any) {
    const today = new Date().toISOString().slice(0, 10);
    const { data: cur } = await (supabase as any)
      .from('article_prices')
      .select(`${s.field_name}`)
      .eq('art_nr', s.art_nr)
      .maybeSingle();
    const old = cur?.[s.field_name] ?? null;
    const { error: e1 } = await (supabase as any).from('article_prices').upsert(
      { art_nr: s.art_nr, [s.field_name]: s.new_value, [`${s.field_name}_dat`]: today },
      { onConflict: 'art_nr' },
    );
    if (e1) {
      toast({ title: 'Fehler', description: e1.message, variant: 'destructive' });
      return;
    }
    await (supabase as any).from('price_change_log').insert({
      art_nr: s.art_nr,
      field_name: s.field_name,
      old_value: old,
      new_value: s.new_value,
      change_reason: `Geplante Änderung: ${s.note ?? ''}`,
      effective_date: today,
    });
    await (supabase as any)
      .from('scheduled_price_changes')
      .update({ applied: true, applied_at: new Date().toISOString() })
      .eq('id', s.id);
    toast({ title: 'Angewendet' });
    loadScheduled();
    load();
  }

  async function previewBulk() {
    const val = Number(bulkValue.replace(',', '.'));
    if (!Number.isFinite(val)) {
      toast({ title: 'Ungültiger Wert', variant: 'destructive' });
      return;
    }
    const preview = rows
      .map((r) => {
        const cur = r.article_prices?.[bulkField] as number | null | undefined;
        if (cur == null) return null;
        const next = bulkMode === 'percent' ? cur * (1 + val / 100) : cur + val;
        return { art_nr: r.art_nr, current: cur, next: Math.round(next * 10000) / 10000 };
      })
      .filter(Boolean) as { art_nr: string; current: number; next: number }[];
    setBulkPreview(preview);
  }

  async function applyBulk() {
    if (bulkPreview.length === 0) {
      toast({ title: 'Keine Vorschau', variant: 'destructive' });
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    const updates = bulkPreview.map((p) => ({
      art_nr: p.art_nr,
      [bulkField]: p.next,
      [`${bulkField}_dat`]: today,
    }));
    const logs = bulkPreview.map((p) => ({
      art_nr: p.art_nr,
      field_name: bulkField,
      old_value: p.current,
      new_value: p.next,
      change_reason: bulkReason || `Massenupdate ${bulkMode === 'percent' ? bulkValue + '%' : '+' + bulkValue}`,
      effective_date: today,
    }));
    // chunked upsert
    for (let i = 0; i < updates.length; i += 200) {
      const chunk = updates.slice(i, i + 200);
      const { error } = await (supabase as any).from('article_prices').upsert(chunk, { onConflict: 'art_nr' });
      if (error) {
        toast({ title: 'Fehler', description: error.message, variant: 'destructive' });
        return;
      }
    }
    await (supabase as any).from('price_change_log').insert(logs);
    toast({ title: 'Massenupdate angewendet', description: `${updates.length} Artikel` });
    setBulkPreview([]);
    setBulkReason('');
    setBulkValue('');
    load();
  }

  if (!isAdmin) {
    return (
      <AppLayout>
        <div className="p-8 text-sm text-muted-foreground">Nur Admins haben Zugriff.</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6 p-6">
        <div className="flex items-center gap-3">
          <TrendingUp className="h-6 w-6" />
          <h1 className="text-xl font-semibold">Preismanagement</h1>
        </div>

        <Tabs defaultValue="list">
          <TabsList>
            <TabsTrigger value="list">Artikel & Preise</TabsTrigger>
            <TabsTrigger value="bulk"><Percent className="mr-1 h-4 w-4" />Massenänderung</TabsTrigger>
            <TabsTrigger value="scheduled"><Calendar className="mr-1 h-4 w-4" />Geplante Änderungen</TabsTrigger>
            <TabsTrigger value="history"><History className="mr-1 h-4 w-4" />Historie</TabsTrigger>
          </TabsList>

          {/* List + Edit */}
          <TabsContent value="list" className="space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="Suche: Art-Nr, Matchcode, Bezeichnung…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && load()}
              />
              <Button onClick={load} disabled={loading}>Suchen</Button>
            </div>
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Art-Nr</TableHead>
                      <TableHead>Bezeichnung</TableHead>
                      <TableHead className="text-right">SP</TableHead>
                      <TableHead className="text-right">DP</TableHead>
                      <TableHead className="text-right">LEP</TableHead>
                      <TableHead className="text-right">EP</TableHead>
                      <TableHead>Whg.</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.art_nr}>
                        <TableCell className="font-mono text-xs">
                          {r.art_nr}
                          {r.is_blocked && <Badge variant="destructive" className="ml-2">gesperrt</Badge>}
                        </TableCell>
                        <TableCell className="text-xs">{r.matchcode ?? r.bezeich_1}</TableCell>
                        <TableCell className="text-right text-xs">{fmt(r.article_prices?.standardpreis)}</TableCell>
                        <TableCell className="text-right text-xs">{fmt(r.article_prices?.durchschnittspreis)}</TableCell>
                        <TableCell className="text-right text-xs">{fmt(r.article_prices?.letzter_ep)}</TableCell>
                        <TableCell className="text-right text-xs">{fmt(r.article_prices?.einkaufspreis)}</TableCell>
                        <TableCell className="text-xs">{r.article_prices?.waehrung ?? 'EUR'}</TableCell>
                        <TableCell className="text-right space-x-2">
                          <Button size="sm" variant="outline" onClick={() => openEdit(r)}>Bearbeiten</Button>
                          <Button size="sm" variant="ghost" onClick={() => loadHistory(r.art_nr)}>Historie</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {rows.length === 0 && (
                      <TableRow><TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-6">Keine Artikel.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Bulk */}
          <TabsContent value="bulk" className="space-y-3">
            <Card>
              <CardHeader><CardTitle className="text-base">Massenänderung auf aktuelle Trefferliste</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">Wirkt auf alle {rows.length} aktuell geladenen Artikel. Erst Filter anpassen, dann anwenden.</p>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div>
                    <Label>Feld</Label>
                    <Select value={bulkField} onValueChange={(v) => setBulkField(v as FieldKey)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PRICE_FIELDS.map((f) => <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Modus</Label>
                    <Select value={bulkMode} onValueChange={(v) => setBulkMode(v as any)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percent">Prozent (+/-)</SelectItem>
                        <SelectItem value="absolute">Absolut (+/-)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Wert</Label>
                    <Input value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} placeholder={bulkMode === 'percent' ? 'z.B. 2.5' : 'z.B. -1.00'} />
                  </div>
                  <div className="flex items-end gap-2">
                    <Button onClick={previewBulk} variant="outline">Vorschau</Button>
                    <Button onClick={applyBulk} disabled={bulkPreview.length === 0}>Anwenden</Button>
                  </div>
                </div>
                <div>
                  <Label>Grund</Label>
                  <Input value={bulkReason} onChange={(e) => setBulkReason(e.target.value)} placeholder="z.B. Jahrespreiserhöhung 2026" />
                </div>
                {bulkPreview.length > 0 && (
                  <Card>
                    <CardContent className="p-0 max-h-96 overflow-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Art-Nr</TableHead>
                            <TableHead className="text-right">Aktuell</TableHead>
                            <TableHead className="text-right">Neu</TableHead>
                            <TableHead className="text-right">Δ</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {bulkPreview.map((p) => (
                            <TableRow key={p.art_nr}>
                              <TableCell className="font-mono text-xs">{p.art_nr}</TableCell>
                              <TableCell className="text-right text-xs">{fmt(p.current)}</TableCell>
                              <TableCell className="text-right text-xs">{fmt(p.next)}</TableCell>
                              <TableCell className="text-right text-xs">{fmt(p.next - p.current)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Scheduled */}
          <TabsContent value="scheduled" className="space-y-3">
            <Card>
              <CardHeader><CardTitle className="text-base">Neue geplante Änderung</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-5 gap-3">
                <div>
                  <Label>Art-Nr</Label>
                  <Input value={schedArtNr} onChange={(e) => setSchedArtNr(e.target.value)} />
                </div>
                <div>
                  <Label>Feld</Label>
                  <Select value={schedField} onValueChange={(v) => setSchedField(v as FieldKey)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PRICE_FIELDS.map((f) => <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Neuer Wert</Label>
                  <Input value={schedValue} onChange={(e) => setSchedValue(e.target.value)} />
                </div>
                <div>
                  <Label>Wirksam ab</Label>
                  <Input type="date" value={schedDate} onChange={(e) => setSchedDate(e.target.value)} />
                </div>
                <div className="flex items-end">
                  <Button onClick={addScheduled}>Anlegen</Button>
                </div>
                <div className="md:col-span-5">
                  <Label>Notiz</Label>
                  <Input value={schedNote} onChange={(e) => setSchedNote(e.target.value)} />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Art-Nr</TableHead>
                      <TableHead>Feld</TableHead>
                      <TableHead className="text-right">Neuer Wert</TableHead>
                      <TableHead>Wirksam ab</TableHead>
                      <TableHead>Notiz</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {scheduled.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-mono text-xs">{s.art_nr}</TableCell>
                        <TableCell className="text-xs">{s.field_name}</TableCell>
                        <TableCell className="text-right text-xs">{fmt(s.new_value)}</TableCell>
                        <TableCell className="text-xs">{s.effective_date}</TableCell>
                        <TableCell className="text-xs">{s.note}</TableCell>
                        <TableCell>{s.applied ? <Badge variant="secondary">angewendet</Badge> : <Badge>offen</Badge>}</TableCell>
                        <TableCell className="text-right space-x-2">
                          {!s.applied && <Button size="sm" variant="outline" onClick={() => applyScheduled(s)}>Jetzt anwenden</Button>}
                          {!s.applied && <Button size="sm" variant="ghost" onClick={() => deleteScheduled(s.id)}>Löschen</Button>}
                        </TableCell>
                      </TableRow>
                    ))}
                    {scheduled.length === 0 && (
                      <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-6">Keine geplanten Änderungen.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* History */}
          <TabsContent value="history" className="space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="Art-Nr…"
                value={historyArtNr}
                onChange={(e) => setHistoryArtNr(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && loadHistory(historyArtNr)}
              />
              <Button onClick={() => loadHistory(historyArtNr)}>Laden</Button>
            </div>
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Datum</TableHead>
                      <TableHead>Art-Nr</TableHead>
                      <TableHead>Feld</TableHead>
                      <TableHead className="text-right">Alt</TableHead>
                      <TableHead className="text-right">Neu</TableHead>
                      <TableHead className="text-right">Δ %</TableHead>
                      <TableHead>Grund</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {historyRows.map((h) => {
                      const delta = h.old_value && h.new_value != null ? ((h.new_value - h.old_value) / h.old_value) * 100 : null;
                      return (
                        <TableRow key={h.id}>
                          <TableCell className="text-xs">{new Date(h.created_at).toLocaleString('de-DE')}</TableCell>
                          <TableCell className="font-mono text-xs">{h.art_nr}</TableCell>
                          <TableCell className="text-xs">{h.field_name}</TableCell>
                          <TableCell className="text-right text-xs">{fmt(h.old_value)}</TableCell>
                          <TableCell className="text-right text-xs">{fmt(h.new_value)}</TableCell>
                          <TableCell className="text-right text-xs">{delta == null ? '—' : delta.toFixed(1) + '%'}</TableCell>
                          <TableCell className="text-xs">{h.change_reason}</TableCell>
                        </TableRow>
                      );
                    })}
                    {historyRows.length === 0 && (
                      <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-6">Art-Nr eingeben und laden.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Edit Dialog */}
        <Dialog open={!!editRow} onOpenChange={(o) => !o && setEditRow(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Preise bearbeiten — {editRow?.art_nr}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              {PRICE_FIELDS.map((f) => (
                <div key={f.key}>
                  <Label>{f.label}</Label>
                  <Input
                    value={editValues[f.key]}
                    onChange={(e) => setEditValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  />
                </div>
              ))}
              <div>
                <Label>Grund / Notiz</Label>
                <Textarea value={editReason} onChange={(e) => setEditReason(e.target.value)} rows={2} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditRow(null)}>Abbrechen</Button>
              <Button onClick={saveEdit} disabled={saving}>Speichern</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
