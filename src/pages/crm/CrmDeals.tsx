import { useEffect, useState } from 'react';
import { CrmLayout } from '@/components/CrmLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { STAGES, StageKey, stageColor, formatEUR, daysSince } from '@/lib/crm';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Plus, Loader2, Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface Deal {
  id: string; title: string; stage: StageKey;
  value_estimated: number | null; value_final: number | null;
  stage_changed_at: string; owner_id: string | null; company_id: string | null;
  companies?: { name: string } | null;
  users_profile?: { display_name: string; short_code: string } | null;
}

export default function CrmDeals() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: '', company_id: '', value_estimated: '', notes: '' });
  const [newCompanyOpen, setNewCompanyOpen] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState('');
  const [creatingCompany, setCreatingCompany] = useState(false);

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

  const load = async () => {
    setLoading(true);
    const [{ data }, { data: cmp }] = await Promise.all([
      supabase.from('deals').select('*, companies(name)').order('stage_changed_at', { ascending: false }),
      supabase.from('companies').select('id, name').order('name').limit(5000),
    ]);
    setDeals((data ?? []) as any);
    setCompanies(cmp ?? []);
    setLoading(false);
  };

  const create = async () => {
    if (!form.title.trim()) { toast.error('Titel erforderlich'); return; }
    setSaving(true);
    const { error } = await supabase.from('deals').insert({
      title: form.title.trim(),
      company_id: form.company_id || null,
      value_estimated: form.value_estimated ? Number(form.value_estimated) : null,
      owner_id: user?.id,
      created_by: user?.id,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Deal angelegt');
    setOpen(false);
    setForm({ title: '', company_id: '', value_estimated: '', notes: '' });
    void load();
  };

  const grouped = STAGES.map(s => ({ ...s, deals: deals.filter(d => d.stage === s.key) }));

  return (
    <CrmLayout>
      <div className="crm-surface">
        <div className="crm-hero mb-5 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Deal-Pipeline</h1>
            <p className="text-xs text-muted-foreground mt-1">Stages, Werte und Aging — drag-free Übersicht.</p>
          </div>
          <Button onClick={() => setOpen(true)} size="sm" className="h-8 text-xs gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Neuer Deal
          </Button>
        </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {grouped.map(col => (
            <div key={col.key} className="crm-column flex flex-col min-h-[320px]">
              <div className="px-3 py-2.5 border-b border-border/40 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: stageColor(col.key), boxShadow: `0 0 8px ${stageColor(col.key)}` }} />
                  <p className="text-[11px] font-semibold text-foreground uppercase tracking-wide">{col.label}</p>
                </div>
                <span className="text-[10px] text-muted-foreground tabular-nums px-1.5 py-0.5 rounded bg-muted/50">{col.deals.length}</span>
              </div>
              <div className="p-2 space-y-2 flex-1 overflow-y-auto">
                {col.deals.map(d => (
                  <button
                    key={d.id}
                    onClick={() => navigate(`/crm/deals/${d.id}`)}
                    className="crm-deal-card w-full text-left"
                  >
                    <p className="text-xs font-semibold text-foreground line-clamp-2 mb-1">{d.title}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{d.companies?.name ?? '–'}</p>
                    <div className="mt-1.5 flex items-center justify-between">
                      <span className="text-[11px] tabular-nums text-foreground font-medium">
                        {formatEUR(d.stage === 'won' ? d.value_final : d.value_estimated)}
                      </span>
                      <span className="text-[10px] text-muted-foreground tabular-nums">{daysSince(d.stage_changed_at)} T</span>
                    </div>
                  </button>
                ))}
                {col.deals.length === 0 && <p className="text-[11px] text-muted-foreground/70 text-center py-4 italic">leer</p>}
              </div>
            </div>
          ))}
        </div>
      )}
      </div>


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
                  <Command>
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
