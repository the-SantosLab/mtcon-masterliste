import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { formatRelativeTime } from '@/lib/case-utils';
import { Send, Pencil, Trash2, Check, X, Pin, PinOff, Mail, Paperclip } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface NoteRow {
  id: string;
  case_id: string;
  author_id: string;
  body: string;
  created_at: string;
  edited_at: string | null;
  edited_by: string | null;
  pinned: boolean;
  author: { display_name: string; short_code: string } | null;
}

interface EmailRow {
  id: string;
  case_id: string;
  from_email: string;
  from_name: string | null;
  subject: string;
  body_plain: string;
  received_at: string;
  attachments: { id: string; file_name: string; storage_path: string }[];
}

interface CaseNotesProps {
  caseId: string;
  canEdit: boolean;
  userId: string;
  isAdmin?: boolean;
  refreshKey?: number;
  onRefresh?: () => void;
}

export function CaseNotes({ caseId, canEdit, userId, isAdmin, refreshKey, onRefresh }: CaseNotesProps) {
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [emails, setEmails] = useState<EmailRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  const fetchAll = async () => {
    const [notesRes, emailsRes] = await Promise.all([
      (supabase as any)
        .from('case_notes')
        .select('*')
        .eq('case_id', caseId)
        .order('pinned', { ascending: false })
        .order('created_at', { ascending: false }),
      (supabase as any)
        .from('case_emails')
        .select('id, case_id, from_email, from_name, subject, body_plain, received_at, case_email_attachments(id, file_name, storage_path)')
        .eq('case_id', caseId)
        .order('received_at', { ascending: false }),
    ]);

    const rows = (notesRes.data || []) as NoteRow[];
    const authorIds = Array.from(new Set(rows.map(r => r.author_id).filter(Boolean)));
    const authorMap: Record<string, { display_name: string; short_code: string }> = {};
    if (authorIds.length > 0) {
      const { data: profs } = await supabase
        .from('users_profile')
        .select('id, display_name, short_code')
        .in('id', authorIds);
      (profs || []).forEach((p: any) => { authorMap[p.id] = { display_name: p.display_name, short_code: p.short_code }; });
    }
    setNotes(rows.map(r => ({ ...r, author: authorMap[r.author_id] || null })));
    setEmails(((emailsRes.data || []) as any[]).map(e => ({
      id: e.id,
      case_id: e.case_id,
      from_email: e.from_email,
      from_name: e.from_name,
      subject: e.subject,
      body_plain: e.body_plain,
      received_at: e.received_at,
      attachments: e.case_email_attachments || [],
    })));
    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
    const channel = supabase
      .channel(`case-notes-${caseId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'case_notes', filter: `case_id=eq.${caseId}` }, () => fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'case_emails', filter: `case_id=eq.${caseId}` }, () => fetchAll())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [caseId, refreshKey]);

  const submit = async () => {
    if (!text.trim() || !userId) return;
    setSending(true);
    const { error } = await (supabase as any).from('case_notes').insert({
      case_id: caseId,
      author_id: userId,
      body: text.trim(),
    });
    setSending(false);
    if (error) { toast.error('Fehler beim Speichern'); return; }
    setText('');
    onRefresh?.();
  };

  const saveEdit = async (id: string) => {
    if (!editText.trim()) return;
    const { error } = await (supabase as any)
      .from('case_notes')
      .update({ body: editText.trim(), edited_at: new Date().toISOString(), edited_by: userId })
      .eq('id', id);
    if (error) { toast.error('Fehler beim Bearbeiten'); return; }
    setEditingId(null);
    setEditText('');
    onRefresh?.();
  };

  const remove = async (id: string) => {
    if (!confirm('Notiz wirklich löschen?')) return;
    const { error } = await (supabase as any).from('case_notes').delete().eq('id', id);
    if (error) { toast.error('Fehler beim Löschen'); return; }
    onRefresh?.();
  };

  const togglePin = async (id: string, pinned: boolean) => {
    const { error } = await (supabase as any).from('case_notes').update({ pinned: !pinned }).eq('id', id);
    if (error) { toast.error('Fehler beim Anpinnen'); return; }
    onRefresh?.();
  };

  const downloadAttachment = async (path: string, name: string) => {
    const { data, error } = await supabase.storage.from('case-attachments').createSignedUrl(path, 300);
    if (error || !data) { toast.error('Download fehlgeschlagen'); return; }
    const a = document.createElement('a');
    a.href = data.signedUrl;
    a.download = name;
    a.click();
  };

  // Merge emails as items into the same chronological list (after pinned notes)
  type Item =
    | { kind: 'note'; ts: string; pinned: boolean; data: NoteRow }
    | { kind: 'email'; ts: string; pinned: false; data: EmailRow };

  const items: Item[] = [
    ...notes.map(n => ({ kind: 'note' as const, ts: n.created_at, pinned: n.pinned, data: n })),
    ...emails.map(e => ({ kind: 'email' as const, ts: e.received_at, pinned: false as const, data: e })),
  ].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return new Date(b.ts).getTime() - new Date(a.ts).getTime();
  });

  return (
    <div className="rounded-md border border-border bg-card p-5 space-y-4">
      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Notizen</h3>

      {canEdit && (
        <div className="space-y-2">
          <Textarea
            value={text}
            onChange={e => setText(e.target.value)}
            rows={2}
            placeholder="Notiz hinzufügen"
            className="text-xs"
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(); }}
          />
          <div className="flex justify-end">
            <Button size="sm" onClick={submit} disabled={!text.trim() || sending} className="h-7 text-xs">
              <Send className="h-3 w-3 mr-1" />Hinzufügen
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-xs text-muted-foreground">Laden</p>
      ) : items.length === 0 ? (
        <p className="text-xs text-muted-foreground">Keine Notizen</p>
      ) : (
        <div className="space-y-0 divide-y divide-border -mx-5">
          {items.map(item => {
            if (item.kind === 'email') {
              const e = item.data;
              return (
                <div key={`e-${e.id}`} className="px-5 py-3 group bg-muted/20">
                  <div className="flex items-baseline justify-between gap-2 mb-1">
                    <span className="text-xs font-medium text-foreground inline-flex items-center gap-1.5">
                      <Mail className="h-3 w-3 text-muted-foreground" />
                      {e.from_name ? `${e.from_name} <${e.from_email}>` : e.from_email}
                      <span className="text-[9px] uppercase tracking-wide text-muted-foreground font-medium">Email</span>
                    </span>
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      {formatRelativeTime(e.received_at)}
                    </span>
                  </div>
                  <p className="text-xs font-medium text-foreground mb-1">{e.subject}</p>
                  <p className="text-xs text-foreground whitespace-pre-wrap leading-relaxed">{e.body_plain || '(kein Text)'}</p>
                  {e.attachments.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {e.attachments.map(a => (
                        <button
                          key={a.id}
                          onClick={() => downloadAttachment(a.storage_path, a.file_name)}
                          className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-background border border-border hover:bg-muted text-foreground"
                        >
                          <Paperclip className="h-3 w-3" />{a.file_name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            }
            const n = item.data;
            const canModify = isAdmin || n.author_id === userId;
            const isEditing = editingId === n.id;
            return (
              <div key={n.id} className={cn('px-5 py-3 group', n.pinned && 'bg-primary/5 border-l-2 border-l-primary')}>
                <div className="flex items-baseline justify-between gap-2 mb-1">
                  <span className="text-xs font-medium text-foreground inline-flex items-center gap-1.5">
                    {n.pinned && <Pin className="h-3 w-3 text-primary fill-primary/30" />}
                    {n.author?.short_code || '–'}
                    {n.pinned && <span className="text-[9px] uppercase tracking-wide text-primary font-medium">Angepinnt</span>}
                  </span>
                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    {formatRelativeTime(n.created_at)}
                    {n.edited_at && <span className="ml-1 italic">(bearb.)</span>}
                  </span>
                </div>
                {isEditing ? (
                  <div className="space-y-2">
                    <Textarea value={editText} onChange={e => setEditText(e.target.value)} rows={2} className="text-xs" />
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => { setEditingId(null); setEditText(''); }}>
                        <X className="h-3 w-3 mr-1" />Abbrechen
                      </Button>
                      <Button size="sm" className="h-6 text-xs" onClick={() => saveEdit(n.id)} disabled={!editText.trim()}>
                        <Check className="h-3 w-3 mr-1" />Speichern
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs text-foreground whitespace-pre-wrap leading-relaxed flex-1">{n.body}</p>
                    {canModify && canEdit && (
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <button
                          onClick={() => togglePin(n.id, n.pinned)}
                          className="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                          title={n.pinned ? 'Lösen' : 'Anpinnen'}
                        >
                          {n.pinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
                        </button>
                        <button
                          onClick={() => { setEditingId(n.id); setEditText(n.body); }}
                          className="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                          title="Bearbeiten"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => remove(n.id)}
                          className="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-destructive"
                          title="Löschen"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
