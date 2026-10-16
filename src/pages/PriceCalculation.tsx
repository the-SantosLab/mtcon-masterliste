import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/AppLayout';
import { FulfillmentHeader } from '@/components/erp/FulfillmentHeader';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/contexts/AuthContext';
import { calcRow, lzValue, openPoints, type CalcRow, type Setting } from '@/lib/priceCalc';
import { toast } from 'sonner';

const num = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')));
const fmt = (v: number | null, d = 2) => (v == null || isNaN(v) ? '–' : v.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d }));
const emptyRows = (): CalcRow[] => [100, 150000, 500000, 1000000].map((qty) => ({ qty, hk: null, galvanik: null, pruefung: null, sws_wkz: null, sws_gurt: null }));

type Form = {
  id?: string; art_nr: string; issos_offer_no: string; supplier_offer: string; customer_name: string;
  with_galvanik: boolean; with_pruefung: boolean; with_lz: boolean; with_sws: boolean;
  lz_consumption: string; lead_time_weeks: string; note: string; rows: CalcRow[]; status: 'draft' | 'final';
};
const blank = (): Form => ({ art_nr: '', issos_offer_no: '', supplier_offer: '', customer_name: '', with_galvanik: true, with_pruefung: true, with_lz: false, with_sws: false, lz_consumption: '', lead_time_weeks: '', note: '', rows: emptyRows(), status: 'draft' });

export default function PriceCalculation() {
  const { isAdmin, role } = useAuth();
  const canCalc = isAdmin || role === 'staff';
  const qc = useQueryClient();
  const s = supabase as any;
  const [f, setF] = useState<Form>(blank());
  const [busy, setBusy] = useState(false);

  const { data: settings = [] } = useQuery({ queryKey: ['calc-settings'], queryFn: async () => (await s.from('calc_settings').select('*').order('key')).data ?? [] });
  const { data: list = [] } = useQuery({ queryKey: ['price-calcs'], queryFn: async () => (await s.from('price_calculations').select('*').order('created_at', { ascending: false }).limit(200)).data ?? [] });

  const val = (k: string) => (settings as any[]).find((x) => x.key === k)?.value ?? null;
  const factor = val('factor');
  const lz = lzValue(val('lz_quarter_avg'), val('lz_base'), num(f.lz_consumption));
  const opt = { with_galvanik: f.with_galvanik, with_pruefung: f.with_pruefung, with_lz: f.with_lz, with_sws: f.with_sws };
  const results = f.rows.map((r) => calcRow(r, opt, factor, lz));
  const points = useMemo(() => {
    const p = openPoints(settings as Setting[], opt).map((t) => { const [k, rest] = t.split(': '); return `${(settings as any[]).find((x) => x.key === k)?.label ?? k}: ${rest ?? ''}`; });
    if (f.with_lz && num(f.lz_consumption) == null) p.push('Effektiver Verbrauch fehlt');
    return p;
  }, [settings, f]);

  const setRow = (i: number, k: keyof CalcRow, v: string) => setF((p) => ({ ...p, rows: p.rows.map((r, j) => (j === i ? { ...r, [k]: num(v) } : r)) }));

  const save = async (status: 'draft' | 'final') => {
    if (!f.art_nr.trim()) return toast.error('Artikelnummer fehlt');
    if (status === 'final' && points.length) return toast.error('Abschließen erst, wenn keine offenen Punkte mehr bestehen');
    setBusy(true);
    const payload = { art_nr: f.art_nr.trim(), issos_offer_no: f.issos_offer_no || null, supplier_offer: f.supplier_offer || null, customer_name: f.customer_name || null, ...opt,
      lz_quarter_avg: val('lz_quarter_avg'), lz_base: val('lz_base'), lz_consumption: num(f.lz_consumption), factor, sws_factor: val('sws_factor'),
      rows: f.rows, lead_time_weeks: num(f.lead_time_weeks), note: f.note || null, status };
    const q = f.id ? s.from('price_calculations').update(payload).eq('id', f.id).select('id').single() : s.from('price_calculations').insert(payload).select('id').single();
    const { data, error } = await q;
    setBusy(false);
    if (error) return toast.error(error.message);
    setF((p) => ({ ...p, id: data.id, status }));
    qc.invalidateQueries({ queryKey: ['price-calcs'] });
    toast.success(status === 'final' ? 'Kalkulation abgeschlossen' : 'Entwurf gespeichert');
  };

  const load = (c: any) => setF({ id: c.id, art_nr: c.art_nr ?? '', issos_offer_no: c.issos_offer_no ?? '', supplier_offer: c.supplier_offer ?? '', customer_name: c.customer_name ?? '',
    with_galvanik: c.with_galvanik, with_pruefung: c.with_pruefung, with_lz: c.with_lz, with_sws: c.with_sws, lz_consumption: c.lz_consumption?.toString() ?? '',
    lead_time_weeks: c.lead_time_weeks?.toString() ?? '', note: c.note ?? '', rows: c.rows?.length ? c.rows : emptyRows(), status: c.status });

  const locked = !canCalc || (f.status === 'final' && !isAdmin);

  return (
    <AppLayout>
      <div className="space-y-6 p-4 md:p-6">
        <FulfillmentHeader title="Kalkulation" subtitle="Verkaufspreis je 1.000 Stück aus Herstellkosten, Zuschlägen und Faktor"
          actions={<Button variant="outline" onClick={() => setF(blank())}>Neue Kalkulation</Button>} />

        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-5 rounded-xl border border-border bg-card/60 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {([['art_nr', 'Artikelnummer'], ['customer_name', 'Kunde'], ['issos_offer_no', 'ISSOS Angebot-Nr.'], ['supplier_offer', 'Angebot Lieferant']] as const).map(([k, l]) => (
                <div key={k} className="space-y-1"><Label className="text-xs">{l}</Label>
                  <Input disabled={locked} value={(f as any)[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></div>
              ))}
            </div>
            <div className="flex flex-wrap gap-5">
              {([['with_galvanik', 'Galvanik'], ['with_pruefung', 'Prüfung'], ['with_lz', 'Legierungszuschlag'], ['with_sws', 'SWS-Gurte']] as const).map(([k, l]) => (
                <label key={k} className="flex items-center gap-2 text-sm"><Switch disabled={locked} checked={(f as any)[k]} onCheckedChange={(v) => setF({ ...f, [k]: v })} />{l}</label>
              ))}
            </div>
            {f.with_lz && (
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1"><Label className="text-xs">Effektiver Verbrauch</Label><Input disabled={locked} inputMode="decimal" value={f.lz_consumption} onChange={(e) => setF({ ...f, lz_consumption: e.target.value })} /></div>
                <div className="text-xs text-muted-foreground sm:col-span-2 self-end">Zuschlag = (Quartalsdurchschnitt {fmt(val('lz_quarter_avg'))} − Preisbasis {fmt(val('lz_base'))}) × Verbrauch = <span className="text-foreground font-medium">{fmt(lz)}</span> je 1.000</div>
              </div>
            )}
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Menge</TableHead><TableHead>Herstellk. /1000</TableHead>
                  {f.with_galvanik && <TableHead>Galvanik</TableHead>}{f.with_pruefung && <TableHead>Prüfung</TableHead>}
                  {f.with_lz && <TableHead>LZ</TableHead>}
                  {f.with_sws && <><TableHead>SWS WKZ</TableHead><TableHead>SWS Gurt</TableHead></>}
                  <TableHead>MGK 1</TableHead><TableHead>MGK 2</TableHead><TableHead>VK /1000</TableHead><TableHead>VK / Stk</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {f.rows.map((r, i) => { const x = results[i]; const cell = (k: keyof CalcRow) => <TableCell><Input disabled={locked} className="h-8 w-24" inputMode="decimal" value={r[k]?.toString() ?? ''} onChange={(e) => setRow(i, k, e.target.value)} /></TableCell>;
                    return <TableRow key={i}>{cell('qty')}{cell('hk')}{f.with_galvanik && cell('galvanik')}{f.with_pruefung && cell('pruefung')}
                      {f.with_lz && <TableCell className="tabular-nums">{fmt(x.lz)}</TableCell>}
                      {f.with_sws && <>{cell('sws_wkz')}{cell('sws_gurt')}</>}
                      <TableCell className="tabular-nums">{fmt(x.mgk1)}</TableCell><TableCell className="tabular-nums">{fmt(x.mgk2)}</TableCell>
                      <TableCell className="tabular-nums font-medium">{fmt(x.vk1000)}</TableCell><TableCell className="tabular-nums">{fmt(x.vkPiece, 4)}</TableCell></TableRow>; })}
                </TableBody>
              </Table>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1"><Label className="text-xs">Lieferzeit (Wochen)</Label><Input disabled={locked} inputMode="decimal" value={f.lead_time_weeks} onChange={(e) => setF({ ...f, lead_time_weeks: e.target.value })} /></div>
              <div className="space-y-1"><Label className="text-xs">Notiz</Label><Input disabled={locked} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></div>
            </div>
            {canCalc && <div className="flex gap-2">
              <Button disabled={busy || locked} variant="outline" onClick={() => save('draft')}>Entwurf speichern</Button>
              <Button disabled={busy || locked || points.length > 0} onClick={() => save('final')}>Abschließen</Button>
              {f.status === 'final' && <Badge variant="secondary">Abgeschlossen</Badge>}
            </div>}
          </div>

          <div className="space-y-5">
            <div className="rounded-xl border border-border bg-card/60 p-4 space-y-2">
              <h2 className="text-sm font-medium">Offene Punkte</h2>
              {points.length ? <ul className="space-y-1 text-xs text-destructive">{points.map((p) => <li key={p}>{p}</li>)}</ul> : <p className="text-xs text-muted-foreground">Keine</p>}
            </div>
            <SettingsPanel settings={settings as any[]} isAdmin={isAdmin} onSaved={() => qc.invalidateQueries({ queryKey: ['calc-settings'] })} />
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card/60 p-4">
          <h2 className="mb-3 text-sm font-medium">Gespeicherte Kalkulationen</h2>
          <Table><TableHeader><TableRow><TableHead>Datum</TableHead><TableHead>Artikel</TableHead><TableHead>Kunde</TableHead><TableHead>Faktor</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>{(list as any[]).map((c) => <TableRow key={c.id} className="cursor-pointer" onClick={() => load(c)}>
              <TableCell>{new Date(c.calc_date).toLocaleDateString('de-DE')}</TableCell><TableCell>{c.art_nr}</TableCell><TableCell>{c.customer_name ?? '–'}</TableCell>
              <TableCell>{c.factor == null ? <span className="text-destructive">ungeklärt</span> : fmt(c.factor, 3)}</TableCell>
              <TableCell>{c.status === 'final' ? 'Abgeschlossen' : 'Entwurf'}</TableCell></TableRow>)}
              {!list.length && <TableRow><TableCell colSpan={5} className="text-xs text-muted-foreground">Noch keine Kalkulationen</TableCell></TableRow>}
            </TableBody></Table>
        </div>
      </div>
    </AppLayout>
  );
}

function SettingsPanel({ settings, isAdmin, onSaved }: { settings: any[]; isAdmin: boolean; onSaved: () => void }) {
  const [edit, setEdit] = useState<Record<string, { value: string; status: string; note: string }>>({});
  useEffect(() => { setEdit(Object.fromEntries(settings.map((x) => [x.key, { value: x.value?.toString() ?? '', status: x.status, note: x.note ?? '' }]))); }, [settings]);
  const save = async (k: string) => {
    const e = edit[k]; const v = num(e.value);
    if (e.status === 'confirmed' && v == null) return toast.error('Bestätigen nur mit Wert');
    const { error } = await (supabase as any).from('calc_settings').update({ value: v, status: e.status, note: e.note || null, updated_at: new Date().toISOString() }).eq('key', k);
    if (error) return toast.error(error.message);
    toast.success('Gespeichert'); onSaved();
  };
  return (
    <div className="rounded-xl border border-border bg-card/60 p-4 space-y-3">
      <h2 className="text-sm font-medium">Faktoren und Grundwerte</h2>
      {!isAdmin && <p className="text-xs text-muted-foreground">Nur Admins können diese Werte ändern.</p>}
      {settings.map((x) => { const e = edit[x.key]; if (!e) return null; return (
        <div key={x.key} className="space-y-1 border-t border-border pt-3 first:border-0 first:pt-0">
          <div className="flex items-center justify-between gap-2"><span className="text-xs">{x.label}</span>
            <Badge variant={x.status === 'confirmed' && x.value != null ? 'secondary' : 'destructive'}>{x.value == null ? 'kein Wert' : x.status === 'confirmed' ? 'bestätigt' : 'ungeklärt'}</Badge></div>
          {isAdmin ? <>
            <div className="flex gap-2"><Input className="h-8" inputMode="decimal" placeholder={x.unit ?? ''} value={e.value} onChange={(ev) => setEdit({ ...edit, [x.key]: { ...e, value: ev.target.value } })} />
              <select className="h-8 rounded-md border border-input bg-background px-2 text-xs" value={e.status} onChange={(ev) => setEdit({ ...edit, [x.key]: { ...e, status: ev.target.value } })}>
                <option value="unclear">ungeklärt</option><option value="confirmed">bestätigt</option></select></div>
            <Input className="h-8 text-xs" placeholder="Notiz / Quelle" value={e.note} onChange={(ev) => setEdit({ ...edit, [x.key]: { ...e, note: ev.target.value } })} />
            <Button size="sm" variant="outline" onClick={() => save(x.key)}>Speichern</Button>
          </> : <p className="text-xs text-muted-foreground">{x.value == null ? '–' : fmt(x.value, 3)} {x.unit ?? ''}{x.note ? ` · ${x.note}` : ''}</p>}
        </div>); })}
    </div>
  );
}
