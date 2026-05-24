import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { MessageSquare, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatRelativeTime } from '@/lib/case-utils';

interface UnreadRow {
  case_id: string;
  unread_count: number;
  last_message_at: string | null;
}

interface CaseInfo {
  id: string;
  case_no: string;
  project_name: string;
}

interface Props {
  caseIds: string[];
}

/**
 * Shows cases with unread chat messages the current user can access.
 * Click navigates directly into the case's chat tab.
 */
export function ChatUnreadWidget({ caseIds }: Props) {
  const { user } = useAuth();
  const [rows, setRows] = useState<UnreadRow[]>([]);
  const [caseMap, setCaseMap] = useState<Record<string, CaseInfo>>({});
  const [previewMap, setPreviewMap] = useState<Record<string, { body: string; author: string }>>({});
  const idsKey = useMemo(() => caseIds.slice().sort().join(','), [caseIds]);

  const fetchUnread = useCallback(async () => {
    if (!user?.id || caseIds.length === 0) {
      setRows([]);
      return;
    }
    const { data, error } = await (supabase as any).rpc('get_case_chat_unread', { p_case_ids: caseIds });
    if (error) {
      console.warn('chat-unread', error);
      return;
    }
    const unread = ((data as UnreadRow[]) || []).filter(r => r.unread_count > 0);
    unread.sort((a, b) => (b.last_message_at || '').localeCompare(a.last_message_at || ''));
    setRows(unread);

    const unreadIds = unread.map(r => r.case_id);
    if (!unreadIds.length) { setPreviewMap({}); return; }

    const missing = unreadIds.filter(id => !caseMap[id]);
    if (missing.length) {
      const { data: cs } = await supabase
        .from('cases')
        .select('id, case_no, project_name')
        .in('id', missing);
      const next = { ...caseMap };
      ((cs as CaseInfo[]) || []).forEach(c => { next[c.id] = c; });
      setCaseMap(next);
    }

    // Fetch latest non-system message preview per case
    const { data: msgs } = await supabase
      .from('case_chat_messages')
      .select('case_id, body, created_at, author_id')
      .in('case_id', unreadIds)
      .is('deleted_at', null)
      .is('system_kind', null)
      .order('created_at', { ascending: false })
      .limit(200);

    const previews: Record<string, { body: string; author_id: string }> = {};
    ((msgs as any[]) || []).forEach(m => {
      if (!previews[m.case_id]) previews[m.case_id] = { body: m.body, author_id: m.author_id };
    });

    const authorIds = Array.from(new Set(Object.values(previews).map(p => p.author_id).filter(Boolean)));
    const authors: Record<string, string> = {};
    if (authorIds.length) {
      const { data: ps } = await supabase
        .from('users_profile')
        .select('id, display_name, short_code')
        .in('id', authorIds);
      ((ps as any[]) || []).forEach(p => { authors[p.id] = p.short_code || p.display_name || ''; });
    }
    const out: Record<string, { body: string; author: string }> = {};
    Object.entries(previews).forEach(([cid, p]) => {
      out[cid] = { body: p.body || '(Anhang)', author: authors[p.author_id] || '' };
    });
    setPreviewMap(out);
  }, [user?.id, idsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchUnread(); }, [fetchUnread]);

  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase.channel(`dash-chat-unread-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'case_chat_messages' }, () => fetchUnread())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'case_chat_reads', filter: `user_id=eq.${user.id}` }, () => fetchUnread())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id, fetchUnread]);

  const total = rows.reduce((s, r) => s + r.unread_count, 0);

  return (
    <div className="glass-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-medium text-foreground">Neue Vorgang-Chats</h2>
          {total > 0 && (
            <span className="text-[10px] bg-destructive/15 text-destructive px-1.5 py-0.5 rounded-full font-medium tabular-nums">
              {total} ungelesen
            </span>
          )}
        </div>
        <Link to="/cases?filter=mine">
          <Button variant="ghost" size="sm" className="text-xs text-muted-foreground h-7">
            Alle Vorgänge <ArrowRight className="h-3 w-3 ml-1" />
          </Button>
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="p-4 text-xs text-muted-foreground">Keine ungelesenen Chat-Nachrichten</p>
      ) : (
        <div className="divide-y divide-border max-h-[320px] overflow-auto">
          {rows.slice(0, 12).map(r => {
            const c = caseMap[r.case_id];
            const preview = previewMap[r.case_id];
            return (
              <Link
                key={r.case_id}
                to={`/cases/${r.case_id}`}
                className="flex items-start gap-3 px-4 py-2.5 hover:bg-muted/50 transition-colors"
              >
                <span className="relative shrink-0 h-7 w-7 rounded-md bg-primary/10 flex items-center justify-center mt-0.5">
                  <MessageSquare className="h-3.5 w-3.5 text-primary" />
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-0.5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center tabular-nums leading-none">
                    {r.unread_count > 9 ? '9+' : r.unread_count}
                  </span>
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-sm text-foreground truncate">{c?.project_name ?? 'Vorgang'}</p>
                    {r.last_message_at && (
                      <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                        {formatRelativeTime(r.last_message_at)}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground font-mono truncate">{c?.case_no ?? r.case_id.slice(0, 8)}</p>
                  {preview && (
                    <p className="text-[11px] text-foreground/70 mt-1 line-clamp-2 leading-snug">
                      {preview.author && <span className="font-medium text-foreground/90">{preview.author}: </span>}
                      {preview.body}
                    </p>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
