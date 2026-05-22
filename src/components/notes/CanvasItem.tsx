import { useEffect, useRef, useState, useCallback } from 'react';
import { Pin, Trash2, Copy, Palette, Plus, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NoteEditor } from './NoteEditor';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { NOTE_COLORS, type NoteColor, type NoteData } from './PostIt';

export type ItemKind =
  | 'postit'
  | 'text'
  | 'rect'
  | 'rounded'
  | 'circle'
  | 'triangle'
  | 'arrow'
  | 'table';

export const SHAPE_FILLS: string[] = [
  'transparent',
  'hsl(0 0% 100%)',
  'hsl(48 90% 75%)',
  'hsl(335 80% 82%)',
  'hsl(200 80% 78%)',
  'hsl(135 55% 75%)',
  'hsl(270 60% 80%)',
  'hsl(25 90% 72%)',
  'hsl(0 0% 20%)',
];

export const STROKE_COLORS: string[] = [
  'hsl(0 0% 20%)',
  'hsl(0 0% 50%)',
  'hsl(0 75% 55%)',
  'hsl(28 90% 55%)',
  'hsl(48 95% 55%)',
  'hsl(140 60% 45%)',
  'hsl(200 80% 50%)',
  'hsl(270 60% 55%)',
];

interface Props {
  note: NoteData & {
    kind?: ItemKind | null;
    fill_color?: string | null;
    stroke_color?: string | null;
    extra?: any;
  };
  canEdit: boolean;
  onChange: (patch: Partial<NoteData> & { kind?: ItemKind; fill_color?: string | null; stroke_color?: string | null; extra?: any }) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onBringToFront: () => void;
}

export function CanvasItem({ note, canEdit, onChange, onDelete, onDuplicate, onBringToFront }: Props) {
  const kind: ItemKind = (note.kind as ItemKind) || 'postit';
  const ref = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);
  const startRef = useRef({ x: 0, y: 0, nx: 0, ny: 0, w: 0, h: 0 });

  const onPointerDownDrag = (e: React.PointerEvent) => {
    if (!canEdit || note.pinned) return;
    const tgt = e.target as HTMLElement;
    if (tgt.closest('[data-no-drag]')) return;
    // Don't start drag on actual interactive content (text editing, inputs, buttons)
    if (tgt.closest('input, textarea, button, [contenteditable="true"], .ProseMirror, a, select')) return;
    onBringToFront();
    setDragging(true);
    startRef.current = { x: e.clientX, y: e.clientY, nx: note.position_x, ny: note.position_y, w: 0, h: 0 };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerDownResize = (e: React.PointerEvent) => {
    if (!canEdit) return;
    e.stopPropagation();
    setResizing(true);
    startRef.current = { x: e.clientX, y: e.clientY, nx: 0, ny: 0, w: note.width, h: note.height };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = useCallback((e: PointerEvent) => {
    if (dragging) {
      const dx = e.clientX - startRef.current.x;
      const dy = e.clientY - startRef.current.y;
      if (ref.current) {
        ref.current.style.transform = `translate(${startRef.current.nx + dx}px, ${startRef.current.ny + dy}px)`;
      }
    } else if (resizing) {
      const dx = e.clientX - startRef.current.x;
      const dy = e.clientY - startRef.current.y;
      if (ref.current) {
        ref.current.style.width = `${Math.max(60, startRef.current.w + dx)}px`;
        ref.current.style.height = `${Math.max(40, startRef.current.h + dy)}px`;
      }
    }
  }, [dragging, resizing]);

  const onPointerUp = useCallback((e: PointerEvent) => {
    if (dragging) {
      const dx = e.clientX - startRef.current.x;
      const dy = e.clientY - startRef.current.y;
      setDragging(false);
      onChange({
        position_x: Math.max(0, startRef.current.nx + dx),
        position_y: Math.max(0, startRef.current.ny + dy),
      });
    } else if (resizing) {
      const dx = e.clientX - startRef.current.x;
      const dy = e.clientY - startRef.current.y;
      setResizing(false);
      onChange({
        width: Math.max(60, startRef.current.w + dx),
        height: Math.max(40, startRef.current.h + dy),
      });
    }
  }, [dragging, resizing, onChange]);

  useEffect(() => {
    if (!dragging && !resizing) return;
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [dragging, resizing, onPointerMove, onPointerUp]);

  const fill = note.fill_color || (kind === 'postit' ? NOTE_COLORS[note.color] : 'transparent');
  const stroke = note.stroke_color || 'hsl(0 0% 25%)';
  const hasShadow = kind === 'postit';
  const showFillPicker = kind !== 'arrow' && kind !== 'text';
  const showStrokePicker = kind === 'rect' || kind === 'rounded' || kind === 'circle' || kind === 'triangle' || kind === 'arrow';

  return (
    <div
      ref={ref}
      className={cn(
        'absolute select-none transition-shadow group/item',
        hasShadow && (dragging || resizing ? 'shadow-xl' : 'hover:shadow-lg shadow-md'),
        kind === 'postit' && 'rounded-sm',
        canEdit && !note.pinned && 'cursor-grab active:cursor-grabbing',
      )}
      style={{
        transform: `translate(${note.position_x}px, ${note.position_y}px)`,
        width: note.width,
        height: note.height,
        zIndex: note.z_index,
        color: kind === 'postit' ? 'hsl(0 0% 12%)' : 'hsl(var(--foreground))',
        background: kind === 'postit' ? NOTE_COLORS[note.color] : 'transparent',
      }}
      onPointerDown={onPointerDownDrag}
    >
      {/* Shape rendering layer (behind content) */}
      {kind !== 'postit' && kind !== 'text' && kind !== 'table' && (
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          preserveAspectRatio="none"
          viewBox={`0 0 ${Math.max(1, note.width)} ${Math.max(1, note.height)}`}
        >
          {kind === 'rect' && (
            <rect x={1} y={1} width={Math.max(1, note.width - 2)} height={Math.max(1, note.height - 2)} fill={fill} stroke={stroke} strokeWidth={2} />
          )}
          {kind === 'rounded' && (
            <rect x={1} y={1} width={Math.max(1, note.width - 2)} height={Math.max(1, note.height - 2)} rx={16} ry={16} fill={fill} stroke={stroke} strokeWidth={2} />
          )}
          {kind === 'circle' && (
            <ellipse cx={note.width / 2} cy={note.height / 2} rx={Math.max(1, note.width / 2 - 1)} ry={Math.max(1, note.height / 2 - 1)} fill={fill} stroke={stroke} strokeWidth={2} />
          )}
          {kind === 'triangle' && (
            <polygon points={`${note.width / 2},2 ${note.width - 2},${note.height - 2} 2,${note.height - 2}`} fill={fill} stroke={stroke} strokeWidth={2} strokeLinejoin="round" />
          )}
          {kind === 'arrow' && (() => {
            const flipped = !!note.extra?.flipped;
            const x1 = flipped ? note.width - 2 : 2;
            const y1 = flipped ? note.height - 2 : 2;
            const x2 = flipped ? 2 : note.width - 2;
            const y2 = flipped ? 2 : note.height - 2;
            const headId = `arrowhead-${note.id}`;
            return (
              <>
                <defs>
                  <marker id={headId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill={stroke} />
                  </marker>
                </defs>
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={stroke} strokeWidth={1.5} markerEnd={`url(#${headId})`} />
              </>
            );
          })()}
        </svg>
      )}

      {/* Toolbar */}
      <div
        data-no-drag
        className={cn(
          'absolute -top-7 left-0 right-0 flex items-center gap-0.5 px-1 py-0.5 rounded-sm bg-card/95 border border-border shadow-sm transition-opacity',
          'opacity-0 group-hover/item:opacity-100',
        )}
      >
        <button
          type="button"
          onClick={() => canEdit && onChange({ pinned: !note.pinned })}
          className={cn('h-5 w-5 flex items-center justify-center rounded-sm hover:bg-muted', note.pinned && 'text-foreground')}
          title={note.pinned ? 'Lösen' : 'Anheften'}
        >
          <Pin className={cn('h-3 w-3', note.pinned && 'fill-current')} />
        </button>
        {canEdit && showFillPicker && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="h-5 w-5 flex items-center justify-center rounded-sm hover:bg-muted" title="Füllfarbe">
                <Palette className="h-3 w-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-0 p-1.5">
              <div className="text-[9px] uppercase tracking-wide text-muted-foreground mb-1 px-0.5">Füllung</div>
              {kind === 'postit' ? (
                <div className="grid grid-cols-3 gap-1">
                  {(Object.keys(NOTE_COLORS) as NoteColor[]).map(c => (
                    <button
                      key={c}
                      onClick={() => onChange({ color: c, fill_color: null })}
                      className={cn('h-5 w-5 rounded-sm border', note.color === c && !note.fill_color ? 'border-foreground' : 'border-transparent')}
                      style={{ background: NOTE_COLORS[c] }}
                    />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-1">
                  {SHAPE_FILLS.map(c => (
                    <button
                      key={c}
                      onClick={() => onChange({ fill_color: c })}
                      className={cn(
                        'h-5 w-5 rounded-sm border',
                        (note.fill_color || 'transparent') === c ? 'border-foreground' : 'border-border',
                      )}
                      style={{
                        background: c === 'transparent' ? 'repeating-conic-gradient(hsl(var(--muted)) 0% 25%, transparent 0% 50%) 50% / 8px 8px' : c,
                      }}
                      title={c}
                    />
                  ))}
                </div>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {canEdit && showStrokePicker && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="h-5 w-5 flex items-center justify-center rounded-sm hover:bg-muted" title="Linienfarbe">
                <div className="h-3 w-3 rounded-full border-2" style={{ borderColor: stroke }} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-0 p-1.5">
              <div className="text-[9px] uppercase tracking-wide text-muted-foreground mb-1 px-0.5">Linie</div>
              <div className="grid grid-cols-4 gap-1">
                {STROKE_COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => onChange({ stroke_color: c })}
                    className={cn('h-5 w-5 rounded-full border-2', (note.stroke_color || STROKE_COLORS[0]) === c ? 'ring-2 ring-foreground/40' : '')}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {canEdit && kind === 'arrow' && (
          <button
            onClick={() => onChange({ extra: { ...(note.extra || {}), flipped: !note.extra?.flipped } })}
            className="h-5 px-1 text-[10px] rounded-sm hover:bg-muted"
            title="Richtung umkehren"
          >
            ↔
          </button>
        )}
        {canEdit && kind === 'table' && (
          <TableControls
            extra={note.extra}
            onChange={(extra) => onChange({ extra })}
          />
        )}
        {canEdit && (
          <>
            <button onClick={onDuplicate} className="h-5 w-5 flex items-center justify-center rounded-sm hover:bg-muted" title="Duplizieren">
              <Copy className="h-3 w-3" />
            </button>
            <button onClick={onDelete} className="h-5 w-5 flex items-center justify-center rounded-sm hover:bg-destructive/20 text-destructive" title="Löschen">
              <Trash2 className="h-3 w-3" />
            </button>
          </>
        )}
      </div>

      {/* Content area */}
      {kind === 'postit' && (
        <div className="px-2 pt-1 pb-2 h-full">
          <NoteEditor content={note.content} onUpdate={(html) => onChange({ content: html })} readOnly={!canEdit} />
        </div>
      )}
      {kind === 'text' && (
        <div className="px-1 py-0.5 h-full">
          <NoteEditor content={note.content} onUpdate={(html) => onChange({ content: html })} readOnly={!canEdit} />
        </div>
      )}
      {(kind === 'rect' || kind === 'rounded' || kind === 'circle' || kind === 'triangle') && (
        <div className="relative h-full w-full flex items-center justify-center px-3 py-2 text-center">
          <div className="w-full">
            <NoteEditor content={note.content} onUpdate={(html) => onChange({ content: html })} readOnly={!canEdit} />
          </div>
        </div>
      )}
      {kind === 'table' && (
        <TableBody
          extra={note.extra}
          canEdit={canEdit}
          onChange={(extra) => onChange({ extra })}
        />
      )}

      {canEdit && kind !== 'arrow' && (
        <div
          data-no-drag
          onPointerDown={onPointerDownResize}
          className="absolute bottom-0 right-0 h-3 w-3 cursor-nwse-resize opacity-0 group-hover/item:opacity-100"
          style={{
            background: 'linear-gradient(135deg, transparent 50%, hsl(var(--foreground) / 0.4) 50%)',
          }}
        />
      )}
      {canEdit && kind === 'arrow' && (
        <div
          data-no-drag
          onPointerDown={onPointerDownResize}
          className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize opacity-0 group-hover/item:opacity-100 rounded-full border border-foreground/40 bg-background/80"
        />
      )}
    </div>
  );
}

function TableControls({ extra, onChange }: { extra: any; onChange: (e: any) => void }) {
  const rows = Math.max(1, extra?.rows ?? 2);
  const cols = Math.max(1, extra?.cols ?? 2);
  const cells: string[][] = extra?.cells || [];

  const setSize = (newRows: number, newCols: number) => {
    const next: string[][] = [];
    for (let r = 0; r < newRows; r++) {
      const row: string[] = [];
      for (let c = 0; c < newCols; c++) {
        row.push(cells?.[r]?.[c] ?? '');
      }
      next.push(row);
    }
    onChange({ ...(extra || {}), rows: newRows, cols: newCols, cells: next });
  };

  return (
    <div className="flex items-center gap-0.5 border-l border-border ml-0.5 pl-1">
      <span className="text-[9px] text-muted-foreground">Z</span>
      <button onClick={() => setSize(Math.max(1, rows - 1), cols)} className="h-5 w-5 flex items-center justify-center rounded-sm hover:bg-muted"><Minus className="h-2.5 w-2.5" /></button>
      <button onClick={() => setSize(rows + 1, cols)} className="h-5 w-5 flex items-center justify-center rounded-sm hover:bg-muted"><Plus className="h-2.5 w-2.5" /></button>
      <span className="text-[9px] text-muted-foreground ml-1">S</span>
      <button onClick={() => setSize(rows, Math.max(1, cols - 1))} className="h-5 w-5 flex items-center justify-center rounded-sm hover:bg-muted"><Minus className="h-2.5 w-2.5" /></button>
      <button onClick={() => setSize(rows, cols + 1)} className="h-5 w-5 flex items-center justify-center rounded-sm hover:bg-muted"><Plus className="h-2.5 w-2.5" /></button>
    </div>
  );
}

function TableBody({ extra, canEdit, onChange }: { extra: any; canEdit: boolean; onChange: (e: any) => void }) {
  const rows = Math.max(1, extra?.rows ?? 2);
  const cols = Math.max(1, extra?.cols ?? 2);
  const cells: string[][] = extra?.cells || Array.from({ length: rows }, () => Array.from({ length: cols }, () => ''));

  const updateCell = (r: number, c: number, v: string) => {
    const next = cells.map(row => [...row]);
    while (next.length < rows) next.push(Array(cols).fill(''));
    for (const row of next) while (row.length < cols) row.push('');
    next[r][c] = v;
    onChange({ ...(extra || {}), rows, cols, cells: next });
  };

  return (
    <div data-no-drag className="h-full w-full overflow-auto bg-background/80 border border-border rounded-sm">
      <table className="w-full h-full border-collapse text-[11px]">
        <tbody>
          {Array.from({ length: rows }).map((_, r) => (
            <tr key={r}>
              {Array.from({ length: cols }).map((_, c) => (
                <td key={c} className="border border-border p-0 align-top">
                  <input
                    className="w-full h-full bg-transparent px-1.5 py-1 outline-none focus:bg-muted/40"
                    value={cells?.[r]?.[c] ?? ''}
                    onChange={(e) => updateCell(r, c, e.target.value)}
                    readOnly={!canEdit}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
