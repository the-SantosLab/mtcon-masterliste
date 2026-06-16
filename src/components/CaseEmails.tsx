import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Mail, Paperclip, ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { toastError } from '@/lib/errors';
import { cn } from '@/lib/utils';
import DOMPurify from 'dompurify';

interface EmailRow {
  id: string;
  case_id: string;
  from_email: string;
  from_name: string | null;
  subject: string | null;
  body_plain: string | null;
  body_html: string | null;
  received_at: string;
  attachments: { id: string; file_name: string; storage_path: string; size_bytes: number | null }[];
}

interface Props {
  caseId: string;
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('de-DE', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

function formatBytes(b: number | null): string {
  if (!b) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

export function CaseEmails({ caseId }: Props) {
  const { isAdmin, role } = useAuth();
  const canDelete = isAdmin || role === 'staff';
  const [emails, setEmails] = useState<EmailRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [pendingDelete, setPendingDelete] = useState<Set<string>>(new Set());

  const fetchEmails = async () => {
    const { data, error } = await (supabase as any)
      .from('case_emails')
      .select('id, case_id, from_email, from_name, subject, body_plain, body_html, received_at, case_email_attachments(id, file_name, storage_path, size_bytes)')
      .eq('case_id', caseId)
      .order('received_at', { ascending: false });
    if (error) { console.error(error); setLoading(false); return; }
    setEmails(((data || []) as any[]).map(e => ({
      id: e.id, case_id: e.case_id,
      from_email: e.from_email, from_name: e.from_name,
      subject: e.subject, body_plain: e.body_plain, body_html: e.body_html,
      received_at: e.received_at,
      attachments: e.case_email_attachments || [],
    })));
    setLoading(false);
  };

  useEffect(() => {
    fetchEmails();
    const ch = supabase
      .channel(`case-emails-${caseId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'case_emails', filter: `case_id=eq.${caseId}` }, fetchEmails)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [caseId]);

  const download = async (path: string, name: string) => {
    const { data, error } = await supabase.storage.from('case-attachments').createSignedUrl(path, 300);
    if (error || !data) { toast.error('Download fehlgeschlagen'); return; }
    // Open in a new tab via an anchor click. Avoid `window.open()` /
    // `window.location.href` fallbacks — on mobile (PWA, in-app browsers)
    // they unload the SPA, which is what BUG-2026-0079 was about.
    try {
      const res = await fetch(data.signedUrl);
      if (!res.ok) throw new Error('Fetch fehlgeschlagen');
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = name;
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    } catch {
      const a = document.createElement('a');
      a.href = data.signedUrl;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  const deleteEmail = async (email: EmailRow) => {
    const paths = email.attachments.map(a => a.storage_path).filter(Boolean);
    const { error } = await (supabase as any)
      .from('case_emails')
      .delete()
      .eq('id', email.id);
    if (error) {
      toastError(error, 'case_email', 'E-Mail konnte nicht gelöscht werden');
      return;
    }
    if (paths.length > 0) {
      await supabase.storage.from('case-attachments').remove(paths).catch(() => {});
    }
    toast.success('E-Mail gelöscht');
    fetchEmails();
  };

  const deleteAttachment = (attachmentId: string, storagePath: string, fileName: string) => {
    // Optimistisch ausblenden
    setPendingDelete(prev => { const n = new Set(prev); n.add(attachmentId); return n; });
    let cancelled = false;

    const timer = window.setTimeout(async () => {
      if (cancelled) return;
      const { error: dbErr } = await (supabase as any)
        .from('case_email_attachments')
        .delete()
        .eq('id', attachmentId);
      if (dbErr) {
        toastError(null, 'case_email', 'Löschen fehlgeschlagen');
        setPendingDelete(prev => { const n = new Set(prev); n.delete(attachmentId); return n; });
        return;
      }
      await supabase.storage.from('case-attachments').remove([storagePath]).catch(() => {});
      fetchEmails();
    }, 6000);

    toast(`Anhang „${fileName}" gelöscht`, {
      duration: 6000,
      action: {
        label: 'Rückgängig',
        onClick: () => {
          cancelled = true;
          window.clearTimeout(timer);
          setPendingDelete(prev => { const n = new Set(prev); n.delete(attachmentId); return n; });
          toast.success('Löschung rückgängig gemacht');
        },
      },
    });
  };

  if (loading) return <p className="text-xs text-muted-foreground">Laden</p>;
  if (emails.length === 0) return <p className="text-xs text-muted-foreground">Keine E-Mails</p>;

  return (
    <div className="divide-y divide-border border border-border rounded-md overflow-hidden">
      {emails.map(e => {
        const isOpen = expanded[e.id] ?? false;
        return (
          <div key={e.id} data-compact-row className="bg-background">
            <button
              type="button"
              onClick={() => setExpanded(s => ({ ...s, [e.id]: !isOpen }))}
              className="w-full text-left px-3 py-2.5 hover:bg-muted/40 transition-colors"
            >
              <div className="flex items-start gap-2">
                <span className="mt-0.5 text-muted-foreground shrink-0">
                  {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                </span>
                <Mail className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs font-medium text-foreground truncate">
                      {e.subject || '(kein Betreff)'}
                    </span>
                    <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                      {formatDateTime(e.received_at)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[11px] text-muted-foreground truncate">
                      {e.from_name ? `${e.from_name} <${e.from_email}>` : e.from_email}
                    </span>
                    {e.attachments.length > 0 && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground shrink-0">
                        <Paperclip className="h-3 w-3" />{e.attachments.length}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </button>

            {isOpen && (
              <div className="px-3 pb-3 pl-9 space-y-3 bg-muted/10">
                <div className="grid grid-cols-[80px_1fr] gap-x-3 gap-y-1 text-[11px]">
                  <span className="text-muted-foreground">Von</span>
                  <span className="text-foreground break-all">
                    {e.from_name ? `${e.from_name} <${e.from_email}>` : e.from_email}
                  </span>
                  <span className="text-muted-foreground">Empfangen</span>
                  <span className="text-foreground tabular-nums">{formatDateTime(e.received_at)}</span>
                  <span className="text-muted-foreground">Betreff</span>
                  <span className="text-foreground font-medium">{e.subject || '(kein Betreff)'}</span>
                </div>

                <EmailBody html={e.body_html} plain={e.body_plain} />

                {canDelete && (
                  <div className="flex justify-end">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-destructive transition-colors px-2 py-1 rounded border border-border hover:border-destructive/40"
                          title="E-Mail löschen"
                        >
                          <Trash2 className="h-3 w-3" />
                          E-Mail löschen
                        </button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>E-Mail löschen?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Die E-Mail „{e.subject || '(kein Betreff)'}" wird einschließlich aller Anhänge unwiderruflich aus diesem Vorgang entfernt.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteEmail(e)}>
                            Löschen
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                )}


                {e.attachments.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Anhänge</p>
                    <div className="flex flex-wrap gap-1.5">
                      {e.attachments.filter(a => !pendingDelete.has(a.id)).map(a => (
                        <div
                          key={a.id}
                          data-compact-row
                          className="inline-flex items-center gap-0.5 text-[11px] rounded bg-background border border-border text-foreground overflow-hidden"
                        >
                          <button
                            onClick={() => download(a.storage_path, a.file_name)}
                            className="inline-flex items-center gap-1.5 px-2 py-1 hover:bg-muted transition-colors"
                          >
                            <Paperclip className="h-3 w-3 text-muted-foreground" />
                            <span>{a.file_name}</span>
                            {a.size_bytes && (
                              <span className="text-muted-foreground">· {formatBytes(a.size_bytes)}</span>
                            )}
                          </button>
                          {canDelete && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <button
                                  className="px-1.5 py-1 border-l border-border text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                                  title="Anhang löschen"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Anhang löschen?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    „{a.file_name}" wird unwiderruflich entfernt.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => deleteAttachment(a.id, a.storage_path, a.file_name)}>
                                    Löschen
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function EmailBody({ html, plain }: { html: string | null; plain: string | null }) {
  const hasHtml = !!(html && html.trim());
  const hasPlain = !!(plain && plain.trim());
  const [mode, setMode] = useState<'html' | 'plain'>(hasHtml ? 'html' : 'plain');

  // Sanitize HTML: strip scripts, event handlers, dangerous protocols.
  // Force links to open in a new tab with no referrer.
  const safeHtml = useMemo(() => {
    if (!hasHtml) return '';
    const clean = DOMPurify.sanitize(html as string, {
      USE_PROFILES: { html: true },
      FORBID_TAGS: ['style', 'script', 'iframe', 'form', 'object', 'embed', 'meta', 'link'],
      FORBID_ATTR: ['style', 'srcset'],
      ALLOW_DATA_ATTR: false,
    });
    // Tag links to open externally
    return clean.replace(/<a /gi, '<a target="_blank" rel="noopener noreferrer nofollow" ');
  }, [html, hasHtml]);

  if (!hasHtml && !hasPlain) {
    return (
      <div className="rounded border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
        (kein Textinhalt)
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {hasHtml && hasPlain && (
        <div className="inline-flex rounded border border-border overflow-hidden text-[10px]">
          <button
            type="button"
            onClick={() => setMode('html')}
            className={cn(
              'px-2 py-0.5 transition-colors',
              mode === 'html' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/50',
            )}
          >
            HTML
          </button>
          <button
            type="button"
            onClick={() => setMode('plain')}
            className={cn(
              'px-2 py-0.5 border-l border-border transition-colors',
              mode === 'plain' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/50',
            )}
          >
            Text
          </button>
        </div>
      )}

      <div className="rounded border border-border bg-background px-4 py-3 max-h-96 overflow-y-auto">
        {mode === 'html' && hasHtml ? (
          <div
            className={cn(
              'text-sm text-foreground leading-relaxed break-words',
              '[&_p]:my-2 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0',
              '[&_a]:text-primary [&_a]:underline [&_a]:break-all',
              '[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-2',
              '[&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-2',
              '[&_li]:my-0.5',
              '[&_h1]:text-base [&_h1]:font-semibold [&_h1]:mt-3 [&_h1]:mb-1',
              '[&_h2]:text-sm [&_h2]:font-semibold [&_h2]:mt-3 [&_h2]:mb-1',
              '[&_h3]:text-sm [&_h3]:font-medium [&_h3]:mt-2 [&_h3]:mb-1',
              '[&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_blockquote]:my-2',
              '[&_pre]:bg-muted [&_pre]:p-2 [&_pre]:rounded [&_pre]:text-xs [&_pre]:overflow-x-auto',
              '[&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs',
              '[&_table]:border-collapse [&_table]:my-2',
              '[&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:bg-muted/40',
              '[&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1',
              '[&_img]:max-w-full [&_img]:h-auto [&_img]:rounded',
              '[&_hr]:my-3 [&_hr]:border-border',
            )}
            dangerouslySetInnerHTML={{ __html: safeHtml }}
          />
        ) : (
          <pre className="text-sm text-foreground whitespace-pre-wrap break-words leading-relaxed font-sans m-0">
            {plain || ''}
          </pre>
        )}
      </div>
    </div>
  );
}
