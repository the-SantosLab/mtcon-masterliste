import { useEffect, useMemo, useState } from 'react';
import { CrmLayout } from '@/components/CrmLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { STAGES, StageKey, stageColor, formatEUR, daysSince } from '@/lib/crm';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Plus, Loader2, Check, ChevronsUpDown, AlertTriangle, CalendarClock, Flame } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fetchAllCompanies } from '@/lib/crmData';
import { toast } from 'sonner';
import { DndContext, DragEndEvent, PointerSensor, useDraggable, useDroppable, useSensor, useSensors } from '@dnd-kit/core';
import { NextActivityDialog } from '@/components/crm/NextActivityDialog';

interface Deal {
  id: string; title: string; stage: StageKey;
  value_estimated: number | null; value_final: number | null;
  stage_changed_at: string; owner_id: string | null; company_id: string | null;
  sop: string | null; delivery_address: string | null; quantity: number | null;
  companies?: { name: string } | null;
}
type NextAct = { due_at: string | null; subject: string };

const OPEN_STAGES: StageKey[] = ['anfrage', 'qualifikation', 'angebot_versendet', 'verhandlung'];

function DroppableColumn({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return <div ref={setNodeRef} className={cn('p-2 space-y-2 flex-1 overflow-y-auto rounded-b transition-colors', isOver && 'bg-primary/10')}>{children}</div>;
}

function DraggableCard({ id, children, onClick }: { id: string; children: React.ReactNode; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={onClick}
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 50 } : undefined}
      className={cn('crm-deal-card w-full text-left cursor-grab active:cursor-grabbing select-none', isDragging && 'opacity-80 shadow-xl')}
    >
      {children}
    </div>
  );
}

export default function CrmDeals() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [nextActs, setNextActs] = useState<Record<string, NextAct>>({});
  const [lastActs, setLastActs] = useState<Record<string, string>>({});
  const [rotting, setRotting] = useState<Record<string, number | null>>({});
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: '', company_id: '', value_estimated: '', notes: '' });
  const [newCompanyOpen, setNewCompanyOpen] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState('');
  const [creatingCompany, setCreatingCompany] = useState(false);
  const [planDeal, setPlanDeal] = useState<Deal | null>(null);
  const [planReason, setPlanReason] = useState<string | undefined>();
  const [onlyMine, setOnlyMine] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const createCompany = async () => {
    const name = newCompanyName.trim();
    if (!name) { toast.error('Name erforderlich'); return; }
    setCreatingCompany(true);
    const { data, error } = await supabase.from('companies').insert({ name }).select('id, name').single();
    setCreatingCompany(false);
    if (error) { toast.error(error.message); return; }
    if (data) {
      setCompanies(prev => [...prev, { id: data.id, name: data.name }].sort((a, b) => a.name.localeCompare(b.name)));
      setForm(f => ({ ...f, company_id: data.id }));
      toast.success('Unternehmen angelegt');
      setNewCompanyOpen(false);
    }
  };

  useEffect(() => { void load(); }, []);
  useEffect(() => {
    if (searchParams.get('action') === 'new') {
      setOpen(true);
      const next = new URLSearchParams(searchParams); next.delete('action'); setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const loadActivities = async () => {
    const [{ data: openActs }, { data: doneActs }] = await Promise.all([
      supabase.from('crm_activities').select('deal_id, due_at, subject').not('deal_id', 'is', null).is('completed_at', null).order('due_at', { ascending: true, nullsFirst: false }).limit(5000),
      supabase.from('crm_activities').select('deal_id, completed_at').not('deal_id', 'is', null).not('completed_at', 'is', null).order('completed_at', { ascending: false }).limit(5000),
    ]);
    const n: Record<string, NextAct> = {};
    (openActs ?? []).forEach((a: any) => { if (!n[a.deal_id]) n[a.deal_id] = { due_at: a.due_at, subject: a.subject }; });
    const l: Record<string, string> = {};
    (doneActs ?? []).forEach((a: any) => { if (!l[a.deal_id]) l[a.deal_id] = a.completed_at; });
    setNextActs(n); setLastActs(l);
  };

  const load = async () => {
    setLoading(true);
    const [{ data }, cmp, { data: st }] = await Promise.all([
      supabase.from('deals').select('*, companies(name)').order('stage_changed_at', { ascending: false }),
      fetchAllCompanies(),
      supabase.from('crm_stage_probabilities').select('stage, rotting_days'),
      loadActivities(),
    ]);
    setDeals((data ?? []) as any);
    setCompanies(cmp ?? []);
    const r: Record<string, number | null> = {};
    (st ?? []).forEach((s: any) => { r[s.stage] = s.rotting_days; });
    setRotting(r);
    setLoading(false);
  };

  const create = async () => {
    if (!form.title.trim()) { toast.error('Titel erforderlich'); return; }
    setSaving(true);
    const { data, error } = await supabase.from('deals').insert({
      title: form.title.trim(),
      company_id: form.company_id || null,
      value_estimated: form.value_estimated ? Number(form.value_estimated) : null,
      owner_id: user?.id,
      created_by: user?.id,
    }).select('*').single();
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Deal angelegt');
    setOpen(false);
    setForm({ title: '', company_id: '', value_estimated: '', notes: '' });
    await load();
    if (data) { setPlanReason('Neuer Deal – was ist der erste Schritt?'); setPlanDeal(data as any); }
  };

  const onDragEnd = async (e: DragEndEvent) => {
    const dealId = String(e.active.id);
    const target = e.over?.id as StageKey | undefined;
    const deal = deals.find(d => d.id === dealId);
    if (!deal || !target || target === deal.stage) return;
    if (target === 'won' || target === 'lost') {
      toast.info(target === 'won' ? 'Bitte den Abschluss im Deal bestätigen (Auftragsvolumen).' : 'Bitte Verlustgrund im Deal angeben.');
      navigate(`/crm/deals/${deal.id}?stage=${target}`);
      return;
    }
    if (target === 'qualifikation') {
      const missing: string[] = [];
      if (!deal.sop) missing.push('SOP');
      if (!deal.delivery_address) missing.push('Lieferadresse');
      if (!deal.quantity) missing.push('Stückzahl');
      if (missing.length) { toast.error('Pflichtfelder fehlen: ' + missing.join(', ')); return; }
    }
    const prev = deals;
    setDeals(ds => ds.map(d => d.id === dealId ? { ...d, stage: target, stage_changed_at: new Date().toISOString() } : d));
    const { error } = await supabase.from('deals').update({ stage: target }).eq('id', dealId);
    if (error) { setDeals(prev); toast.error(error.message); return; }
    toast.success(`Verschoben nach „${STAGES.find(s => s.key === target)?.label}"`);
    await loadActivities();
    // Automationen können eine Aktivität angelegt haben – danach prüfen
    const { count } = await supabase.from('crm_activities').select('id', { count: 'exact', head: true }).eq('deal_id', dealId).is('completed_at', null);
    if (!count) { setPlanReason('Stufe gewechselt – plane den nächsten Schritt.'); setPlanDeal({ ...deal, stage: target }); }
  };

  // Deep-Link-Filter, z.B. /crm/deals?stages=anfrage,verhandlung (Big-7 KPI Drill-down)
  const stageParam = searchParams.get('stages');
  const stageWhitelist = stageParam ? stageParam.split(',').map(s => s.trim()).filter(Boolean) : null;
  const visibleDeals = onlyMine ? deals.filter(d => d.owner_id === user?.id) : deals;
  const grouped = STAGES
    .filter(s => !stageWhitelist || stageWhitelist.includes(s.key))
    .map(s => {
      const list = visibleDeals.filter(d => d.stage === s.key);
      const sum = list.reduce((a, d) => a + Number((s.key === 'won' ? d.value_final : d.value_estimated) ?? 0), 0);
      return { ...s, deals: list, sum };
    });

  const isRotten = (d: Deal) => {
    const limit = rotting[d.stage];
    if (!limit || !OPEN_STAGES.includes(d.stage)) return false;
    const lastTouch = [d.stage_changed_at, lastActs[d.id]].filter(Boolean).sort().pop();
    return daysSince(lastTouch) > limit;
  };

  const stats = useMemo(() => {
    const openDeals = visibleDeals.filter(d => OPEN_STAGES.includes(d.stage));
    return {
      open: openDeals.length,
      withoutNext: openDeals.filter(d => !nextActs[d.id]).length,
      rotten: openDeals.filter(isRotten).length,
      overdue: openDeals.filter(d => nextActs[d.id]?.due_at && new Date(nextActs[d.id].due_at!) < new Date()).length,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleDeals, nextActs, lastActs, rotting]);

  return (
    <CrmLayout>
      <div className="crm-surface">
        <div className="crm-hero mb-4 flex flex-wrap gap-3 items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Deal-Pipeline</h1>
            <p className="text-xs text-muted-foreground mt-1">Deals per Ziehen zwischen Stufen verschieben. Jeder offene Deal braucht eine nächste Aktivität.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant={onlyMine ? 'default' : 'outline'} size="sm" className="h-8 text-xs" onClick={() => setOnlyMine(v => !v)}>
              Nur meine
            </Button>
            <Button onClick={() => setOpen(true)} size="sm" className="h-8 text-xs gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Neuer Deal
            </Button>
          </div>
        </div>

        {!loading && (
          <div className="mb-4 grid grid-cols-2 md:grid-cols-4 gap-2">
            {[
              { label: 'Offene Deals', v: stats.open, tone: '' },
              { label: 'Ohne nächste Aktivität', v: stats.withoutNext, tone: stats.withoutNext ? 'text-destructive' : '' },
              { label: 'Aktivität überfällig', v: stats.overdue, tone: stats.overdue ? 'text-destructive' : '' },
              { label: 'Verrottet (zu lange ohne Kontakt)', v: stats.rotten, tone: stats.rotten ? 'text-destructive' : '' },
            ].map(k => (
              <div key={k.label} className="crm-column px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{k.label}</p>
                <p className={cn('text-lg font-semibold tabular-nums', k.tone)}>{k.v}</p>
              </div>
            ))}
          </div>
        )}

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {grouped.map(col => (
            <div key={col.key} className="crm-column flex flex-col min-h-[420px]">
              <div className="px-3 py-2.5 border-b border-border/40">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ background: stageColor(col.key), boxShadow: `0 0 8px ${stageColor(col.key)}` }} />
                    <p className="text-[11px] font-semibold text-foreground uppercase tracking-wide">{col.label}</p>
                  </div>
                  <span className="text-[10px] text-muted-foreground tabular-nums px-1.5 py-0.5 rounded bg-muted/50">{col.deals.length}</span>
                </div>
                <p className="text-[11px] text-muted-foreground tabular-nums mt-1">{formatEUR(col.sum)}</p>
              </div>
              <DroppableColumn id={col.key}>
                {col.deals.map(d => {
                  const next = nextActs[d.id];
                  const isOpen = OPEN_STAGES.includes(d.stage);
                  const overdue = next?.due_at && new Date(next.due_at) < new Date();
                  const rotten = isRotten(d);
                  return (
                    <DraggableCard key={d.id} id={d.id} onClick={() => navigate(`/crm/deals/${d.id}`)}>
                      <div className={cn(rotten && 'border-l-2 border-destructive pl-2 -ml-1')}>
                        <p className="text-xs font-semibold text-foreground line-clamp-2 mb-1">{d.title}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{d.companies?.name ?? '–'}</p>
                        <div className="mt-1.5 flex items-center justify-between">
                          <span className="text-[11px] tabular-nums text-foreground font-medium">
                            {formatEUR(d.stage === 'won' ? d.value_final : d.value_estimated)}
                          </span>
                          <span className={cn('text-[10px] tabular-nums flex items-center gap-0.5', rotten ? 'text-destructive font-semibold' : 'text-muted-foreground')}>
                            {rotten && <Flame className="h-3 w-3" />}{daysSince(d.stage_changed_at)} T
                          </span>
                        </div>
                        {isOpen && (
                          next ? (
                            <p className={cn('mt-1.5 text-[10px] flex items-center gap-1 truncate', overdue ? 'text-destructive' : 'text-muted-foreground')}>
                              <CalendarClock className="h-3 w-3 shrink-0" />
                              <span className="truncate">{next.due_at ? new Date(next.due_at).toLocaleDateString('de-DE') : 'ohne Datum'} · {next.subject}</span>
                            </p>
                          ) : (
                            <button
                              onPointerDown={e => e.stopPropagation()}
                              onClick={e => { e.stopPropagation(); setPlanReason(undefined); setPlanDeal(d); }}
                              className="mt-1.5 text-[10px] flex items-center gap-1 text-destructive hover:underline"
                            >
                              <AlertTriangle className="h-3 w-3" /> Keine nächste Aktivität – planen
                            </button>
                          )
                        )}
                      </div>
                    </DraggableCard>
                  );
                })}
                {col.deals.length === 0 && <p className="text-[11px] text-muted-foreground/70 text-center py-4 italic">leer</p>}
              </DroppableColumn>
            </div>
          ))}
        </div>
        </DndContext>
      )}
      </div>

      <NextActivityDialog
        open={!!planDeal}
        onOpenChange={o => { if (!o) setPlanDeal(null); }}
        deal={planDeal}
        reason={planReason}
        onSaved={() => void loadActivities()}
      />



      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full sm:max-w-md">
          <SheetHeader><SheetTitle>Neuer Deal</SheetTitle></SheetHeader>
          <div className="space-y-3 mt-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Titel *</Label>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className="h-8 text-xs" />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Unternehmen</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[11px]"
                  onClick={() => { setNewCompanyName(''); setNewCompanyOpen(true); }}
                >
                  <Plus className="h-3 w-3 mr-1" /> Neues Unternehmen
                </Button>
              </div>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" className="w-full h-8 text-xs justify-between font-normal">
                    <span className="truncate">
                      {form.company_id ? companies.find(c => c.id === form.company_id)?.name ?? 'Auswählen…' : 'Auswählen…'}
                    </span>
                    <ChevronsUpDown className="h-3.5 w-3.5 opacity-50 shrink-0 ml-2" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command filter={(value, search) => value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0}>
                    <CommandInput placeholder="Suchen…" className="h-8 text-xs" />
                    <CommandList>
                      <CommandEmpty>
                        <div className="p-2 space-y-2">
                          <p className="text-xs text-muted-foreground">Keine Unternehmen gefunden.</p>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="w-full h-7 text-xs"
                            onClick={() => { setNewCompanyName(''); setNewCompanyOpen(true); }}
                          >
                            <Plus className="h-3 w-3 mr-1" /> Neues Unternehmen anlegen
                          </Button>
                        </div>
                      </CommandEmpty>
                      <CommandGroup>
                        <CommandItem value="__none__" onSelect={() => setForm(f => ({ ...f, company_id: '' }))} className="text-xs">
                          <Check className={cn('mr-2 h-3.5 w-3.5', !form.company_id ? 'opacity-100' : 'opacity-0')} />
                          — kein Unternehmen —
                        </CommandItem>
                        {companies.map(c => (
                          <CommandItem key={c.id} value={c.name} onSelect={() => setForm(f => ({ ...f, company_id: c.id }))} className="text-xs">
                            <Check className={cn('mr-2 h-3.5 w-3.5', form.company_id === c.id ? 'opacity-100' : 'opacity-0')} />
                            {c.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Geschätzter Wert (EUR)</Label>
              <Input type="number" value={form.value_estimated} onChange={e => setForm(f => ({ ...f, value_estimated: e.target.value }))} className="h-8 text-xs" />
            </div>
            <Button onClick={create} disabled={saving} className="w-full h-8 text-xs">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Deal anlegen'}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={newCompanyOpen} onOpenChange={setNewCompanyOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle className="text-sm">Neues Unternehmen</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Name *</Label>
              <Input
                value={newCompanyName}
                onChange={e => setNewCompanyName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void createCompany(); } }}
                autoFocus
                placeholder="z. B. SantosLab"
                className="h-8 text-xs"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setNewCompanyOpen(false)}>Abbrechen</Button>
              <Button size="sm" className="h-8 text-xs" onClick={createCompany} disabled={creatingCompany}>
                {creatingCompany ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Anlegen'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </CrmLayout>
  );
}
