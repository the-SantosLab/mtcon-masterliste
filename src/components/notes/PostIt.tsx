import { useEffect, useRef, useState, useCallback } from 'react';
import { Pin, Trash2, Copy, Palette } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NoteEditor } from './NoteEditor';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export const NOTE_COLORS = {
  yellow: 'hsl(48 90% 75%)',
  pink: 'hsl(335 80% 82%)',
  blue: 'hsl(200 80% 78%)',
  green: 'hsl(135 55% 75%)',
  purple: 'hsl(270 60% 80%)',
  orange: 'hsl(25 90% 72%)',
} as const;

export type NoteColor = keyof typeof NOTE_COLORS;

export interface NoteData {
  id: string;
  content: string;
  color: NoteColor;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  z_index: number;
  pinned: boolean;
}

interface Props {
  note: NoteData;
  canEdit: boolean;
  onChange: (patch: Partial<NoteData>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onBringToFront: () => void;
}

export function PostIt({ note, canEdit, onChange, onDelete, onDuplicate, onBringToFront }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);
  const startRef = useRef({ x: 0, y: 0, nx: 0, ny: 0, w: 0, h: 0 });

  const onPointerDownDrag = (e: React.PointerEvent) => {
    if (!canEdit || note.pinned) return;
    if ((e.target as HTMLElement).closest('[data-no-drag]')) return;
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
        ref.current.style.width = `${Math.max(160, startRef.current.w + dx)}px`;
        ref.current.style.height = `${Math.max(140, startRef.current.h + dy)}px`;
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
        width: Math.max(160, startRef.current.w + dx),
        height: Math.max(140, startRef.current.h + dy),
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

  return (
    <div
      ref={ref}
      className={cn(
        'absolute select-none rounded-sm shadow-md transition-shadow text-foreground',
        dragging || resizing ? 'shadow-xl' : 'hover:shadow-lg',
        canEdit && !note.pinned && 'cursor-grab active:cursor-grabbing',
      )}
      style={{
        background: NOTE_COLORS[note.color],
        transform: `translate(${note.position_x}px, ${note.position_y}px)`,
        width: note.width,
        height: note.height,
        zIndex: note.z_index,
        color: 'hsl(0 0% 12%)',
      }}
      onPointerDown={onPointerDownDrag}
    >
      <div className="flex items-center justify-between px-2 pt-1 h-6">
        <button
          type="button"
          data-no-drag
          onClick={() => canEdit && onChange({ pinned: !note.pinned })}
          className={cn('h-4 w-4 flex items-center justify-center rounded-sm hover:bg-foreground/10', note.pinned && 'text-foreground')}
          title={note.pinned ? 'Lösen' : 'Anheften'}
        >
          <Pin className={cn('h-3 w-3', note.pinned && 'fill-current')} />
        </button>
        {canEdit && (
          <div data-no-drag className="flex items-center gap-0.5">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="h-4 w-4 flex items-center justify-center rounded-sm hover:bg-foreground/10" title="Farbe">
                  <Palette className="h-3 w-3" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-0 p-1">
                <div className="grid grid-cols-3 gap-1">
                  {(Object.keys(NOTE_COLORS) as NoteColor[]).map(c => (
                    <button
                      key={c}
                      onClick={() => onChange({ color: c })}
                      className={cn('h-5 w-5 rounded-sm border', note.color === c ? 'border-foreground' : 'border-transparent')}
                      style={{ background: NOTE_COLORS[c] }}
                    />
                  ))}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
            <button onClick={onDuplicate} className="h-4 w-4 flex items-center justify-center rounded-sm hover:bg-foreground/10" title="Duplizieren">
              <Copy className="h-3 w-3" />
            </button>
            <button onClick={onDelete} className="h-4 w-4 flex items-center justify-center rounded-sm hover:bg-destructive/20" title="Löschen">
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>
      <div data-no-drag className="px-2 pb-2 h-[calc(100%-1.5rem)] cursor-text">
        <NoteEditor
          content={note.content}
          onUpdate={(html) => onChange({ content: html })}
          readOnly={!canEdit}
        />
      </div>
      {canEdit && (
        <div
          data-no-drag
          onPointerDown={onPointerDownResize}
          className="absolute bottom-0 right-0 h-3 w-3 cursor-nwse-resize"
          style={{
            background: 'linear-gradient(135deg, transparent 50%, hsl(0 0% 25% / 0.4) 50%)',
          }}
        />
      )}
    </div>
  );
}
