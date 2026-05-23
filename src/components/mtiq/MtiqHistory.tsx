import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface Row {
  vorgang_id: string;
  case_no: string | null;
  project_name: string | null;
  count: number;
  last_at: string;
}

export function MtiqHistory({ onNavigate }: { onNavigate: () => void }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!user?.id) return;
      setLoading(true);
      const { data } = await supabase
        .from('ai_messages')
        .select('vorgang_id, created_at, cases:vorgang_id(case_no, project_name)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(200);
      const map = new Map<string, Row>();
      (data ?? []).forEach((r: any) => {
        const ex = map.get(r.vorgang_id);
        if (ex) ex.count += 1;
        else map.set(r.vorgang_id, {
          vorgang_id: r.vorgang_id,
          case_no: r.cases?.case_no ?? null,
          project_name: r.cases?.project_name ?? null,
          count: 1,
          last_at: r.created_at,
        });
      });
      setRows(Array.from(map.values()));
      setLoading(false);
    })();
  }, [user?.id]);

  return (
    <div className="flex-1 overflow-y-auto">
      {loading && <div className="text-[12px] p-4 text-center" style={{ color: '#666' }}>Lädt…</div>}
      {!loading && rows.length === 0 && (
        <div className="text-[12px] p-6 text-center" style={{ color: '#666' }}>Noch keine Verläufe.</div>
      )}
      {rows.map(r => (
        <button
          key={r.vorgang_id}
          onClick={() => { navigate(`/cases/${r.vorgang_id}`); onNavigate(); }}
          className="w-full text-left px-3 py-2.5 transition-colors"
          style={{ borderBottom: '1px solid #1a1a1a' }}
          onMouseEnter={e => (e.currentTarget.style.background = '#1a1a1a')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <div className="flex items-center justify-between">
            <div className="text-[13px] font-medium truncate" style={{ color: '#e0e0e0' }}>
              {r.project_name || 'Vorgang'}
            </div>
            <div className="text-[10px] font-mono shrink-0 ml-2" style={{ color: '#666' }}>
              {new Date(r.last_at).toLocaleDateString('de-DE')}
            </div>
          </div>
          <div className="flex items-center justify-between mt-0.5">
            <div className="text-[10px] font-mono" style={{ color: '#666' }}>{r.case_no || '—'}</div>
            <div className="text-[10px]" style={{ color: '#666' }}>{r.count} Nachr.</div>
          </div>
        </button>
      ))}
    </div>
  );
}
