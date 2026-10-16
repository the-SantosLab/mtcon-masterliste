import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { STATUS_LABELS } from '@/lib/case-utils';
import { format } from 'date-fns';
import { Printer, ArrowLeft, Check } from 'lucide-react';

interface CaseRow {
  id: string;
  case_no: string | null;
  case_number: number | null;
  project_name: string;
  status: string;
  client_name: string | null;
  customer_no: string | null;
  product_code: string | null;
  internal_area_code: string | null;
  project_article_no: string | null;
  quantity: number | null;
  sop: string | null;
  received_at: string | null;
  started_at: string | null;
  due_at: string | null;
  completed_at: string | null;
  estimated_hours: number | null;
  note: string | null;
  urgency: number | null;
  department_id: string | null;
  assignee_id: string | null;
  created_by: string | null;
  created_at: string | null;
  closure_summary: string | null;
  closure_outputs: any;
  closed_at: string | null;
  closed_by: string | null;
}

interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  status: string | null;
  completed: boolean;
  completed_at: string | null;
  due_at: string | null;
  urgency: number | null;
  assigned_to: string | null;
  department_id: string | null;
  sort_order: number | null;
  required_outputs: any;
  completed_outputs: any;
  archived_at: string | null;
}

export default function PrintCase() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [c, setC] = useState<CaseRow | null>(null);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [notes, setNotes] = useState<Array<{ id: string; body: string; author_id: string | null; created_at: string; pinned: boolean }>>([]);
  const [completionNotes, setCompletionNotes] = useState<Record<string, string>>({});
  const [depts, setDepts] = useState<Record<string, string>>({});
  const [users, setUsers] = useState<Record<string, { display_name: string | null; short_code: string | null }>>({});
  const [loading, setLoading] = useState(true);
  const [files, setFiles] = useState<Array<{ name: string; size: number | null; created_at: string | null }>>([]);
  const [emails, setEmails] = useState<Array<{ id: string; from_email: string | null; from_name: string | null; subject: string | null; received_at: string | null; n: number }>>([]);
  const [articles, setArticles] = useState<Array<{ key: string; kind: string; art_nr: string; name: string; qty: number; me: string; wh: string; status: string; at: string | null }>>([]);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const [caseRes, taskRes, noteRes, deptRes, userRes, actRes] = await Promise.all([
        (supabase as any).from('cases').select('*').eq('id', id).maybeSingle(),
        supabase.from('case_tasks').select('*').eq('case_id', id).order('archived_at', { ascending: true, nullsFirst: true }).order('sort_order', { ascending: true }),
        supabase.from('case_notes').select('id, body, author_id, created_at, pinned').eq('case_id', id).order('pinned', { ascending: false }).order('created_at', { ascending: false }),
        supabase.from('departments').select('id, name'),
        supabase.from('users_profile').select('id, display_name, short_code'),
        supabase.from('case_activity').select('task_id, new_value, created_at').eq('case_id', id).eq('action', 'task_completed').eq('field', 'completion_note').order('created_at', { ascending: false }),
      ]);
      const [fileRes, mailRes, mvRes, rvRes] = await Promise.all([
        supabase.storage.from('case-attachments').list(`cases/${id}`, { sortBy: { column: 'created_at', order: 'desc' } }),
        (supabase as any).from('case_emails').select('id, from_email, from_name, subject, received_at, case_email_attachments(id)').eq('case_id', id).order('received_at', { ascending: false }),
        (supabase as any).from('stock_movements').select('id,art_nr,movement_type,quantity,created_at,articles(bezeich_1,me),warehouses!stock_movements_warehouse_id_fkey(code)').eq('case_id', id).order('created_at', { ascending: false }),
        (supabase as any).from('stock_reservations').select('id,art_nr,quantity,status,created_at,articles(bezeich_1,me),warehouses(code)').eq('case_id', id).order('created_at', { ascending: false }),
      ]);
      setFiles(((fileRes.data || []) as any[]).filter(f => f.name && !f.name.startsWith('.')).map(f => ({ name: f.name.replace(/^\d{10,}[-_]/, ''), size: f.metadata?.size ?? null, created_at: f.created_at ?? null })));
      setEmails(((mailRes.data || []) as any[]).map(e => ({ id: e.id, from_email: e.from_email, from_name: e.from_name, subject: e.subject, received_at: e.received_at, n: (e.case_email_attachments || []).length })));
      setArticles([
        ...((rvRes.data || []) as any[]).map(r => ({ key: 'r' + r.id, kind: 'Reservierung', art_nr: r.art_nr, name: r.articles?.bezeich_1 || '', qty: r.quantity, me: r.articles?.me || '', wh: r.warehouses?.code || '', status: r.status || '', at: r.created_at })),
        ...((mvRes.data || []) as any[]).map(m => ({ key: 'm' + m.id, kind: 'Bewegung', art_nr: m.art_nr, name: m.articles?.bezeich_1 || '', qty: m.quantity, me: m.articles?.me || '', wh: m.warehouses?.code || '', status: m.movement_type || '', at: m.created_at })),
      ]);
      setC((caseRes.data || null) as CaseRow | null);
      setTasks((taskRes.data || []) as TaskRow[]);
      setNotes((noteRes.data || []) as any);
      const cn: Record<string, string> = {};
      (actRes.data || []).forEach((a: any) => {
        if (a.task_id && !cn[a.task_id] && a.new_value) cn[a.task_id] = a.new_value;
      });
      setCompletionNotes(cn);
      const dm: Record<string, string> = {};
      (deptRes.data || []).forEach((d: any) => { dm[d.id] = d.name; });
      setDepts(dm);
      const um: Record<string, any> = {};
      (userRes.data || []).forEach((u: any) => { um[u.id] = { display_name: u.display_name, short_code: u.short_code }; });
      setUsers(um);
      setLoading(false);
    })();
  }, [id]);


  const progress = useMemo(() => {
    if (!tasks.length) return { done: 0, total: 0, pct: 0 };
    const done = tasks.filter(t => t.completed).length;
    return { done, total: tasks.length, pct: Math.round((done / tasks.length) * 100) };
  }, [tasks]);

  const fmtDate = (d: string | null | undefined) => (d ? format(new Date(d), 'dd.MM.yyyy') : '—');
  const fmtDateTime = (d: string | null | undefined) => (d ? format(new Date(d), 'dd.MM.yyyy HH:mm') : '—');
  const chili = (n?: number | null) => (n && n > 0 ? '🌶'.repeat(n) : '');
  const userLabel = (uid: string | null | undefined) => {
    if (!uid) return '—';
    const u = users[uid];
    if (!u) return '—';
    return u.short_code ? `${u.display_name || ''} (${u.short_code})` : (u.display_name || '—');
  };

  // Einfache Markdown-Auszeichnung (**fett**, *kursiv*, `code`) für den Druck entfernen
  const plain = (t: string | null | undefined) => (t || '').replace(/\*\*(.+?)\*\*/gs, '$1').replace(/(^|\s)\*(\S.*?)\*(?=\s|$)/g, '$1$2').replace(/`([^`]+)`/g, '$1').replace(/^\*\*|\*\*$/gm, '');
  const fmtSize = (b: number | null) => (b == null ? '' : b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

  if (loading) {
    return <div className="p-8 text-sm text-gray-600">Laden…</div>;
  }
  if (!c) {
    return <div className="p-8 text-sm text-gray-600">Vorgang nicht gefunden.</div>;
  }

  const statusLabel = STATUS_LABELS[c.status as keyof typeof STATUS_LABELS] || c.status;

  return (
    <div className="print-page bg-white text-black min-h-screen">
      <style>{`
        .running-footer { display: none; }
        @media print {
          .no-print { display: none !important; }
          .print-page { padding: 0 !important; }
          .print-section { break-inside: avoid; page-break-inside: avoid; }
          .print-flow { break-inside: auto; page-break-inside: auto; }
          .print-page h2 { break-after: avoid; page-break-after: avoid; }
          .print-page .card, .print-page .task, .print-page tr { break-inside: avoid; page-break-inside: avoid; }
          .footer { display: none !important; }
          @page { size: A4; margin: 12mm 10mm 22mm 10mm; }
          .running-footer {
            display: flex;
            position: fixed;
            bottom: 4mm;
            left: 10mm;
            right: 10mm;
            font-family: 'Inter', system-ui, sans-serif;
            font-size: 8.5pt;
            color: #555;
            border-top: 1px solid #999;
            padding-top: 2pt;
            justify-content: space-between;
          }
        }
        .print-page { font-family: 'Inter', system-ui, sans-serif; font-size: 10pt; line-height: 1.4; color: #111; overflow-wrap: anywhere; word-break: break-word; }
        .print-page .tbl { width: 100%; border-collapse: collapse; font-size: 8.5pt; table-layout: fixed; }
        .print-page .tbl th { text-align: left; font-weight: 600; color: #555; border-bottom: 1px solid #999; padding: 2pt 4pt; }
        .print-page .tbl td { border-bottom: 1px solid #e5e5e5; padding: 2pt 4pt; vertical-align: top; }
        .print-page .tbl thead { display: table-header-group; }
        .print-page h1 { font-size: 18pt; font-weight: 700; letter-spacing: -0.01em; }
        .print-page h2 { font-size: 11pt; font-weight: 600; margin-top: 10pt; margin-bottom: 4pt; text-transform: uppercase; letter-spacing: 0.05em; color: #111; border-bottom: 1px solid #000; padding-bottom: 2pt; }
        .print-page .sub { font-size: 9pt; color: #555; }
        .print-page .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
        .print-page .kv { display: grid; grid-template-columns: 38mm 1fr; gap: 2pt 8pt; font-size: 9.5pt; }
        .print-page .kv dt { color: #666; }
        .print-page .kv dd { margin: 0; font-weight: 500; }
        .print-page .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8mm; }
        .print-page .card { border: 1px solid #ccc; border-radius: 4px; padding: 6pt 8pt; }
        .print-page .task { display: grid; grid-template-columns: 12pt 1fr auto; gap: 6pt; padding: 4pt 0; border-bottom: 1px dashed #ddd; break-inside: avoid; }
        .print-page .task:last-child { border-bottom: 0; }
        .print-page .check-box { width: 10pt; height: 10pt; border: 1.2px solid #000; border-radius: 2px; display: inline-flex; align-items: center; justify-content: center; margin-top: 2pt; }
        .print-page .check-done { background: #000; color: #fff; }
        .print-page .task-title { font-weight: 500; }
        .print-page .task-title.done { text-decoration: line-through; color: #666; }
        .print-page .task-meta { font-size: 8.5pt; color: #666; margin-top: 1pt; }
        .print-page .progress-shell { width: 100%; height: 10pt; background: #eee; border-radius: 999px; overflow: hidden; border: 1px solid #ccc; }
        .print-page .progress-fill { height: 100%; background: #000; }
        .print-page .badge { display: inline-block; padding: 1pt 5pt; border-radius: 999px; border: 1px solid #000; font-size: 6.5pt; font-weight: 600; text-transform: uppercase; letter-spacing: 0.03em; white-space: nowrap; }
        .print-page .footer { margin-top: 14pt; padding-top: 6pt; border-top: 1px solid #ccc; font-size: 8pt; color: #777; display: flex; justify-content: space-between; }
      `}</style>

      <div className="running-footer">
        <span className="mono">{c.case_no || (c.case_number ? `#${c.case_number}` : '')}</span>
        <span>{c.project_name}</span>
        <span>Gedruckt {format(new Date(), 'dd.MM.yyyy HH:mm')}</span>
      </div>

      <div className="no-print sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-xs text-gray-600 hover:text-black">
          <ArrowLeft className="h-3 w-3" /> Zurück
        </button>
        <div className="flex-1" />
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-3 py-1.5 rounded bg-black text-white text-xs font-medium hover:bg-gray-800"
        >
          <Printer className="h-3.5 w-3.5" /> Drucken
        </button>
      </div>

      <div className="max-w-[190mm] mx-auto p-6">
        {/* Header */}
        <div className="print-section flex items-start justify-between gap-4 border-b-2 border-black pb-3 mb-4">
          <div className="min-w-0">
            <div className="sub mono">{c.case_no || (c.case_number ? `#${c.case_number}` : '')}</div>
            <h1>{c.project_name}</h1>
            <div className="sub mt-1">
              {depts[c.department_id || ''] || '—'} · Zuständig: {userLabel(c.assignee_id)}
            </div>
          </div>
          <div className="text-right shrink-0">
            <span className="badge">{statusLabel}</span>
            <div className="sub mt-2">Priorität: {chili(c.urgency) || '—'}</div>
            <div className="sub">Fällig: {fmtDate(c.due_at)}</div>
          </div>
        </div>

        {/* Progress */}
        <div className="print-section mb-4">
          <div className="flex items-baseline justify-between mb-1">
            <div className="text-xs font-semibold uppercase tracking-wider">Fortschritt</div>
            <div className="sub">{progress.done} von {progress.total} Unteraufgaben abgeschlossen · {progress.pct}%</div>
          </div>
          <div className="progress-shell">
            <div className="progress-fill" style={{ width: `${progress.pct}%` }} />
          </div>
        </div>

        {/* Overview grid */}
        <div className="print-section grid2 mb-2">
          <div>
            <h2>Vorgang</h2>
            <dl className="kv">
              <dt>Auftraggeber</dt><dd>{c.client_name || '—'}</dd>
              <dt>Kundennr.</dt><dd>{c.customer_no || '—'}</dd>
              <dt>Abteilung</dt><dd>{depts[c.department_id || ''] || '—'}</dd>
              <dt>Bearbeiter</dt><dd>{userLabel(c.assignee_id)}</dd>
              <dt>Produkt</dt><dd>{c.product_code || '—'}</dd>
              <dt>Artikel</dt><dd>{c.project_article_no || '—'}</dd>
              <dt>Bereich</dt><dd>{c.internal_area_code || '—'}</dd>
              <dt>Menge</dt><dd>{c.quantity ?? '—'}</dd>
              <dt>SOP</dt><dd>{fmtDate(c.sop)}</dd>
            </dl>
          </div>
          <div>
            <h2>Termine</h2>
            <dl className="kv">
              <dt>Eingang</dt><dd>{fmtDate(c.received_at)}</dd>
              <dt>Start</dt><dd>{fmtDateTime(c.started_at)}</dd>
              <dt>Fällig</dt><dd>{fmtDate(c.due_at)}</dd>
              <dt>Abschluss</dt><dd>{fmtDateTime(c.completed_at)}</dd>
              <dt>Geplante Std.</dt><dd>{c.estimated_hours ?? '—'}</dd>
              <dt>Erstellt</dt><dd>{fmtDate(c.created_at)} · {userLabel(c.created_by)}</dd>
            </dl>
          </div>
        </div>

        {c.note && (
          <div className="print-section mb-2">
            <h2>Kurznotiz</h2>
            <div className="card sub" style={{ whiteSpace: 'pre-wrap' }}>{plain(c.note)}</div>
          </div>
        )}

        {notes.length > 0 && (
          <div className="print-flow mb-2">
            <h2>Notizen ({notes.length})</h2>
            {notes.map(n => (
              <div key={n.id} className="card mb-2" style={{ pageBreakInside: 'avoid' }}>
                <div className="sub" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2pt' }}>
                  <span>{n.pinned ? '★ ' : ''}{userLabel(n.author_id)}</span>
                  <span>{fmtDateTime(n.created_at)}</span>
                </div>
                <div style={{ whiteSpace: 'pre-wrap', fontSize: '9.5pt' }}>{plain(n.body)}</div>
              </div>
            ))}
          </div>
        )}

        {/* Tasks */}
        <div className="print-flow mb-2">
          <h2>Unteraufgaben ({tasks.length})</h2>
          {tasks.length === 0 && <div className="sub">Keine Unteraufgaben.</div>}
          {tasks.map(t => (
            <div className="task" key={t.id} style={t.archived_at ? { opacity: 0.65 } : undefined}>
              <div>
                <span className={`check-box ${t.completed ? 'check-done' : ''}`}>
                  {t.completed && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
                </span>
              </div>
              <div>
                <div className={`task-title ${t.completed ? 'done' : ''}`}>
                  {t.title}
                  {t.archived_at && <span className="task-meta" style={{ marginLeft: 6, fontStyle: 'italic' }}>(archiviert)</span>}
                </div>
                {t.description && <div className="task-meta" style={{ whiteSpace: 'pre-wrap' }}>{plain(t.description)}</div>}
                <div className="task-meta">
                  {depts[t.department_id || ''] ? `${depts[t.department_id!]} · ` : ''}
                  {userLabel(t.assigned_to)}
                  {t.due_at ? ` · Fällig ${fmtDate(t.due_at)}` : ''}
                  {t.completed_at ? ` · Erledigt ${fmtDate(t.completed_at)}` : ''}
                  {t.archived_at ? ` · Archiviert ${fmtDate(t.archived_at)}` : ''}
                </div>
                {completionNotes[t.id] && (
                  <div className="task-meta" style={{ whiteSpace: 'pre-wrap', marginTop: 3, padding: '3pt 5pt', border: '1px solid #ddd', borderRadius: 3, background: '#fafafa' }}>
                    <span style={{ fontWeight: 600 }}>Abschlussnotiz:</span> {plain(completionNotes[t.id])}
                  </div>
                )}
              </div>
              <div className="task-meta text-right">

                {chili(t.urgency)}
                {t.status && <div>{t.status}</div>}
              </div>
            </div>
          ))}
        </div>

        {articles.length > 0 && (
          <div className="print-flow mb-2">
            <h2>Artikel ({articles.length})</h2>
            <table className="tbl">
              <colgroup><col style={{ width: '16%' }} /><col style={{ width: '30%' }} /><col style={{ width: '12%' }} /><col style={{ width: '10%' }} /><col style={{ width: '17%' }} /><col style={{ width: '15%' }} /></colgroup>
              <thead><tr><th>Art.-Nr.</th><th>Bezeichnung</th><th style={{ textAlign: 'right' }}>Menge</th><th>Lager</th><th>Art</th><th>Datum</th></tr></thead>
              <tbody>{articles.map(a => (
                <tr key={a.key}><td className="mono">{a.art_nr}</td><td>{a.name || '—'}</td><td style={{ textAlign: 'right' }}>{a.qty} {a.me}</td><td>{a.wh || '—'}</td><td>{a.kind}{a.status ? ` · ${a.status}` : ''}</td><td>{fmtDate(a.at)}</td></tr>
              ))}</tbody>
            </table>
          </div>
        )}

        {files.length > 0 && (
          <div className="print-flow mb-2">
            <h2>Dateien ({files.length})</h2>
            <table className="tbl">
              <colgroup><col style={{ width: '65%' }} /><col style={{ width: '15%' }} /><col style={{ width: '20%' }} /></colgroup>
              <thead><tr><th>Name</th><th style={{ textAlign: 'right' }}>Größe</th><th>Hochgeladen</th></tr></thead>
              <tbody>{files.map(f => (
                <tr key={f.name}><td>{f.name}</td><td style={{ textAlign: 'right' }}>{fmtSize(f.size)}</td><td>{fmtDateTime(f.created_at)}</td></tr>
              ))}</tbody>
            </table>
          </div>
        )}

        {emails.length > 0 && (
          <div className="print-flow mb-2">
            <h2>E-Mails ({emails.length})</h2>
            <table className="tbl">
              <colgroup><col style={{ width: '30%' }} /><col style={{ width: '46%' }} /><col style={{ width: '8%' }} /><col style={{ width: '16%' }} /></colgroup>
              <thead><tr><th>Von</th><th>Betreff</th><th style={{ textAlign: 'right' }}>Anh.</th><th>Eingang</th></tr></thead>
              <tbody>{emails.map(e => (
                <tr key={e.id}><td>{e.from_name || e.from_email || '—'}</td><td>{e.subject || '(ohne Betreff)'}</td><td style={{ textAlign: 'right' }}>{e.n || ''}</td><td>{fmtDateTime(e.received_at)}</td></tr>
              ))}</tbody>
            </table>
          </div>
        )}

        {(c.closure_summary || (Array.isArray(c.closure_outputs) && c.closure_outputs.length > 0) || c.closed_at) && (
          <div className="print-flow mb-2">
            <h2>Abschluss</h2>
            {c.closed_at && (
              <div className="sub" style={{ marginBottom: 4 }}>
                Abgeschlossen am {fmtDateTime(c.closed_at)}{c.closed_by ? ` durch ${userLabel(c.closed_by)}` : ''}
              </div>
            )}
            {c.closure_summary && (
              <div className="card sub" style={{ whiteSpace: 'pre-wrap', marginBottom: 6 }}>{plain(c.closure_summary)}</div>
            )}
            {Array.isArray(c.closure_outputs) && c.closure_outputs.length > 0 && (
              <div className="card sub">
                <div style={{ fontWeight: 600, marginBottom: 3 }}>Ergebnisse ({c.closure_outputs.length})</div>
                {c.closure_outputs.map((o: any, i: number) => (
                  <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', padding: '2px 0' }}>
                    <span className="check-box check-done"><Check className="h-2.5 w-2.5" strokeWidth={3} /></span>
                    <div style={{ flex: 1 }}>
                      <div>{o.label}</div>
                      {(o.completed_at || o.completed_by) && (
                        <div className="task-meta">
                          {o.completed_at ? fmtDate(o.completed_at) : ''}
                          {o.completed_by ? `${o.completed_at ? ' · ' : ''}${userLabel(o.completed_by)}` : ''}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="footer">
          <div>Gedruckt: {format(new Date(), 'dd.MM.yyyy HH:mm')}</div>
          <div className="mono">{c.case_no || ''}</div>
        </div>
      </div>
    </div>
  );
}
