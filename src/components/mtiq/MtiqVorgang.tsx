import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { MtiqActionsGrid } from './MtiqActionsGrid';
import { MtiqChat } from './MtiqChat';
import { MtiqCaseChat } from './MtiqCaseChat';
import { MtiqHistory } from './MtiqHistory';
import { cn } from '@/lib/utils';

type Tab = 'case' | 'actions' | 'ai' | 'history';

export function MtiqVorgang({ vorgangId, onClose }: { vorgangId: string; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('case');
  const [caseNo, setCaseNo] = useState<string | null>(null);

  useEffect(() => {
    supabase.from('cases').select('case_no').eq('id', vorgangId).maybeSingle().then(({ data }) => {
      setCaseNo(data?.case_no ?? null);
    });
  }, [vorgangId]);


  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-1 flex gap-1 overflow-x-auto" style={{ borderBottom: '1px solid #222' }}>
        {([
          ['case', 'Vorgang-Chat'],
          ['ai', 'KI-Chat'],
          ['actions', 'Aktionen'],
          ['history', 'Verlauf'],
        ] as [Tab, string][]).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={cn('px-2.5 py-1.5 text-[11px] rounded transition-colors whitespace-nowrap', tab === k ? 'font-medium' : '')}
            style={{
              color: tab === k ? '#e0e0e0' : '#666',
              background: tab === k ? '#181818' : 'transparent',
            }}
          >{label}</button>
        ))}
        {caseNo && (
          <div className="ml-auto text-[10px] font-mono self-center shrink-0 pl-2" style={{ color: '#666' }}>{caseNo}</div>
        )}
      </div>
      <div className="flex-1 min-h-0 flex flex-col">
        {tab === 'case' && <MtiqCaseChat vorgangId={vorgangId} />}
        {tab === 'actions' && <MtiqActionsGrid vorgangId={vorgangId} />}
        {tab === 'ai' && <MtiqChat vorgangId={vorgangId} />}
        {tab === 'history' && <MtiqHistory onNavigate={onClose} />}
      </div>
    </div>
  );
}
