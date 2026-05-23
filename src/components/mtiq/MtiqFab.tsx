import { cn } from '@/lib/utils';

interface Props {
  onClick: () => void;
  open: boolean;
  unread: number;
}

export function MtiqFab({ onClick, open, unread }: Props) {
  return (
    <button
      onClick={onClick}
      aria-label="MTIQ KI-Assistent"
      style={{
        position: 'fixed',
        bottom: 28,
        right: 28,
        width: 54,
        height: 54,
        borderRadius: 17,
        background: 'linear-gradient(135deg, #0ea5e9 0%, #818cf8 100%)',
        boxShadow: '0 10px 30px -10px rgba(14,165,233,0.55), 0 4px 12px rgba(0,0,0,0.25)',
        zIndex: 9999,
      }}
      className={cn(
        'flex items-center justify-center text-white text-2xl font-light transition-transform duration-150 hover:scale-105 active:scale-95',
        open && 'scale-95'
      )}
    >
      <span style={{ fontFamily: '"DM Sans", system-ui, sans-serif', lineHeight: 1 }}>✦</span>
      {unread > 0 && (
        <span
          className="absolute flex items-center justify-center font-mono font-semibold text-white"
          style={{
            top: -4,
            right: -4,
            minWidth: 20,
            height: 20,
            padding: '0 5px',
            borderRadius: 10,
            background: '#ef4444',
            fontSize: 11,
            border: '2px solid #0f0f0f',
          }}
        >
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </button>
  );
}
