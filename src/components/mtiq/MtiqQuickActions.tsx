import { MTIQ_ACTIONS, MtiqAction } from './MtiqActionsGrid';

export function MtiqQuickActions({ onPick }: { onPick: (a: MtiqAction) => void }) {
  return (
    <div className="flex gap-1.5 overflow-x-auto px-3 py-2 no-scrollbar" style={{ borderTop: '1px solid #222' }}>
      {MTIQ_ACTIONS.map(a => (
        <button
          key={a.key}
          onClick={() => onPick(a)}
          className="shrink-0 px-2.5 py-1 text-[11px] rounded-full transition-colors flex items-center gap-1"
          style={{ background: '#181818', border: '1px solid #222', color: '#e0e0e0' }}
        >
          <a.icon className="h-3 w-3" />
          {a.label}
        </button>
      ))}
    </div>
  );
}
