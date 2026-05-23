import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Megaphone, Pin, AlertTriangle, Info, Check, Archive, X, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface Announcement {
  id: string;
  title: string;
  body: string;
  severity: 'info' | 'wichtig' | 'kritisch';
  pinned: boolean;
  published_at: string;
  expires_at: string | null;
  archived_at: string | null;
  created_at: string;
}

interface Receipt {
  announcement_id: string;
  delivered_at: string | null;
  seen_at: string | null;
  read_at: string | null;
}

const severityStyle: Record<Announcement['severity'], { icon: typeof Info; cls: string; label: string }> = {
  info: { icon: Info, cls: 'border-blue-500/40 bg-blue-500/5', label: 'Info' },
  wichtig: { icon: Megaphone, cls: 'border-amber-500/50 bg-amber-500/5', label: 'Wichtig' },
  kritisch: { icon: AlertTriangle, cls: 'border-red-500/60 bg-red-500/10', label: 'Kritisch' },
};

function formatDateTime(s: string) {
  return new Date(s).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function AnnouncementsWidget() {
  const { user } = useAuth();
  const [items, setItems] = useState<Announcement[]>([]);
  const [receipts, setReceipts] = useState<Record<string, Receipt>>({});
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archive, setArchive] = useState<Announcement[]>([]);
  const seenObserver = useRef<IntersectionObserver | null>(null);

  const upsertReceipt = async (announcement_id: string, patch: Partial<Receipt>) => {
    if (!user) return;
    const current = receipts[announcement_id];
    // skip if already set
    if (patch.delivered_at && current?.delivered_at) delete patch.delivered_at;
    if (patch.seen_at && current?.seen_at) delete patch.seen_at;
    if (patch.read_at && current?.read_at) delete patch.read_at;
    if (Object.keys(patch).length === 0) return;
    const row = {
      announcement_id,
      user_id: user.id,
      delivered_at: current?.delivered_at ?? null,
      seen_at: current?.seen_at ?? null,
      read_at: current?.read_at ?? null,
      ...patch,
    };
    setReceipts(prev => ({ ...prev, [announcement_id]: row }));
    await (supabase as any)
      .from('announcement_receipts')
      .upsert(row, { onConflict: 'announcement_id,user_id' });
  };

  const fetchActive = async () => {
    const { data } = await (supabase as any)
      .from('announcements')
      .select('*')
      .is('archived_at', null)
      .lte('published_at', new Date().toISOString())
      .order('pinned', { ascending: false })
      .order('published_at', { ascending: false });
    const list = ((data || []) as Announcement[]).filter(a => !a.expires_at || new Date(a.expires_at) > new Date());
    setItems(list);
    if (user && list.length > 0) {
      const { data: r } = await (supabase as any)
        .from('announcement_receipts')
        .select('announcement_id, delivered_at, seen_at, read_at')
        .eq('user_id', user.id)
        .in('announcement_id', list.map(a => a.id));
      const map: Record<string, Receipt> = {};
      (r || []).forEach((x: any) => { map[x.announcement_id] = x; });
      setReceipts(map);
      // mark delivered for any not yet delivered
      const now = new Date().toISOString();
      for (const a of list) {
        if (!map[a.id]?.delivered_at) {
          await upsertReceipt(a.id, { delivered_at: now });
        }
      }
    }
  };

  const fetchArchive = async () => {
    const { data } = await (supabase as any)
      .from('announcements')
      .select('*')
      .not('archived_at', 'is', null)
      .order('archived_at', { ascending: false })
      .limit(50);
    setArchive((data || []) as Announcement[]);
  };

  useEffect(() => {
    fetchActive();
    const ch = supabase
      .channel('announcements-widget')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, () => fetchActive())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // IntersectionObserver for seen_at
  useEffect(() => {
    seenObserver.current = new IntersectionObserver((entries) => {
      const now = new Date().toISOString();
      entries.forEach(e => {
        if (e.isIntersecting) {
          const id = (e.target as HTMLElement).dataset.aid;
          if (id && !receipts[id]?.seen_at) {
            upsertReceipt(id, { seen_at: now });
          }
        }
      });
    }, { threshold: 0.5 });
    return () => { seenObserver.current?.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipts]);

  const setRef = (el: HTMLDivElement | null) => {
    if (el && seenObserver.current) seenObserver.current.observe(el);
  };

  if (items.length === 0) return null;

  return (
    <>
      <div className="glass-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/50">
          <div className="flex items-center gap-2">
            <Megaphone className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-medium text-foreground">Mitteilungen vom MCS</h2>
            <span className="text-[10px] text-muted-foreground">Mastercontrolsystem – zentrales Steuerungssystem</span>
            <span className="text-[11px] text-muted-foreground tabular-nums">{items.length}</span>
          </div>
          <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={() => { setArchiveOpen(true); fetchArchive(); }}>
            <Archive className="h-3 w-3 mr-1" /> Archiv
          </Button>
        </div>
        <div className="divide-y divide-border">
          {items.map(a => {
            const s = severityStyle[a.severity];
            const Icon = s.icon;
            const r = receipts[a.id];
            const isRead = !!r?.read_at;
            return (
              <div
                key={a.id}
                ref={setRef}
                data-aid={a.id}
                className={cn('px-4 py-3 border-l-2', s.cls, isRead && 'opacity-70')}
              >
                <div className="flex items-start gap-3">
                  <Icon className="h-4 w-4 mt-0.5 shrink-0 text-foreground/70" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {a.pinned && <Pin className="h-3 w-3 text-primary fill-primary/30" />}
                      <span className="text-sm font-medium text-foreground">{a.title}</span>
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{s.label}</span>
                      <span className="text-[10px] text-muted-foreground tabular-nums ml-auto">{formatDateTime(a.published_at)}</span>
                    </div>
                    {a.body && (
                      <p className="text-xs text-foreground/80 whitespace-pre-wrap mt-1 leading-relaxed">{a.body}</p>
                    )}
                    <div className="mt-2 flex items-center gap-2">
                      {isRead ? (
                        <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
                          <Check className="h-3 w-3" /> Gelesen {r?.read_at && `· ${formatDateTime(r.read_at)}`}
                        </span>
                      ) : (
                        <Button size="sm" variant="ghost" className="h-6 text-[11px]" onClick={() => upsertReceipt(a.id, { read_at: new Date().toISOString() })}>
                          <Check className="h-3 w-3 mr-1" /> Gelesen
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Dialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-sm font-medium">Archivierte Mitteilungen</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto divide-y divide-border -mx-6">
            {archive.length === 0 ? (
              <p className="px-6 py-4 text-xs text-muted-foreground">Keine archivierten Mitteilungen</p>
            ) : archive.map(a => {
              const s = severityStyle[a.severity];
              const Icon = s.icon;
              return (
                <div key={a.id} className="px-6 py-3">
                  <div className="flex items-start gap-2">
                    <Icon className="h-3.5 w-3.5 mt-0.5 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-foreground">{a.title}</span>
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{s.label}</span>
                        <span className="text-[10px] text-muted-foreground tabular-nums ml-auto">
                          Veröffentlicht: {formatDateTime(a.published_at)}
                          {a.archived_at && ` · Archiviert: ${formatDateTime(a.archived_at)}`}
                        </span>
                      </div>
                      {a.body && <p className="text-xs text-foreground/80 whitespace-pre-wrap mt-1 leading-relaxed">{a.body}</p>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
