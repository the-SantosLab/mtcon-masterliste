import { useEffect, useMemo, useRef, useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Plus, StickyNote, Trash2, Users, Lock, UserCog, Search, Filter, Pin, X, Type, Square, Circle, Triangle, ArrowRight, Table as TableIcon, Sticker } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { NOTE_COLORS, type NoteColor, type NoteData } from '@/components/notes/PostIt';
import { CanvasItem, type ItemKind } from '@/components/notes/CanvasItem';
import { BoardMembersDialog } from '@/components/notes/BoardMembersDialog';
import { MARKER_COLORS } from '@/components/notes/NoteEditor';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';

interface Board {
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
  scope: 'private' | 'shared';
  department_id: string | null;
}

const COLOR_CYCLE: NoteColor[] = ['yellow', 'pink', 'blue', 'green', 'purple', 'orange'];

export default function Notes() {
  const { user } = useAuth();
  const [boards, setBoards] = useState<Board[]>([]);
  const [activeBoardId, setActiveBoardId] = useState<string | null>(null);
  const [notes, setNotes] = useState<NoteData[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [newBoard, setNewBoard] = useState({ name: '', description: '', scope: 'private' as 'private' | 'shared' });
  const [loading, setLoading] = useState(true);
  const [membersBoard, setMembersBoard] = useState<Board | null>(null);
  const [search, setSearch] = useState('');
  const [colorFilters, setColorFilters] = useState<Set<NoteColor>>(new Set());
  const [markerFilters, setMarkerFilters] = useState<Set<string>>(new Set());
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);

  const canvasRef = useRef<HTMLDivElement>(null);

  const activeBoard = boards.find(b => b.id === activeBoardId) || null;
  const canEdit = !!(activeBoard && user && (activeBoard.owner_id === user.id || activeBoard.scope === 'shared'));

  const activeFilterCount = colorFilters.size + markerFilters.size + (pinnedOnly ? 1 : 0);
  const hasFilter = !!search.trim() || activeFilterCount > 0;

  const matchedIds = useMemo(() => {
    const q = search.trim().toLowerCase();
    const stripHtml = (html: string) =>
      html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').toLowerCase();
    return new Set(
      notes
        .filter(n => {
          if (pinnedOnly && !n.pinned) return false;
          if (colorFilters.size > 0 && !colorFilters.has(n.color)) return false;
          if (markerFilters.size > 0) {
            const hasAny = Array.from(markerFilters).some(hex =>
              (n.content || '').includes(`data-color="${hex}"`) ||
              (n.content || '').includes(`background-color: ${hex}`)
            );
            if (!hasAny) return false;
          }
          if (q && !stripHtml(n.content || '').includes(q)) return false;
          return true;
        })
        .map(n => n.id),
    );
  }, [notes, search, colorFilters, markerFilters, pinnedOnly]);

  function toggleColor(c: NoteColor) {
    setColorFilters(prev => {
      const n = new Set(prev); n.has(c) ? n.delete(c) : n.add(c); return n;
    });
  }
  function toggleMarker(hex: string) {
    setMarkerFilters(prev => {
      const n = new Set(prev); n.has(hex) ? n.delete(hex) : n.add(hex); return n;
    });
  }
  function clearFilters() {
    setSearch(''); setColorFilters(new Set()); setMarkerFilters(new Set()); setPinnedOnly(false);
  }


  useEffect(() => {
    loadBoards();
  }, []);

  useEffect(() => {
    if (!activeBoardId) { setNotes([]); return; }
    loadNotes(activeBoardId);
    const channel = supabase
      .channel(`notes-${activeBoardId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notes', filter: `board_id=eq.${activeBoardId}` }, () => loadNotes(activeBoardId))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeBoardId]);

  async function loadBoards() {
    setLoading(true);
    const { data, error } = await supabase
      .from('note_boards')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) { toast.error(error.message); setLoading(false); return; }
    const list = (data || []) as Board[];

    if (list.length === 0 && user) {
      const { data: created, error: ce } = await supabase
        .from('note_boards')
        .insert({ name: 'Meine Notizen', scope: 'private', owner_id: user.id })
        .select()
        .single();
      if (!ce && created) {
        setBoards([created as Board]);
        setActiveBoardId((created as Board).id);
      }
    } else {
      setBoards(list);
      if (!activeBoardId) setActiveBoardId(list[0]?.id || null);
    }
    setLoading(false);
  }

  async function loadNotes(boardId: string) {
    const { data, error } = await supabase
      .from('notes')
      .select('*')
      .eq('board_id', boardId)
      .is('archived_at', null)
      .order('z_index', { ascending: true });
    if (error) { toast.error(error.message); return; }
    setNotes((data || []) as any);
  }

  async function createBoard() {
    if (!user || !newBoard.name.trim()) return;
    const { data, error } = await supabase
      .from('note_boards')
      .insert({
        name: newBoard.name.trim(),
        description: newBoard.description.trim() || null,
        scope: newBoard.scope,
        owner_id: user.id,
      })
      .select()
      .single();
    if (error) { toast.error(error.message); return; }
    setBoards(b => [...b, data as Board]);
    setActiveBoardId((data as Board).id);
    setCreateOpen(false);
    setNewBoard({ name: '', description: '', scope: 'private' });
  }

  function defaultsFor(kind: ItemKind): { width: number; height: number; fill_color: string | null; stroke_color: string | null; extra: any; color: NoteColor } {
    const color = COLOR_CYCLE[notes.length % COLOR_CYCLE.length];
    switch (kind) {
      case 'postit': return { width: 200, height: 180, fill_color: null, stroke_color: null, extra: {}, color };
      case 'text': return { width: 220, height: 60, fill_color: null, stroke_color: null, extra: {}, color };
      case 'rect': return { width: 220, height: 140, fill_color: 'transparent', stroke_color: 'hsl(0 0% 20%)', extra: {}, color };
      case 'rounded': return { width: 220, height: 140, fill_color: 'transparent', stroke_color: 'hsl(0 0% 20%)', extra: {}, color };
      case 'circle': return { width: 160, height: 160, fill_color: 'transparent', stroke_color: 'hsl(0 0% 20%)', extra: {}, color };
      case 'triangle': return { width: 180, height: 160, fill_color: 'transparent', stroke_color: 'hsl(0 0% 20%)', extra: {}, color };
      case 'arrow': return { width: 180, height: 80, fill_color: null, stroke_color: 'hsl(0 0% 20%)', extra: {}, color };
      case 'table': return { width: 280, height: 140, fill_color: null, stroke_color: null, extra: { rows: 2, cols: 2, cells: [['',''],['','']] }, color };
    }
  }

  async function addItem(kind: ItemKind) {
    if (!user || !activeBoardId) return;
    const maxZ = notes.reduce((m, n) => Math.max(m, n.z_index), 0);
    const offset = (notes.length % 6) * 24;
    const scroll = canvasRef.current;
    const cx = ((scroll?.scrollLeft ?? 0) / zoom) + 40 + offset;
    const cy = ((scroll?.scrollTop ?? 0) / zoom) + 40 + offset;
    const d = defaultsFor(kind);
    const { data, error } = await supabase
      .from('notes')
      .insert({
        board_id: activeBoardId,
        author_id: user.id,
        content: '',
        color: d.color,
        position_x: cx,
        position_y: cy,
        width: d.width,
        height: d.height,
        z_index: maxZ + 1,
        kind,
        fill_color: d.fill_color,
        stroke_color: d.stroke_color,
        extra: d.extra,
      } as any)
      .select()
      .single();
    if (error) { toast.error(error.message); return; }
    setNotes(n => [...n, data as any]);
  }

  // Debounced patch
  const pendingRef = useRef<Record<string, { patch: Partial<NoteData>; timer: any }>>({});
  function patchNote(id: string, patch: Partial<NoteData>) {
    setNotes(arr => arr.map(n => n.id === id ? { ...n, ...patch } : n));
    const entry = pendingRef.current[id] || { patch: {}, timer: null };
    entry.patch = { ...entry.patch, ...patch };
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = setTimeout(async () => {
      const toSend = entry.patch;
      delete pendingRef.current[id];
      const { error } = await supabase.from('notes').update(toSend).eq('id', id);
      if (error) toast.error(error.message);
    }, 400);
    pendingRef.current[id] = entry;
  }

  async function deleteNote(id: string) {
    setNotes(arr => arr.filter(n => n.id !== id));
    const { error } = await supabase.from('notes').delete().eq('id', id);
    if (error) toast.error(error.message);
  }

  async function duplicateNote(n: NoteData & any) {
    if (!user || !activeBoardId) return;
    const maxZ = notes.reduce((m, x) => Math.max(m, x.z_index), 0);
    const { data, error } = await supabase
      .from('notes')
      .insert({
        board_id: activeBoardId,
        author_id: user.id,
        content: n.content,
        color: n.color,
        position_x: n.position_x + 20,
        position_y: n.position_y + 20,
        width: n.width,
        height: n.height,
        z_index: maxZ + 1,
        kind: n.kind || 'postit',
        fill_color: n.fill_color || null,
        stroke_color: n.stroke_color || null,
        extra: n.extra || {},
      } as any)
      .select()
      .single();
    if (error) { toast.error(error.message); return; }
    setNotes(arr => [...arr, data as any]);
  }

  function bringToFront(id: string) {
    const maxZ = notes.reduce((m, n) => Math.max(m, n.z_index), 0);
    const note = notes.find(n => n.id === id);
    if (!note || note.z_index === maxZ) return;
    patchNote(id, { z_index: maxZ + 1 });
  }

  async function deleteBoard(b: Board) {
    if (!confirm(`Board "${b.name}" wirklich löschen? Alle Notizen darauf gehen verloren.`)) return;
    const { error } = await supabase.from('note_boards').delete().eq('id', b.id);
    if (error) { toast.error(error.message); return; }
    setBoards(arr => arr.filter(x => x.id !== b.id));
    if (activeBoardId === b.id) setActiveBoardId(boards.find(x => x.id !== b.id)?.id || null);
  }

  return (
    <AppLayout>
      <div className="flex flex-col h-[calc(100vh-8rem)] min-h-[600px] gap-3">
        <div className="flex items-center gap-3">
          <StickyNote className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">Notizen</h1>
          <p className="text-xs text-muted-foreground ml-2 hidden md:block">Digitale Post-its – verschieben, einfärben, hervorheben</p>
        </div>

        <div className="flex gap-3 flex-1 min-h-0">
          {/* Board list */}
          <aside className="w-56 shrink-0 flex flex-col gap-2">
            <Button size="sm" onClick={() => setCreateOpen(true)} className="h-8 text-xs gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Neues Board
            </Button>
            <div className="flex-1 overflow-y-auto space-y-1 rounded border border-border bg-card/40 p-1">
              {loading && <div className="text-xs text-muted-foreground p-2">Laden…</div>}
              {!loading && boards.length === 0 && (
                <div className="text-xs text-muted-foreground p-2">Noch keine Boards.</div>
              )}
              {boards.map(b => (
                <div
                  key={b.id}
                  className={cn(
                    'group flex items-center gap-2 px-2 py-1.5 rounded text-xs cursor-pointer transition-colors',
                    activeBoardId === b.id ? 'bg-primary/15 text-foreground' : 'hover:bg-muted/60 text-muted-foreground'
                  )}
                  onClick={() => setActiveBoardId(b.id)}
                >
                  {b.scope === 'shared' ? <Users className="h-3 w-3 shrink-0" /> : <Lock className="h-3 w-3 shrink-0" />}
                  <span className="flex-1 truncate">{b.name}</span>
                  {b.scope === 'shared' && user?.id === b.owner_id && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setMembersBoard(b); }}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground"
                      title="Mitglieder verwalten"
                    >
                      <UserCog className="h-3 w-3" />
                    </button>
                  )}
                  {user?.id === b.owner_id && (
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteBoard(b); }}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </aside>

          {/* Canvas */}
          <div className="flex-1 flex flex-col min-w-0 rounded border border-border bg-card/30 overflow-hidden relative">
            <div className="flex items-center px-3 py-2 border-b border-border bg-card/50 gap-2 flex-wrap">
              <div className="text-xs text-muted-foreground truncate mr-auto">
                {activeBoard ? activeBoard.name : 'Kein Board ausgewählt'}
                {hasFilter && activeBoard && (
                  <span className="ml-2 text-[10px] text-muted-foreground">
                    · {matchedIds.size} von {notes.length}
                  </span>
                )}
              </div>

              <div className="relative">
                <Search className="h-3 w-3 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Suchen…"
                  className="h-7 text-xs pl-7 pr-7 w-44"
                  disabled={!activeBoard}
                />
                {search && (
                  <button
                    onClick={() => setSearch('')}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label="Suche leeren"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>

              <Popover>
                <PopoverTrigger asChild>
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" disabled={!activeBoard}>
                    <Filter className="h-3 w-3" /> Filter
                    {activeFilterCount > 0 && (
                      <Badge variant="secondary" className="h-4 px-1 text-[10px]">{activeFilterCount}</Badge>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-64 p-3 space-y-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">Post-it Farbe</div>
                    <div className="flex flex-wrap gap-1.5">
                      {(Object.keys(NOTE_COLORS) as NoteColor[]).map(c => {
                        const active = colorFilters.has(c);
                        return (
                          <button
                            key={c}
                            onClick={() => toggleColor(c)}
                            className={cn(
                              'h-6 w-6 rounded-sm border-2 transition-all',
                              active ? 'border-foreground scale-110' : 'border-transparent opacity-70 hover:opacity-100',
                            )}
                            style={{ background: NOTE_COLORS[c] }}
                            title={c}
                          />
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">Marker</div>
                    <div className="flex flex-wrap gap-1.5">
                      {MARKER_COLORS.map(m => {
                        const active = markerFilters.has(m.hex);
                        return (
                          <button
                            key={m.name}
                            onClick={() => toggleMarker(m.hex)}
                            className={cn(
                              'h-6 w-6 rounded-sm border-2 transition-all',
                              active ? 'border-foreground scale-110' : 'border-transparent opacity-70 hover:opacity-100',
                            )}
                            style={{ background: m.hex }}
                            title={`Marker ${m.name}`}
                          />
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <button
                      onClick={() => setPinnedOnly(p => !p)}
                      className={cn(
                        'w-full h-7 rounded-sm border text-xs flex items-center justify-center gap-1.5 transition-colors',
                        pinnedOnly ? 'border-foreground bg-muted text-foreground' : 'border-border text-muted-foreground hover:bg-muted/50',
                      )}
                    >
                      <Pin className={cn('h-3 w-3', pinnedOnly && 'fill-current')} />
                      Nur angeheftete
                    </button>
                  </div>
                  {activeFilterCount > 0 && (
                    <Button size="sm" variant="ghost" onClick={() => { setColorFilters(new Set()); setMarkerFilters(new Set()); setPinnedOnly(false); }} className="w-full h-7 text-xs">
                      Filter zurücksetzen
                    </Button>
                  )}
                </PopoverContent>
              </Popover>

              {hasFilter && (
                <Button size="sm" variant="ghost" onClick={clearFilters} className="h-7 text-xs gap-1.5 px-2">
                  <X className="h-3 w-3" /> Alle
                </Button>
              )}

              {activeBoard?.scope === 'shared' && activeBoard.owner_id === user?.id && (
                <Button size="sm" variant="outline" onClick={() => setMembersBoard(activeBoard)} className="h-7 text-xs gap-1.5">
                  <UserCog className="h-3 w-3" /> Mitglieder
                </Button>
              )}
              <div className="flex items-center gap-0.5 rounded border border-border bg-card/60 p-0.5">
                {([
                  { k: 'postit' as ItemKind, icon: Sticker, title: 'Post-it' },
                  { k: 'text' as ItemKind, icon: Type, title: 'Textfeld' },
                  { k: 'rect' as ItemKind, icon: Square, title: 'Rechteck' },
                  { k: 'rounded' as ItemKind, icon: Square, title: 'Abgerundetes Rechteck', rounded: true },
                  { k: 'circle' as ItemKind, icon: Circle, title: 'Kreis' },
                  { k: 'triangle' as ItemKind, icon: Triangle, title: 'Dreieck' },
                  { k: 'arrow' as ItemKind, icon: ArrowRight, title: 'Pfeil' },
                  { k: 'table' as ItemKind, icon: TableIcon, title: 'Tabelle' },
                ]).map(({ k, icon: Icon, title, rounded }) => (
                  <button
                    key={k}
                    onClick={() => addItem(k)}
                    disabled={!canEdit}
                    className="h-6 w-6 flex items-center justify-center rounded-sm hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent text-muted-foreground hover:text-foreground"
                    title={title}
                  >
                    <Icon className="h-3.5 w-3.5" strokeWidth={rounded ? 1.4 : undefined} />
                  </button>
                ))}
              </div>
            </div>
            <div
              ref={canvasRef}
              onPointerDown={(e) => { if (e.target === e.currentTarget || (e.target as HTMLElement).dataset?.canvasBg) setSelectedId(null); }}
              className="flex-1 relative overflow-auto"
              style={{
                backgroundImage: 'radial-gradient(circle, hsl(var(--border)) 1px, transparent 1px)',
                backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
              }}
            >
              <div
                data-canvas-bg
                onPointerDown={(e) => { if (e.target === e.currentTarget) setSelectedId(null); }}
                className="relative"
                style={{ width: 3000 * zoom, height: 2000 * zoom, transform: `scale(${zoom})`, transformOrigin: '0 0' }}
              >
                {notes.map(n => {
                  const dimmed = hasFilter && !matchedIds.has(n.id);
                  return (
                    <div
                      key={n.id}
                      style={{ opacity: dimmed ? 0.15 : 1, pointerEvents: dimmed ? 'none' : 'auto', transition: 'opacity 0.15s' }}
                    >
                      <CanvasItem
                        selected={selectedId === n.id}
                        onSelect={() => setSelectedId(n.id)}
                        note={n}
                        canEdit={canEdit}
                        zoom={zoom}
                        onChange={(p) => patchNote(n.id, p)}
                        onDelete={() => deleteNote(n.id)}
                        onDuplicate={() => duplicateNote(n)}
                        onBringToFront={() => bringToFront(n.id)}
                      />
                    </div>
                  );
                })}
                {activeBoard && notes.length === 0 && (
                  <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground pointer-events-none">
                    Noch keine Elemente – über die Toolbar oben Post-it, Textfeld, Form, Pfeil oder Tabelle einfügen
                  </div>
                )}
                {activeBoard && notes.length > 0 && hasFilter && matchedIds.size === 0 && (
                  <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground pointer-events-none">
                    Keine Treffer – Filter anpassen
                  </div>
                )}
              </div>
              {/* Zoom controls */}
              {activeBoard && (
                <div className="absolute bottom-3 right-3 flex items-center gap-1 rounded-lg border border-border bg-card/90 shadow-md px-1.5 py-1 backdrop-blur-sm z-50">
                  <button
                    onClick={() => setZoom(z => Math.max(0.25, Math.round((z - 0.25) * 100) / 100))}
                    className="h-6 w-6 flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                    title="Herauszoomen"
                  >
                    −
                  </button>
                  <span className="text-[10px] text-muted-foreground w-10 text-center select-none">{Math.round(zoom * 100)}%</span>
                  <button
                    onClick={() => setZoom(z => Math.min(3, Math.round((z + 0.25) * 100) / 100))}
                    className="h-6 w-6 flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                    title="Reinzoomen"
                  >
                    +
                  </button>
                  <button
                    onClick={() => setZoom(1)}
                    className="h-6 px-1.5 flex items-center justify-center rounded hover:bg-muted text-[10px] text-muted-foreground hover:text-foreground border-l border-border ml-0.5"
                    title="Zoom zurücksetzen"
                  >
                    100%
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-sm">Neues Board</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Name</Label>
              <Input value={newBoard.name} onChange={e => setNewBoard(s => ({ ...s, name: e.target.value }))} className="h-8 text-xs" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Beschreibung (optional)</Label>
              <Textarea value={newBoard.description} onChange={e => setNewBoard(s => ({ ...s, description: e.target.value }))} className="text-xs" rows={2} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Sichtbarkeit</Label>
              <Select value={newBoard.scope} onValueChange={(v: any) => setNewBoard(s => ({ ...s, scope: v }))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="private" className="text-xs">Privat (nur ich)</SelectItem>
                  <SelectItem value="shared" className="text-xs">Geteilt (Mitglieder können bearbeiten)</SelectItem>
                </SelectContent>
              </Select>
              {newBoard.scope === 'shared' && (
                <p className="text-[10px] text-muted-foreground">Mitglieder können später über die Board-Einstellungen hinzugefügt werden.</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setCreateOpen(false)} className="h-8 text-xs">Abbrechen</Button>
            <Button size="sm" onClick={createBoard} disabled={!newBoard.name.trim()} className="h-8 text-xs">Anlegen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {membersBoard && (
        <BoardMembersDialog
          boardId={membersBoard.id}
          boardName={membersBoard.name}
          ownerId={membersBoard.owner_id}
          open={!!membersBoard}
          onOpenChange={(v) => { if (!v) setMembersBoard(null); }}
        />
      )}
    </AppLayout>
  );
}
