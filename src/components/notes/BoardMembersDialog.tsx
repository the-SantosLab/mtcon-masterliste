import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Check, Trash2, UserPlus, Users } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Props {
  boardId: string;
  boardName: string;
  ownerId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

interface ProfileLite {
  id: string;
  display_name: string;
  short_code: string;
}

interface Member {
  id: string;
  user_id: string;
  role: 'view' | 'edit';
  profile?: ProfileLite;
}

export function BoardMembersDialog({ boardId, boardName, ownerId, open, onOpenChange }: Props) {
  const { user } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [profiles, setProfiles] = useState<ProfileLite[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [inviteRole, setInviteRole] = useState<'view' | 'edit'>('edit');
  const isOwner = user?.id === ownerId;

  useEffect(() => {
    if (!open) return;
    load();
  }, [open, boardId]);

  async function load() {
    setLoading(true);
    const [m, p] = await Promise.all([
      supabase.from('note_board_members').select('*').eq('board_id', boardId),
      supabase.from('users_profile').select('id, display_name, short_code').eq('active', true).order('display_name'),
    ]);
    if (m.error) toast.error(m.error.message);
    if (p.error) toast.error(p.error.message);
    const profs = (p.data || []) as ProfileLite[];
    setProfiles(profs);
    const profMap = new Map(profs.map(x => [x.id, x]));
    setMembers(((m.data || []) as any[]).map(x => ({ ...x, profile: profMap.get(x.user_id) })));
    setLoading(false);
  }

  function toggleSelect(userId: string) {
    setSelectedIds(prev =>
      prev.includes(userId) ? prev.filter(x => x !== userId) : [...prev, userId],
    );
  }

  async function inviteSelected() {
    if (selectedIds.length === 0) return;
    setAdding(true);
    const rows = selectedIds.map(uid => ({ board_id: boardId, user_id: uid, role: inviteRole }));
    const { error } = await supabase.from('note_board_members').insert(rows);
    setAdding(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`${selectedIds.length} Mitglied(er) eingeladen`);
    setSelectedIds([]);
    setPickerOpen(false);
    load();
  }

  const [savingMemberId, setSavingMemberId] = useState<string | null>(null);

  async function changeRole(memberId: string, role: 'view' | 'edit') {
    const target = members.find(m => m.id === memberId);
    if (!target || target.role === role) return;
    setSavingMemberId(memberId);
    const prev = members;
    setMembers(arr => arr.map(m => m.id === memberId ? { ...m, role } : m));
    const { error } = await supabase.from('note_board_members').update({ role }).eq('id', memberId);
    setSavingMemberId(null);
    if (error) { setMembers(prev); toast.error(error.message); return; }
    toast.success(`Berechtigung auf „${role === 'edit' ? 'Bearbeiten' : 'Lesen'}" geändert`);
  }

  async function removeMember(memberId: string) {
    if (!confirm('Mitglied wirklich entfernen?')) return;
    const prev = members;
    setMembers(arr => arr.filter(m => m.id !== memberId));
    const { error } = await supabase.from('note_board_members').delete().eq('id', memberId);
    if (error) { setMembers(prev); toast.error(error.message); }
  }

  const candidates = profiles.filter(
    p => p.id !== ownerId && !members.some(m => m.user_id === p.id),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm flex items-center gap-2">
            <Users className="h-4 w-4" /> Mitglieder – {boardName}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Mitglieder mit Rolle „Bearbeiten" können Notizen erstellen und ändern. „Lesen" gewährt nur Ansicht.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {isOwner && (
            <Popover open={pickerOpen} onOpenChange={(v) => { setPickerOpen(v); if (!v) setSelectedIds([]); }}>
              <PopoverTrigger asChild>
                <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 w-full justify-start" disabled={adding}>
                  <UserPlus className="h-3.5 w-3.5" />
                  Nutzer einladen{candidates.length > 0 ? ` (${candidates.length} verfügbar)` : ''}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
                <Command shouldFilter>
                  <CommandInput placeholder="Nach Name oder Kürzel suchen…" className="h-8 text-xs" />
                  <CommandList className="max-h-60">
                    <CommandEmpty className="text-xs py-3 px-2 text-muted-foreground">Keine Nutzer gefunden.</CommandEmpty>
                    <CommandGroup>
                      {candidates.map(p => {
                        const checked = selectedIds.includes(p.id);
                        return (
                          <CommandItem
                            key={p.id}
                            value={`${p.display_name} ${p.short_code}`}
                            onSelect={() => toggleSelect(p.id)}
                            className="text-xs gap-2"
                          >
                            <Checkbox checked={checked} className="h-3.5 w-3.5" />
                            <span className="flex-1 truncate">{p.display_name}</span>
                            <span className="text-muted-foreground ml-2">{p.short_code}</span>
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </CommandList>
                  <div className="flex items-center gap-2 border-t border-border p-2 bg-muted/30">
                    <span className="text-[10px] text-muted-foreground">
                      {selectedIds.length} ausgewählt
                    </span>
                    <Select value={inviteRole} onValueChange={(v: 'view' | 'edit') => setInviteRole(v)}>
                      <SelectTrigger className="h-7 w-[110px] text-xs ml-auto"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="edit" className="text-xs">Bearbeiten</SelectItem>
                        <SelectItem value="view" className="text-xs">Lesen</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      onClick={inviteSelected}
                      disabled={selectedIds.length === 0 || adding}
                      className="h-7 text-xs gap-1.5"
                    >
                      <Check className="h-3 w-3" /> Einladen
                    </Button>
                  </div>
                </Command>
              </PopoverContent>
            </Popover>
          )}

          <div className="rounded border border-border divide-y divide-border max-h-72 overflow-y-auto">
            <div className="flex items-center gap-2 px-3 py-2 bg-muted/30">
              <span className="text-xs flex-1 truncate font-medium">Besitzer</span>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Vollzugriff</span>
            </div>
            {loading && <div className="text-xs text-muted-foreground px-3 py-3">Laden…</div>}
            {!loading && members.length === 0 && (
              <div className="text-xs text-muted-foreground px-3 py-3">Noch keine zusätzlichen Mitglieder.</div>
            )}
            {members.map(m => {
              const isSaving = savingMemberId === m.id;
              return (
                <div key={m.id} className="flex items-center gap-2 px-3 py-2">
                  <div className="flex-1 min-w-2">
                    <div className="text-xs truncate">{m.profile?.display_name || m.user_id}</div>
                    {m.profile?.short_code && (
                      <div className="text-[10px] text-muted-foreground">{m.profile.short_code}</div>
                    )}
                  </div>
                  {isOwner ? (
                    <div className="inline-flex rounded border border-border overflow-hidden bg-muted/40">
                      <button
                        onClick={() => changeRole(m.id, 'edit')}
                        disabled={isSaving}
                        className={cn(
                          'text-[10px] px-2 py-1 transition-colors',
                          m.role === 'edit'
                            ? 'bg-primary text-primary-foreground font-medium'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                          isSaving && 'opacity-50 cursor-wait',
                        )}
                      >
                        Bearbeiten
                      </button>
                      <button
                        onClick={() => changeRole(m.id, 'view')}
                        disabled={isSaving}
                        className={cn(
                          'text-[10px] px-2 py-1 transition-colors border-l border-border',
                          m.role === 'view'
                            ? 'bg-primary text-primary-foreground font-medium'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                          isSaving && 'opacity-50 cursor-wait',
                        )}
                      >
                        Lesen
                      </button>
                    </div>
                  ) : (
                    <span className="text-[10px] text-muted-foreground px-2 py-1">
                      {m.role === 'edit' ? 'Bearbeiten' : 'Lesen'}
                    </span>
                  )}
                  {isOwner && (
                    <button
                      onClick={() => removeMember(m.id)}
                      className="p-1 text-muted-foreground hover:text-destructive"
                      aria-label="Entfernen"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <DialogFooter>
          <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)} className="h-8 text-xs">
            Schließen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
