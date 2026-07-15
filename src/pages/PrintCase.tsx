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
}

export default function PrintCase() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [c, setC] = useState<CaseRow | null>(null);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [notes, setNotes] = useState<Array<{ id: string; body: string; author_id: string | null; created_at: string; pinned: boolean }>>([]);
  const [depts, setDepts] = useState<Record<string, string>>({});
  const [users, setUsers] = useState<Record<string, { display_name: string | null; short_code: string | null }>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const [caseRes, taskRes, noteRes, deptRes, userRes] = await Promise.all([
        (supabase as any).from('cases').select('*').eq('id', id).maybeSingle(),
        supabase.from('case_tasks').select('*').eq('case_id', id).order('archived_at', { ascending: true, nullsFirst: true }).order('sort_order', { ascending: true }),
        supabase.from('case_notes').select('id, body, author_id, created_at, pinned').eq('case_id', id).order('pinned', { ascending: false }).order('created_at', { ascending: false }),
        supabase.from('departments').select('id, name'),
        supabase.from('users_profile').select('id, display_name, short_code'),
      ]);
      setC((caseRes.data || null) as CaseRow | null);
      setTasks((taskRes.data || []) as TaskRow[]);
      setNotes((noteRes.data || []) as any);
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
        @media print {
          .no-print { display: none !important; }
          .print-page { padding: 0 !important; }
          .print-section { break-inside: avoid; page-break-inside: avoid; }
          @page { size: A4; margin: 12mm 10mm; }
        }
        .print-page { font-family: 'Inter', system-ui, sans-serif; font-size: 10pt; line-height: 1.4; color: #111; }
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
        .print-page .badge { display: inline-block; padding: 1pt 6pt; border-radius: 999px; border: 1px solid #000; font-size: 8pt; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
        .print-page .footer { margin-top: 14pt; padding-top: 6pt; border-top: 1px solid #ccc; font-size: 8pt; color: #777; display: flex; justify-content: space-between; }
      `}</style>

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
        <div className="print-section flex items-start justify-between border-b-2 border-black pb-3 mb-4">
          <div>
            <div className="sub mono">{c.case_no || (c.case_number ? `#${c.case_number}` : '')}</div>
            <h1>{c.project_name}</h1>
            <div className="sub mt-1">
              {depts[c.department_id || ''] || '—'} · Zuständig: {userLabel(c.assignee_id)}
            </div>
          </div>
          <div className="text-right">
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
              <dt>Kunde</dt><dd>{c.client_name || '—'}{c.customer_no ? ` (${c.customer_no})` : ''}</dd>
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
            <div className="card sub" style={{ whiteSpace: 'pre-wrap' }}>{c.note}</div>
          </div>
        )}

        {notes.length > 0 && (
          <div className="print-section mb-2">
            <h2>Notizen ({notes.length})</h2>
            {notes.map(n => (
              <div key={n.id} className="card mb-2" style={{ pageBreakInside: 'avoid' }}>
                <div className="sub" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2pt' }}>
                  <span>{n.pinned ? '★ ' : ''}{userLabel(n.author_id)}</span>
                  <span>{fmtDateTime(n.created_at)}</span>
                </div>
                <div style={{ whiteSpace: 'pre-wrap', fontSize: '9.5pt' }}>{n.body}</div>
              </div>
            ))}
          </div>
        )}

        {/* Tasks */}
        <div className="print-section mb-2">
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
                {t.description && <div className="task-meta" style={{ whiteSpace: 'pre-wrap' }}>{t.description}</div>}
                <div className="task-meta">
                  {depts[t.department_id || ''] ? `${depts[t.department_id!]} · ` : ''}
                  {userLabel(t.assigned_to)}
                  {t.due_at ? ` · Fällig ${fmtDate(t.due_at)}` : ''}
                  {t.completed_at ? ` · Erledigt ${fmtDate(t.completed_at)}` : ''}
                  {t.archived_at ? ` · Archiviert ${fmtDate(t.archived_at)}` : ''}
                </div>
              </div>
              <div className="task-meta text-right">
                {chili(t.urgency)}
                {t.status && <div>{t.status}</div>}
              </div>
            </div>
          ))}
        </div>

        {c.closure_summary && (
          <div className="print-section mb-2">
            <h2>Abschluss</h2>
            <div className="card sub" style={{ whiteSpace: 'pre-wrap' }}>{c.closure_summary}</div>
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
