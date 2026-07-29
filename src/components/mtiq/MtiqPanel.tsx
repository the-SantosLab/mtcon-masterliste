import { useEffect, useRef, useState } from 'react';
import { X, Maximize2, Minimize2, GripVertical, ChevronDown, ChevronUp } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { MtiqOverview } from './MtiqOverview';
import { MtiqVorgang } from './MtiqVorgang';
import { MtiqNewDraft } from './MtiqNewDraft';
import { MtiqDraftsTab } from './MtiqDraftsTab';
import { MtiqScanUpload } from './MtiqScanUpload';
import { MtiqCardScan } from './MtiqCardScan';
import { MtiqTablet } from './MtiqTablet';
import { MtiqAsk } from './MtiqAsk';
import { MtiqDuplicateScan } from './MtiqDuplicateScan';
import { supabase } from '@/integrations/supabase/client';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useAuth } from '@/contexts/AuthContext';

interface Props {
  open: boolean;
  onClose: () => void;
}

type Mode = 'ask' | 'current' | 'list' | 'drafts' | 'new' | 'scan' | 'card' | 'tablet' | 'dupes';

export function MtiqPanel({ open, onClose }: Props) {
  const location = useLocation();
  const { preferences } = usePreferences();
  const { isAdmin } = useAuth();
  const theme = preferences.theme;
  const m = location.pathname.match(/^\/cases\/([a-zA-Z0-9-]+)$/);
  const vorgangId = m && m[1] !== 'kanban' ? m[1] : null;
  const [mode, setMode] = useState<Mode>(vorgangId ? 'current' : 'ask');
  const [activeTabletId, setActiveTabletId] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [expanded, setExpanded] = useState<boolean>(() => {
    try { return localStorage.getItem('mtiq-panel-expanded') === '1'; } catch { return false; }
  });
  const [minimized, setMinimized] = useState<boolean>(() => {
    try { return localStorage.getItem('mtiq-panel-minimized') === '1'; } catch { return false; }
  });
  const [pos, setPos] = useState<{ x: number; y: number } | null>(() => {
    try {
      const raw = localStorage.getItem('mtiq-panel-pos');
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  });
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  useEffect(() => {
    try { localStorage.setItem('mtiq-panel-expanded', expanded ? '1' : '0'); } catch { /* ignore */ }
  }, [expanded]);
  useEffect(() => {
    try { localStorage.setItem('mtiq-panel-minimized', minimized ? '1' : '0'); } catch { /* ignore */ }
  }, [minimized]);
  useEffect(() => {
    if (pos) {
      try { localStorage.setItem('mtiq-panel-pos', JSON.stringify(pos)); } catch { /* ignore */ }
    }
  }, [pos]);

  // Reset stored position if it would place the panel header off-screen
  // (e.g. persisted from a larger viewport). Prevents "panel opens but is invisible".
  useEffect(() => {
    if (!open || !pos) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const outOfBounds = pos.x < 0 || pos.y < 0 || pos.x > vw - 120 || pos.y > vh - 80;
    if (outOfBounds) {
      setPos(null);
      try { localStorage.removeItem('mtiq-panel-pos'); } catch { /* ignore */ }
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const onDragStart = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    const width = expanded ? 920 : 480;
    const height = expanded ? window.innerHeight - 140 : 680;
    const current = pos ?? { x: window.innerWidth - width - 28, y: window.innerHeight - height - 96 };
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: current.x, origY: current.y };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = ev.clientX - dragRef.current.startX;
      const dy = ev.clientY - dragRef.current.startY;
      const nx = Math.max(8, Math.min(window.innerWidth - 80, dragRef.current.origX + dx));
      const ny = Math.max(8, Math.min(window.innerHeight - 60, dragRef.current.origY + dy));
      setPos({ x: nx, y: ny });
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  useEffect(() => {
    setMode(vorgangId ? 'current' : 'ask');
  }, [vorgangId]);

  useEffect(() => {
    if (!open) return;
    const load = async () => {
      const { count } = await supabase
        .from('mtiq_drafts')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending');
      setPendingCount(count ?? 0);
    };
    load();
    const ch = supabase.channel('mtiq-panel-drafts-count')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mtiq_drafts' }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [open]);

  if (!open) return null;

  const tabs: [Mode, string][] = vorgangId
    ? [['current', 'Vorgang'], ['ask', 'Chat'], ['list', 'Alle'], ['drafts', 'Entwürfe'], ['new', 'Neu'], ['scan', 'Scan'], ['card', 'Visitenkarte'], ['dupes', 'Duplikate']]
    : [['ask', 'Chat'], ['list', 'Alle'], ['drafts', 'Entwürfe'], ['new', 'Neu'], ['scan', 'Scan'], ['card', 'Visitenkarte'], ['dupes', 'Duplikate']];

  const subline = mode === 'current'
    ? '· aktueller Vorgang'
    : mode === 'new'
      ? '· neuer Entwurf'
      : mode === 'scan'
        ? '· Dokument-Scan'
        : mode === 'card'
          ? '· Visitenkarte'
          : mode === 'tablet'
            ? '· Prozess-Tablet'
            : mode === 'drafts'
              ? '· offene Entwürfe'
              : mode === 'ask'
                ? '· Chat'
                : '· alle Vorgänge';


  return (
    <div
      className="mtiq-panel-slide mtiq-shell"
      data-theme={theme}
      style={{
        position: 'fixed',
        ...(pos
          ? { left: pos.x, top: pos.y }
          : { bottom: 96, right: 28 }),
        width: minimized ? 280 : (expanded ? 920 : 480),
        height: minimized ? 'auto' : (expanded ? 'calc(100vh - 140px)' : 680),
        maxHeight: 'calc(100vh - 120px)',
        maxWidth: 'calc(100vw - 40px)',
        background: 'var(--mtiq-bg)',
        border: '1px solid var(--mtiq-border)',
        borderRadius: 20,
        boxShadow: theme === 'light'
          ? '0 24px 60px -20px rgba(15,23,42,0.25)'
          : '0 24px 60px -20px rgba(0,0,0,0.7)',
        zIndex: 9998,
        pointerEvents: 'auto',

        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        fontFamily: '"DM Sans", system-ui, sans-serif',
      }}
    >
      <div
        onMouseDown={onDragStart}
        className="flex items-center gap-2.5 px-3 py-2.5 select-none"
        style={{ borderBottom: '1px solid #222', cursor: 'move' }}
      >
        <div
          className="flex items-center justify-center text-white text-sm"
          style={{ width: 28, height: 28, borderRadius: 9, background: 'linear-gradient(135deg, #0ea5e9 0%, #818cf8 100%)' }}
        >✦</div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold" style={{ color: '#e0e0e0' }}>MTIQ</div>
          <div className="text-[10px]" style={{ color: '#666' }}>KI-Assistent {subline}</div>
        </div>
        <button
          onClick={() => setMinimized(m => !m)}
          className="p-1 rounded hover:bg-white/5"
          style={{ color: '#666' }}
          title={minimized ? 'Öffnen' : 'Minimieren'}
        >
          {minimized ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {!minimized && (
          <button
            onClick={() => setExpanded(e => !e)}
            className="p-1 rounded hover:bg-white/5"
            style={{ color: '#666' }}
            title={expanded ? 'Verkleinern' : 'Vergrößern'}
          >
            {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        )}
        <button onClick={onClose} className="p-1 rounded hover:bg-white/5" style={{ color: '#666' }}>
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="px-3 pt-2 pb-1 flex gap-1 flex-wrap" style={{ borderBottom: '1px solid #1a1a1a' }}>
        {tabs.map(([k, label]) => (
          <button
            key={k}
            onClick={() => setMode(k)}
            className="px-2.5 py-1 text-[11px] rounded transition-colors flex items-center gap-1"
            style={{
              color: mode === k ? '#e0e0e0' : '#666',
              background: mode === k ? '#181818' : 'transparent',
              fontWeight: mode === k ? 500 : 400,
            }}
          >
            {label}
            {k === 'drafts' && pendingCount > 0 && (
              <span
                className="text-white text-[9px] font-mono font-semibold flex items-center justify-center"
                style={{ minWidth: 15, height: 15, padding: '0 4px', borderRadius: 8, background: '#0ea5e9' }}
              >
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
        {mode === 'new' && <MtiqNewDraft onClose={onClose} />}
        {mode === 'scan' && <MtiqScanUpload onClose={onClose} />}
        {mode === 'card' && <MtiqCardScan onClose={onClose} onOpenTablet={(id) => { setActiveTabletId(id); setMode('tablet'); }} />}
        {mode === 'tablet' && activeTabletId && <MtiqTablet tabletId={activeTabletId} onClose={onClose} />}
        {mode === 'drafts' && <MtiqDraftsTab onClose={onClose} />}
        {mode === 'current' && vorgangId && <MtiqVorgang vorgangId={vorgangId} onClose={onClose} />}
        {mode === 'list' && <MtiqOverview onClose={onClose} />}
        {mode === 'ask' && <MtiqAsk />}
        {mode === 'dupes' && <MtiqDuplicateScan />}
      </div>


      <div className="px-3 py-1.5 flex items-center justify-between text-[10px]" style={{ borderTop: '1px solid #222', color: '#444' }}>
        <span>powered by MTIQ v1</span>
        <span>Einstellungen</span>
      </div>
    </div>
  );
}
