import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { UserAvatar } from '@/components/UserAvatar';
import { Paperclip, Smile, Send, Loader2, X, Trash2, Pencil, Check, Download, FileText } from 'lucide-react';
import { cn, sanitizeFileName } from '@/lib/utils';
import { toast } from 'sonner';

const BUCKET = 'case-attachments';
const MAX_BYTES = 20 * 1024 * 1024;

const EMOJIS = ['👍','👌','✅','❌','❤️','🔥','🎉','🙌','👀','🙏','💡','⚠️','📌','📎','✏️','🚀','😀','😂','😊','😉','😍','🤔','😅','😢','😡','🙃','👏','💯','✨','📷'];

interface ChatAttachment {
  id: string; message_id: string; case_id: string; storage_path: string;
  file_name: string; mime_type: string | null; size_bytes: number | null;
  uploaded_by: string; created_at: string;
}
interface ChatMessage {
  id: string; case_id: string; author_id: string; body: string;
  created_at: string; edited_at: string | null; deleted_at: string | null;
  author?: { display_name: string; short_code: string; avatar_url: string | null } | null;
  attachments: ChatAttachment[];
}
interface PendingFile { id: string; file: File; previewUrl?: string }

interface Props {
  caseId: string;
  canWrite: boolean;
}

export function CaseChat({ caseId, canWrite }: Props) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [pending, setPending] = useState<PendingFile[]>([]);
  const [signed, setSigned] = useState<Record<string, string>>({});
  const [isAdmin, setIsAdmin] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Check admin once
  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const { data } = await (supabase as any).from('user_roles').select('role').eq('user_id', user.id).eq('role','admin').maybeSingle();
      setIsAdmin(!!data);
    })();
  }, [user?.id]);

  const fetchMessages = useCallback(async () => {
    const { data: msgs, error } = await (supabase as any)
      .from('case_chat_messages')
      .select('*')
      .eq('case_id', caseId)
      .order('created_at', { ascending: true })
      .limit(500);
    if (error) { console.error(error); setLoading(false); return; }
    const rows: ChatMessage[] = (msgs || []).map((m: any) => ({ ...m, attachments: [] }));
    const ids = rows.map(r => r.id);
    if (ids.length) {
      const { data: atts } = await (supabase as any)
        .from('case_chat_attachments')
        .select('*')
        .in('message_id', ids);
      const byMsg: Record<string, ChatAttachment[]> = {};
      (atts || []).forEach((a: any) => { (byMsg[a.message_id] ||= []).push(a); });
      rows.forEach(r => { r.attachments = byMsg[r.id] || []; });
    }
    const authorIds = Array.from(new Set(rows.map(r => r.author_id).filter(Boolean)));
    if (authorIds.length) {
      const { data: profs } = await (supabase as any).from('users_profile')
        .select('id, display_name, short_code, avatar_url').in('id', authorIds);
      const map: Record<string, any> = {};
      (profs || []).forEach((p: any) => { map[p.id] = p; });
      rows.forEach(r => { r.author = map[r.author_id] || null; });
    }
    setMessages(rows);
    setLoading(false);
    // sign image attachments
    const toSign = rows.flatMap(r => r.attachments).filter(a => (a.mime_type || '').startsWith('image/'));
    if (toSign.length) {
      const { data: sd } = await (supabase as any).storage.from(BUCKET).createSignedUrls(toSign.map(a => a.storage_path), 300);
      const map: Record<string, string> = {};
      (sd || []).forEach((s: any, i: number) => { if (s?.signedUrl) map[toSign[i].id] = s.signedUrl; });
      setSigned(prev => ({ ...prev, ...map }));
    }
  }, [caseId]);

  useEffect(() => { fetchMessages(); }, [fetchMessages]);

  // Realtime
  useEffect(() => {
    const ch = supabase.channel(`case-chat-${caseId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'case_chat_messages', filter: `case_id=eq.${caseId}` }, () => fetchMessages())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'case_chat_attachments', filter: `case_id=eq.${caseId}` }, () => fetchMessages())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [caseId, fetchMessages]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length]);

  const addFiles = (files: FileList | File[]) => {
    const arr = Array.from(files);
    const added: PendingFile[] = [];
    for (const f of arr) {
      if (f.size > MAX_BYTES) { toast.error(`${f.name}: max. 20 MB`); continue; }
      const id = crypto.randomUUID();
      const previewUrl = f.type.startsWith('image/') ? URL.createObjectURL(f) : undefined;
      added.push({ id, file: f, previewUrl });
    }
    setPending(prev => [...prev, ...added]);
  };

  const onPaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.kind === 'file') {
        const f = it.getAsFile();
        if (f) {
          const ext = (f.type.split('/')[1] || 'png');
          const named = f.name && f.name !== 'image.png' ? f : new File([f], `screenshot-${Date.now()}.${ext}`, { type: f.type });
          files.push(named);
        }
      }
    }
    if (files.length) { e.preventDefault(); addFiles(files); }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  };

  const send = async () => {
    if (!user?.id) return;
    const body = text.trim();
    if (!body && pending.length === 0) return;
    setSending(true);
    try {
      const { data: ins, error } = await (supabase as any)
        .from('case_chat_messages')
        .insert({ case_id: caseId, author_id: user.id, body })
        .select('id').single();
      if (error) throw error;
      const msgId = ins.id;
      for (const p of pending) {
        const path = `cases/${caseId}/chat/${msgId}/${Date.now()}_${sanitizeFileName(p.file.name)}`;
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, p.file, { contentType: p.file.type });
        if (upErr) { toast.error(`Upload ${p.file.name}: ${upErr.message}`); continue; }
        await (supabase as any).from('case_chat_attachments').insert({
          message_id: msgId, case_id: caseId, storage_path: path,
          file_name: p.file.name, mime_type: p.file.type, size_bytes: p.file.size,
          uploaded_by: user.id,
        });
      }
      // cleanup
      pending.forEach(p => p.previewUrl && URL.revokeObjectURL(p.previewUrl));
      setPending([]); setText('');
    } catch (e: any) {
      toast.error(e.message || 'Senden fehlgeschlagen');
    } finally { setSending(false); }
  };

  const saveEdit = async (id: string) => {
    const body = editText.trim();
    if (!body) return;
    const { error } = await (supabase as any).from('case_chat_messages')
      .update({ body, edited_at: new Date().toISOString() }).eq('id', id);
    if (error) toast.error(error.message);
    setEditId(null); setEditText('');
  };

  const deleteMsg = async (m: ChatMessage) => {
    if (!confirm('Nachricht löschen?')) return;
    // try storage cleanup
    if (m.attachments.length) {
      await supabase.storage.from(BUCKET).remove(m.attachments.map(a => a.storage_path)).catch(() => {});
    }
    const { error } = await (supabase as any).from('case_chat_messages').delete().eq('id', m.id);
    if (error) toast.error(error.message);
  };

  const grouped = useMemo(() => {
    const out: { day: string; items: ChatMessage[] }[] = [];
    for (const m of messages) {
      const d = new Date(m.created_at);
      const day = d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: 'long', year: 'numeric' });
      const last = out[out.length - 1];
      if (last && last.day === day) last.items.push(m);
      else out.push({ day, items: [m] });
    }
    return out;
  }, [messages]);

  const insertEmoji = (e: string) => {
    setText(prev => prev + e);
    requestAnimationFrame(() => taRef.current?.focus());
  };

  return (
    <div className="rounded-md border border-border bg-card flex flex-col" style={{ maxHeight: '60vh' }}>
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Chat</h3>
        <span className="text-[10px] text-muted-foreground">{messages.length} Nachrichten</span>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-4 min-h-[200px]">
        {loading ? (
          <div className="flex items-center justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
        ) : messages.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">Noch keine Nachrichten. Starte das Gespräch.</p>
        ) : grouped.map(g => (
          <div key={g.day} className="space-y-2">
            <div className="flex items-center gap-2 my-2">
              <div className="h-px flex-1 bg-border" />
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{g.day}</span>
              <div className="h-px flex-1 bg-border" />
            </div>
            {g.items.map(m => {
              const mine = m.author_id === user?.id;
              const time = new Date(m.created_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
              return (
                <div key={m.id} className="flex gap-2 group">
                  <UserAvatar user={m.author} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-xs font-medium text-foreground">{m.author?.display_name || '—'}</span>
                      <span className="text-[10px] text-muted-foreground">{time}</span>
                      {m.edited_at && <span className="text-[10px] text-muted-foreground italic">(bearbeitet)</span>}
                      {(mine || isAdmin) && editId !== m.id && (
                        <span className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                          {mine && (
                            <button onClick={() => { setEditId(m.id); setEditText(m.body); }} className="text-muted-foreground hover:text-foreground" title="Bearbeiten">
                              <Pencil className="h-3 w-3" />
                            </button>
                          )}
                          <button onClick={() => deleteMsg(m)} className="text-muted-foreground hover:text-destructive" title="Löschen">
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </span>
                      )}
                    </div>
                    {editId === m.id ? (
                      <div className="mt-1 space-y-1">
                        <Textarea value={editText} onChange={e => setEditText(e.target.value)} className="text-xs min-h-[50px]" autoFocus />
                        <div className="flex gap-1">
                          <Button size="sm" className="h-6 text-xs" onClick={() => saveEdit(m.id)}><Check className="h-3 w-3 mr-1" />Speichern</Button>
                          <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => { setEditId(null); setEditText(''); }}><X className="h-3 w-3 mr-1" />Abbrechen</Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {m.body && <p className="text-xs text-foreground whitespace-pre-wrap break-words [overflow-wrap:anywhere] leading-relaxed mt-0.5">{m.body}</p>}
                        {m.attachments.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-2">
                            {m.attachments.map(a => {
                              const isImg = (a.mime_type || '').startsWith('image/');
                              if (isImg && signed[a.id]) {
                                return (
                                  <a key={a.id} href={signed[a.id]} target="_blank" rel="noreferrer" className="block">
                                    <img src={signed[a.id]} alt={a.file_name} className="max-h-48 max-w-[260px] rounded border border-border object-contain bg-muted" />
                                  </a>
                                );
                              }
                              return (
                                <a key={a.id} href={signed[a.id] || '#'} target="_blank" rel="noreferrer"
                                   onClick={async (e) => {
                                     if (!signed[a.id]) {
                                       e.preventDefault();
                                       const { data } = await (supabase as any).storage.from(BUCKET).createSignedUrl(a.storage_path, 300);
                                       if (data?.signedUrl) window.open(data.signedUrl, '_blank');
                                     }
                                   }}
                                   className="inline-flex items-center gap-1.5 px-2 py-1 rounded border border-border bg-muted/30 text-xs hover:bg-muted">
                                  <FileText className="h-3 w-3" /> <span className="truncate max-w-[180px]">{a.file_name}</span>
                                  <Download className="h-3 w-3 text-muted-foreground" />
                                </a>
                              );
                            })}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {canWrite && (
        <div className="border-t border-border p-2 space-y-2">
          {pending.length > 0 && (
            <div className="flex flex-wrap gap-2 px-1">
              {pending.map(p => (
                <div key={p.id} className="relative group">
                  {p.previewUrl ? (
                    <img src={p.previewUrl} className="h-14 w-14 object-cover rounded border border-border" alt="" />
                  ) : (
                    <div className="h-14 px-2 flex items-center gap-1 rounded border border-border bg-muted text-[11px]">
                      <FileText className="h-3 w-3" /><span className="truncate max-w-[120px]">{p.file.name}</span>
                    </div>
                  )}
                  <button
                    onClick={() => { p.previewUrl && URL.revokeObjectURL(p.previewUrl); setPending(prev => prev.filter(x => x.id !== p.id)); }}
                    className="absolute -top-1.5 -right-1.5 bg-background border border-border rounded-full p-0.5 opacity-0 group-hover:opacity-100">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div
            className={cn('relative rounded border border-input bg-background', dragOver && 'ring-2 ring-primary')}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
          >
            <Textarea
              ref={taRef}
              value={text}
              onChange={e => setText(e.target.value)}
              onPaste={onPaste}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
              placeholder="Nachricht schreiben… (Strg+V für Screenshot, Enter zum Senden)"
              className="text-xs min-h-[56px] max-h-[200px] border-0 focus-visible:ring-0 resize-none"
              disabled={sending}
            />
            <div className="flex items-center justify-between px-2 pb-1.5">
              <div className="flex items-center gap-1">
                <input ref={fileRef} type="file" multiple className="hidden" onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value=''; }} />
                <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => fileRef.current?.click()} title="Datei anhängen">
                  <Paperclip className="h-3.5 w-3.5" />
                </Button>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button type="button" size="icon" variant="ghost" className="h-7 w-7" title="Emoji"><Smile className="h-3.5 w-3.5" /></Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-2" align="start">
                    <div className="grid grid-cols-8 gap-1">
                      {EMOJIS.map(e => (
                        <button key={e} type="button" onClick={() => insertEmoji(e)} className="text-lg hover:bg-muted rounded p-1">{e}</button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              <Button size="sm" className="h-7 text-xs gap-1.5" onClick={send} disabled={sending || (!text.trim() && pending.length === 0)}>
                {sending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />} Senden
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CaseChat;
