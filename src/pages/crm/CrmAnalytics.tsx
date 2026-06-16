import { useEffect, useMemo, useState } from 'react';
import { CrmLayout } from '@/components/CrmLayout';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Calendar } from '@/components/ui/calendar';
import { Calendar as CalendarIcon, TrendingUp, Receipt, Users, Building2, X, ChevronsUpDown, Check, ArrowUp, ArrowDown } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid, Area, AreaChart } from 'recharts';
import { format, startOfYear, endOfYear, startOfQuarter, startOfMonth, subMonths, subDays, subYears, parseISO, eachMonthOfInterval, isWithinInterval } from 'date-fns';
import { de } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';

type Invoice = {
  id: string;
  rech_nr: number;
  rech_dat: string | null;
  netto_fw: number | null;
  brutto_fw: number | null;
  waehrung: string | null;
  storno_kz: boolean | null;
  iae_text: string | null;
  belegart_text: string | null;
  company_id: string | null;
  matchcode: string | null;
};
type Company = { id: string; name: string };

const fmtEUR = (n: number) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtEUR2 = (n: number) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Preset = { label: string; range: () => { from: Date; to: Date } };
const PRESETS: Preset[] = [
  { label: 'Dieses Jahr', range: () => ({ from: startOfYear(new Date()), to: new Date() }) },
  { label: 'Letztes Jahr', range: () => { const y = subYears(new Date(), 1); return { from: startOfYear(y), to: endOfYear(y) }; } },
  { label: 'Letzte 12 Monate', range: () => ({ from: subMonths(new Date(), 12), to: new Date() }) },
  { label: 'Aktuelles Quartal', range: () => ({ from: startOfQuarter(new Date()), to: new Date() }) },
  { label: 'Aktueller Monat', range: () => ({ from: startOfMonth(new Date()), to: new Date() }) },
  { label: 'Letzte 90 Tage', range: () => ({ from: subDays(new Date(), 90), to: new Date() }) },
  { label: 'Letzte 30 Tage', range: () => ({ from: subDays(new Date(), 30), to: new Date() }) },
  { label: 'Alles', range: () => ({ from: new Date(2010, 0, 1), to: new Date() }) },
];

export default function CrmAnalytics() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState<Date>(startOfYear(new Date()));
  const [to, setTo] = useState<Date>(new Date());
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<'revenue' | 'count'>('revenue');

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      const pageSize = 1000;
      let all: any[] = []; let off = 0;
      while (true) {
        const { data, error } = await supabase
          .from('issos_invoices' as any)
          .select('id, rech_nr, rech_dat, netto_fw, brutto_fw, waehrung, storno_kz, iae_text, belegart_text, company_id, matchcode')
          .order('rech_dat', { ascending: false, nullsFirst: false })
          .range(off, off + pageSize - 1);
        if (error || !data || data.length === 0) break;
        all = all.concat(data);
        if (data.length < pageSize) break;
        off += pageSize; if (off > 100000) break;
      }
      const { data: cs } = await supabase.from('companies').select('id, name').order('name');
      if (mounted) {
        setInvoices(all as any);
        setCompanies((cs as any) || []);
        setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const filtered = useMemo(() => {
    return invoices.filter(i => {
      if (i.storno_kz) return false;
      if (selectedCompanyId && i.company_id !== selectedCompanyId) return false;
      if (!i.rech_dat) return false;
      const d = parseISO(i.rech_dat);
      return isWithinInterval(d, { start: from, end: to });
    });
  }, [invoices, from, to, selectedCompanyId]);

  const kpis = useMemo(() => {
    const netto = filtered.reduce((s, i) => s + Number(i.netto_fw || 0), 0);
    const brutto = filtered.reduce((s, i) => s + Number(i.brutto_fw || 0), 0);
    const count = filtered.length;
    const avg = count > 0 ? netto / count : 0;
    const customers = new Set(filtered.map(i => i.company_id || `mc:${i.matchcode}`)).size;
    return { netto, brutto, count, avg, customers };
  }, [filtered]);

  const monthly = useMemo(() => {
    if (filtered.length === 0) return [];
    const months = eachMonthOfInterval({ start: startOfMonth(from), end: startOfMonth(to) });
    const map = new Map<string, number>();
    for (const m of months) map.set(format(m, 'yyyy-MM'), 0);
    for (const i of filtered) {
      if (!i.rech_dat) continue;
      const key = i.rech_dat.slice(0, 7);
      map.set(key, (map.get(key) || 0) + Number(i.netto_fw || 0));
    }
    return Array.from(map.entries()).map(([k, v]) => ({ month: k, label: format(parseISO(k + '-01'), 'MMM yy', { locale: de }), netto: Math.round(v) }));
  }, [filtered, from, to]);

  const topCustomers = useMemo(() => {
    const m = new Map<string, { id: string | null; name: string; netto: number; count: number }>();
    for (const i of filtered) {
      const id = i.company_id || `mc:${i.matchcode}`;
      const name = companies.find(c => c.id === i.company_id)?.name || i.matchcode || 'Unbekannt';
      const e = m.get(id) || { id: i.company_id, name, netto: 0, count: 0 };
      e.netto += Number(i.netto_fw || 0); e.count += 1;
      m.set(id, e);
    }
    const arr = Array.from(m.values());
    arr.sort((a, b) => sortKey === 'revenue' ? b.netto - a.netto : b.count - a.count);
    return arr;
  }, [filtered, companies, sortKey]);

  const selectedCompany = companies.find(c => c.id === selectedCompanyId);

  return (
    <CrmLayout>
      <div className="p-6 space-y-6 max-w-[1600px]">
        {/* Header */}
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <TrendingUp className="h-3.5 w-3.5" /> CRM · Auswertungen
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Umsatz-Auswertungen</h1>
          <p className="text-sm text-muted-foreground">Basis: ISSOS-Rechnungen (ohne stornierte). Netto in Belegwährung.</p>
        </div>

        {/* Filter bar */}
        <Card className="p-4 border border-border/50 bg-card/40 backdrop-blur-xl">
          <div className="flex flex-col lg:flex-row gap-3 lg:items-end">
            <div className="space-y-1.5 flex-1 min-w-[280px]">
              <label className="text-[11px] uppercase tracking-wider text-muted-foreground">Kunde</label>
              <CompanyCombobox companies={companies} value={selectedCompanyId} onChange={setSelectedCompanyId} />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] uppercase tracking-wider text-muted-foreground">Zeitraum</label>
              <DateRangePicker from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
            </div>
          </div>
          <div className="flex gap-1.5 flex-wrap mt-3 pt-3 border-t border-border/40">
            {PRESETS.map(p => {
              const r = p.range();
              const active = format(from, 'yyyy-MM-dd') === format(r.from, 'yyyy-MM-dd') && format(to, 'yyyy-MM-dd') === format(r.to, 'yyyy-MM-dd');
              return (
                <Button key={p.label} size="sm" variant={active ? 'default' : 'outline'} className="h-7 text-xs" onClick={() => { setFrom(r.from); setTo(r.to); }}>
                  {p.label}
                </Button>
              );
            })}
          </div>
        </Card>

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi label="Umsatz Netto" value={fmtEUR(kpis.netto)} icon={<TrendingUp className="h-4 w-4" />} accent />
          <Kpi label="Rechnungen" value={kpis.count.toLocaleString('de-DE')} icon={<Receipt className="h-4 w-4" />} />
          <Kpi label="Ø Rechnung" value={fmtEUR(kpis.avg)} icon={<Receipt className="h-4 w-4" />} />
          <Kpi label="Kunden" value={kpis.customers.toLocaleString('de-DE')} icon={<Users className="h-4 w-4" />} />
        </div>

        {/* Trend */}
        <Card className="p-5 border border-border/50 bg-card/40 backdrop-blur-xl">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-sm font-medium">Umsatzverlauf</div>
              <div className="text-xs text-muted-foreground">
                {selectedCompany ? selectedCompany.name : 'Alle Kunden'} · {format(from, 'dd.MM.yyyy', { locale: de })} – {format(to, 'dd.MM.yyyy', { locale: de })}
              </div>
            </div>
          </div>
          <div className="h-72">
            {loading ? (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Lade…</div>
            ) : monthly.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Keine Daten im gewählten Zeitraum</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthly} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="hsl(var(--border))" strokeOpacity={0.3} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} />
                  <Tooltip
                    contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                    formatter={(v: any) => [fmtEUR2(Number(v)), 'Netto']}
                  />
                  <Area type="monotone" dataKey="netto" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#rev)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        {/* Top customers — hidden when single customer selected */}
        {!selectedCompanyId && (
          <Card className="p-5 border border-border/50 bg-card/40 backdrop-blur-xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-sm font-medium">Top-Kunden</div>
                <div className="text-xs text-muted-foreground">Sortiert nach {sortKey === 'revenue' ? 'Umsatz' : 'Anzahl Rechnungen'}</div>
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant={sortKey === 'revenue' ? 'default' : 'outline'} className="h-7 text-xs" onClick={() => setSortKey('revenue')}>Umsatz</Button>
                <Button size="sm" variant={sortKey === 'count' ? 'default' : 'outline'} className="h-7 text-xs" onClick={() => setSortKey('count')}>Anzahl</Button>
              </div>
            </div>
            <div className="h-72 mb-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topCustomers.slice(0, 10)} layout="vertical" margin={{ top: 0, right: 24, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="hsl(var(--border))" strokeOpacity={0.3} horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} width={180} />
                  <Tooltip
                    contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                    formatter={(v: any, n: any) => n === 'netto' ? [fmtEUR2(Number(v)), 'Netto'] : [v, 'Rechnungen']}
                  />
                  <Bar dataKey={sortKey === 'revenue' ? 'netto' : 'count'} fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="overflow-hidden rounded-lg border border-border/40">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-[11px] uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left p-2 font-medium">#</th>
                    <th className="text-left p-2 font-medium">Kunde</th>
                    <th className="text-right p-2 font-medium">Rechnungen</th>
                    <th className="text-right p-2 font-medium">Umsatz Netto</th>
                    <th className="text-right p-2 font-medium">Ø Rechnung</th>
                  </tr>
                </thead>
                <tbody>
                  {topCustomers.slice(0, 50).map((c, idx) => (
                    <tr key={c.id || c.name} className="border-t border-border/40 hover:bg-muted/20">
                      <td className="p-2 text-muted-foreground tabular-nums">{idx + 1}</td>
                      <td className="p-2">
                        {c.id ? <Link to={`/crm/companies/${c.id}`} className="hover:underline">{c.name}</Link> : <span className="text-muted-foreground">{c.name}</span>}
                      </td>
                      <td className="p-2 text-right tabular-nums">{c.count.toLocaleString('de-DE')}</td>
                      <td className="p-2 text-right tabular-nums font-medium">{fmtEUR2(c.netto)}</td>
                      <td className="p-2 text-right tabular-nums text-muted-foreground">{fmtEUR2(c.count > 0 ? c.netto / c.count : 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </CrmLayout>
  );
}

function Kpi({ label, value, icon, accent }: { label: string; value: string; icon: React.ReactNode; accent?: boolean }) {
  return (
    <Card className={cn('p-4 border border-border/50 backdrop-blur-xl', accent ? 'bg-gradient-to-br from-primary/10 via-card/40 to-card/20' : 'bg-card/40')}>
      <div className="flex items-center justify-between text-muted-foreground">
        <span className="text-[11px] uppercase tracking-wider">{label}</span>
        <span className={cn(accent && 'text-primary')}>{icon}</span>
      </div>
      <div className="text-2xl font-semibold tabular-nums mt-2">{value}</div>
    </Card>
  );
}

function CompanyCombobox({ companies, value, onChange }: { companies: Company[]; value: string | null; onChange: (id: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const selected = companies.find(c => c.id === value);
  return (
    <div className="flex gap-1.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" className="h-9 justify-between flex-1 min-w-[280px] font-normal">
            {selected ? <span className="flex items-center gap-2 truncate"><Building2 className="h-3.5 w-3.5 text-muted-foreground" />{selected.name}</span> : <span className="text-muted-foreground">Alle Kunden</span>}
            <ChevronsUpDown className="h-3.5 w-3.5 opacity-50 shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[420px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Kunde suchen…" />
            <CommandList>
              <CommandEmpty>Kein Treffer.</CommandEmpty>
              <CommandGroup>
                <CommandItem onSelect={() => { onChange(null); setOpen(false); }}>
                  <Check className={cn('h-4 w-4 mr-2', !value ? 'opacity-100' : 'opacity-0')} />
                  Alle Kunden
                </CommandItem>
                {companies.map(c => (
                  <CommandItem key={c.id} value={c.name} onSelect={() => { onChange(c.id); setOpen(false); }}>
                    <Check className={cn('h-4 w-4 mr-2', value === c.id ? 'opacity-100' : 'opacity-0')} />
                    {c.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {selected && (
        <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => onChange(null)}><X className="h-4 w-4" /></Button>
      )}
    </div>
  );
}

function DateRangePicker({ from, to, onChange }: { from: Date; to: Date; onChange: (f: Date, t: Date) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="h-9 justify-start font-normal gap-2 min-w-[260px]">
          <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
          {format(from, 'dd.MM.yyyy', { locale: de })} – {format(to, 'dd.MM.yyyy', { locale: de })}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end">
        <Calendar
          mode="range"
          selected={{ from, to }}
          onSelect={(r: any) => {
            if (r?.from && r?.to) { onChange(r.from, r.to); setOpen(false); }
            else if (r?.from) onChange(r.from, r.from);
          }}
          numberOfMonths={2}
          locale={de}
          defaultMonth={subMonths(to, 1)}
        />
      </PopoverContent>
    </Popover>
  );
}
