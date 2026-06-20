import { useEffect, useRef, useState } from 'react';
import { X, Maximize2, Minimize2, GripVertical } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { MtiqOverview } from './MtiqOverview';
import { MtiqVorgang } from './MtiqVorgang';
import { MtiqNewDraft } from './MtiqNewDraft';
import { MtiqDraftsTab } from './MtiqDraftsTab';
import { MtiqScanUpload } from './MtiqScanUpload';
import { MtiqCardScan } from './MtiqCardScan';
import { supabase } from '@/integrations/supabase/client';

interface Props {
  open: boolean;
  onClose: () => void;
}

type Mode = 'current' | 'list' | 'drafts' | 'new' | 'scan' | 'card';

export function MtiqPanel({ open, onClose }: Props) {
  const location = useLocation();
  const m = location.pathname.match(/^\/cases\/([a-zA-Z0-9-]+)$/);
  const vorgangId = m && m[1] !== 'kanban' ? m[1] : null;
  const [mode, setMode] = useState<Mode>(vorgangId ? 'current' : 'list');
  const [pendingCount, setPendingCount] = useState(0);
  const [expanded, setExpanded] = useState<boolean>(() => {
    try { return localStorage.getItem('mtiq-panel-expanded') === '1'; } catch { return false; }
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
    if (pos) {
      try { localStorage.setItem('mtiq-panel-pos', JSON.stringify(pos)); } catch { /* ignore */ }
    }
  }, [pos]);

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
    setMode(vorgangId ? 'current' : 'list');
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
    ? [['current', 'Vorgang'], ['list', 'Alle'], ['drafts', 'Entwürfe'], ['new', 'Neu'], ['scan', 'Scan']]
    : [['list', 'Alle'], ['drafts', 'Entwürfe'], ['new', 'Neu'], ['scan', 'Scan']];

  const subline = mode === 'current'
    ? '· aktueller Vorgang'
    : mode === 'new'
      ? '· neuer Entwurf'
      : mode === 'scan'
        ? '· Dokument-Scan'
        : mode === 'drafts'
          ? '· offene Entwürfe'
          : '· alle Vorgänge';


  return (
    <div
      className="mtiq-panel-slide"
      style={{
        position: 'fixed',
        ...(pos
          ? { left: pos.x, top: pos.y }
          : { bottom: 96, right: 28 }),
        width: expanded ? 920 : 480,
        height: expanded ? 'calc(100vh - 140px)' : 680,
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
          onClick={() => setExpanded(e => !e)}
          className="p-1 rounded hover:bg-white/5"
          style={{ color: '#666' }}
          title={expanded ? 'Verkleinern' : 'Vergrößern'}
        >
          {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
        <button onClick={onClose} className="p-1 rounded hover:bg-white/5" style={{ color: '#666' }}>
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="px-3 pt-2 pb-1 flex gap-1" style={{ borderBottom: '1px solid #1a1a1a' }}>
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
        {mode === 'drafts' && <MtiqDraftsTab onClose={onClose} />}
        {mode === 'current' && vorgangId && <MtiqVorgang vorgangId={vorgangId} onClose={onClose} />}
        {mode === 'list' && <MtiqOverview onClose={onClose} />}
      </div>


      <div className="px-3 py-1.5 flex items-center justify-between text-[10px]" style={{ borderTop: '1px solid #222', color: '#444' }}>
        <span>powered by MTIQ v1</span>
        <span>Einstellungen</span>
      </div>
    </div>
  );
}
