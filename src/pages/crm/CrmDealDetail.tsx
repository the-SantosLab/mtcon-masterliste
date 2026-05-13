import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CrmLayout } from '@/components/CrmLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { STAGES, StageKey, stageColor, formatEUR } from '@/lib/crm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Loader2, ArrowLeft, Save } from 'lucide-react';
import { toast } from 'sonner';

export default function CrmDealDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [deal, setDeal] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>({});
  const [activities, setActivities] = useState<any[]>([]);
  const [offers, setOffers] = useState<any[]>([]);
  const [reasons, setReasons] = useState<any[]>([]);
  const [pendingStage, setPendingStage] = useState<StageKey | null>(null);
  const [wonValue, setWonValue] = useState('');
  const [lostReason, setLostReason] = useState('');
  const [lostDetails, setLostDetails] = useState('');

  useEffect(() => { void load(); }, [id]);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    const [{ data: d }, { data: acts }, { data: ofs }, { data: lr }] = await Promise.all([
      supabase.from('deals').select('*, companies(id, name, customer_no)').eq('id', id).single(),
      supabase.from('crm_activities').select('*').eq('deal_id', id).order('created_at', { ascending: false }),
      supabase.from('offers').select('*').eq('deal_id', id).order('created_at', { ascending: false }),
      supabase.from('lost_reasons').select('*').eq('is_active', true).order('sort_order'),
    ]);
    setDeal(d);
    setForm(d ?? {});
    setActivities(acts ?? []);
    setOffers(ofs ?? []);
    setReasons(lr ?? []);
    setLoading(false);
  };

  const save = async (patch?: any) => {
    if (!id) return;
    setSaving(true);
    const payload = patch ?? {
      title: form.title, value_estimated: form.value_estimated ? Number(form.value_estimated) : null,
      sop: form.sop, delivery_address: form.delivery_address,
      quantity: form.quantity ? Number(form.quantity) : null, currency: form.currency || 'EUR',
    };
    const { error } = await supabase.from('deals').update(payload).eq('id', id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Gespeichert');
    void load();
  };

  const requestStageChange = (target: StageKey) => {
    if (!deal || target === deal.stage) return;
    if (target === 'qualifikation') {
      const missing: string[] = [];
      if (!form.sop) missing.push('SOP');
      if (!form.delivery_address) missing.push('Lieferadresse');
      if (!form.quantity) missing.push('Stückzahl');
      if (missing.length) { toast.error('Pflichtfelder fehlen: ' + missing.join(', ')); return; }
    }
    if (target === 'won' || target === 'lost') {
      setPendingStage(target);
      setWonValue(deal.value_estimated?.toString() ?? '');
      setLostReason(''); setLostDetails('');
      return;
    }
    void save({ stage: target });
  };

  const confirmWon = async () => {
    if (!wonValue || Number(wonValue) <= 0) { toast.error('Finales Auftragsvolumen erforderlich'); return; }
    setSaving(true);
    // Create case in Masterliste
    const { data: caseRow, error: caseErr } = await supabase.from('cases').insert({
      project_name: deal.title,
      client_name: deal.companies?.name ?? null,
      customer_no: deal.companies?.customer_no ?? null,
      quantity: form.quantity ? Number(form.quantity) : null,
      sop: form.sop ?? null,
      note: `Aus CRM-Deal ${deal.deal_no} übernommen`,
      created_by: user?.id,
      assignee_id: user?.id,
    }).select('id').single();
    if (caseErr) { setSaving(false); toast.error('Case konnte nicht angelegt werden: ' + caseErr.message); return; }
    const { error } = await supabase.from('deals').update({
      stage: 'won', value_final: Number(wonValue), won_case_id: caseRow.id,
    }).eq('id', deal.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Deal als Won markiert · Vorgang in Masterliste angelegt');
    setPendingStage(null);
    void load();
  };

  const confirmLost = async () => {
    if (!lostReason) { toast.error('Verlustgrund erforderlich'); return; }
    if (!lostDetails.trim()) { toast.error('Details erforderlich'); return; }
    setSaving(true);
    const { error } = await supabase.from('deals').update({
      stage: 'lost', lost_reason_id: lostReason, lost_details: lostDetails.trim(),
    }).eq('id', deal.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Deal als Lost markiert');
    setPendingStage(null);
    void load();
  };

  if (loading) return <CrmLayout><div className="flex justify-center py-20"><Loader2 className="h-5 w-5 animate-spin" /></div></CrmLayout>;
  if (!deal) return <CrmLayout><p className="text-sm text-muted-foreground">Deal nicht gefunden.</p></CrmLayout>;

  return (
    <CrmLayout>
      <button onClick={() => navigate('/crm/deals')} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-3">
        <ArrowLeft className="h-3.5 w-3.5" /> Zurück zur Pipeline
      </button>

      <div className="flex flex-wrap items-center gap-3 justify-between mb-5">
        <div>
          <p className="text-[11px] text-muted-foreground tabular-nums">{deal.deal_no}</p>
          <h1 className="text-xl font-semibold text-foreground">{deal.title}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{deal.companies?.name ?? '–'}</p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className="px-2.5 py-1 rounded text-[11px] font-semibold uppercase tracking-wide text-white"
            style={{ background: stageColor(deal.stage) }}
          >
            {STAGES.find(s => s.key === deal.stage)?.label}
          </span>
          <span className="text-sm font-semibold tabular-nums text-foreground">
            {formatEUR(deal.stage === 'won' ? deal.value_final : deal.value_estimated)}
          </span>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap gap-1.5">
        {STAGES.map(s => (
          <button
            key={s.key}
            onClick={() => requestStageChange(s.key)}
            disabled={s.key === deal.stage}
            className="px-2.5 py-1 rounded text-[11px] border border-border bg-card/60 hover:bg-card text-foreground disabled:opacity-40 disabled:cursor-default"
          >
            → {s.label}
          </button>
        ))}
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Übersicht</TabsTrigger>
          <TabsTrigger value="activities">Aktivitäten</TabsTrigger>
          <TabsTrigger value="offers">Angebote</TabsTrigger>
          <TabsTrigger value="files">Dateien</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <div className="grid md:grid-cols-2 gap-3 max-w-3xl">
            <Field label="Titel"><Input value={form.title ?? ''} onChange={e => setForm({ ...form, title: e.target.value })} className="h-8 text-xs" /></Field>
            <Field label="Geschätzter Wert"><Input type="number" value={form.value_estimated ?? ''} onChange={e => setForm({ ...form, value_estimated: e.target.value })} className="h-8 text-xs" /></Field>
            <Field label="SOP *"><Input value={form.sop ?? ''} onChange={e => setForm({ ...form, sop: e.target.value })} className="h-8 text-xs" /></Field>
            <Field label="Stückzahl *"><Input type="number" value={form.quantity ?? ''} onChange={e => setForm({ ...form, quantity: e.target.value })} className="h-8 text-xs" /></Field>
            <Field label="Lieferadresse *" className="md:col-span-2"><Textarea value={form.delivery_address ?? ''} onChange={e => setForm({ ...form, delivery_address: e.target.value })} className="text-xs min-h-[60px]" /></Field>
          </div>
          <Button onClick={() => save()} disabled={saving} size="sm" className="mt-4 h-8 text-xs gap-1.5">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Speichern
          </Button>
          {deal.stage === 'lost' && deal.lost_details && (
            <div className="mt-5 p-3 rounded border border-border bg-card/40 max-w-3xl">
              <p className="text-[11px] uppercase text-muted-foreground mb-1">Verlustgrund</p>
              <p className="text-xs text-foreground">{reasons.find(r => r.id === deal.lost_reason_id)?.label} — {deal.lost_details}</p>
            </div>
          )}
          {deal.stage === 'won' && deal.won_case_id && (
            <div className="mt-5 p-3 rounded border border-border bg-card/40 max-w-3xl text-xs">
              Vorgang in Masterliste: <a href={`/cases/${deal.won_case_id}`} className="text-primary hover:underline">öffnen →</a>
            </div>
          )}
        </TabsContent>

        <TabsContent value="activities" className="mt-4">
          {activities.length === 0 ? (
            <p className="text-xs text-muted-foreground">Noch keine Aktivitäten.</p>
          ) : (
            <ul className="space-y-2 max-w-3xl">
              {activities.map(a => (
                <li key={a.id} className="p-3 rounded border border-border bg-card/40">
                  <div className="flex justify-between text-xs">
                    <span className="font-semibold text-foreground">{a.subject}</span>
                    <span className="text-muted-foreground">{new Date(a.created_at).toLocaleDateString('de-DE')}</span>
                  </div>
                  {a.body && <p className="text-[11px] text-muted-foreground mt-1">{a.body}</p>}
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="offers" className="mt-4">
          {offers.length === 0 ? (
            <p className="text-xs text-muted-foreground">Noch keine Angebote.</p>
          ) : (
            <ul className="space-y-2 max-w-3xl">
              {offers.map(o => (
                <li key={o.id} className="p-3 rounded border border-border bg-card/40 flex justify-between text-xs">
                  <span className="text-foreground">{o.offer_no}</span>
                  <span className="text-muted-foreground">{o.status} · {formatEUR(Number(o.total))}</span>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="files" className="mt-4">
          <p className="text-xs text-muted-foreground">Datei-Anhänge: in Vorbereitung.</p>
        </TabsContent>
      </Tabs>

      <Dialog open={pendingStage === 'won'} onOpenChange={o => !o && setPendingStage(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Deal als Won markieren</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Bei Bestätigung wird ein Vorgang in der Masterliste angelegt.</p>
            <div className="space-y-1.5">
              <Label className="text-xs">Finales Auftragsvolumen (EUR) *</Label>
              <Input type="number" value={wonValue} onChange={e => setWonValue(e.target.value)} className="h-8 text-xs" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingStage(null)} size="sm" className="h-8 text-xs">Abbrechen</Button>
            <Button onClick={confirmWon} disabled={saving} size="sm" className="h-8 text-xs">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Won bestätigen'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={pendingStage === 'lost'} onOpenChange={o => !o && setPendingStage(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Deal als Lost markieren</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Verlustgrund *</Label>
              <Select value={lostReason} onValueChange={setLostReason}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Auswählen…" /></SelectTrigger>
                <SelectContent>{reasons.map(r => <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Details *</Label>
              <Textarea value={lostDetails} onChange={e => setLostDetails(e.target.value)} className="text-xs min-h-[80px]" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingStage(null)} size="sm" className="h-8 text-xs">Abbrechen</Button>
            <Button onClick={confirmLost} disabled={saving} size="sm" className="h-8 text-xs">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Lost bestätigen'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </CrmLayout>
  );
}

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
