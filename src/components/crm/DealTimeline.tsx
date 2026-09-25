import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Mail, Phone, CalendarDays, CheckSquare, StickyNote, FileText, Eye, MousePointerClick, Flag } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Kind = 'activity' | 'email' | 'offer' | 'milestone';
interface Entry { id: string; at: string; kind: Kind; icon: any; title: string; detail?: string; meta?: string }

const ACT_ICON: Record<string, any> = { call: Phone, meeting: CalendarDays, email: Mail, note: StickyNote, task: CheckSquare };
const ACT_LABEL: Record<string, string> = { call: 'Anruf', meeting: 'Termin', email: 'E-Mail', note: 'Notiz', task: 'Aufgabe' };
const OFFER_EVT: Record<string, string> = { viewed: 'Angebot angesehen', accepted: 'Angebot angenommen', rejected: 'Angebot abgelehnt', sent: 'Angebot versendet', commented: 'Kommentar zum Angebot' };

const FILTERS: { key: Kind | 'all'; label: string }[] = [
  { key: 'all', label: 'Alle' }, { key: 'activity', label: 'Aktivitäten' }, { key: 'email', label: 'E-Mails' },
  { key: 'offer', label: 'Angebote' }, { key: 'milestone', label: 'Meilensteine' },
];

export function DealTimeline({ deal }: { deal: any }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Kind | 'all'>('all');

  useEffect(() => {
    if (!deal?.id) return;
    let alive = true;
    (async () => {
      setLoading(true);
      const [acts, offers] = await Promise.all([
        supabase.from('crm_activities').select('*').eq('deal_id', deal.id),
        supabase.from('offers').select('id, offer_no, status, created_at, sent_at').eq('deal_id', deal.id),
      ]);
      const actList = (acts.data ?? []) as any[];
      const offerList = (offers.data ?? []) as any[];
      const actIds = actList.map(a => a.id);
      const offerIds = offerList.map(o => o.id);
      const [track, evts] = await Promise.all([
        actIds.length ? supabase.from('crm_email_tracking').select('*').in('activity_id', actIds) : Promise.resolve({ data: [] as any[] }),
        offerIds.length ? supabase.from('offer_events').select('*').in('offer_id', offerIds) : Promise.resolve({ data: [] as any[] }),
      ]);
      const out: Entry[] = [];
      for (const a of actList) {
        const done = a.completed_at ? ' · erledigt' : a.due_at ? ` · fällig ${new Date(a.due_at).toLocaleDateString('de-DE')}` : '';
        out.push({ id: 'a' + a.id, at: a.completed_at ?? a.created_at, kind: a.type === 'email' ? 'email' : 'activity', icon: ACT_ICON[a.type] ?? CheckSquare, title: `${ACT_LABEL[a.type] ?? a.type}: ${a.subject ?? ''}`, detail: a.body ?? undefined, meta: (a.auto_generated ? 'automatisch' : '') + done });
      }
      for (const t of (track.data ?? []) as any[]) {
        if (t.sent_at) out.push({ id: 's' + t.id, at: t.sent_at, kind: 'email', icon: Mail, title: `E-Mail gesendet: ${t.subject ?? ''}`, meta: t.to_email });
        if (t.opened_at) out.push({ id: 'o' + t.id, at: t.opened_at, kind: 'email', icon: Eye, title: `E-Mail geöffnet: ${t.subject ?? ''}`, meta: t.to_email });
        if (t.clicked_at) out.push({ id: 'c' + t.id, at: t.clicked_at, kind: 'email', icon: MousePointerClick, title: `Link geklickt: ${t.subject ?? ''}`, meta: t.to_email });
      }
      const offerNo = (id: string) => offerList.find(o => o.id === id)?.offer_no ?? '';
      for (const o of offerList) {
        out.push({ id: 'of' + o.id, at: o.created_at, kind: 'offer', icon: FileText, title: `Angebot ${o.offer_no ?? ''} erstellt`, meta: o.status });
        if (o.sent_at) out.push({ id: 'os' + o.id, at: o.sent_at, kind: 'offer', icon: FileText, title: `Angebot ${o.offer_no ?? ''} versendet` });
      }
      for (const e of (evts.data ?? []) as any[]) {
        out.push({ id: 'e' + e.id, at: e.occurred_at, kind: 'offer', icon: FileText, title: `${OFFER_EVT[e.event_type] ?? e.event_type} (${offerNo(e.offer_id)})`, detail: e.comment ?? undefined, meta: e.actor_name ?? e.actor_email ?? undefined });
      }
      out.push({ id: 'm-created', at: deal.created_at, kind: 'milestone', icon: Flag, title: 'Deal angelegt' });
      if (deal.won_at) out.push({ id: 'm-won', at: deal.won_at, kind: 'milestone', icon: Flag, title: 'Deal gewonnen' });
      if (deal.lost_at) out.push({ id: 'm-lost', at: deal.lost_at, kind: 'milestone', icon: Flag, title: 'Deal verloren', detail: deal.lost_details ?? undefined });
      else if (deal.stage_changed_at && !deal.won_at) out.push({ id: 'm-stage', at: deal.stage_changed_at, kind: 'milestone', icon: Flag, title: `Stufe gewechselt: ${deal.stage}` });
      out.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
      if (alive) { setEntries(out); setLoading(false); }
    })();
    return () => { alive = false; };
  }, [deal?.id, deal?.stage_changed_at]);

  const shown = useMemo(() => filter === 'all' ? entries : entries.filter(e => e.kind === filter), [entries, filter]);

  if (loading) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  return (
    <div className="max-w-3xl">
      <div className="flex gap-1 mb-4 flex-wrap">
        {FILTERS.map(f => (
          <Button key={f.key} size="sm" variant={filter === f.key ? 'default' : 'outline'} className="h-7 text-[11px]" onClick={() => setFilter(f.key)}>
            {f.label} ({f.key === 'all' ? entries.length : entries.filter(e => e.kind === f.key).length})
          </Button>
        ))}
      </div>
      {shown.length === 0 ? <p className="text-xs text-muted-foreground">Keine Einträge.</p> : (
        <ol className="relative border-l border-border ml-3 space-y-3">
          {shown.map(e => {
            const Icon = e.icon;
            return (
              <li key={e.id} className="ml-5">
                <span className="absolute -left-3 flex h-6 w-6 items-center justify-center rounded-full bg-card border border-border">
                  <Icon className="h-3 w-3 text-primary" />
                </span>
                <div className="p-2.5 rounded border border-border bg-card/40">
                  <div className="flex justify-between gap-3 text-xs">
                    <span className="font-medium text-foreground">{e.title}</span>
                    <span className="text-muted-foreground whitespace-nowrap">{new Date(e.at).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}</span>
                  </div>
                  {e.detail && <p className="text-[11px] text-muted-foreground mt-1 whitespace-pre-wrap">{e.detail}</p>}
                  {e.meta && <p className="text-[10px] text-muted-foreground mt-1">{e.meta}</p>}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
