import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CrmLayout } from '@/components/CrmLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Loader2, Pause, Play } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export default function CrmOutbound() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [seqs, setSeqs] = useState<any[]>([]);
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');

  useEffect(() => { void load(); }, []);
  const load = async () => {
    setLoading(true);
    const [{ data: s }, { data: e }] = await Promise.all([
      supabase.from('sequences').select('*, sequence_steps(count), sequence_enrollments(count)').order('created_at', { ascending: false }),
      supabase.from('sequence_enrollments').select('id, status, sequence_id'),
    ]);
    setSeqs(s ?? []);
    setEnrollments(e ?? []);
    setLoading(false);
  };

  const create = async () => {
    if (!name.trim()) return;
    const { data, error } = await supabase.from('sequences').insert({ name: name.trim(), created_by: user?.id }).select('id').single();
    if (error) { toast.error(error.message); return; }
    setOpen(false); setName('');
    navigate(`/crm/outbound/sequences/${data.id}`);
  };

  const toggleStatus = async (s: any) => {
    const next = s.status === 'aktiv' ? 'pausiert' : 'aktiv';
    const { error } = await supabase.from('sequences').update({ status: next }).eq('id', s.id);
    if (error) { toast.error(error.message); return; }
    void load();
  };

  return (
    <CrmLayout>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Outbound</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Sequenzen, Kampagnen und eingeschriebene Kontakte</p>
        </div>
        <div className="flex gap-2">
          <Link to="/crm/outbound/enrollments" className="text-xs text-muted-foreground hover:text-foreground underline self-center">Enrollments</Link>
          <Button size="sm" onClick={() => setOpen(true)} className="h-8 text-xs gap-1.5"><Plus className="h-3.5 w-3.5" />Neue Sequenz</Button>
        </div>
      </div>

      <Tabs defaultValue={searchParams.get('tab') === 'campaigns' ? 'campaigns' : searchParams.get('tab') === 'contacts' ? 'contacts' : 'sequences'}>
        <TabsList>
          <TabsTrigger value="sequences">Sequenzen</TabsTrigger>
          <TabsTrigger value="campaigns">Kampagnen</TabsTrigger>
          <TabsTrigger value="contacts">Kontakte</TabsTrigger>
        </TabsList>

        <TabsContent value="sequences" className="mt-4">
          {loading ? <div className="flex justify-center py-10"><Loader2 className="h-4 w-4 animate-spin" /></div>
          : seqs.length === 0 ? <p className="text-xs text-muted-foreground">Noch keine Sequenzen.</p>
          : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {seqs.map(s => {
                const stepCount = s.sequence_steps?.[0]?.count ?? 0;
                const enrolls = enrollments.filter(e => e.sequence_id === s.id);
                const active = enrolls.filter(e => e.status === 'aktiv').length;
                return (
                  <div key={s.id} className="p-4 rounded-lg border border-border bg-card/40 backdrop-blur-xl">
                    <div className="flex items-start justify-between mb-2">
                      <Link to={`/crm/outbound/sequences/${s.id}`} className="text-sm font-semibold text-foreground hover:text-primary truncate">{s.name}</Link>
                      <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-semibold', s.status === 'aktiv' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-muted text-muted-foreground')}>
                        {s.status === 'aktiv' ? 'Aktiv' : 'Pausiert'}
                      </span>
                    </div>
                    {s.description && <p className="text-[11px] text-muted-foreground mb-3 line-clamp-2">{s.description}</p>}
                    <div className="grid grid-cols-3 gap-2 text-[11px]">
                      <Stat label="Schritte" value={stepCount} />
                      <Stat label="Aktiv" value={active} />
                      <Stat label="Total" value={enrolls.length} />
                    </div>
                    <Button size="sm" variant="outline" onClick={() => toggleStatus(s)} className="w-full h-7 text-[11px] mt-3 gap-1.5">
                      {s.status === 'aktiv' ? <><Pause className="h-3 w-3" />Pausieren</> : <><Play className="h-3 w-3" />Aktivieren</>}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>
        <TabsContent value="campaigns" className="mt-4">
          {seqs.length === 0 ? <p className="text-xs text-muted-foreground">Keine Kampagnen — lege zuerst eine Sequenz an.</p>
          : (
            <div className="rounded-lg border border-border bg-card/40 backdrop-blur-xl overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted/30 text-[10px] uppercase text-muted-foreground tracking-wider">
                  <tr>
                    <th className="text-left p-2">Kampagne (Sequenz)</th>
                    <th className="text-right p-2">Eingeschrieben</th>
                    <th className="text-right p-2">Aktiv</th>
                    <th className="text-right p-2">Abgeschlossen</th>
                    <th className="text-right p-2">Antwortrate</th>
                  </tr>
                </thead>
                <tbody>
                  {seqs.map(s => {
                    const en = enrollments.filter(e => e.sequence_id === s.id);
                    const active = en.filter(e => e.status === 'aktiv').length;
                    const done = en.filter(e => e.status === 'abgeschlossen').length;
                    const replies = en.filter(e => e.status === 'geantwortet').length;
                    const rate = en.length ? Math.round((replies / en.length) * 100) : 0;
                    return (
                      <tr key={s.id} className="border-t border-border/40">
                        <td className="p-2"><Link to={`/crm/outbound/sequences/${s.id}`} className="text-foreground hover:text-primary">{s.name}</Link></td>
                        <td className="p-2 text-right tabular-nums text-foreground">{en.length}</td>
                        <td className="p-2 text-right tabular-nums text-emerald-400">{active}</td>
                        <td className="p-2 text-right tabular-nums text-muted-foreground">{done}</td>
                        <td className="p-2 text-right tabular-nums text-blue-400">{rate}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
        <TabsContent value="contacts" className="mt-4">
          <Link to="/crm/outbound/enrollments" className="text-xs text-primary hover:underline">Zur Enrollment-Übersicht →</Link>
        </TabsContent>
      </Tabs>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Neue Sequenz</DialogTitle></DialogHeader>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="Name" className="h-8 text-xs" />
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setOpen(false)} className="h-8 text-xs">Abbrechen</Button>
            <Button size="sm" onClick={create} className="h-8 text-xs">Anlegen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </CrmLayout>
  );
}

const Stat = ({ label, value }: { label: string; value: number }) => (
  <div className="text-center p-1.5 rounded bg-muted/30">
    <p className="text-foreground font-semibold tabular-nums">{value}</p>
    <p className="text-[10px] text-muted-foreground">{label}</p>
  </div>
);
