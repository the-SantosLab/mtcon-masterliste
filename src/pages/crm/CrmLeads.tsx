import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CrmLayout } from '@/components/CrmLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { LeadPartnerLock } from '@/components/crm/LeadPartnerLock';
import { Plus, Loader2, Upload, ArrowRight, X, LayoutGrid, List, Flame, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { DndContext, DragEndEvent, PointerSensor, useDraggable, useDroppable, useSensor, useSensors } from '@dnd-kit/core';

const STATUS_LABEL: Record<string, string> = { neu: 'Neu', qualifiziert: 'Qualifiziert', eingeschrieben: 'Eingeschrieben', konvertiert: 'Konvertiert', abgelehnt: 'Abgelehnt' };
const STATUS_COLOR: Record<string, string> = { neu: 'bg-blue-500/15 text-blue-400', qualifiziert: 'bg-amber-500/15 text-amber-400', eingeschrieben: 'bg-purple-500/15 text-purple-400', konvertiert: 'bg-emerald-500/15 text-emerald-400', abgelehnt: 'bg-muted text-muted-foreground' };
const STATUS_DOT: Record<string, string> = { neu: '#3b82f6', qualifiziert: '#f59e0b', eingeschrieben: '#a855f7', konvertiert: '#10b981', abgelehnt: '#6b7280' };
const BOARD_STAGES = ['neu', 'qualifiziert', 'eingeschrieben', 'konvertiert', 'abgelehnt'];

function LeadDroppableColumn({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return <div ref={setNodeRef} className={cn('p-2 space-y-2 flex-1 overflow-y-auto rounded-b transition-colors', isOver && 'bg-primary/10')}>{children}</div>;
}

function LeadDraggableCard({ id, children, onClick }: { id: string; children: React.ReactNode; onClick: () => void }) {
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

export default function CrmLeads() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);
  const [filter, setFilter] = useState<{ status: string; industry: string; country: string }>({ status: 'all', industry: '', country: '' });
  const [form, setForm] = useState({ company_name: '', website: '', country: '', industry: '', contact_name: '', email: '', phone: '', notes: '' });
  const [selected, setSelected] = useState<any>(null);
  const [view, setView] = useState<'liste' | 'board'>('board');
  const [rotConfig, setRotConfig] = useState<Record<string, number>>({});
  const [lastActAt, setLastActAt] = useState<Record<string, string>>({});
  const [rotOpen, setRotOpen] = useState(false);
  const [rotForm, setRotForm] = useState<{ stage: string; days: number }[]>([]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  useEffect(() => { void load(); }, []);
  useEffect(() => {
    const action = searchParams.get('action');
    const status = searchParams.get('status');
    const requestedView = searchParams.get('view');
    if (action === 'new') setOpen(true);
    if (action === 'import') setCsvOpen(true);
    if (status && (status === 'all' || BOARD_STAGES.includes(status))) setFilter(current => ({ ...current, status }));
    if (requestedView === 'liste' || requestedView === 'board') setView(requestedView);
    if (action) { const next = new URLSearchParams(searchParams); next.delete('action'); setSearchParams(next, { replace: true }); }
  }, [searchParams, setSearchParams]);
  const load = async () => {
    setLoading(true);
    const [{ data }, cfgRes, actRes] = await Promise.all([
      supabase.from('leads').select('*').order('created_at', { ascending: false }),
      supabase.from('lead_rotting_config').select('stage,rotting_days'),
      supabase.from('crm_activities').select('lead_id,completed_at').not('lead_id', 'is', null).not('completed_at', 'is', null),
    ]);
    setRows(data ?? []);
    const cfg: Record<string, number> = {};
    (cfgRes.data ?? []).forEach((c: any) => { cfg[c.stage] = c.rotting_days; });
    setRotConfig(cfg);
    const actMap: Record<string, string> = {};
    (actRes.data ?? []).forEach((a: any) => {
      if (a.completed_at && (!actMap[a.lead_id] || a.completed_at > actMap[a.lead_id])) actMap[a.lead_id] = a.completed_at;
    });
    setLastActAt(actMap);
    setLoading(false);
  };

  const rottenDays = (r: any): number | null => {
    const limit = rotConfig[r.status];
    if (!limit) return null;
    const candidates = [r.status_changed_at, lastActAt[r.id], r.created_at].filter(Boolean);
    if (candidates.length === 0) return null;
    const ref = candidates.sort()[candidates.length - 1];
    const days = Math.floor((Date.now() - new Date(ref).getTime()) / 86_400_000);
    return days > limit ? days : null;
  };

  const openRotDialog = () => {
    setRotForm(['neu', 'qualifiziert', 'eingeschrieben'].map(s => ({ stage: s, days: rotConfig[s] ?? 14 })));
    setRotOpen(true);
  };

  const saveRotConfig = async () => {
    const { error } = await supabase.from('lead_rotting_config').upsert(
      rotForm.map(f => ({ stage: f.stage, rotting_days: f.days })),
      { onConflict: 'stage' },
    );
    if (error) { toast.error(error.message); return; }
    toast.success('Fäulnis-Grenzen gespeichert');
    setRotOpen(false);
    void load();
  };

  const filtered = useMemo(() => rows.filter(r => {
    if (filter.status !== 'all' && r.status !== filter.status) return false;
    if (filter.industry && !(r.industry ?? '').toLowerCase().includes(filter.industry.toLowerCase())) return false;
    if (filter.country && !(r.country ?? '').toLowerCase().includes(filter.country.toLowerCase())) return false;
    return true;
  }), [rows, filter]);

  const create = async () => {
    if (!form.company_name.trim()) { toast.error('Unternehmen erforderlich'); return; }
    const { error } = await supabase.from('leads').insert({ ...form, source: 'manuell' as any, created_by: user?.id });
    if (error) { toast.error(error.message); return; }
    setOpen(false);
    setForm({ company_name: '', website: '', country: '', industry: '', contact_name: '', email: '', phone: '', notes: '' });
    void load();
  };

  const convertToCompany = async (l: any) => {
    if (!confirm('Lead als Unternehmen + Kontakt anlegen?')) return;
    const { data: comp, error: ce } = await supabase.from('companies').insert({
      name: l.company_name, website: l.website, country: l.country, industry: l.industry, type: 'kunde' as any, owner_id: user?.id,
    }).select('id').single();
    if (ce) { toast.error(ce.message); return; }
    if (l.contact_name) {
      const [first, ...rest] = l.contact_name.split(' ');
      await supabase.from('contacts').insert({ company_id: comp.id, first_name: first, last_name: rest.join(' ') || '–', email: l.email, phone: l.phone });
    }
    await supabase.from('leads').update({ status: 'konvertiert', converted_company_id: comp.id }).eq('id', l.id);
    toast.success('Konvertiert');
    setSelected(null);
    void load();
  };

  const reject = async (l: any) => {
    const reason = prompt('Ablehnungsgrund:');
    if (!reason) return;
    await supabase.from('leads').update({ status: 'abgelehnt', rejection_reason: reason }).eq('id', l.id);
    setSelected(null); void load();
  };

  const onDragEnd = async (e: DragEndEvent) => {
    const leadId = String(e.active.id);
    const target = e.over?.id as string | undefined;
    const lead = rows.find(r => r.id === leadId);
    if (!lead || !target || target === lead.status) return;
    if (target === 'konvertiert') {
      toast.info('Bitte die Konvertierung im Lead bestätigen (Unternehmen + Kontakt).');
      setSelected(lead);
      return;
    }
    if (target === 'abgelehnt') {
      const reason = prompt('Ablehnungsgrund:');
      if (!reason) return;
      const prev = rows;
      setRows(rs => rs.map(r => r.id === leadId ? { ...r, status: 'abgelehnt', rejection_reason: reason } : r));
      const { error } = await supabase.from('leads').update({ status: 'abgelehnt', rejection_reason: reason }).eq('id', leadId);
      if (error) { setRows(prev); toast.error(error.message); return; }
      toast.success('Lead abgelehnt');
      return;
    }
    const prev = rows;
    setRows(rs => rs.map(r => r.id === leadId ? { ...r, status: target } : r));
    const { error } = await supabase.from('leads').update({ status: target as any }).eq('id', leadId);
    if (error) { setRows(prev); toast.error(error.message); return; }
    toast.success(`Verschoben nach „${STATUS_LABEL[target]}"`);
  };

  return (
    <CrmLayout>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Leads</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Outbound-Lead-Erfassung und Anreicherung</p>
        </div>
        <div className="flex gap-2">
          <div className="flex rounded-md border border-border overflow-hidden">
            <Button size="sm" variant={view === 'board' ? 'default' : 'ghost'} onClick={() => setView('board')} className="h-8 text-xs gap-1.5 rounded-none"><LayoutGrid className="h-3.5 w-3.5" />Board</Button>
            <Button size="sm" variant={view === 'liste' ? 'default' : 'ghost'} onClick={() => setView('liste')} className="h-8 text-xs gap-1.5 rounded-none"><List className="h-3.5 w-3.5" />Liste</Button>
          </div>
          <Button size="sm" variant="outline" onClick={openRotDialog} className="h-8 text-xs gap-1.5"><Settings2 className="h-3.5 w-3.5" />Fäulnis</Button>
          <Button size="sm" variant="outline" onClick={() => setCsvOpen(true)} className="h-8 text-xs gap-1.5"><Upload className="h-3.5 w-3.5" />CSV-Import</Button>
          <Button size="sm" onClick={() => setOpen(true)} className="h-8 text-xs gap-1.5"><Plus className="h-3.5 w-3.5" />Neuer Lead</Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        <Select value={filter.status} onValueChange={v => setFilter({ ...filter, status: v })}>
          <SelectTrigger className="h-8 text-xs w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Status</SelectItem>
            {Object.entries(STATUS_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input value={filter.industry} onChange={e => setFilter({ ...filter, industry: e.target.value })} placeholder="Branche" className="h-8 text-xs w-40" />
        <Input value={filter.country} onChange={e => setFilter({ ...filter, country: e.target.value })} placeholder="Land" className="h-8 text-xs w-40" />
      </div>

      {loading ? <div className="flex justify-center py-10"><Loader2 className="h-4 w-4 animate-spin" /></div>
      : filtered.length === 0 ? <p className="text-xs text-muted-foreground py-8 text-center">Keine Leads.</p>
      : view === 'board' ? (
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {BOARD_STAGES.map(stage => {
              const list = filtered.filter(r => r.status === stage);
              const rottenCount = list.filter(r => rottenDays(r)).length;
              return (
                <div key={stage} className="crm-column flex flex-col min-h-[420px]">
                  <div className="px-3 py-2.5 border-b border-border/40">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full" style={{ background: STATUS_DOT[stage], boxShadow: `0 0 8px ${STATUS_DOT[stage]}` }} />
                        <p className="text-[11px] font-semibold text-foreground uppercase tracking-wide">{STATUS_LABEL[stage]}</p>
                      </div>
                      <span className="flex items-center gap-1.5">
                        {rottenCount > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold tabular-nums text-destructive">
                            <Flame className="h-3 w-3" />{rottenCount}
                          </span>
                        )}
                        <span className="text-[10px] text-muted-foreground tabular-nums px-1.5 py-0.5 rounded bg-muted/50">{list.length}</span>
                      </span>
                    </div>
                  </div>
                  <LeadDroppableColumn id={stage}>
                    {list.map(r => {
                      const rot = rottenDays(r);
                      return (
                        <LeadDraggableCard key={r.id} id={r.id} onClick={() => setSelected(r)}>
                          <div className={cn(rot && 'rounded-md ring-1 ring-destructive/60 bg-destructive/5 -m-1 p-1')}>
                            <p className="text-xs font-semibold text-foreground line-clamp-2 mb-1 flex items-start gap-1">
                              <span className="flex-1">{r.company_name}</span>
                              {rot && <Flame className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />}
                            </p>
                            <p className="text-[11px] text-muted-foreground truncate">{r.contact_name ?? '–'}</p>
                            <div className="mt-1.5 flex items-center justify-between">
                              <span className="text-[10px] text-muted-foreground truncate">{[r.country, r.industry].filter(Boolean).join(' · ') || '–'}</span>
                              <span className="flex items-center gap-1 shrink-0">
                                {rot && <span className="text-[10px] font-semibold text-destructive tabular-nums">{rot} T.</span>}
                                <span className={cn(
                                  'inline-flex items-center justify-center min-w-[1.75rem] px-1.5 py-0.5 rounded text-[10px] font-semibold tabular-nums',
                                  (r.score ?? 0) >= 50 ? 'bg-emerald-500/15 text-emerald-400'
                                    : (r.score ?? 0) >= 20 ? 'bg-amber-500/15 text-amber-400'
                                    : (r.score ?? 0) > 0 ? 'bg-blue-500/15 text-blue-400'
                                    : (r.score ?? 0) < 0 ? 'bg-destructive/15 text-destructive'
                                    : 'bg-muted text-muted-foreground',
                                )}>{r.score ?? 0}</span>
                              </span>
                            </div>
                          </div>
                        </LeadDraggableCard>
                      );
                    })}
                    {list.length === 0 && <p className="text-[11px] text-muted-foreground/70 text-center py-4 italic">leer</p>}
                  </LeadDroppableColumn>
                </div>
              );
            })}
          </div>
        </DndContext>
      ) : (
        <div className="rounded-lg border border-border bg-card/40 backdrop-blur-xl overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-muted/30 text-[10px] uppercase text-muted-foreground tracking-wider">
              <tr>
                <th className="text-left p-2">Unternehmen</th>
                <th className="text-right p-2 w-16">Score</th>
                <th className="text-left p-2">Land</th>
                <th className="text-left p-2">Branche</th>
                <th className="text-left p-2">Ansprechpartner</th>
                <th className="text-left p-2">E-Mail</th>
                <th className="text-left p-2">Status</th>
                <th className="text-left p-2">Quelle</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id} onClick={() => setSelected(r)} className="border-t border-border/40 cursor-pointer hover:bg-card/40">
                  <td className="p-2 text-foreground font-medium">{r.company_name}</td>
                  <td className="p-2 text-right">
                    <span className={cn(
                      'inline-flex items-center justify-center min-w-[2rem] px-1.5 py-0.5 rounded text-[10px] font-semibold tabular-nums',
                      (r.score ?? 0) >= 50 ? 'bg-emerald-500/15 text-emerald-400'
                        : (r.score ?? 0) >= 20 ? 'bg-amber-500/15 text-amber-400'
                        : (r.score ?? 0) > 0 ? 'bg-blue-500/15 text-blue-400'
                        : (r.score ?? 0) < 0 ? 'bg-destructive/15 text-destructive'
                        : 'bg-muted text-muted-foreground',
                    )}>{r.score ?? 0}</span>
                  </td>
                  <td className="p-2 text-muted-foreground">{r.country ?? '—'}</td>
                  <td className="p-2 text-muted-foreground">{r.industry ?? '—'}</td>
                  <td className="p-2 text-muted-foreground">{r.contact_name ?? '—'}</td>
                  <td className="p-2 text-muted-foreground">{r.email ?? '—'}</td>
                  <td className="p-2">
                    <span className="inline-flex items-center gap-1.5">
                      {rottenDays(r) && <span title={`Seit ${rottenDays(r)} Tagen ohne Fortschritt`}><Flame className="h-3 w-3 text-destructive" /></span>}
                      <span className={cn('text-[10px] px-1.5 py-0.5 rounded', STATUS_COLOR[r.status])}>{STATUS_LABEL[r.status]}</span>
                    </span>
                  </td>
                  <td className="p-2 text-muted-foreground capitalize">{r.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail */}
      <Dialog open={!!selected} onOpenChange={o => !o && setSelected(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{selected?.company_name}</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-2 text-xs">
              <Detail label="Website" value={selected.website} />
              <Detail label="Land" value={selected.country} />
              <Detail label="Branche" value={selected.industry} />
              <Detail label="Ansprechpartner" value={selected.contact_name} />
              <Detail label="E-Mail" value={selected.email} />
              <Detail label="Telefon" value={selected.phone} />
              <Detail label="Quelle" value={selected.source} />
              <Detail label="Status" value={STATUS_LABEL[selected.status]} />
              {selected.notes && <Detail label="Notizen" value={selected.notes} />}
              {selected.rejection_reason && <Detail label="Ablehnungsgrund" value={selected.rejection_reason} />}
              <LeadPartnerLock lead={selected} onSaved={async () => { const { data } = await supabase.from('leads').select('*').eq('id', selected.id).single(); if (data) setSelected(data as any); void load(); }} />
            </div>
          )}
          <DialogFooter className="flex-wrap gap-2">
            {selected?.status !== 'konvertiert' && selected?.status !== 'abgelehnt' && (
              <>
                <Button size="sm" variant="outline" onClick={() => reject(selected)} className="h-8 text-xs gap-1.5"><X className="h-3.5 w-3.5" />Ablehnen</Button>
                <Button size="sm" onClick={() => convertToCompany(selected)} className="h-8 text-xs gap-1.5"><ArrowRight className="h-3.5 w-3.5" />Als Unternehmen anlegen</Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Neuer Lead</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Unternehmen *" full><Input value={form.company_name} onChange={e => setForm({ ...form, company_name: e.target.value })} className="h-8 text-xs" /></Field>
            <Field label="Website"><Input value={form.website} onChange={e => setForm({ ...form, website: e.target.value })} className="h-8 text-xs" /></Field>
            <Field label="Land"><Input value={form.country} onChange={e => setForm({ ...form, country: e.target.value })} className="h-8 text-xs" /></Field>
            <Field label="Branche"><Input value={form.industry} onChange={e => setForm({ ...form, industry: e.target.value })} className="h-8 text-xs" /></Field>
            <Field label="Ansprechpartner"><Input value={form.contact_name} onChange={e => setForm({ ...form, contact_name: e.target.value })} className="h-8 text-xs" /></Field>
            <Field label="E-Mail"><Input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="h-8 text-xs" /></Field>
            <Field label="Telefon"><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="h-8 text-xs" /></Field>
            <Field label="Notizen" full><Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="text-xs min-h-[60px]" /></Field>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setOpen(false)} className="h-8 text-xs">Abbrechen</Button>
            <Button size="sm" onClick={create} className="h-8 text-xs">Anlegen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Fäulnis-Grenzen */}
      <Dialog open={rotOpen} onOpenChange={setRotOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Fäulnis-Grenzen (Interessenten)</DialogTitle></DialogHeader>
          <p className="text-[11px] text-muted-foreground">Ein Interessent wird rot markiert, wenn er länger als die angegebenen Tage ohne Statuswechsel und ohne erledigte Aktivität in seiner Stufe bleibt.</p>
          <div className="space-y-2">
            {rotForm.map((f, i) => (
              <div key={f.stage} className="flex items-center justify-between gap-3">
                <span className="text-xs text-foreground">{STATUS_LABEL[f.stage]}</span>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    value={f.days}
                    onChange={e => setRotForm(rotForm.map((x, j) => j === i ? { ...x, days: parseInt(e.target.value) || 0 } : x))}
                    className="h-8 text-xs w-24"
                  />
                  <span className="text-[11px] text-muted-foreground">Tage</span>
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setRotOpen(false)} className="h-8 text-xs">Abbrechen</Button>
            <Button size="sm" onClick={saveRotConfig} className="h-8 text-xs">Speichern</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CsvImportDialog open={csvOpen} onClose={() => { setCsvOpen(false); void load(); }} userId={user?.id} />
    </CrmLayout>
  );
}

const Field = ({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) => (
  <div className={cn('space-y-1.5', full && 'col-span-2')}><Label className="text-[11px] text-muted-foreground">{label}</Label>{children}</div>
);
const Detail = ({ label, value }: { label: string; value: any }) => (
  <div className="flex justify-between gap-3 border-b border-border/40 py-1"><span className="text-muted-foreground">{label}</span><span className="text-foreground text-right">{value || '—'}</span></div>
);

function CsvImportDialog({ open, onClose, userId }: { open: boolean; onClose: () => void; userId?: string }) {
  const [text, setText] = useState('');
  const [rows, setRows] = useState<string[][]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const FIELDS = ['company_name','website','country','industry','contact_name','email','phone','notes'];

  const parse = (raw: string) => {
    const sep = raw.includes(';') && !raw.split('\n')[0].includes(',') ? ';' : ',';
    const lines = raw.trim().split(/\r?\n/);
    const hs = lines[0].split(sep).map(h => h.trim());
    const rs = lines.slice(1).map(l => l.split(sep).map(c => c.trim()));
    setHeaders(hs); setRows(rs);
    const auto: Record<string, string> = {};
    hs.forEach(h => { const lower = h.toLowerCase(); const m = FIELDS.find(f => lower.includes(f.replace('_',''))); if (m) auto[m] = h; });
    setMapping(auto);
  };

  const importAll = async () => {
    const inserts = rows.map(r => {
      const obj: any = { source: 'csv', created_by: userId };
      FIELDS.forEach(f => { const col = mapping[f]; if (col) { const idx = headers.indexOf(col); if (idx >= 0) obj[f] = r[idx] || null; } });
      return obj;
    }).filter(x => x.company_name);
    if (inserts.length === 0) { toast.error('Keine gültigen Zeilen (company_name fehlt)'); return; }
    const { error } = await supabase.from('leads').insert(inserts);
    if (error) { toast.error(error.message); return; }
    toast.success(`${inserts.length} Leads importiert`);
    setText(''); setRows([]); setHeaders([]); setMapping({});
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>CSV-Import</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <input type="file" accept=".csv,text/csv" onChange={async e => { const f = e.target.files?.[0]; if (f) { const t = await f.text(); setText(t); parse(t); } }} className="text-xs" />
          {headers.length > 0 && (
            <>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {FIELDS.map(f => (
                  <div key={f} className="flex items-center gap-2">
                    <span className="text-muted-foreground w-32">{f}</span>
                    <Select value={mapping[f] ?? '__none'} onValueChange={v => setMapping({ ...mapping, [f]: v === '__none' ? '' : v })}>
                      <SelectTrigger className="h-7 text-xs flex-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">—</SelectItem>
                        {headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground mb-1">Vorschau (erste 5):</p>
                <div className="rounded border border-border max-h-48 overflow-auto">
                  <table className="w-full text-[11px]">
                    <thead className="bg-muted/30"><tr>{headers.map(h => <th key={h} className="text-left p-1.5">{h}</th>)}</tr></thead>
                    <tbody>{rows.slice(0, 5).map((r, i) => <tr key={i} className="border-t border-border/40">{r.map((c, j) => <td key={j} className="p-1.5 text-muted-foreground">{c}</td>)}</tr>)}</tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} className="h-8 text-xs">Abbrechen</Button>
          <Button size="sm" onClick={importAll} disabled={rows.length === 0} className="h-8 text-xs">{rows.length} importieren</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
