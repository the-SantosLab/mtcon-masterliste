import { useEffect, useMemo, useState } from 'react';
import { CrmLayout } from '@/components/CrmLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const TYPE_COLOR: Record<string, string> = {
  task: 'bg-blue-500',
  follow_up: 'bg-amber-500',
  meeting: 'bg-emerald-500',
  call: 'bg-purple-500',
  email: 'bg-slate-500',
  note: 'bg-muted-foreground',
};
const TYPE_LABEL: Record<string, string> = { task: 'Task', follow_up: 'Follow-up', meeting: 'Meeting', call: 'Anruf', email: 'E-Mail', note: 'Notiz' };

export default function CrmCalendar() {
  const { user, role } = useAuth();
  const [acts, setActs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const [selected, setSelected] = useState<any>(null);

  const isAdmin = role === 'admin';

  useEffect(() => { void load(); }, [cursor, scope]);
  const load = async () => {
    setLoading(true);
    const start = new Date(cursor); start.setDate(1);
    const end = new Date(cursor); end.setMonth(end.getMonth() + 1); end.setDate(0);
    let q = supabase.from('crm_activities').select('*').gte('due_at', start.toISOString()).lte('due_at', end.toISOString() + 'T23:59:59').not('due_at', 'is', null);
    if (scope === 'mine' || !isAdmin) q = q.eq('owner_id', user?.id);
    const { data } = await q;
    setActs(data ?? []); setLoading(false);
  };

  const days = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    const startOffset = (first.getDay() + 6) % 7; // Monday=0
    const total = startOffset + last.getDate();
    const cells = Math.ceil(total / 7) * 7;
    const list: { date: Date | null }[] = [];
    for (let i = 0; i < cells; i++) {
      const day = i - startOffset + 1;
      list.push({ date: day >= 1 && day <= last.getDate() ? new Date(cursor.getFullYear(), cursor.getMonth(), day) : null });
    }
    return list;
  }, [cursor]);

  const actsByDay = useMemo(() => {
    const map: Record<string, any[]> = {};
    acts.forEach(a => {
      const d = new Date(a.due_at).toISOString().slice(0, 10);
      (map[d] ??= []).push(a);
    });
    return map;
  }, [acts]);

  return (
    <CrmLayout>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Kalender</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{cursor.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}</p>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <div className="flex rounded border border-border overflow-hidden text-xs">
              <button onClick={() => setScope('mine')} className={cn('px-3 py-1', scope === 'mine' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground')}>Nur meine</button>
              <button onClick={() => setScope('all')} className={cn('px-3 py-1', scope === 'all' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground')}>Alle</button>
            </div>
          )}
          <Button size="sm" variant="outline" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} className="h-8 w-8 p-0"><ChevronLeft className="h-4 w-4" /></Button>
          <Button size="sm" variant="outline" onClick={() => { const d = new Date(); d.setDate(1); setCursor(d); }} className="h-8 text-xs">Heute</Button>
          <Button size="sm" variant="outline" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} className="h-8 w-8 p-0"><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>

      <div className="flex gap-3 mb-2 text-[10px] text-muted-foreground">
        {Object.entries(TYPE_LABEL).slice(0, 4).map(([k, l]) => (
          <span key={k} className="inline-flex items-center gap-1"><span className={cn('w-2 h-2 rounded-full', TYPE_COLOR[k])} />{l}</span>
        ))}
      </div>

      {loading ? <div className="flex justify-center py-10"><Loader2 className="h-4 w-4 animate-spin" /></div>
      : (
        <div className="rounded-lg border border-border bg-card/40 backdrop-blur-xl overflow-hidden">
          <div className="grid grid-cols-7 text-[10px] uppercase text-muted-foreground tracking-wider border-b border-border">
            {['Mo','Di','Mi','Do','Fr','Sa','So'].map(d => <div key={d} className="p-2 text-center">{d}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {days.map((c, i) => {
              const today = c.date && c.date.toDateString() === new Date().toDateString();
              const key = c.date?.toISOString().slice(0, 10);
              const list = key ? (actsByDay[key] ?? []) : [];
              return (
                <div key={i} className={cn('min-h-[90px] p-1.5 border-r border-b border-border/40 text-xs', !c.date && 'bg-muted/10')}>
                  {c.date && (
                    <>
                      <div className={cn('text-[11px] mb-1', today ? 'inline-block px-1.5 rounded bg-primary text-primary-foreground font-semibold' : 'text-muted-foreground')}>{c.date.getDate()}</div>
                      <div className="space-y-0.5">
                        {list.slice(0, 3).map(a => (
                          <button key={a.id} onClick={() => setSelected(a)} className="w-full text-left text-[10px] flex items-center gap-1 hover:bg-card/40 rounded px-1 py-0.5">
                            <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', TYPE_COLOR[a.type] ?? 'bg-muted')} />
                            <span className="truncate text-foreground">{a.subject}</span>
                          </button>
                        ))}
                        {list.length > 3 && <p className="text-[10px] text-muted-foreground">+{list.length - 3} weitere</p>}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={o => !o && setSelected(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{selected?.subject}</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-2 text-xs">
              <p className="text-muted-foreground">Typ: <span className="text-foreground capitalize">{TYPE_LABEL[selected.type] ?? selected.type}</span></p>
              <p className="text-muted-foreground">Fällig: <span className="text-foreground">{new Date(selected.due_at).toLocaleString('de-DE')}</span></p>
              {selected.body && <p className="whitespace-pre-wrap text-foreground p-2 rounded bg-muted/30">{selected.body}</p>}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </CrmLayout>
  );
}
