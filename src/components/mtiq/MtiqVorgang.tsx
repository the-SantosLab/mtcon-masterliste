import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { MtiqActionsGrid, MtiqAction } from './MtiqActionsGrid';
import { MtiqChat } from './MtiqChat';
import { MtiqHistory } from './MtiqHistory';
import { cn } from '@/lib/utils';

type Tab = 'actions' | 'chat' | 'history';

export function MtiqVorgang({ vorgangId, onClose }: { vorgangId: string; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('actions');
  const [seedPrompt, setSeedPrompt] = useState<string | undefined>();
  const [caseNo, setCaseNo] = useState<string | null>(null);

  useEffect(() => {
    supabase.from('cases').select('case_no').eq('id', vorgangId).maybeSingle().then(({ data }) => {
      setCaseNo(data?.case_no ?? null);
    });
  }, [vorgangId]);

  const pickAction = (a: MtiqAction) => {
    setSeedPrompt(a.prompt);
    setTab('chat');
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-1 flex gap-1" style={{ borderBottom: '1px solid #222' }}>
        {([
          ['actions', 'Aktionen'],
          ['chat', 'Chat'],
          ['history', 'Verlauf'],
        ] as [Tab, string][]).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={cn('px-3 py-1.5 text-[12px] rounded transition-colors', tab === k ? 'font-medium' : '')}
            style={{
              color: tab === k ? '#e0e0e0' : '#666',
              background: tab === k ? '#181818' : 'transparent',
            }}
          >{label}</button>
        ))}
        {caseNo && (
          <div className="ml-auto text-[10px] font-mono self-center" style={{ color: '#666' }}>{caseNo}</div>
        )}
      </div>
      <div className="flex-1 min-h-0 flex flex-col">
        {tab === 'actions' && <MtiqActionsGrid onPick={pickAction} />}
        {tab === 'chat' && <MtiqChat vorgangId={vorgangId} seedPrompt={seedPrompt} onSeedConsumed={() => setSeedPrompt(undefined)} />}
        {tab === 'history' && <MtiqHistory onNavigate={onClose} />}
      </div>
    </div>
  );
}
