import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Mail, Paperclip, ChevronDown, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
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
  const [emails, setEmails] = useState<EmailRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

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
    const a = document.createElement('a');
    a.href = data.signedUrl; a.download = name; a.click();
  };

  if (loading) return <p className="text-xs text-muted-foreground">Laden</p>;
  if (emails.length === 0) return <p className="text-xs text-muted-foreground">Keine E-Mails</p>;

  return (
    <div className="divide-y divide-border border border-border rounded-md overflow-hidden">
      {emails.map(e => {
        const isOpen = expanded[e.id] ?? false;
        return (
          <div key={e.id} className="bg-background">
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


                {e.attachments.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Anhänge</p>
                    <div className="flex flex-wrap gap-1.5">
                      {e.attachments.map(a => (
                        <button
                          key={a.id}
                          onClick={() => download(a.storage_path, a.file_name)}
                          className={cn(
                            'inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded',
                            'bg-background border border-border hover:bg-muted text-foreground'
                          )}
                        >
                          <Paperclip className="h-3 w-3 text-muted-foreground" />
                          <span>{a.file_name}</span>
                          {a.size_bytes && (
                            <span className="text-muted-foreground">· {formatBytes(a.size_bytes)}</span>
                          )}
                        </button>
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
