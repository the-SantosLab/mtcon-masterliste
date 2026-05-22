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
import { Plus, StickyNote, Trash2, Users, Lock, UserCog, Search, Filter, Pin, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { PostIt, NOTE_COLORS, type NoteColor, type NoteData } from '@/components/notes/PostIt';
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

  const canvasRef = useRef<HTMLDivElement>(null);

  const activeBoard = boards.find(b => b.id === activeBoardId) || null;
  const canEdit = !!(activeBoard && user && (activeBoard.owner_id === user.id || activeBoard.scope === 'shared'));

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

  async function addNote() {
    if (!user || !activeBoardId) return;
    const maxZ = notes.reduce((m, n) => Math.max(m, n.z_index), 0);
    const offset = (notes.length % 6) * 24;
    const scroll = canvasRef.current;
    const cx = (scroll?.scrollLeft || 0) + 40 + offset;
    const cy = (scroll?.scrollTop || 0) + 40 + offset;
    const color = COLOR_CYCLE[notes.length % COLOR_CYCLE.length];
    const { data, error } = await supabase
      .from('notes')
      .insert({
        board_id: activeBoardId,
        author_id: user.id,
        content: '',
        color,
        position_x: cx,
        position_y: cy,
        z_index: maxZ + 1,
      })
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

  async function duplicateNote(n: NoteData) {
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
      })
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
          <div className="flex-1 flex flex-col min-w-0 rounded border border-border bg-card/30 overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-card/50 gap-2">
              <div className="text-xs text-muted-foreground truncate">
                {activeBoard ? activeBoard.name : 'Kein Board ausgewählt'}
              </div>
              <div className="flex items-center gap-1.5">
                {activeBoard?.scope === 'shared' && activeBoard.owner_id === user?.id && (
                  <Button size="sm" variant="outline" onClick={() => setMembersBoard(activeBoard)} className="h-7 text-xs gap-1.5">
                    <UserCog className="h-3 w-3" /> Mitglieder
                  </Button>
                )}
                <Button size="sm" onClick={addNote} disabled={!canEdit} className="h-7 text-xs gap-1.5">
                  <Plus className="h-3 w-3" /> Post-it
                </Button>
              </div>
            </div>
            <div
              ref={canvasRef}
              className="flex-1 relative overflow-auto"
              style={{
                backgroundImage: 'radial-gradient(circle, hsl(var(--border)) 1px, transparent 1px)',
                backgroundSize: '24px 24px',
              }}
            >
              <div className="relative" style={{ width: 3000, height: 2000 }}>
                {notes.map(n => (
                  <PostIt
                    key={n.id}
                    note={n}
                    canEdit={canEdit}
                    onChange={(p) => patchNote(n.id, p)}
                    onDelete={() => deleteNote(n.id)}
                    onDuplicate={() => duplicateNote(n)}
                    onBringToFront={() => bringToFront(n.id)}
                  />
                ))}
                {activeBoard && notes.length === 0 && (
                  <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground pointer-events-none">
                    Noch keine Post-its – über "+ Post-it" hinzufügen
                  </div>
                )}
              </div>
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
