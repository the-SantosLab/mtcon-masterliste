import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CrmLayout } from '@/components/CrmLayout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Plus, Loader2, Check, ChevronsUpDown } from 'lucide-react';
import { ErpDocPdfButton } from '@/components/ErpDocPdfButton';
import { formatEUR } from '@/lib/crm';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const STATUS_LABEL: Record<string, string> = {
  entwurf: 'Entwurf', versendet: 'Versendet', angenommen: 'Angenommen', abgelehnt: 'Abgelehnt', abgelaufen: 'Abgelaufen',
};
const STATUS_COLOR: Record<string, string> = {
  entwurf: 'hsl(var(--status-open))',
  versendet: 'hsl(var(--status-working))',
  angenommen: 'hsl(var(--status-done))',
  abgelehnt: 'hsl(var(--status-rejected))',
  abgelaufen: 'hsl(var(--status-overdue))',
};

export default function CrmOffers() {
  const nav = useNavigate();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusF, setStatusF] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [deals, setDeals] = useState<any[]>([]);
  const [dealId, setDealId] = useState('');
  const [dealPickerOpen, setDealPickerOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => { void load(); }, []);

  const load = async () => {
    setLoading(true);
    const today = new Date().toISOString().slice(0, 10);
    // mark expired
    await supabase.from('offers').update({ status: 'abgelaufen' })
      .eq('status', 'versendet').lt('valid_until', today);
    const { data } = await supabase.from('offers')
      .select('*, deals(title, owner_id, companies(name))')
      .order('created_at', { ascending: false });
    setRows(data ?? []);
    setLoading(false);
  };

  const openCreate = async () => {
    const { data } = await supabase.from('deals')
      .select('id, deal_no, title, company_id, companies(name)')
      .order('created_at', { ascending: false })
      .limit(5000);
    setDeals(data ?? []); setDealId(''); setOpen(true);
  };

  const create = async () => {
    if (!dealId) { toast.error('Deal wählen'); return; }
    setCreating(true);
    const deal = deals.find(d => d.id === dealId);
    const { data: u } = await supabase.auth.getUser();
    const { data, error } = await supabase.from('offers').insert({
      deal_id: dealId, company_id: deal?.company_id ?? null, owner_id: u.user?.id, status: 'entwurf', total: 0,
    }).select('id').single();
    setCreating(false);
    if (error) { toast.error(error.message); return; }
    setOpen(false);
    nav(`/crm/offers/${data!.id}`);
  };

  const filtered = useMemo(() => rows.filter(r => {
    if (statusF !== 'all' && r.status !== statusF) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!`${r.offer_no} ${r.deals?.title ?? ''} ${r.deals?.companies?.name ?? ''}`.toLowerCase().includes(q)) return false;
    }
    return true;
  }), [rows, statusF, search]);

  return (
    <CrmLayout>
      <div className="crm-surface">
        <div className="crm-hero mb-5 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Angebote</h1>
            <p className="text-xs text-muted-foreground mt-1">Versendete, angenommene und ablaufende Offerten.</p>
          </div>
          <Button size="sm" onClick={openCreate} className="h-8 text-xs gap-1.5"><Plus className="h-3.5 w-3.5" /> Neues Angebot</Button>
        </div>

      <div className="flex gap-2 mb-3">
        <Input placeholder="Suchen…" value={search} onChange={e => setSearch(e.target.value)} className="h-8 text-xs max-w-xs" />
        <Select value={statusF} onValueChange={setStatusF}>
          <SelectTrigger className="h-8 text-xs w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Status</SelectItem>
            {Object.entries(STATUS_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="crm-table-wrap">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="px-3 py-2.5 font-medium text-[10px] uppercase tracking-wider">Nr.</th>
              <th className="px-3 py-2.5 font-medium text-[10px] uppercase tracking-wider">Deal</th>
              <th className="px-3 py-2.5 font-medium text-[10px] uppercase tracking-wider">Unternehmen</th>
              <th className="px-3 py-2.5 font-medium text-[10px] uppercase tracking-wider text-right">Wert</th>
              <th className="px-3 py-2.5 font-medium text-[10px] uppercase tracking-wider">Status</th>
              <th className="px-3 py-2.5 font-medium text-[10px] uppercase tracking-wider">Erstellt</th>
              <th className="px-3 py-2.5 font-medium text-[10px] uppercase tracking-wider">Gültig bis</th>
              <th className="px-3 py-2.5 font-medium text-[10px] uppercase tracking-wider text-right w-16">PDF</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="py-10 text-center"><Loader2 className="h-4 w-4 animate-spin inline" /></td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} className="py-10 text-center text-muted-foreground">Keine Angebote.</td></tr>
            ) : filtered.map(r => (
              <tr key={r.id} className="border-t border-border/30 cursor-pointer" onClick={() => nav(`/crm/offers/${r.id}`)}>
                <td className="px-3 py-2.5 tabular-nums text-foreground font-medium">{r.offer_no}{r.version > 1 ? ` v${r.version}` : ''}</td>
                <td className="px-3 py-2.5 text-foreground">{r.deals?.title ?? '–'}</td>
                <td className="px-3 py-2.5 text-muted-foreground">{r.deals?.companies?.name ?? '–'}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{formatEUR(Number(r.total))}</td>
                <td className="px-3 py-2.5">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase text-white shadow-sm" style={{ background: STATUS_COLOR[r.status], boxShadow: `0 0 12px ${STATUS_COLOR[r.status]}55` }}>
                    {STATUS_LABEL[r.status]}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-muted-foreground">{new Date(r.created_at).toLocaleDateString('de-DE')}</td>
                <td className="px-3 py-2.5 text-muted-foreground">{r.valid_until ? new Date(r.valid_until).toLocaleDateString('de-DE') : '–'}</td>
                <td className="px-3 py-1 text-right" onClick={(e) => e.stopPropagation()}><ErpDocPdfButton type="angebot" id={r.id} iconOnly variant="ghost" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </div>


      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Neues Angebot</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs">Deal *</Label>
            <Select value={dealId} onValueChange={setDealId}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Deal wählen…" /></SelectTrigger>
              <SelectContent>
                {deals.map(d => <SelectItem key={d.id} value={d.id}>{d.deal_no} · {d.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setOpen(false)} className="h-8 text-xs">Abbrechen</Button>
            <Button size="sm" onClick={create} disabled={creating} className="h-8 text-xs">
              {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Anlegen'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </CrmLayout>
  );
}
