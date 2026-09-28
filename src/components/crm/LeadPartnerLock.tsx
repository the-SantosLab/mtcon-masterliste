import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllCompanies } from '@/lib/crmData';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Lock } from 'lucide-react';
import { toast } from 'sonner';

export function LeadPartnerLock({ lead, onSaved }: { lead: any; onSaved?: () => void }) {
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [partner, setPartner] = useState<string>(lead.partner_company_id ?? '__none__');
  const [project, setProject] = useState<string>(lead.protected_project ?? '');
  const [until, setUntil] = useState<string>(lead.protected_until ?? '');

  useEffect(() => { void fetchAllCompanies().then(c => setCompanies(c ?? [])); }, []);
  useEffect(() => { setPartner(lead.partner_company_id ?? '__none__'); setProject(lead.protected_project ?? ''); setUntil(lead.protected_until ?? ''); }, [lead.id]);

  const save = async () => {
    const pid = partner === '__none__' ? null : partner;
    if (pid && !project.trim()) return toast.error('Projekt für die Sperre angeben');
    const { error } = await supabase.from('leads').update({ partner_company_id: pid, protected_project: pid ? project.trim() : null, protected_until: pid && until ? until : null }).eq('id', lead.id);
    if (error) return toast.error(error.message);
    toast.success(pid ? 'Interessent für Vertriebspartner gesperrt' : 'Sperre aufgehoben'); onSaved?.();
  };

  const active = lead.partner_company_id && (!lead.protected_until || new Date(lead.protected_until) >= new Date(new Date().toDateString()));

  return (
    <div className="rounded border border-border bg-card/40 p-3 space-y-2">
      <p className="text-[11px] uppercase text-muted-foreground flex items-center gap-1"><Lock className="h-3 w-3" />Vertriebspartner & Projektsperre</p>
      {active && <p className="text-[11px] text-primary">Aktuell gesperrt für {companies.find(c => c.id === lead.partner_company_id)?.name ?? 'Partner'} – Projekt „{lead.protected_project}"{lead.protected_until ? ` bis ${new Date(lead.protected_until).toLocaleDateString('de-DE')}` : ''}</p>}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <div className="space-y-1"><Label className="text-xs">Vertriebspartner</Label>
          <Select value={partner} onValueChange={setPartner}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-72"><SelectItem value="__none__">— keiner —</SelectItem>{companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1"><Label className="text-xs">Projekt (Sperre gilt nur hierfür)</Label><Input value={project} onChange={e => setProject(e.target.value)} className="h-8 text-xs" /></div>
        <div className="space-y-1"><Label className="text-xs">Gesperrt bis</Label><Input type="date" value={until} onChange={e => setUntil(e.target.value)} className="h-8 text-xs" /></div>
      </div>
      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={save}>Speichern</Button>
    </div>
  );
}
