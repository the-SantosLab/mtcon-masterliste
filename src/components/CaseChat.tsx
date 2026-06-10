import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { UserAvatar } from '@/components/UserAvatar';
import {
  Paperclip, Smile, Send, Loader2, X, Trash2, Pencil, Check, Download, FileText,
  Reply, Pin, PinOff, MoreHorizontal, ListChecks, Search, ArrowDown, Bell, BellOff,
  Settings2, Circle,
} from 'lucide-react';
import { cn, sanitizeFileName } from '@/lib/utils';
import { toast } from 'sonner';
import { toastError } from '@/lib/errors';
import { MessageContent } from '@/components/chat/MessageContent';
import { MentionPopover, getActiveMention, type MentionUser } from '@/components/chat/MentionPopover';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

const BUCKET = 'case-attachments';
const MAX_BYTES = 20 * 1024 * 1024;
const QUICK_REACTIONS = ['👍','❤️','✅','🎉','🤔','😂'];
const ALL_EMOJIS = ['👍','👌','✅','❌','❤️','🔥','🎉','🙌','👀','🙏','💡','⚠️','📌','📎','✏️','🚀','😀','😂','😊','😉','😍','🤔','😅','😢','😡','🙃','👏','💯','✨','📷'];

const DEPT_PALETTE = [
  'bg-purple-500/15 text-purple-300 border-purple-500/30',
  'bg-orange-500/15 text-orange-300 border-orange-500/30',
  'bg-pink-500/15 text-pink-300 border-pink-500/30',
  'bg-blue-500/15 text-blue-300 border-blue-500/30',
  'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
  'bg-rose-500/15 text-rose-300 border-rose-500/30',
  'bg-amber-500/15 text-amber-300 border-amber-500/30',
];
function deptColor(name?: string | null) {
  if (!name) return DEPT_PALETTE[3];
  let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return DEPT_PALETTE[h % DEPT_PALETTE.length];
}

const STATUS_LABEL: Record<string, string> = {
  open: 'Offen', new: 'Neu', in_progress: 'In Bearbeitung', ready_for_review: 'Zur Prüfung',
  blocked: 'Blockiert', waiting: 'Wartet', done: 'Erledigt', completed: 'Abgeschlossen', closed: 'Geschlossen',
};

interface CaseMeta { case_no: string | null; status: string | null; project_name: string | null; department_name: string | null; watchers: string[] }

interface ChatAttachment {
  id: string; message_id: string; case_id: string; storage_path: string;
  file_name: string; mime_type: string | null; size_bytes: number | null;
  uploaded_by: string; created_at: string;
}
interface Reaction { id: string; message_id: string; user_id: string; emoji: string }
interface ChatMessage {
  id: string; case_id: string; author_id: string; body: string;
  created_at: string; edited_at: string | null; deleted_at: string | null;
  reply_to_id: string | null;
  pinned: boolean; pinned_at: string | null; pinned_by: string | null;
  system_kind: string | null;
  author?: MentionUser | null;
  attachments: ChatAttachment[];
  reactions: Reaction[];
}
interface PendingFile { id: string; file: File; previewUrl?: string }

type FilterMode = 'all' | 'attachments' | 'mentions' | 'system' | 'nosystem';

interface Props { caseId: string; canWrite: boolean }

export function CaseChat({ caseId, canWrite }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
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
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [members, setMembers] = useState<MentionUser[]>([]);
  const [meShortCode, setMeShortCode] = useState<string | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [filter, setFilter] = useState<FilterMode>('all');
  const [isMuted, setIsMuted] = useState(false);
  const [lastReadAt, setLastReadAt] = useState<string | null>(null);
  const [presentUsers, setPresentUsers] = useState<Record<string, { display_name: string; typing: boolean }>>({});
  const [showJump, setShowJump] = useState(false);
  const [caseNumberMap, setCaseNumberMap] = useState<Record<string, string>>({});
  const [caseMeta, setCaseMeta] = useState<CaseMeta>({ case_no: null, status: null, project_name: null, department_name: null, watchers: [] });
  const [userDepts, setUserDepts] = useState<Record<string, string>>({});

  // mention state
  const [mentionState, setMentionState] = useState<{ start: number; query: string } | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);

  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const typingDebounce = useRef<number | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // ---------- bootstrap ----------
  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const [roleRes, profRes, muteRes, readRes] = await Promise.all([
        (supabase as any).from('user_roles').select('role').eq('user_id', user.id).eq('role','admin').maybeSingle(),
        (supabase as any).from('users_profile').select('short_code').eq('id', user.id).maybeSingle(),
        (supabase as any).from('case_chat_mutes').select('case_id').eq('case_id', caseId).eq('user_id', user.id).maybeSingle(),
        (supabase as any).from('case_chat_reads').select('last_read_at').eq('case_id', caseId).eq('user_id', user.id).maybeSingle(),
      ]);
      setIsAdmin(!!roleRes.data);
      setMeShortCode(profRes.data?.short_code || null);
      setIsMuted(!!muteRes.data);
      setLastReadAt(readRes.data?.last_read_at || null);
    })();
  }, [user?.id, caseId]);

  // Load department members for @mentions: prefer dept members of this case, fallback all profiles
  useEffect(() => {
    (async () => {
      const { data: cs } = await (supabase as any).from('cases')
        .select('case_no, status, project_name, department_id, watchers, departments:department_id(name)').eq('id', caseId).maybeSingle();
      setCaseMeta({
        case_no: cs?.case_no || null,
        status: cs?.status || null,
        project_name: cs?.project_name || null,
        department_name: (cs as any)?.departments?.name || null,
        watchers: Array.isArray(cs?.watchers) ? cs.watchers : [],
      });
      let userIds: string[] | null = null;
      if (cs?.department_id) {
        const { data: dm } = await (supabase as any).from('department_members').select('user_id').eq('department_id', cs.department_id);
        userIds = (dm || []).map((x: any) => x.user_id);
        // include watchers (may live outside the department)
        const w: string[] = Array.isArray(cs?.watchers) ? cs.watchers : [];
        for (const wid of w) if (wid && !userIds.includes(wid)) userIds.push(wid);
      }
      let q = (supabase as any).from('users_profile').select('id, display_name, short_code, avatar_url').order('display_name');
      if (userIds && userIds.length) q = q.in('id', userIds);
      const { data } = await q;
      setMembers((data || []) as MentionUser[]);
    })();
  }, [caseId]);

  // ---------- fetch messages ----------
  const fetchMessages = useCallback(async () => {
    const { data: msgs, error } = await (supabase as any)
      .from('case_chat_messages')
      .select('*')
      .eq('case_id', caseId)
      .order('created_at', { ascending: true })
      .limit(800);
    if (error) { console.error(error); setLoading(false); return; }
    const rows: ChatMessage[] = (msgs || []).map((m: any) => ({ ...m, attachments: [], reactions: [] }));
    const ids = rows.map(r => r.id);
    if (ids.length) {
      const [{ data: atts }, { data: rxs }] = await Promise.all([
        (supabase as any).from('case_chat_attachments').select('*').in('message_id', ids),
        (supabase as any).from('case_chat_reactions').select('*').in('message_id', ids),
      ]);
      const byA: Record<string, ChatAttachment[]> = {};
      (atts || []).forEach((a: any) => { (byA[a.message_id] ||= []).push(a); });
      const byR: Record<string, Reaction[]> = {};
      (rxs || []).forEach((r: any) => { (byR[r.message_id] ||= []).push(r); });
      rows.forEach(r => { r.attachments = byA[r.id] || []; r.reactions = byR[r.id] || []; });
    }
    const authorIds = Array.from(new Set(rows.map(r => r.author_id).filter(Boolean)));
    if (authorIds.length) {
      const { data: profs } = await (supabase as any).from('users_profile')
        .select('id, display_name, short_code, avatar_url, department_id').in('id', authorIds);
      const map: Record<string, any> = {};
      (profs || []).forEach((p: any) => { map[p.id] = p; });
      rows.forEach(r => { r.author = map[r.author_id] || null; });
      // Primary department comes from users_profile.department_id (the user's actual home dept).
      const profDeptIds = Array.from(new Set((profs || []).map((p: any) => p.department_id).filter(Boolean)));
      const deptMap: Record<string, string> = {};
      if (profDeptIds.length) {
        const { data: deps } = await (supabase as any).from('departments').select('id, name').in('id', profDeptIds);
        const dn: Record<string, string> = {};
        (deps || []).forEach((d: any) => { dn[d.id] = d.name; });
        (profs || []).forEach((p: any) => { if (p.department_id && dn[p.department_id]) deptMap[p.id] = dn[p.department_id]; });
      }
      setUserDepts(prev => ({ ...prev, ...deptMap }));
    }
    setMessages(rows);
    setLoading(false);

    // Sign image attachments
    const toSign = rows.flatMap(r => r.attachments).filter(a => (a.mime_type || '').startsWith('image/'));
    if (toSign.length) {
      const { data: sd } = await (supabase as any).storage.from(BUCKET).createSignedUrls(toSign.map(a => a.storage_path), 300);
      const sm: Record<string, string> = {};
      (sd || []).forEach((s: any, i: number) => { if (s?.signedUrl) sm[toSign[i].id] = s.signedUrl; });
      setSigned(prev => ({ ...prev, ...sm }));
    }

    // Resolve case_no autolinks from message bodies
    const caseNos = new Set<string>();
    rows.forEach(r => {
      const re = /#VOR-\d{4}-\d{4}/g;
      const matches = r.body?.match(re);
      matches?.forEach(m => caseNos.add(m.slice(1)));
    });
    if (caseNos.size > 0) {
      const { data: cs } = await (supabase as any).from('cases').select('id, case_no').in('case_no', Array.from(caseNos));
      const cm: Record<string, string> = {};
      (cs || []).forEach((c: any) => { cm[c.case_no] = c.id; });
      setCaseNumberMap(prev => ({ ...prev, ...cm }));
    }
  }, [caseId]);

  useEffect(() => { fetchMessages(); }, [fetchMessages]);

  // ---------- realtime + presence ----------
  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase.channel(`case-chat-${caseId}`, { config: { presence: { key: user.id } } })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'case_chat_messages', filter: `case_id=eq.${caseId}` }, () => fetchMessages())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'case_chat_attachments', filter: `case_id=eq.${caseId}` }, () => fetchMessages())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'case_chat_reactions', filter: `case_id=eq.${caseId}` }, () => fetchMessages())
      .on('presence', { event: 'sync' }, () => {
        const state = ch.presenceState() as Record<string, any[]>;
        const acc: Record<string, { display_name: string; typing: boolean }> = {};
        Object.entries(state).forEach(([uid, metas]) => {
          if (uid === user.id) return;
          const last = metas[metas.length - 1];
          acc[uid] = { display_name: last?.display_name || 'Jemand', typing: !!last?.typing };
        });
        setPresentUsers(acc);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          // Re-fetch on (re)subscribe to catch events missed during reconnect
          fetchMessages();
          await ch.track({ display_name: user.email?.split('@')[0] || 'User', typing: false, at: Date.now() });
        }
      });
    channelRef.current = ch;

    // Re-fetch when tab becomes visible again or window regains focus
    const onVis = () => { if (document.visibilityState === 'visible') fetchMessages(); };
    const onFocus = () => fetchMessages();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onFocus);

    return () => {
      channelRef.current = null;
      supabase.removeChannel(ch);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onFocus);
    };
  }, [caseId, user?.id, user?.email, fetchMessages]);


  // ---------- mark read ----------
  const markRead = useCallback(async () => {
    if (!user?.id) return;
    const nowIso = new Date().toISOString();
    await (supabase as any).from('case_chat_reads').upsert({ case_id: caseId, user_id: user.id, last_read_at: nowIso }, { onConflict: 'case_id,user_id' });
  }, [caseId, user?.id]);

  useEffect(() => {
    if (loading) return;
    const t = setTimeout(() => { markRead(); }, 800);
    return () => clearTimeout(t);
  }, [loading, messages.length, markRead]);

  // ---------- scroll behavior ----------
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      setShowJump(distFromBottom > 200);
    };
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  const lastMsgId = messages[messages.length - 1]?.id;
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distFromBottom < 250) {
      el.scrollTop = el.scrollHeight;
    }
  }, [lastMsgId]);

  // ---------- file handling ----------
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

  // ---------- send ----------
  const send = async () => {
    if (!user?.id) return;
    const body = text.trim();
    if (!body && pending.length === 0) return;
    setSending(true);

    // Optimistic: render the message immediately while the insert runs in the background
    const tempId = `temp-${crypto.randomUUID()}`;
    const nowIso = new Date().toISOString();
    const selfAuthor = (members.find(m => m.id === user.id) || null) as MentionUser | null;
    const optimisticAttachments: ChatAttachment[] = pending.map(p => ({
      id: `temp-att-${p.id}`,
      message_id: tempId,
      case_id: caseId,
      storage_path: '',
      file_name: p.file.name,
      mime_type: p.file.type,
      size_bytes: p.file.size,
      uploaded_by: user.id,
      created_at: nowIso,
    }));
    const optimisticMsg: ChatMessage = {
      id: tempId,
      case_id: caseId,
      author_id: user.id,
      body,
      created_at: nowIso,
      edited_at: null,
      deleted_at: null,
      reply_to_id: replyTo?.id || null,
      pinned: false,
      pinned_at: null,
      pinned_by: null,
      system_kind: null,
      author: selfAuthor,
      attachments: optimisticAttachments,
      reactions: [],
    };
    setMessages(prev => [...prev, optimisticMsg]);

    const sentText = text;
    const sentPending = pending;
    const sentReplyTo = replyTo;
    setPending([]); setText(''); setReplyTo(null);
    requestAnimationFrame(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; });

    try {
      const { data: ins, error } = await (supabase as any)
        .from('case_chat_messages')
        .insert({ case_id: caseId, author_id: user.id, body, reply_to_id: sentReplyTo?.id || null })
        .select('id').single();
      if (error) throw error;
      const msgId = ins.id;
      for (const p of sentPending) {
        const path = `cases/${caseId}/chat/${msgId}/${Date.now()}_${sanitizeFileName(p.file.name)}`;
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, p.file, { contentType: p.file.type });
        if (upErr) { toast.error(`Upload ${p.file.name}: ${upErr.message}`); continue; }
        await (supabase as any).from('case_chat_attachments').insert({
          message_id: msgId, case_id: caseId, storage_path: path,
          file_name: p.file.name, mime_type: p.file.type, size_bytes: p.file.size,
          uploaded_by: user.id,
        });
      }
      // Notifications for mentions
      const mentioned = Array.from(new Set((body.match(/(^|\s)@([A-Za-z0-9._-]{2,})/g) || []).map(s => s.trim().slice(1).toLowerCase())));
      if (mentioned.length) {
        const targets = members.filter(m => mentioned.includes(m.short_code.toLowerCase()) && m.id !== user.id);
        if (targets.length) {
          await (supabase as any).from('notifications').insert(
            targets.map(t => ({
              user_id: t.id,
              type: 'mention',
              title: 'Du wurdest erwähnt',
              body: body.slice(0, 160),
              href: `/cases/${caseId}`,
            }))
          );
        }
      }
      sentPending.forEach(p => p.previewUrl && URL.revokeObjectURL(p.previewUrl));
      // Reconcile: fetchMessages replaces the temporary message with the real one
      await fetchMessages();
      requestAnimationFrame(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; });
    } catch (e: any) {
      // Roll back optimistic insert and restore the input so the user can retry
      setMessages(prev => prev.filter(m => m.id !== tempId));
      setText(sentText);
      setPending(sentPending);
      setReplyTo(sentReplyTo);
      toast.error(e.message || 'Senden fehlgeschlagen');
    } finally { setSending(false); }
  };

  // ---------- per-message actions ----------
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
    if (m.attachments.length) {
      await supabase.storage.from(BUCKET).remove(m.attachments.map(a => a.storage_path)).catch(() => {});
    }
    const { error } = await (supabase as any).from('case_chat_messages').delete().eq('id', m.id);
    if (error) toast.error(error.message);
  };
  const togglePin = async (m: ChatMessage) => {
    const { error } = await (supabase as any).from('case_chat_messages')
      .update({ pinned: !m.pinned, pinned_at: !m.pinned ? new Date().toISOString() : null, pinned_by: !m.pinned ? user?.id : null })
      .eq('id', m.id);
    if (error) toast.error(error.message);
  };
  const toggleReaction = async (m: ChatMessage, emoji: string) => {
    if (!user?.id) return;
    const existing = m.reactions.find(r => r.user_id === user.id && r.emoji === emoji);
    if (existing) {
      await (supabase as any).from('case_chat_reactions').delete().eq('id', existing.id);
    } else {
      await (supabase as any).from('case_chat_reactions').insert({
        message_id: m.id, case_id: caseId, user_id: user.id, emoji,
      });
    }
  };
  const createSubtask = async (m: ChatMessage) => {
    if (!user?.id) return;
    const title = (m.body || 'Aus Chat').replace(/\n+/g, ' ').slice(0, 120);
    const { error } = await (supabase as any).from('case_tasks').insert({
      case_id: caseId, title, description: m.body || null,
      assigned_to: user.id, created_by: user.id, status: 'open',
    });
    if (error) toast.error(error.message);
    else toast.success('Unteraufgabe erstellt');
  };
  const toggleMute = async () => {
    if (!user?.id) return;
    if (isMuted) {
      await (supabase as any).from('case_chat_mutes').delete().eq('case_id', caseId).eq('user_id', user.id);
      setIsMuted(false); toast.success('Benachrichtigungen aktiviert');
    } else {
      await (supabase as any).from('case_chat_mutes').insert({ case_id: caseId, user_id: user.id });
      setIsMuted(true); toast.success('Stummgeschaltet');
    }
  };

  // ---------- input handling: mentions + shortcuts ----------
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    setText(v);
    const caret = e.target.selectionStart ?? v.length;
    const m = getActiveMention(v, caret);
    setMentionState(m);
    setMentionIndex(0);
    // presence typing
    const ch = channelRef.current;
    if (ch && user?.id) {
      ch.track({ display_name: user.email?.split('@')[0] || 'User', typing: true, at: Date.now() }).catch(() => {});
      if (typingDebounce.current) window.clearTimeout(typingDebounce.current);
      typingDebounce.current = window.setTimeout(() => {
        ch.track({ display_name: user.email?.split('@')[0] || 'User', typing: false, at: Date.now() }).catch(() => {});
      }, 1500);
    }
  };

  const filteredMentionUsers = useMemo(() => {
    if (!mentionState) return [];
    const q = mentionState.query.toLowerCase();
    return members.filter(u => !q || u.short_code.toLowerCase().includes(q) || u.display_name.toLowerCase().includes(q)).slice(0, 6);
  }, [mentionState, members]);

  const pickMention = (u: MentionUser) => {
    if (!mentionState || !taRef.current) return;
    const before = text.slice(0, mentionState.start);
    const after = text.slice((taRef.current.selectionStart ?? text.length));
    const inserted = `@${u.short_code} `;
    const next = before + inserted + after;
    setText(next);
    setMentionState(null);
    requestAnimationFrame(() => {
      const pos = (before + inserted).length;
      taRef.current?.focus();
      taRef.current?.setSelectionRange(pos, pos);
    });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionState && filteredMentionUsers.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIndex(i => Math.min(i + 1, filteredMentionUsers.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIndex(i => Math.max(0, i - 1)); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pickMention(filteredMentionUsers[mentionIndex]); return; }
      if (e.key === 'Escape') { e.preventDefault(); setMentionState(null); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault(); void send(); return;
    }
    if (e.key === 'ArrowUp' && text === '' && !editId) {
      const mine = [...messages].reverse().find(m => m.author_id === user?.id && !m.system_kind && !m.deleted_at);
      if (mine) {
        e.preventDefault();
        setEditId(mine.id); setEditText(mine.body);
      }
    }
  };

  // ---------- derived: grouping, filter, search ----------
  const mentionMap = useMemo(() => {
    const map: Record<string, { id: string; display_name: string }> = {};
    members.forEach(m => { map[m.short_code.toLowerCase()] = { id: m.id, display_name: m.display_name }; });
    return map;
  }, [members]);

  const visibleMessages = useMemo(() => {
    let arr = messages;
    if (filter === 'attachments') arr = arr.filter(m => m.attachments.length > 0);
    else if (filter === 'system') arr = arr.filter(m => !!m.system_kind);
    else if (filter === 'nosystem') arr = arr.filter(m => !m.system_kind);
    else if (filter === 'mentions' && meShortCode) {
      const tag = `@${meShortCode.toLowerCase()}`;
      arr = arr.filter(m => m.body?.toLowerCase().includes(tag));
    }
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase();
      arr = arr.filter(m => m.body?.toLowerCase().includes(q) || m.author?.display_name.toLowerCase().includes(q));
    }
    return arr;
  }, [messages, filter, searchQ, meShortCode]);

  const grouped = useMemo(() => {
    const out: { day: string; items: ChatMessage[] }[] = [];
    for (const m of visibleMessages) {
      const d = new Date(m.created_at);
      const day = d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: 'long', year: 'numeric' });
      const last = out[out.length - 1];
      if (last && last.day === day) last.items.push(m);
      else out.push({ day, items: [m] });
    }
    return out;
  }, [visibleMessages]);

  const pinned = useMemo(() => messages.filter(m => m.pinned && !m.deleted_at && !m.system_kind), [messages]);
  const unreadCutoff = lastReadAt ? new Date(lastReadAt).getTime() : 0;
  const firstUnreadId = useMemo(() => {
    if (!unreadCutoff) return null;
    return visibleMessages.find(m => m.author_id !== user?.id && new Date(m.created_at).getTime() > unreadCutoff)?.id || null;
  }, [visibleMessages, unreadCutoff, user?.id]);

  const messageById = useMemo(() => {
    const m: Record<string, ChatMessage> = {};
    messages.forEach(x => { m[x.id] = x; });
    return m;
  }, [messages]);

  const insertEmoji = (e: string) => {
    setText(prev => prev + e);
    requestAnimationFrame(() => taRef.current?.focus());
  };

  const jumpToBottom = () => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  };
  const scrollToMessage = (id: string) => {
    const el = messageRefs.current[id];
    if (el && scrollRef.current) {
      scrollRef.current.scrollTo({ top: el.offsetTop - 40, behavior: 'smooth' });
      el.classList.add('ring-2','ring-primary/40','rounded');
      setTimeout(() => el.classList.remove('ring-2','ring-primary/40','rounded'), 1200);
    }
  };

  const typingOthers = Object.values(presentUsers).filter(p => p.typing).map(p => p.display_name);

  const participantStack = useMemo(() => {
    const seen = new Set<string>();
    const list: MentionUser[] = [];
    // 1) Authors who have actually written (others first, newest first)
    for (let i = messages.length - 1; i >= 0; i--) {
      const a = messages[i].author;
      if (a && !seen.has(a.id) && a.id !== user?.id) { seen.add(a.id); list.push(a); }
    }
    // 2) Explicit watchers ("Weitere Personen informieren")
    for (const wid of caseMeta.watchers || []) {
      if (seen.has(wid) || wid === user?.id) continue;
      const m = members.find(x => x.id === wid);
      if (m) { seen.add(m.id); list.push(m); }
    }
    // 3) Self at the end
    const self = members.find(m => m.id === user?.id);
    if (self && !seen.has(self.id)) list.push(self);
    return list;
  }, [messages, members, caseMeta.watchers, user?.id]);

  const onlineCount = Object.keys(presentUsers).length + 1;
  const statusLabel = caseMeta.status ? (STATUS_LABEL[caseMeta.status] || caseMeta.status) : null;

  return (
    <div className="rounded-2xl border border-border bg-card flex flex-col relative overflow-hidden" style={{ maxHeight: '70vh' }}>
      {/* Premium header with case meta */}
      <div className="px-4 py-3 border-b border-border/60 bg-gradient-to-b from-muted/30 to-transparent">
        <div className="flex items-start gap-3">
          <div className="h-2 w-2 rounded-full bg-amber-400 mt-2 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-semibold text-foreground tracking-tight">{caseMeta.case_no || 'Chat'}</h2>
              {statusLabel && (
                <span className="text-[11px] px-2 py-0.5 rounded-md bg-muted text-muted-foreground border border-border">{statusLabel}</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {caseMeta.project_name || '—'}{caseMeta.department_name ? ` · ${caseMeta.department_name}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {participantStack.length > 0 && (
              <div className="flex -space-x-2">
                {participantStack.slice(0, 3).map(p => (
                  <div key={p.id} className="ring-2 ring-card rounded-full"><UserAvatar user={p} size="sm" /></div>
                ))}
                {participantStack.length > 3 && (
                  <div className="h-6 px-1.5 min-w-[1.5rem] inline-flex items-center justify-center rounded-full bg-muted text-[10px] text-muted-foreground ring-2 ring-card">+{participantStack.length - 3}</div>
                )}
              </div>
            )}
            <button title="Suche" onClick={() => setShowSearch(v => !v)} className={cn('h-8 w-8 inline-flex items-center justify-center rounded-full hover:bg-muted text-muted-foreground hover:text-foreground', showSearch && 'bg-muted text-foreground')}>
              <Search className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="px-4 py-2 border-b border-border/60 flex items-center gap-1.5 flex-wrap">
        <button onClick={() => setFilter('all')}
          className={cn('text-xs px-3 py-1 rounded-md transition-colors', filter === 'all' ? 'bg-muted text-foreground font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50')}>
          Alle
        </button>
        <button onClick={() => setFilter('mentions')} disabled={!meShortCode}
          className={cn('text-xs px-3 py-1 rounded-md transition-colors disabled:opacity-50', filter === 'mentions' ? 'bg-muted text-foreground font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50')}>
          @Erwähnungen
        </button>
        <button onClick={() => setFilter('system')}
          className={cn('text-xs px-3 py-1 rounded-md transition-colors', filter === 'system' ? 'bg-muted text-foreground font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50')}>
          Ereignisse
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button title="Weitere Filter" className={cn('h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50', (filter === 'attachments' || filter === 'nosystem') && 'bg-muted text-foreground')}>
              <Settings2 className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="text-xs">
            <DropdownMenuItem onClick={() => setFilter('nosystem')}>Ohne Systemereignisse</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setFilter('attachments')}>Nur mit Anhängen</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground whitespace-nowrap">
            <Circle className="h-2 w-2 fill-emerald-400 text-emerald-400" />
            {onlineCount} online
          </span>
          <button title={isMuted ? 'Stummschaltung aufheben' : 'Stummschalten'} onClick={toggleMute} className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50">
            {isMuted ? <BellOff className="h-3.5 w-3.5" /> : <Bell className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {showSearch && (
        <div className="px-4 py-2 border-b border-border/60">
          <Input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="In Nachrichten suchen…" className="h-8 text-xs" autoFocus />
        </div>
      )}

      {pinned.length > 0 && (
        <div className="px-4 py-2 border-b border-border/60 bg-amber-500/5 flex items-center gap-2 overflow-x-auto">
          <span className="text-sm shrink-0">📌</span>
          {pinned.map(p => (
            <button key={p.id} onClick={() => scrollToMessage(p.id)} className="text-xs text-muted-foreground hover:text-foreground truncate max-w-[420px]">
              <span className="font-medium text-foreground">{p.author?.display_name}:</span> {p.body || '(Anhang)'}
            </button>
          ))}
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3 min-h-[200px]">
        {loading ? (
          <div className="flex items-center justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
        ) : visibleMessages.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">Keine Nachrichten.</p>
        ) : grouped.map(g => (
          <div key={g.day} className="space-y-2">
            <div className="flex items-center gap-2 my-2">
              <div className="h-px flex-1 bg-border" />
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{g.day}</span>
              <div className="h-px flex-1 bg-border" />
            </div>
            {g.items.map(m => {
              const isUnreadDivider = firstUnreadId === m.id;
              if (m.system_kind) {
                return (
                  <div key={m.id} ref={el => { messageRefs.current[m.id] = el; }}>
                    {isUnreadDivider && <UnreadDivider />}
                    <div className="flex items-center gap-2 my-1">
                      <div className="h-px flex-1 bg-border/60" />
                      <span className="text-[10px] text-muted-foreground italic">{m.body}</span>
                      <span className="text-[10px] text-muted-foreground">{new Date(m.created_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</span>
                      <div className="h-px flex-1 bg-border/60" />
                    </div>
                  </div>
                );
              }
              const mine = m.author_id === user?.id;
              const time = new Date(m.created_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
              const parentMsg = m.reply_to_id ? messageById[m.reply_to_id] : null;
              // group reactions by emoji
              const rxGroups: Record<string, Reaction[]> = {};
              m.reactions.forEach(r => { (rxGroups[r.emoji] ||= []).push(r); });
              return (
                <div key={m.id} ref={el => { messageRefs.current[m.id] = el; }}>
                  {isUnreadDivider && <UnreadDivider />}
                  <div className={cn('flex gap-3 group rounded-lg px-2 py-1.5 -mx-2', m.pinned && 'bg-amber-500/5')}>
                    <div className="shrink-0"><UserAvatar user={m.author} size="md" /></div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-foreground">{m.author?.display_name || '—'}</span>
                        {userDepts[m.author_id] && (
                          <span className={cn('text-[10px] px-1.5 py-0.5 rounded border font-medium', deptColor(userDepts[m.author_id]))}>
                            {userDepts[m.author_id]}
                          </span>
                        )}
                        {m.pinned && <span className="text-[10px] text-amber-500 flex items-center gap-0.5 font-medium">📌 Angeheftet</span>}
                        {m.edited_at && <span className="text-[10px] text-muted-foreground italic">(bearbeitet)</span>}
                        <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">{time}</span>
                        {editId !== m.id && (
                          <span className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                            <Popover>
                              <PopoverTrigger asChild>
                                <button className="text-muted-foreground hover:text-foreground" title="Reaktion"><Smile className="h-3 w-3" /></button>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-1" align="end">
                                <div className="flex gap-0.5">
                                  {QUICK_REACTIONS.map(e => (
                                    <button key={e} type="button" onClick={() => toggleReaction(m, e)} className="text-base hover:bg-muted rounded p-1">{e}</button>
                                  ))}
                                </div>
                              </PopoverContent>
                            </Popover>
                            {canWrite && (
                              <button onClick={() => { setReplyTo(m); taRef.current?.focus(); }} className="text-muted-foreground hover:text-foreground" title="Antworten">
                                <Reply className="h-3 w-3" />
                              </button>
                            )}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button className="text-muted-foreground hover:text-foreground" title="Mehr"><MoreHorizontal className="h-3 w-3" /></button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="text-xs">
                                {canWrite && (
                                  <DropdownMenuItem onClick={() => createSubtask(m)}>
                                    <ListChecks className="h-3 w-3 mr-2" />Als Unteraufgabe
                                  </DropdownMenuItem>
                                )}
                                {(isAdmin || mine) && (
                                  <DropdownMenuItem onClick={() => togglePin(m)}>
                                    {m.pinned ? <><PinOff className="h-3 w-3 mr-2" />Lösen</> : <><Pin className="h-3 w-3 mr-2" />Anpinnen</>}
                                  </DropdownMenuItem>
                                )}
                                {mine && (
                                  <DropdownMenuItem onClick={() => { setEditId(m.id); setEditText(m.body); }}>
                                    <Pencil className="h-3 w-3 mr-2" />Bearbeiten
                                  </DropdownMenuItem>
                                )}
                                {(isAdmin || mine) && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={() => deleteMsg(m)} className="text-destructive">
                                      <Trash2 className="h-3 w-3 mr-2" />Löschen
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </span>
                        )}
                      </div>

                      {parentMsg && (
                        <button
                          onClick={() => scrollToMessage(parentMsg.id)}
                          className="mt-1 mb-1 flex items-stretch gap-2 text-left rounded bg-muted/40 hover:bg-muted/60 px-2 py-1 border-l-2 border-primary/40 max-w-full"
                        >
                          <div className="text-[10px] text-muted-foreground truncate">
                            <span className="font-medium text-foreground">{parentMsg.author?.display_name || '—'}: </span>
                            {(parentMsg.body || '(Anhang)').slice(0, 140)}
                          </div>
                        </button>
                      )}

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
                          {m.body && (
                            <p className="text-sm text-foreground whitespace-pre-wrap break-words [overflow-wrap:anywhere] leading-relaxed mt-1">
                              <MessageContent body={m.body} caseNumberMap={caseNumberMap} mentionMap={mentionMap} currentUserShortCode={meShortCode} />
                            </p>
                          )}
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
                          {Object.keys(rxGroups).length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {Object.entries(rxGroups).map(([emoji, rs]) => {
                                const mineReacted = rs.some(r => r.user_id === user?.id);
                                return (
                                  <button
                                    key={emoji}
                                    onClick={() => toggleReaction(m, emoji)}
                                    className={cn(
                                      'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs transition-colors',
                                      mineReacted ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border bg-muted/40 hover:bg-muted',
                                    )}
                                  >
                                    <span>{emoji}</span>
                                    <span className="font-medium">{rs.length}</span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
        {typingOthers.length > 0 && (
          <div className="text-[10px] text-muted-foreground italic px-1">
            {typingOthers.slice(0, 3).join(', ')} {typingOthers.length === 1 ? 'schreibt' : 'schreiben'}…
          </div>
        )}
      </div>

      {showJump && (
        <button
          onClick={jumpToBottom}
          className="absolute bottom-[180px] right-4 h-8 px-3 rounded-full bg-primary text-primary-foreground shadow-md text-xs inline-flex items-center gap-1.5 hover:bg-primary/90 z-10"
        >
          <ArrowDown className="h-3 w-3" /> Neueste
        </button>
      )}

      {canWrite && (
        <div className="border-t border-border/60 p-3 space-y-2 relative bg-gradient-to-b from-transparent to-muted/20">
          {replyTo && (
            <div className="flex items-start gap-2 rounded bg-muted/40 px-2 py-1 border-l-2 border-primary/40">
              <div className="flex-1 min-w-0">
                <div className="text-[10px] text-muted-foreground">Antwort an <span className="font-medium text-foreground">{replyTo.author?.display_name}</span></div>
                <div className="text-[11px] text-foreground truncate">{(replyTo.body || '(Anhang)').slice(0, 160)}</div>
              </div>
              <button onClick={() => setReplyTo(null)} className="text-muted-foreground hover:text-foreground"><X className="h-3 w-3" /></button>
            </div>
          )}
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
            className={cn('relative rounded-2xl border border-border bg-background/50 shadow-sm transition-all', dragOver && 'ring-2 ring-primary border-primary')}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
          >
            {mentionState && filteredMentionUsers.length > 0 && (
              <MentionPopover
                query={mentionState.query}
                users={members}
                activeIndex={mentionIndex}
                onPick={pickMention}
                onHover={setMentionIndex}
              />
            )}
            <Textarea
              ref={taRef}
              value={text}
              onChange={handleTextChange}
              onPaste={onPaste}
              onKeyDown={onKeyDown}
              placeholder="Nachricht schreiben… (@Mention, #VOR-Nummer)"
              className="text-sm min-h-[88px] max-h-[240px] border-0 focus-visible:ring-0 resize-none bg-transparent px-4 pt-3"
              disabled={sending}
            />
            <div className="flex items-center justify-between px-3 pb-2">
              <div className="flex items-center gap-0.5">
                <input ref={fileRef} type="file" multiple className="hidden" onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value=''; }} />
                <Button type="button" size="icon" variant="ghost" className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground" onClick={() => fileRef.current?.click()} title="Datei anhängen">
                  <Paperclip className="h-4 w-4" />
                </Button>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button type="button" size="icon" variant="ghost" className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground" title="Emoji"><Smile className="h-4 w-4" /></Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-2" align="start">
                    <div className="grid grid-cols-8 gap-1">
                      {ALL_EMOJIS.map(e => (
                        <button key={e} type="button" onClick={() => insertEmoji(e)} className="text-lg hover:bg-muted rounded p-1">{e}</button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              <Button
                type="button"
                onClick={send}
                disabled={sending || (!text.trim() && pending.length === 0)}
                className="h-9 px-5 rounded-full text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 shadow-md shadow-primary/20"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="h-3.5 w-3.5 mr-1.5" />Senden</>}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function UnreadDivider() {
  return (
    <div className="flex items-center gap-2 my-2">
      <div className="h-px flex-1 bg-primary/40" />
      <span className="text-[10px] uppercase tracking-wide text-primary font-medium">Neu</span>
      <div className="h-px flex-1 bg-primary/40" />
    </div>
  );
}
