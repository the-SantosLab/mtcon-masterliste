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

    const missing = unread.map(r => r.case_id).filter(id => !caseMap[id]);
    if (missing.length) {
      const { data: cs } = await supabase
        .from('cases')
        .select('id, case_no, project_name')
        .in('id', missing);
      const next = { ...caseMap };
      ((cs as CaseInfo[]) || []).forEach(c => { next[c.id] = c; });
      setCaseMap(next);
    }
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
            return (
              <Link
                key={r.case_id}
                to={`/cases/${r.case_id}?tab=chat`}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 transition-colors"
              >
                <span className="relative shrink-0 h-7 w-7 rounded-md bg-primary/10 flex items-center justify-center">
                  <MessageSquare className="h-3.5 w-3.5 text-primary" />
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-0.5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center tabular-nums leading-none">
                    {r.unread_count > 9 ? '9+' : r.unread_count}
                  </span>
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground truncate">{c?.project_name ?? 'Vorgang'}</p>
                  <p className="text-[11px] text-muted-foreground font-mono truncate">{c?.case_no ?? r.case_id.slice(0, 8)}</p>
                </div>
                {r.last_message_at && (
                  <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                    {formatRelativeTime(r.last_message_at)}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
