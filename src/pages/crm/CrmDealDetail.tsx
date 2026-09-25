import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { DealTimeline } from '@/components/crm/DealTimeline';
import { NextActivityDialog } from '@/components/crm/NextActivityDialog';
import { CrmLayout } from '@/components/CrmLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { STAGES, StageKey, stageColor, formatEUR } from '@/lib/crm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TemplateAssignment } from '@/components/erp/TemplateAssignment';
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
  const [protections, setProtections] = useState<any[]>([]);
  const [protectionAck, setProtectionAck] = useState<boolean>(false);
  const [wikiOpen, setWikiOpen] = useState(false);
  const [wikiQuery, setWikiQuery] = useState('');
  const [wikiResults, setWikiResults] = useState<any[]>([]);
  const [pendingStage, setPendingStage] = useState<StageKey | null>(null);
  const [wonValue, setWonValue] = useState('');
  const [lostReason, setLostReason] = useState('');
  const [lostDetails, setLostDetails] = useState('');
  const [poSuggestions, setPoSuggestions] = useState<any[] | null>(null);
  const [poSelection, setPoSelection] = useState<Record<string, boolean>>({});
  const [creatingPo, setCreatingPo] = useState<string | null>(null);
  const [createdCaseId, setCreatedCaseId] = useState<string | null>(null);

  const [searchParams, setSearchParams] = useSearchParams();
  const [planOpen, setPlanOpen] = useState(false);
  const [actForm, setActForm] = useState<any>({ type: 'note', subject: '', body: '', due_at: '', done: true, done_at: '' });
  const [actSaving, setActSaving] = useState(false);

  const addActivity = async () => {
    if (!deal || !actForm.subject.trim()) { toast.error('Titel erforderlich'); return; }
    setActSaving(true);
    const doneAt = actForm.done ? (actForm.done_at ? new Date(actForm.done_at).toISOString() : new Date().toISOString()) : null;
    const { error } = await supabase.from('crm_activities').insert({
      type: actForm.type, subject: actForm.subject.trim(), body: actForm.body || null,
      due_at: actForm.due_at ? new Date(actForm.due_at).toISOString() : null,
      completed_at: doneAt, completed_by: doneAt ? user?.id : null,
      deal_id: deal.id, company_id: deal.company_id, owner_id: user?.id, auto_generated: false,
    });
    setActSaving(false);
    if (error) { toast.error(error.message); return; }
    setActForm({ type: 'note', subject: '', body: '', due_at: '', done: true, done_at: '' });
    toast.success('Aktivität angelegt');
    void load();
  };
  useEffect(() => { void load(); }, [id]);
  useEffect(() => {
    const st = searchParams.get('stage');
    if (deal && (st === 'won' || st === 'lost') && deal.stage !== st) {
      setSearchParams({}, { replace: true });
      requestStageChange(st as StageKey);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deal, searchParams]);

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
    if (d?.company_id) {
      const { data: prot } = await supabase.from('project_protection').select('*').eq('company_id', d.company_id).eq('status', 'aktiv');
      setProtections(prot ?? []);
    } else { setProtections([]); }
    setLoading(false);
  };

  const searchWiki = async (q: string) => {
    setWikiQuery(q);
    if (!q.trim()) { setWikiResults([]); return; }
    const { data } = await supabase.from('wiki_articles').select('id, title, body, tags')
      .or(`title.ilike.%${q}%,body.ilike.%${q}%`).limit(10);
    setWikiResults(data ?? []);
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
    try { await supabase.functions.invoke('notify-vorgang-created', { body: { caseId: caseRow.id, actorId: user?.id } }); } catch {}
    const { error } = await supabase.from('deals').update({
      stage: 'won', value_final: Number(wonValue), won_case_id: caseRow.id,
    }).eq('id', deal.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Deal als Won markiert · Vorgang in Masterliste angelegt');
    setPendingStage(null);
    setCreatedCaseId(caseRow.id);
    // Fetch PO suggestions
    const { data: sugg, error: sErr } = await supabase.rpc('suggest_po_from_deal' as any, { _deal_id: deal.id });
    if (sErr) { console.warn('suggest_po_from_deal failed', sErr); }
    if (sugg && (sugg as any[]).length > 0) {
      setPoSuggestions(sugg as any[]);
      const pre: Record<string, boolean> = {};
      (sugg as any[]).forEach((r: any) => { pre[r.art_nr] = true; });
      setPoSelection(pre);
    } else {
      toast.message('Keine Bestellvorschläge: Bestand reicht aus oder Artikel nicht zugeordnet.');
    }
    void load();
  };

  const createPoForSupplier = async (lief_nr: string, supplier_name: string, items: any[]) => {
    setCreatingPo(lief_nr);
    const payload = items.map(i => ({
      art_nr: i.art_nr,
      description: i.description,
      qty: i.qty_to_order,
      unit_price: i.unit_price,
    }));
    const { data, error } = await supabase.rpc('create_po_from_suggestions' as any, {
      _supplier_lief_nr: lief_nr,
      _supplier_name: supplier_name,
      _items: payload,
    });
    setCreatingPo(null);
    if (error) { toast.error(error.message); return; }
    toast.success(`Bestellung angelegt für ${supplier_name || lief_nr}`);
    setPoSuggestions(prev => (prev ?? []).filter(r => r.lief_nr !== lief_nr));
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

      {protections.length > 0 && !protectionAck && (
        <div className="mb-5 p-3 rounded border border-amber-500/40 bg-amber-500/10 text-amber-100">
          <p className="text-xs font-semibold mb-1">⚠ Projektschutz aktiv</p>
          {protections.map(p => (
            <p key={p.id} className="text-[11px] text-amber-100/90">
              Distributor: <strong>{p.distributor_name}</strong> · Scope: {p.scope_type}{p.scope_detail ? ` (${p.scope_detail})` : ''}{p.valid_until ? ` · gültig bis ${new Date(p.valid_until).toLocaleDateString('de-DE')}` : ''}
            </p>
          ))}
          <button onClick={() => setProtectionAck(true)} className="mt-2 text-[11px] underline hover:no-underline">Schutz zur Kenntnis genommen</button>
        </div>
      )}

      <div className="mb-3 flex justify-end">
        <button onClick={() => { setWikiOpen(true); setWikiQuery(''); setWikiResults([]); }} className="text-[11px] text-muted-foreground hover:text-foreground underline">Wiki durchsuchen</button>
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

      {['anfrage','qualifikation','angebot_versendet','verhandlung'].includes(deal.stage) && !activities.some(a => !a.completed_at) && (
        <div className="mb-4 p-3 rounded border border-destructive/40 bg-destructive/10 flex items-center justify-between gap-3">
          <p className="text-xs text-foreground">Für diesen Deal ist keine nächste Aktivität geplant.</p>
          <Button size="sm" className="h-7 text-xs" onClick={() => setPlanOpen(true)}>Nächste Aktivität planen</Button>
        </div>
      )}
      <NextActivityDialog open={planOpen} onOpenChange={setPlanOpen} deal={deal} onSaved={() => void load()} />

      <Tabs defaultValue="timeline">
        <TabsList>
          <TabsTrigger value="timeline">Historie</TabsTrigger>
          <TabsTrigger value="overview">Übersicht</TabsTrigger>
          <TabsTrigger value="activities">Aktivitäten</TabsTrigger>
          <TabsTrigger value="offers">Angebote</TabsTrigger>
          <TabsTrigger value="files">Dateien</TabsTrigger>
          <TabsTrigger value="templates">PDF-Vorlagen</TabsTrigger>
        </TabsList>

        <TabsContent value="timeline" className="mt-4"><DealTimeline deal={deal} /></TabsContent>

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
          <div className="mb-4 p-3 rounded border border-border bg-card/40 max-w-3xl space-y-2">
            <p className="text-[11px] uppercase text-muted-foreground">Aktivität erfassen</p>
            <div className="grid md:grid-cols-3 gap-2">
              <Select value={actForm.type} onValueChange={v => setActForm({ ...actForm, type: v })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="note">Notiz</SelectItem>
                  <SelectItem value="call">Anruf</SelectItem>
                  <SelectItem value="email">E-Mail</SelectItem>
                  <SelectItem value="meeting">Meeting</SelectItem>
                  <SelectItem value="task">Task</SelectItem>
                  <SelectItem value="followup">Follow-up</SelectItem>
                </SelectContent>
              </Select>
              <Input placeholder="Titel *" value={actForm.subject} onChange={e => setActForm({ ...actForm, subject: e.target.value })} className="h-8 text-xs md:col-span-2" />
            </div>
            <Textarea placeholder="Notiz / Gesprächsprotokoll …" value={actForm.body} onChange={e => setActForm({ ...actForm, body: e.target.value })} className="text-xs min-h-[60px]" />
            <div className="flex items-end gap-3 flex-wrap">
              <label className="flex items-center gap-2 text-xs cursor-pointer pb-1.5">
                <input type="checkbox" checked={!!actForm.done} onChange={e => setActForm({ ...actForm, done: e.target.checked })} className="accent-primary" />
                Bereits erledigt
              </label>
              {actForm.done ? (
                <div className="space-y-1"><Label className="text-[11px]">Erledigt am</Label>
                  <Input type="datetime-local" value={actForm.done_at} onChange={e => setActForm({ ...actForm, done_at: e.target.value })} className="h-8 text-xs" /></div>
              ) : (
                <div className="space-y-1"><Label className="text-[11px]">Fällig am</Label>
                  <Input type="datetime-local" value={actForm.due_at} onChange={e => setActForm({ ...actForm, due_at: e.target.value })} className="h-8 text-xs" /></div>
              )}
              <Button size="sm" onClick={addActivity} disabled={actSaving} className="h-8 text-xs gap-1.5 ml-auto">
                {actSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Anlegen
              </Button>
            </div>
          </div>
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

        <TabsContent value="templates" className="mt-4 max-w-3xl">
          <TemplateAssignment scope="deal" scopeId={deal.id} title="PDF-Vorlagen dieses Deals" />
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

      <Dialog open={wikiOpen} onOpenChange={setWikiOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Wissensdatenbank durchsuchen</DialogTitle></DialogHeader>
          <Input autoFocus value={wikiQuery} onChange={e => searchWiki(e.target.value)} placeholder="Suchbegriff…" className="h-8 text-xs" />
          <div className="space-y-2 max-h-[50vh] overflow-y-auto">
            {wikiResults.length === 0 && wikiQuery && <p className="text-xs text-muted-foreground">Keine Treffer.</p>}
            {wikiResults.map(r => (
              <a key={r.id} href={`/crm/wiki?article=${r.id}`} target="_blank" rel="noreferrer" className="block p-3 rounded border border-border bg-card/40 hover:bg-card transition-colors">
                <p className="text-xs font-semibold text-foreground">{r.title}</p>
                <p className="text-[11px] text-muted-foreground line-clamp-2 mt-1">{r.body}</p>
              </a>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!poSuggestions && poSuggestions.length > 0} onOpenChange={o => !o && setPoSuggestions(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Bestellvorschläge aus Deal</DialogTitle>
          </DialogHeader>
          <p className="text-[11px] text-muted-foreground">
            Basierend auf den Positionen des Deals und dem aktuellen Bestand. Auswahl je Lieferant separat bestellbar.
          </p>
          <div className="space-y-4 max-h-[55vh] overflow-y-auto mt-2">
            {Object.entries(
              (poSuggestions ?? []).reduce<Record<string, any[]>>((acc, r) => {
                const key = r.lief_nr || '__none__';
                (acc[key] ||= []).push(r);
                return acc;
              }, {})
            ).map(([lief_nr, items]) => {
              const supplierName = items[0].supplier_name ?? lief_nr;
              const selectedItems = items.filter(i => poSelection[i.art_nr]);
              const total = selectedItems.reduce((s, i) => s + Number(i.qty_to_order) * Number(i.unit_price ?? 0), 0);
              const hasSupplier = lief_nr !== '__none__';
              return (
                <div key={lief_nr} className="rounded border border-border bg-card/40 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-foreground">
                      {hasSupplier ? `${supplierName} · ${lief_nr}` : 'Ohne Stammlieferant'}
                    </p>
                    <span className="text-[11px] text-muted-foreground tabular-nums">{formatEUR(total)}</span>
                  </div>
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="text-muted-foreground text-left">
                        <th className="w-6"></th>
                        <th>Art-Nr</th>
                        <th>Bezeichnung</th>
                        <th className="text-right">Bedarf</th>
                        <th className="text-right">Bestand</th>
                        <th className="text-right">Bestellen</th>
                        <th className="text-right">Preis</th>
                        <th className="text-right">LZ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map(i => (
                        <tr key={i.art_nr} className="border-t border-border/40">
                          <td>
                            <input
                              type="checkbox"
                              checked={!!poSelection[i.art_nr]}
                              onChange={e => setPoSelection(prev => ({ ...prev, [i.art_nr]: e.target.checked }))}
                            />
                          </td>
                          <td className="font-mono text-foreground">{i.art_nr}</td>
                          <td className="text-foreground/90 truncate max-w-[200px]">{i.description}</td>
                          <td className="text-right tabular-nums">{Number(i.qty_needed).toLocaleString('de-DE')}</td>
                          <td className="text-right tabular-nums">{Number(i.on_hand).toLocaleString('de-DE')}</td>
                          <td className="text-right tabular-nums font-semibold text-amber-300">{Number(i.qty_to_order).toLocaleString('de-DE')}</td>
                          <td className="text-right tabular-nums">{i.unit_price ? formatEUR(Number(i.unit_price)) : '–'}</td>
                          <td className="text-right tabular-nums">{i.lieferzeit ?? '–'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="flex justify-end mt-2">
                    <Button
                      size="sm"
                      className="h-7 text-[11px]"
                      disabled={!hasSupplier || selectedItems.length === 0 || creatingPo === lief_nr}
                      onClick={() => createPoForSupplier(lief_nr, supplierName, selectedItems)}
                    >
                      {creatingPo === lief_nr ? <Loader2 className="h-3 w-3 animate-spin" /> : `Bestellung anlegen (${selectedItems.length})`}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
          <DialogFooter>
            {createdCaseId && (
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => navigate(`/cases/${createdCaseId}`)}>
                Vorgang öffnen
              </Button>
            )}
            <Button size="sm" className="h-8 text-xs" onClick={() => setPoSuggestions(null)}>Schließen</Button>
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
