import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RefreshCw, Boxes, AlertTriangle, Calendar, Route } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { LotTraceDialog, type TraceLot } from '@/components/erp/LotTraceDialog';

type Lot = {
  id: string;
  art_nr: string;
  lot_no: string;
  lot_no_ext: string | null;
  supplier_lief_nr: string | null;
  supplier_name: string | null;
  expiry_date: string | null;
  first_received_at: string;
  last_received_at: string;
  total_received: number;
  current_qty: number;
  receipt_count: number;
  status: 'active' | 'blocked' | 'consumed' | string;
  note: string | null;
};

const fmtN = (n: number | null | undefined, d = 0) =>
  n == null ? '–' : Number(n).toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtD = (d: string | null) => (d ? new Date(d).toLocaleDateString('de-DE') : '–');

/** Chargen-Inhalt ohne AppLayout/Kopfzeile – nutzbar als Tab auf der Lager-Seite. */
export function LotsPanel() {
  const [rows, setRows] = useState<Lot[]>([]);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | 'active' | 'blocked' | 'consumed'>('active');
  const [expiry, setExpiry] = useState<'any' | 'soon' | 'expired'>('any');
  const [trace, setTrace] = useState<TraceLot | null>(null);

  const load = async () => {
    setBusy(true);
    const { data, error } = await (supabase as any)
      .from('lots')
      .select('*')
      .order('last_received_at', { ascending: false })
      .limit(2000);
    setBusy(false);
    if (error) { toast.error('Laden fehlgeschlagen'); return; }
    setRows((data || []) as Lot[]);
  };

  useEffect(() => { load(); }, []);

  const today = new Date(); today.setHours(0,0,0,0);
  const in30 = new Date(today); in30.setDate(in30.getDate() + 30);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows.filter(r => {
      if (status !== 'all' && r.status !== status) return false;
      if (expiry !== 'any') {
        if (!r.expiry_date) return false;
        const d = new Date(r.expiry_date);
        if (expiry === 'expired' && d >= today) return false;
        if (expiry === 'soon' && (d < today || d > in30)) return false;
      }
      if (!s) return true;
      return r.art_nr.toLowerCase().includes(s)
        || r.lot_no.toLowerCase().includes(s)
        || (r.lot_no_ext || '').toLowerCase().includes(s)
        || (r.supplier_name || '').toLowerCase().includes(s);
    });
  }, [rows, search, status, expiry]);

  const kpi = useMemo(() => {
    const active = rows.filter(r => r.status === 'active');
    const expired = active.filter(r => r.expiry_date && new Date(r.expiry_date) < today).length;
    const soon = active.filter(r => r.expiry_date && new Date(r.expiry_date) >= today && new Date(r.expiry_date) <= in30).length;
    return { total: rows.length, active: active.length, expired, soon };
  }, [rows]);

  const setLotStatus = async (id: string, s: Lot['status']) => {
    const { error } = await (supabase as any).from('lots').update({ status: s }).eq('id', id);
    if (error) { toast.error('Aktualisierung fehlgeschlagen'); return; }
    toast.success(s === 'blocked' ? 'Charge gesperrt' : s === 'active' ? 'Charge freigegeben' : 'Charge verbraucht');
    load();
  };

  return (
    <div className="space-y-3 mt-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi icon={<Boxes className="h-4 w-4 text-muted-foreground" />} label="Chargen gesamt" value={fmtN(kpi.total)} />
        <Kpi icon={<Boxes className="h-4 w-4 text-emerald-500" />} label="Aktiv" value={fmtN(kpi.active)} />
        <Kpi icon={<Calendar className="h-4 w-4 text-amber-500" />} label="MHD < 30 Tage" value={fmtN(kpi.soon)} />
        <Kpi icon={<AlertTriangle className="h-4 w-4 text-destructive" />} label="MHD abgelaufen" value={fmtN(kpi.expired)} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Suche Art-Nr, Chargen-Nr, Lieferant…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 max-w-sm text-xs"
        />
        <Select value={status} onValueChange={(v) => setStatus(v as any)}>
          <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Status</SelectItem>
            <SelectItem value="active">Aktiv</SelectItem>
            <SelectItem value="blocked">Gesperrt</SelectItem>
            <SelectItem value="consumed">Verbraucht</SelectItem>
          </SelectContent>
        </Select>
        <Select value={expiry} onValueChange={(v) => setExpiry(v as any)}>
          <SelectTrigger className="h-8 w-[170px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="any">MHD: alle</SelectItem>
            <SelectItem value="soon">MHD: ≤ 30 Tage</SelectItem>
            <SelectItem value="expired">MHD: abgelaufen</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-[11px] text-muted-foreground ml-auto">{filtered.length} Chargen</span>
        <Button size="sm" variant="outline" onClick={load} disabled={busy} className="h-8 text-xs">
          <RefreshCw className={cn('h-3.5 w-3.5 mr-1.5', busy && 'animate-spin')} /> Aktualisieren
        </Button>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-2 py-2 text-left">Artikel</th>
                <th className="px-2 py-2 text-left">Charge</th>
                <th className="px-2 py-2 text-left">Ext.</th>
                <th className="px-2 py-2 text-left">Lieferant</th>
                <th className="px-2 py-2 text-right">Bestand</th>
                <th className="px-2 py-2 text-right">Σ Zugang</th>
                <th className="px-2 py-2 text-right">Eing.</th>
                <th className="px-2 py-2 text-left">Erst</th>
                <th className="px-2 py-2 text-left">Letzt</th>
                <th className="px-2 py-2 text-left">MHD</th>
                <th className="px-2 py-2 text-left">Status</th>
                <th className="px-2 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 && (
                <tr><td colSpan={12} className="px-3 py-8 text-center text-muted-foreground">Keine Chargen</td></tr>
              )}
              {filtered.map(r => {
                const exp = r.expiry_date ? new Date(r.expiry_date) : null;
                const expired = exp && exp < today;
                const soon = exp && !expired && exp <= in30;
                return (
                  <tr key={r.id} className={cn(r.status === 'blocked' && 'bg-destructive/5', expired && 'bg-amber-500/5')}>
                    <td className="px-2 py-1.5 font-mono">{r.art_nr}</td>
                    <td className="px-2 py-1.5 font-mono font-medium text-foreground">{r.lot_no}</td>
                    <td className="px-2 py-1.5 font-mono text-muted-foreground">{r.lot_no_ext || '–'}</td>
                    <td className="px-2 py-1.5">{r.supplier_name || r.supplier_lief_nr || '–'}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums font-medium">{fmtN(r.current_qty, 3)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">{fmtN(r.total_received, 3)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">{r.receipt_count}</td>
                    <td className="px-2 py-1.5 text-muted-foreground">{fmtD(r.first_received_at)}</td>
                    <td className="px-2 py-1.5 text-muted-foreground">{fmtD(r.last_received_at)}</td>
                    <td className={cn('px-2 py-1.5',
                      expired && 'text-destructive font-medium',
                      soon && 'text-amber-600 dark:text-amber-400')}>
                      {fmtD(r.expiry_date)}
                    </td>
                    <td className="px-2 py-1.5">
                      <Badge variant={r.status === 'blocked' ? 'destructive' : r.status === 'consumed' ? 'secondary' : 'outline'}
                        className="text-[10px] h-4 px-1.5">
                        {r.status === 'active' ? 'Aktiv' : r.status === 'blocked' ? 'Gesperrt' : 'Verbraucht'}
                      </Badge>
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      {r.status === 'active' && (
                        <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => setLotStatus(r.id, 'blocked')}>Sperren</Button>
                      )}
                      {r.status === 'blocked' && (
                        <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => setLotStatus(r.id, 'active')}>Freigeben</Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

export default function AdminLots() {
  const { isAdmin, loading, role } = useAuth();
  const canUse = isAdmin || role === 'staff';

  if (loading) return <AppLayout><div className="p-6">Laden…</div></AppLayout>;
  if (!canUse) return <Navigate to="/" replace />;

  return (
    <AppLayout>
      <div className="space-y-4 max-w-[1400px]">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Chargen</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Chargenverwaltung mit automatischer Duplikatsprüfung beim Wareneingang.</p>
        </div>
        <LotsPanel />
      </div>
    </AppLayout>
  );
}

function Kpi({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card className="p-3">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
        {icon}<span>{label}</span>
      </div>
      <div className="mt-1 text-lg font-semibold tabular-nums text-foreground">{value}</div>
    </Card>
  );
}
