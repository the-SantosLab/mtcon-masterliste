import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { formatEUR } from '@/lib/crm';
import { leadKeyFacts } from '@/lib/leadKeyFacts';
import { Loader2 } from 'lucide-react';

/** Kennzahlen eines Leads: Firma über Umwandlung, sonst über gleichen Firmennamen. */
export function LeadKeyFacts({ lead }: { lead: { id: string; company_name: string | null; converted_company_id: string | null; score: number | null } }) {
  const { data, isLoading } = useQuery({
    queryKey: ['lead-key-facts', lead.id, lead.converted_company_id],
    queryFn: async () => {
      const s = supabase as any;
      let companyId = lead.converted_company_id;
      if (!companyId && lead.company_name) {
        const { data: c } = await s.from('companies').select('id').ilike('name', lead.company_name.trim()).limit(1);
        companyId = c?.[0]?.id ?? null;
      }
      if (!companyId) return { companyId: null, facts: leadKeyFacts([], [], []) };
      const [o, d, p] = await Promise.all([
        s.from('orders').select('status, total_amount, subtotal_amount, order_date, created_at').eq('company_id', companyId).limit(2000),
        s.from('deals').select('*').eq('company_id', companyId).limit(1000),
        s.from('crm_stage_probabilities').select('stage, probability'),
      ]);
      return { companyId, facts: leadKeyFacts(o.data ?? [], d.data ?? [], p.data ?? []) };
    },
  });
  const f = data?.facts;
  const tiles = [
    { label: 'Gesamtbestellvolumen', value: f ? formatEUR(f.orderVolume) : '–', detail: f ? `${f.orderCount} Aufträge` : '' },
    { label: 'Prognostizierter Forecast', value: f ? formatEUR(f.forecast) : '–', detail: 'gewichtet nach Wahrscheinlichkeit' },
    { label: 'Offene Pipeline', value: f ? formatEUR(f.pipeline) : '–', detail: f ? `${f.openDeals} offene Chancen` : '' },
    { label: 'Abschlussquote', value: f?.winRate == null ? '–' : `${f.winRate} %`, detail: 'gewonnen / abgeschlossen' },
    { label: 'Letzter Auftrag', value: f?.lastOrder ? new Date(f.lastOrder).toLocaleDateString('de-DE') : '–', detail: '' },
    { label: 'Lead-Score', value: lead.score != null ? String(lead.score) : '–', detail: '' },
  ];
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-medium text-muted-foreground">Key Facts</p>
      {isLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {tiles.map((t) => (
            <div key={t.label} className="rounded-md border border-border p-2">
              <p className="text-[10px] text-muted-foreground">{t.label}</p>
              <p className="text-sm font-semibold tabular-nums">{t.value}</p>
              {t.detail && <p className="text-[10px] text-muted-foreground">{t.detail}</p>}
            </div>
          ))}
        </div>
      )}
      {data && !data.companyId && <p className="text-[10px] text-muted-foreground">Noch keine Kundenfirma verknüpft – Werte erscheinen nach Umwandlung oder bei gleichem Firmennamen.</p>}
    </div>
  );
}
