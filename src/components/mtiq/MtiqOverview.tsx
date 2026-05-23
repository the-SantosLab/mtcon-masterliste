import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Plus, Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useMtiqUnread } from './useMtiqUnread';
import { MtiqChat } from './MtiqChat';
import { MtiqQuickActions } from './MtiqQuickActions';
import { MtiqAction } from './MtiqActionsGrid';

interface CaseRow {
  id: string;
  case_no: string | null;
  project_name: string | null;
  status: string | null;
  department_id: string | null;
  department_name?: string | null;
  last_message?: string | null;
  last_at?: string | null;
  mine?: boolean;
}

const statusDot: Record<string, string> = {
  open: '#3b82f6', in_progress: '#f59e0b', ready_for_review: '#a78bfa',
  blocked: '#ef4444', done: '#10b981', archived: '#6b7280',
};

export function MtiqOverview({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { perCase } = useMtiqUnread();
  const [rows, setRows] = useState<CaseRow[]>([]);
  const [search, setSearch] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [seedPrompt, setSeedPrompt] = useState<string | undefined>();

  useEffect(() => {
    (async () => {
      if (!user?.id) return;
      // Load recent cases the user can see, plus last AI message per case
      const { data: cases, error } = await supabase
        .from('cases')
        .select('id, case_no, project_name, status, department_id, assignee_id, created_by, created_at, departments:department_id(name)')
        .eq('deleted', false)
        .order('created_at', { ascending: false })
        .limit(120);
      if (error) console.error('[MTIQ] cases load failed', error);

      const list: CaseRow[] = (cases ?? []).map((c: any) => ({
        id: c.id, case_no: c.case_no, project_name: c.project_name,
        status: c.status, department_id: c.department_id,
        department_name: c.departments?.name ?? null,
        mine: c.assignee_id === user.id || c.created_by === user.id,
      }));

      const ids = list.map(c => c.id);
      if (ids.length > 0) {
        const { data: msgs } = await supabase
          .from('ai_messages')
          .select('vorgang_id, content, created_at, role')
          .eq('user_id', user.id)
          .in('vorgang_id', ids)
          .order('created_at', { ascending: false });
        const lastByCase = new Map<string, any>();
        (msgs ?? []).forEach((m: any) => { if (!lastByCase.has(m.vorgang_id)) lastByCase.set(m.vorgang_id, m); });
        list.forEach(c => {
          const m = lastByCase.get(c.id);
          if (m) { c.last_message = m.content; c.last_at = m.created_at; }
        });
      }
      // Sort: unread first, then own cases, then messages by recency
      list.sort((a, b) => {
        const ua = perCase[a.id] ?? 0, ub = perCase[b.id] ?? 0;
        if (ua !== ub) return ub - ua;
        if (!!a.mine !== !!b.mine) return a.mine ? -1 : 1;
        if (a.last_at && b.last_at) return b.last_at.localeCompare(a.last_at);
        if (a.last_at) return -1;
        if (b.last_at) return 1;
        return 0;
      });
      setRows(list);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r =>
      (r.project_name ?? '').toLowerCase().includes(q) ||
      (r.case_no ?? '').toLowerCase().includes(q) ||
      (r.department_name ?? '').toLowerCase().includes(q)
    );
  }, [rows, search]);

  if (activeId) {
    const active = rows.find(r => r.id === activeId);
    const initials = (active?.department_name ?? '??').slice(0, 2).toUpperCase();
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2 px-3 py-2.5" style={{ borderBottom: '1px solid #222' }}>
          <button onClick={() => setActiveId(null)} className="hover:opacity-70" style={{ color: '#e0e0e0' }}>
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div
            className="relative flex items-center justify-center text-[10px] font-medium text-white"
            style={{ width: 28, height: 28, borderRadius: 9, background: '#1e293b' }}
          >
            {initials}
            <span className="absolute -bottom-0.5 -right-0.5 rounded-full" style={{ width: 8, height: 8, background: statusDot[active?.status ?? ''] ?? '#666', border: '2px solid #111' }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[12px] font-medium truncate" style={{ color: '#e0e0e0' }}>
              {active?.project_name || 'Vorgang'}
            </div>
            <div className="text-[10px] font-mono truncate" style={{ color: '#666' }}>{active?.case_no}</div>
          </div>
          <button
            onClick={() => { navigate(`/cases/${activeId}`); onClose(); }}
            className="text-[11px] px-2 py-1 rounded"
            style={{ background: '#181818', border: '1px solid #222', color: '#e0e0e0' }}
          >Öffnen</button>
        </div>
        <MtiqChat vorgangId={activeId} seedPrompt={seedPrompt} onSeedConsumed={() => setSeedPrompt(undefined)} />
        <MtiqQuickActions onPick={(a: MtiqAction) => setSeedPrompt(a.prompt)} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 pt-2.5 pb-2" style={{ borderBottom: '1px solid #222' }}>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: '#666' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Vorgang suchen…"
            className="w-full pl-8 pr-3 py-1.5 text-[12px] outline-none"
            style={{ background: '#0f0f0f', border: '1px solid #222', borderRadius: 10, color: '#e0e0e0' }}
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 && (
          <div className="text-center text-[12px] p-6" style={{ color: '#666' }}>Keine Vorgänge gefunden.</div>
        )}
        {filtered.map(c => {
          const initials = (c.department_name ?? '??').slice(0, 2).toUpperCase();
          const unread = perCase[c.id] ?? 0;
          return (
            <button
              key={c.id}
              onClick={() => setActiveId(c.id)}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors"
              style={{ borderBottom: '1px solid #1a1a1a' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#1a1a1a')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <div
                className="relative shrink-0 flex items-center justify-center text-[10px] font-medium text-white"
                style={{ width: 36, height: 36, borderRadius: 11, background: '#1e293b' }}
              >
                {initials}
                <span className="absolute -bottom-0.5 -right-0.5 rounded-full" style={{ width: 10, height: 10, background: statusDot[c.status ?? ''] ?? '#666', border: '2px solid #111' }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <div className={`text-[13px] truncate ${unread > 0 ? 'font-semibold' : 'font-normal'}`} style={{ color: '#e0e0e0' }}>
                    {c.project_name || '—'}
                  </div>
                  <div className="text-[10px] font-mono shrink-0" style={{ color: '#666' }}>
                    {c.last_at ? new Date(c.last_at).toLocaleDateString('de-DE') : ''}
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[11px] truncate" style={{ color: '#666' }}>
                    {c.last_message || c.department_name || '—'}
                  </div>
                  {unread > 0 && (
                    <span className="shrink-0 text-white text-[10px] font-mono font-semibold flex items-center justify-center" style={{ minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9, background: '#0ea5e9' }}>
                      {unread}
                    </span>
                  )}
                </div>
                <div className="text-[10px] font-mono mt-0.5" style={{ color: '#444' }}>{c.case_no}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
