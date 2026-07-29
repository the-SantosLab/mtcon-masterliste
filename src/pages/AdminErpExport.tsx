import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Download, Play, RefreshCw, AlertTriangle } from 'lucide-react';

type Overdue = {
  id: string; invoice_no: string; customer_name: string | null; customer_email: string | null;
  due_date: string | null; total_amount: number | null; paid_amount: number;
  reminder_stage: number; last_reminder_at: string | null; payment_status: string;
};

type Reminder = {
  id: string; invoice_id: string; stage: number; fee: number;
  sent_to: string | null; sent_at: string; note: string | null;
  invoices?: { invoice_no: string; customer_name: string | null } | null;
};

type Settings = {
  enabled: boolean;
  stage1_days: number; stage2_days: number; stage3_days: number;
  stage1_fee: number; stage2_fee: number; stage3_fee: number;
  sender_name: string; sender_email: string; bcc_email: string | null;
};

const eur = (n: number | null | undefined) =>
  `${Number(n || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

const daysAgo = (d: string | null) => d ? Math.floor((Date.now() - new Date(d).getTime()) / 86400000) : 0;

type ActivityRow = {
  id: string; entity_type: string; entity_id: string; entity_no: string | null;
  action: string; actor_name: string | null; note: string | null;
  before: any; after: any; created_at: string;
};

export default function AdminErpExport() {
  const { isAdmin } = useAuth();
  const [overdue, setOverdue] = useState<Overdue[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [activityFilter, setActivityFilter] = useState<string>('all');
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);

  // DATEV range
  const today = new Date();
  const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const last = new Date(today.getFullYear(), today.getMonth(), 0);
  const [from, setFrom] = useState(first.toISOString().slice(0, 10));
  const [to, setTo] = useState(last.toISOString().slice(0, 10));
  const [exporting, setExporting] = useState(false);

  const load = async () => {
    setLoading(true);
    const [ov, rm, st, ac] = await Promise.all([
      supabase.from('invoices')
        .select('id,invoice_no,customer_name,customer_email,due_date,total_amount,paid_amount,reminder_stage,last_reminder_at,payment_status')
        .in('payment_status', ['open', 'partial', 'overdue'])
        .eq('doc_kind', 'invoice')
        .not('due_date', 'is', null)
        .order('due_date', { ascending: true }),
      supabase.from('invoice_reminders')
        .select('id,invoice_id,stage,fee,sent_to,sent_at,note,invoices(invoice_no,customer_name)')
        .order('sent_at', { ascending: false })
        .limit(100),
      supabase.from('dunning_settings').select('*').eq('id', true).maybeSingle(),
      supabase.from('erp_activity')
        .select('id,entity_type,entity_id,entity_no,action,actor_name,note,before,after,created_at')
        .order('created_at', { ascending: false })
        .limit(200),
    ]);
    setOverdue((ov.data ?? []).filter(r => r.due_date && new Date(r.due_date) < new Date()) as any);
    setReminders((rm.data ?? []) as any);
    setSettings((st.data ?? null) as any);
    setActivity((ac.data ?? []) as any);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const runDunning = async (dry: boolean, ids?: string[]) => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('run-dunning', { body: { dry_run: dry, invoice_ids: ids } });
      if (error) throw error;
      toast.success(dry ? `Vorschau: ${data.processed} Mahnungen würden versendet` : `${data.processed} Mahnungen versendet`);
      if (!dry) load();
    } catch (e: any) {
      toast.error(`Fehler: ${e.message || e}`);
    } finally { setRunning(false); }
  };

  const downloadDatev = async () => {
    setExporting(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const url = `https://${projectId}.supabase.co/functions/v1/datev-export`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ from, to }),
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `datev-export_${from}_${to}.csv`;
      a.click();
      toast.success('DATEV-Export heruntergeladen');
    } catch (e: any) {
      toast.error(`Export fehlgeschlagen: ${e.message || e}`);
    } finally { setExporting(false); }
  };

  const saveSettings = async () => {
    if (!settings) return;
    const { error } = await supabase.from('dunning_settings').update({
      enabled: settings.enabled,
      stage1_days: settings.stage1_days, stage2_days: settings.stage2_days, stage3_days: settings.stage3_days,
      stage1_fee: settings.stage1_fee, stage2_fee: settings.stage2_fee, stage3_fee: settings.stage3_fee,
      sender_name: settings.sender_name, sender_email: settings.sender_email, bcc_email: settings.bcc_email,
    }).eq('id', true);
    if (error) toast.error(error.message); else toast.success('Einstellungen gespeichert');
  };

  const stageBadge = (s: number) => {
    const color = s === 0 ? 'bg-slate-500/15 text-slate-300 border-slate-500/30'
      : s === 1 ? 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30'
      : s === 2 ? 'bg-orange-500/15 text-orange-300 border-orange-500/30'
      : 'bg-rose-500/15 text-rose-300 border-rose-500/30';
    const label = s === 0 ? 'noch keine' : s === 1 ? '1. Erinnerung' : s === 2 ? '2. Mahnung' : '3. Mahnung';
    return <Badge variant="outline" className={color}>{label}</Badge>;
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-6 max-w-7xl">
        <div>
          <h1 className="text-2xl font-semibold">Mahnwesen & DATEV-Export</h1>
          <p className="text-sm text-muted-foreground">Offene Posten verfolgen, Mahnungen versenden, Belege für die Buchhaltung exportieren.</p>
        </div>

        <Tabs defaultValue="dunning">
          <TabsList>
            <TabsTrigger value="dunning">Mahnwesen</TabsTrigger>
            <TabsTrigger value="history">Verlauf</TabsTrigger>
            <TabsTrigger value="datev">DATEV-Export</TabsTrigger>
            <TabsTrigger value="audit">Audit-Log</TabsTrigger>
            {isAdmin && <TabsTrigger value="settings">Einstellungen</TabsTrigger>}
          </TabsList>

          <TabsContent value="dunning" className="space-y-4">
            <Card className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="text-lg font-semibold">Überfällige Rechnungen ({overdue.length})</h2>
                  <p className="text-xs text-muted-foreground">Sortiert nach Fälligkeit. Auto-Lauf verwendet die Karenztage aus den Einstellungen.</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => load()} disabled={loading}>
                    <RefreshCw className="h-4 w-4 mr-1" /> Neu laden
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => runDunning(true)} disabled={running}>
                    Trockenlauf
                  </Button>
                  <Button size="sm" onClick={() => runDunning(false)} disabled={running || !settings?.enabled}>
                    <Play className="h-4 w-4 mr-1" /> Alle fälligen mahnen
                  </Button>
                </div>
              </div>
              {!settings?.enabled && (
                <div className="flex items-center gap-2 text-sm text-yellow-400 mb-3 p-2 border border-yellow-500/30 rounded bg-yellow-500/10">
                  <AlertTriangle className="h-4 w-4" /> Mahnwesen ist derzeit deaktiviert. Aktivierung in den Einstellungen.
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground border-b">
                    <tr>
                      <th className="text-left py-2 pr-3">Rechnung</th>
                      <th className="text-left py-2 pr-3">Kunde</th>
                      <th className="text-left py-2 pr-3">Fällig</th>
                      <th className="text-right py-2 pr-3">Offen</th>
                      <th className="text-left py-2 pr-3">Stufe</th>
                      <th className="text-left py-2 pr-3">Letzte Mahnung</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {overdue.map((r) => {
                      const outstanding = Number(r.total_amount || 0) - Number(r.paid_amount || 0);
                      const overdueDays = daysAgo(r.due_date);
                      return (
                        <tr key={r.id} className="border-b hover:bg-white/5">
                          <td className="py-2 pr-3 font-mono">{r.invoice_no}</td>
                          <td className="py-2 pr-3">{r.customer_name || '—'}<div className="text-xs text-muted-foreground">{r.customer_email || 'keine E-Mail'}</div></td>
                          <td className="py-2 pr-3">{r.due_date}<div className="text-xs text-rose-400">{overdueDays} Tage überfällig</div></td>
                          <td className="py-2 pr-3 text-right">{eur(outstanding)}</td>
                          <td className="py-2 pr-3">{stageBadge(r.reminder_stage)}</td>
                          <td className="py-2 pr-3 text-xs">{r.last_reminder_at ? new Date(r.last_reminder_at).toLocaleDateString('de-DE') : '—'}</td>
                          <td className="py-2 pr-3 text-right">
                            <Button variant="ghost" size="sm" onClick={() => runDunning(false, [r.id])} disabled={running || !r.customer_email}>
                              Jetzt mahnen
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                    {overdue.length === 0 && (
                      <tr><td colSpan={7} className="py-8 text-center text-muted-foreground">Keine überfälligen Rechnungen.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="history">
            <Card className="p-4">
              <h2 className="text-lg font-semibold mb-3">Mahnhistorie (letzte 100)</h2>
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground border-b">
                  <tr>
                    <th className="text-left py-2 pr-3">Datum</th>
                    <th className="text-left py-2 pr-3">Rechnung</th>
                    <th className="text-left py-2 pr-3">Kunde</th>
                    <th className="text-left py-2 pr-3">Stufe</th>
                    <th className="text-right py-2 pr-3">Gebühr</th>
                    <th className="text-left py-2 pr-3">Empfänger</th>
                    <th className="text-left py-2 pr-3">Quelle</th>
                  </tr>
                </thead>
                <tbody>
                  {reminders.map(r => (
                    <tr key={r.id} className="border-b hover:bg-white/5">
                      <td className="py-2 pr-3 text-xs">{new Date(r.sent_at).toLocaleString('de-DE')}</td>
                      <td className="py-2 pr-3 font-mono">{r.invoices?.invoice_no || '—'}</td>
                      <td className="py-2 pr-3">{r.invoices?.customer_name || '—'}</td>
                      <td className="py-2 pr-3">{stageBadge(r.stage)}</td>
                      <td className="py-2 pr-3 text-right">{eur(r.fee)}</td>
                      <td className="py-2 pr-3 text-xs">{r.sent_to || '—'}</td>
                      <td className="py-2 pr-3 text-xs text-muted-foreground">{r.note || ''}</td>
                    </tr>
                  ))}
                  {reminders.length === 0 && <tr><td colSpan={7} className="py-8 text-center text-muted-foreground">Noch keine Mahnungen versendet.</td></tr>}
                </tbody>
              </table>
            </Card>
          </TabsContent>

          <TabsContent value="datev">
            <Card className="p-4 space-y-4 max-w-2xl">
              <h2 className="text-lg font-semibold">DATEV-Buchungsstapel (CSV)</h2>
              <p className="text-sm text-muted-foreground">Exportiert alle Rechnungen, Gutschriften und Stornos des Zeitraums nach DATEV-Format (SKR03-Konten: 8400 Erlöse 19%, 8300 Erlöse 7%, 8125 EU steuerfrei).</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Von</Label>
                  <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                </div>
                <div>
                  <Label>Bis</Label>
                  <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                </div>
              </div>
              <Button onClick={downloadDatev} disabled={exporting || !isAdmin}>
                <Download className="h-4 w-4 mr-2" /> {exporting ? 'Exportiere…' : 'CSV herunterladen'}
              </Button>
              {!isAdmin && <p className="text-xs text-yellow-400">Nur Admins können den DATEV-Export erzeugen.</p>}
            </Card>
          </TabsContent>

          {isAdmin && settings && (
            <TabsContent value="settings">
              <Card className="p-4 space-y-4 max-w-2xl">
                <h2 className="text-lg font-semibold">Mahnwesen-Einstellungen</h2>

                <div className="flex items-center justify-between p-3 border rounded">
                  <div>
                    <div className="font-medium">Auto-Mahnwesen aktiv</div>
                    <div className="text-xs text-muted-foreground">Steuert nur den täglichen Cron-Lauf. Manuelle Mahnungen bleiben immer möglich.</div>
                  </div>
                  <Switch checked={settings.enabled} onCheckedChange={(v) => setSettings({ ...settings, enabled: v })} />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  {[1,2,3].map((n) => {
                    const dKey = `stage${n}_days` as keyof Settings;
                    const fKey = `stage${n}_fee` as keyof Settings;
                    return (
                      <div key={n} className="space-y-2 p-3 border rounded">
                        <div className="font-medium text-sm">Stufe {n}</div>
                        <div>
                          <Label className="text-xs">Karenztage {n === 1 ? '(ab Fälligkeit)' : '(nach Stufe ' + (n-1) + ')'}</Label>
                          <Input type="number" value={settings[dKey] as number} onChange={(e) => setSettings({ ...settings, [dKey]: Number(e.target.value) } as any)} />
                        </div>
                        <div>
                          <Label className="text-xs">Mahngebühr (€)</Label>
                          <Input type="number" step="0.01" value={settings[fKey] as number} onChange={(e) => setSettings({ ...settings, [fKey]: Number(e.target.value) } as any)} />
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Absender-Name</Label>
                    <Input value={settings.sender_name} onChange={(e) => setSettings({ ...settings, sender_name: e.target.value })} />
                  </div>
                  <div>
                    <Label>Absender-Email</Label>
                    <Input value={settings.sender_email} onChange={(e) => setSettings({ ...settings, sender_email: e.target.value })} />
                  </div>
                  <div className="col-span-2">
                    <Label>BCC (optional, z. B. Buchhaltung)</Label>
                    <Input value={settings.bcc_email ?? ''} onChange={(e) => setSettings({ ...settings, bcc_email: e.target.value || null })} />
                  </div>
                </div>

                <Button onClick={saveSettings}>Speichern</Button>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      </div>
    </AppLayout>
  );
}
