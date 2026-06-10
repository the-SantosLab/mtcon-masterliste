import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { formatRelativeTime } from '@/lib/case-utils';
import { Send, Pencil, Trash2, Check, X, Pin, PinOff, Paperclip, Loader2, FileText, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { toastError } from '@/lib/errors';
import { cn, sanitizeFileName } from '@/lib/utils';
import { MtiqButton } from '@/components/MtiqButton';

const BUCKET = 'case-attachments';
const MAX_BYTES = 20 * 1024 * 1024;

interface NoteAttachment {
  id: string;
  note_id: string;
  case_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  uploaded_by: string;
  created_at: string;
}

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
  attachments: NoteAttachment[];
}

interface PendingFile {
  id: string;
  file: File;
  previewUrl?: string;
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
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [editPendingFiles, setEditPendingFiles] = useState<PendingFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);

  const fetchNotes = async () => {
    const { data, error } = await (supabase as any)
      .from('case_notes')
      .select('*')
      .eq('case_id', caseId)
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) { console.error('case_notes load error', error); setLoading(false); return; }
    const rows = (data || []) as NoteRow[];
    const authorIds = Array.from(new Set(rows.map(r => r.author_id).filter(Boolean)));
    const authorMap: Record<string, { display_name: string; short_code: string }> = {};
    if (authorIds.length > 0) {
      const { data: profs } = await supabase
        .from('users_profile')
        .select('id, display_name, short_code')
        .in('id', authorIds);
      (profs || []).forEach((p: any) => { authorMap[p.id] = { display_name: p.display_name, short_code: p.short_code }; });
    }
    const noteIds = rows.map(r => r.id);
    let attMap: Record<string, NoteAttachment[]> = {};
    if (noteIds.length > 0) {
      const { data: atts } = await (supabase as any)
        .from('case_note_attachments')
        .select('*')
        .in('note_id', noteIds)
        .order('created_at', { ascending: true });
      (atts || []).forEach((a: NoteAttachment) => {
        (attMap[a.note_id] ||= []).push(a);
      });
    }
    setNotes(rows.map(r => ({ ...r, author: authorMap[r.author_id] || null, attachments: attMap[r.id] || [] })));
    setLoading(false);
  };

  useEffect(() => {
    fetchNotes();
    const channel = supabase
      .channel(`case-notes-${caseId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'case_notes', filter: `case_id=eq.${caseId}` }, () => fetchNotes())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'case_note_attachments', filter: `case_id=eq.${caseId}` }, () => fetchNotes())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [caseId, refreshKey]);

  // Build signed URLs for image attachments
  useEffect(() => {
    const allImages = notes.flatMap(n => n.attachments.filter(a => (a.mime_type || '').startsWith('image/')));
    const missing = allImages.filter(a => !signedUrls[a.id]);
    if (missing.length === 0) return;
    (async () => {
      const updates: Record<string, string> = {};
      await Promise.all(missing.map(async (a) => {
        const { data } = await supabase.storage.from(BUCKET).createSignedUrl(a.storage_path, 300);
        if (data?.signedUrl) updates[a.id] = data.signedUrl;
      }));
      if (Object.keys(updates).length > 0) {
        setSignedUrls(prev => ({ ...prev, ...updates }));
      }
    })();
  }, [notes]);

  const validateAndAddFiles = (files: File[], target: 'new' | 'edit') => {
    const accepted: PendingFile[] = [];
    for (const f of files) {
      if (f.size > MAX_BYTES) {
        toast.error(`${f.name}: zu groß (max. 20 MB)`);
        continue;
      }
      const isImage = f.type.startsWith('image/');
      accepted.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        file: f,
        previewUrl: isImage ? URL.createObjectURL(f) : undefined,
      });
    }
    if (target === 'new') setPendingFiles(prev => [...prev, ...accepted]);
    else setEditPendingFiles(prev => [...prev, ...accepted]);
  };

  const handlePaste = (e: React.ClipboardEvent, target: 'new' | 'edit') => {
    const items = Array.from(e.clipboardData.items || []);
    const images = items
      .filter(i => i.kind === 'file' && i.type.startsWith('image/'))
      .map(i => i.getAsFile())
      .filter((f): f is File => f !== null)
      .map(f => {
        if (!f.name || f.name === 'image.png') {
          const ext = f.type.split('/')[1] || 'png';
          return new File([f], `screenshot-${Date.now()}.${ext}`, { type: f.type });
        }
        return f;
      });
    if (images.length > 0) {
      e.preventDefault();
      validateAndAddFiles(images, target);
    }
  };

  const handleDrop = (e: React.DragEvent, target: 'new' | 'edit') => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length > 0) validateAndAddFiles(files, target);
  };

  const removePending = (id: string, target: 'new' | 'edit') => {
    const list = target === 'new' ? pendingFiles : editPendingFiles;
    const setter = target === 'new' ? setPendingFiles : setEditPendingFiles;
    const f = list.find(p => p.id === id);
    if (f?.previewUrl) URL.revokeObjectURL(f.previewUrl);
    setter(list.filter(p => p.id !== id));
  };

  const uploadAttachments = async (noteId: string, files: PendingFile[]) => {
    if (files.length === 0) return;
    const rows: any[] = [];
    for (const pf of files) {
      const path = `cases/${caseId}/notes/${noteId}/${Date.now()}_${sanitizeFileName(pf.file.name)}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, pf.file, { contentType: pf.file.type });
      if (upErr) { toast.error(`Upload fehlgeschlagen: ${pf.file.name}`); continue; }
      rows.push({
        note_id: noteId,
        case_id: caseId,
        storage_path: path,
        file_name: pf.file.name,
        mime_type: pf.file.type || null,
        size_bytes: pf.file.size,
        uploaded_by: userId,
      });
    }
    if (rows.length > 0) {
      const { error } = await (supabase as any).from('case_note_attachments').insert(rows);
      if (error) toast.error('Anhang-Eintrag fehlgeschlagen');
    }
  };

  const submit = async () => {
    if ((!text.trim() && pendingFiles.length === 0) || !userId) return;
    setSending(true);
    const body = text.trim() || '(Anhang)';
    const { data, error } = await (supabase as any)
      .from('case_notes')
      .insert({ case_id: caseId, author_id: userId, body })
      .select('id')
      .single();
    if (error || !data) {
      setSending(false);
      toastError(error, 'case_note');
      return;
    }
    await uploadAttachments(data.id, pendingFiles);
    pendingFiles.forEach(p => p.previewUrl && URL.revokeObjectURL(p.previewUrl));
    setPendingFiles([]);
    setText('');
    setSending(false);
    onRefresh?.();
  };

  const saveEdit = async (id: string) => {
    if (!editText.trim() && editPendingFiles.length === 0) return;
    const body = editText.trim() || '(Anhang)';
    const { error } = await (supabase as any)
      .from('case_notes')
      .update({ body, edited_at: new Date().toISOString(), edited_by: userId })
      .eq('id', id);
    if (error) { toast.error('Fehler beim Bearbeiten'); return; }
    await uploadAttachments(id, editPendingFiles);
    editPendingFiles.forEach(p => p.previewUrl && URL.revokeObjectURL(p.previewUrl));
    setEditPendingFiles([]);
    setEditingId(null);
    setEditText('');
    onRefresh?.();
  };

  const removeAttachment = async (att: NoteAttachment) => {
    if (!confirm('Anhang löschen?')) return;
    await supabase.storage.from(BUCKET).remove([att.storage_path]);
    const { error } = await (supabase as any).from('case_note_attachments').delete().eq('id', att.id);
    if (error) { toast.error('Fehler beim Löschen'); return; }
    fetchNotes();
  };

  const remove = async (id: string) => {
    if (!confirm('Notiz wirklich löschen?')) return;
    // Find and clean up storage files first
    const note = notes.find(n => n.id === id);
    if (note && note.attachments.length > 0) {
      await supabase.storage.from(BUCKET).remove(note.attachments.map(a => a.storage_path));
    }
    const { error } = await (supabase as any).from('case_notes').delete().eq('id', id);
    if (error) { toast.error('Fehler beim Löschen'); return; }
    onRefresh?.();
  };

  const togglePin = async (id: string, pinned: boolean) => {
    const { error } = await (supabase as any).from('case_notes').update({ pinned: !pinned }).eq('id', id);
    if (error) { toast.error('Fehler beim Anpinnen'); return; }
    onRefresh?.();
  };

  const downloadAttachment = async (att: NoteAttachment) => {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(att.storage_path, 300, { download: true });
    if (data?.signedUrl) window.open(data.signedUrl, '_blank');
  };

  const openAttachment = async (att: NoteAttachment) => {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(att.storage_path, 300);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank');
  };

  const renderPendingPreview = (files: PendingFile[], target: 'new' | 'edit') => {
    if (files.length === 0) return null;
    return (
      <div className="flex flex-wrap gap-2">
        {files.map(pf => (
          <div key={pf.id} className="relative group border border-border rounded-md bg-muted/30 overflow-hidden">
            {pf.previewUrl ? (
              <img src={pf.previewUrl} alt={pf.file.name} className="h-16 w-16 object-cover" />
            ) : (
              <div className="h-16 w-32 flex items-center gap-1.5 px-2">
                <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-[10px] truncate">{pf.file.name}</span>
              </div>
            )}
            <button
              onClick={() => removePending(pf.id, target)}
              className="absolute top-0 right-0 bg-background/80 hover:bg-destructive hover:text-destructive-foreground rounded-bl px-0.5"
              title="Entfernen"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="rounded-md border border-border bg-card p-5 space-y-4">
      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Notizen</h3>

      {canEdit && (
        <div
          className={cn(
            'space-y-2 rounded-md transition-colors',
            isDragging && 'ring-2 ring-primary bg-primary/5 p-2',
          )}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
          onDrop={(e) => handleDrop(e, 'new')}
        >
          <Textarea
            value={text}
            onChange={e => setText(e.target.value)}
            onPaste={(e) => handlePaste(e, 'new')}
            rows={2}
            placeholder="Notiz hinzufügen — Bilder/Dateien hierher ziehen oder einfügen (Strg+V)"
            className="text-xs font-mono"
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(); }}
          />
          {renderPendingPreview(pendingFiles, 'new')}
          <div className="flex justify-between items-center gap-2">
            <div className="flex items-center gap-1">
              <MtiqButton text={text} onResult={setText} />
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => { if (e.target.files) { validateAndAddFiles(Array.from(e.target.files), 'new'); e.target.value=''; } }}
              />
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => fileInputRef.current?.click()}
                title="Datei anhängen"
              >
                <Paperclip className="h-3 w-3" />
              </Button>
            </div>
            <Button size="sm" onClick={submit} disabled={(!text.trim() && pendingFiles.length === 0) || sending} className="h-7 text-xs">
              {sending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Send className="h-3 w-3 mr-1" />}Hinzufügen
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-xs text-muted-foreground">Laden</p>
      ) : notes.length === 0 ? (
        <p className="text-xs text-muted-foreground">Keine Notizen</p>
      ) : (
        <div className="space-y-0 divide-y divide-border -mx-5">
          {notes.map(n => {
            const canModify = isAdmin || n.author_id === userId;
            const isEditing = editingId === n.id;
            return (
              <div key={n.id} data-compact-row className={cn('px-5 py-3 group', n.pinned && 'bg-primary/5 border-l-2 border-l-primary')}>
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
                  <div
                    className="space-y-2"
                    onDragOver={(e) => { e.preventDefault(); }}
                    onDrop={(e) => handleDrop(e, 'edit')}
                  >
                    <Textarea
                      value={editText}
                      onChange={e => setEditText(e.target.value)}
                      onPaste={(e) => handlePaste(e, 'edit')}
                      rows={2}
                      className="text-xs font-mono"
                    />
                    {renderPendingPreview(editPendingFiles, 'edit')}
                    <div className="flex justify-between items-center gap-1">
                      <div className="flex items-center gap-1">
                        <MtiqButton text={editText} onResult={setEditText} />
                        <input
                          ref={editFileInputRef}
                          type="file"
                          multiple
                          className="hidden"
                          onChange={(e) => { if (e.target.files) { validateAndAddFiles(Array.from(e.target.files), 'edit'); e.target.value=''; } }}
                        />
                        <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => editFileInputRef.current?.click()} title="Datei anhängen">
                          <Paperclip className="h-3 w-3" />
                        </Button>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => { setEditingId(null); setEditText(''); editPendingFiles.forEach(p => p.previewUrl && URL.revokeObjectURL(p.previewUrl)); setEditPendingFiles([]); }}>
                          <X className="h-3 w-3 mr-1" />Abbrechen
                        </Button>
                        <Button size="sm" className="h-6 text-xs" onClick={() => saveEdit(n.id)} disabled={!editText.trim() && editPendingFiles.length === 0}>
                          <Check className="h-3 w-3 mr-1" />Speichern
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs text-foreground whitespace-pre-wrap leading-relaxed flex-1 font-mono">{n.body}</p>
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
                    {n.attachments.length > 0 && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {n.attachments.map(att => {
                          const isImage = (att.mime_type || '').startsWith('image/');
                          const canRemoveAtt = isAdmin || att.uploaded_by === userId;
                          if (isImage) {
                            const url = signedUrls[att.id];
                            return (
                              <div key={att.id} className="relative group/att border border-border rounded-md overflow-hidden bg-muted/30">
                                {url ? (
                                  <img
                                    src={url}
                                    alt={att.file_name}
                                    onClick={() => openAttachment(att)}
                                    className="max-h-32 max-w-[240px] object-cover cursor-pointer hover:opacity-90"
                                  />
                                ) : (
                                  <div className="h-20 w-32 flex items-center justify-center">
                                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                  </div>
                                )}
                                {canRemoveAtt && canEdit && (
                                  <button
                                    onClick={() => removeAttachment(att)}
                                    className="absolute top-0 right-0 bg-background/80 hover:bg-destructive hover:text-destructive-foreground rounded-bl px-0.5 opacity-0 group-hover/att:opacity-100"
                                    title="Anhang löschen"
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                )}
                              </div>
                            );
                          }
                          return (
                            <div key={att.id} className="flex items-center gap-1.5 border border-border rounded-md bg-muted/30 px-2 py-1 group/att">
                              <FileText className="h-3 w-3 text-muted-foreground shrink-0" />
                              <button onClick={() => openAttachment(att)} className="text-[11px] text-primary hover:underline max-w-[180px] truncate">
                                {att.file_name}
                              </button>
                              <button onClick={() => downloadAttachment(att)} className="text-muted-foreground hover:text-foreground" title="Herunterladen">
                                <Download className="h-3 w-3" />
                              </button>
                              {canRemoveAtt && canEdit && (
                                <button onClick={() => removeAttachment(att)} className="text-muted-foreground hover:text-destructive opacity-0 group-hover/att:opacity-100" title="Löschen">
                                  <X className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          );
                        })}
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
