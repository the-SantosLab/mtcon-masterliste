import { X } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { MtiqOverview } from './MtiqOverview';
import { MtiqVorgang } from './MtiqVorgang';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function MtiqPanel({ open, onClose }: Props) {
  const location = useLocation();
  if (!open) return null;
  const m = location.pathname.match(/^\/cases\/([a-zA-Z0-9-]+)$/);
  const vorgangId = m && m[1] !== 'kanban' ? m[1] : null;

  return (
    <div
      className="mtiq-panel-slide"
      style={{
        position: 'fixed',
        bottom: 96,
        right: 28,
        width: 400,
        height: 560,
        maxHeight: 'calc(100vh - 120px)',
        maxWidth: 'calc(100vw - 40px)',
        background: '#111',
        border: '1px solid #222',
        borderRadius: 20,
        boxShadow: '0 24px 60px -20px rgba(0,0,0,0.7)',
        zIndex: 9998,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        fontFamily: '"DM Sans", system-ui, sans-serif',
      }}
    >
      <div className="flex items-center gap-2.5 px-3 py-2.5" style={{ borderBottom: '1px solid #222' }}>
        <div
          className="flex items-center justify-center text-white text-sm"
          style={{ width: 28, height: 28, borderRadius: 9, background: 'linear-gradient(135deg, #0ea5e9 0%, #818cf8 100%)' }}
        >✦</div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold" style={{ color: '#e0e0e0' }}>MTIQ</div>
          <div className="text-[10px]" style={{ color: '#666' }}>
            KI-Assistent {vorgangId ? '· aktueller Vorgang' : ''}
          </div>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-white/5" style={{ color: '#666' }}>
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
        {vorgangId
          ? <MtiqVorgang vorgangId={vorgangId} onClose={onClose} />
          : <MtiqOverview onClose={onClose} />}
      </div>

      <div className="px-3 py-1.5 flex items-center justify-between text-[10px]" style={{ borderTop: '1px solid #222', color: '#444' }}>
        <span>powered by MTIQ v1</span>
        <span>Einstellungen</span>
      </div>
    </div>
  );
}
