import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { CrmLayout } from '@/components/CrmLayout';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, Loader2, Sparkles } from 'lucide-react';
import { formatEUR } from '@/lib/crm';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { ProjectProtectionTab } from '@/components/crm/ProjectProtectionTab';
import { LookalikeDialog } from '@/components/crm/LookalikeDialog';
import { DocumentSection } from '@/components/documents/DocumentSection';

export default function CrmCompanyDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [company, setCompany] = useState<any>(null);
  const [deals, setDeals] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [acts, setActs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lookalike, setLookalike] = useState(false);

  useEffect(() => { void load(); }, [id]);
  const load = async () => {
    if (!id) return;
    const [{ data: c }, { data: d }, { data: ct }, { data: a }] = await Promise.all([
      supabase.from('companies').select('*').eq('id', id).single(),
      supabase.from('deals').select('*').eq('company_id', id).order('created_at', { ascending: false }),
      supabase.from('contacts').select('*').eq('company_id', id).order('last_name'),
      supabase.from('crm_activities').select('*').eq('company_id', id).order('created_at', { ascending: false }).limit(20),
    ]);
    setCompany(c); setDeals(d ?? []); setContacts(ct ?? []); setActs(a ?? []);
    setLoading(false);
  };

  if (loading) return <CrmLayout><div className="flex justify-center py-20"><Loader2 className="h-5 w-5 animate-spin" /></div></CrmLayout>;
  if (!company) return <CrmLayout><p className="text-sm text-muted-foreground">Nicht gefunden.</p></CrmLayout>;

  return (
    <CrmLayout>
      <button onClick={() => navigate('/crm/companies')} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-3">
        <ArrowLeft className="h-3.5 w-3.5" /> Zurück
      </button>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-foreground">{company.name}</h1>
          <p className="text-xs text-muted-foreground capitalize">{company.type} · {company.country ?? '–'}</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setLookalike(true)} className="h-8 text-xs gap-1.5"><Sparkles className="h-3.5 w-3.5" />Ähnliche finden</Button>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Übersicht</TabsTrigger>
          <TabsTrigger value="protection">Projektschutz</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="mt-4">
          <div className="grid lg:grid-cols-3 gap-4">
            <Section title="Deal-History">
              {deals.length === 0 ? <Empty /> : (
                <ul className="space-y-1">
                  {deals.map(d => (
                    <li key={d.id} className="flex items-center justify-between text-xs py-1.5 border-b border-border/50 last:border-0">
                      <Link to={`/crm/deals/${d.id}`} className="text-foreground hover:text-primary truncate">{d.title}</Link>
                      <span className="text-muted-foreground tabular-nums">{formatEUR(d.value_final ?? d.value_estimated)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
            <Section title="Kontakte">
              {contacts.length === 0 ? <Empty /> : (
                <ul className="space-y-1">
                  {contacts.map(c => (
                    <li key={c.id} className="text-xs py-1.5 border-b border-border/50 last:border-0">
                      <p className="text-foreground">{c.first_name} {c.last_name}</p>
                      <p className="text-[11px] text-muted-foreground">{c.email ?? c.position ?? '–'}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
            <Section title="Aktivitäten">
              {acts.length === 0 ? <Empty /> : (
                <ul className="space-y-1">
                  {acts.map(a => (
                    <li key={a.id} className="text-xs py-1.5 border-b border-border/50 last:border-0">
                      <p className="text-foreground">{a.subject}</p>
                      <p className="text-[11px] text-muted-foreground">{new Date(a.created_at).toLocaleDateString('de-DE')}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>
          <div className="mt-4">
            <DocumentSection entityType="company" entityId={company.id} />
          </div>
        </TabsContent>
        <TabsContent value="protection" className="mt-4 max-w-3xl">
          <ProjectProtectionTab companyId={company.id} />
        </TabsContent>
      </Tabs>

      <LookalikeDialog company={company} open={lookalike} onClose={() => setLookalike(false)} />
    </CrmLayout>
  );
}

const Section = ({ title, children }: any) => (
  <section className="rounded-lg border border-border bg-card/40 backdrop-blur-xl p-4">
    <h2 className="text-sm font-semibold text-foreground mb-3">{title}</h2>
    {children}
  </section>
);
const Empty = () => <p className="text-xs text-muted-foreground">Keine Einträge.</p>;
