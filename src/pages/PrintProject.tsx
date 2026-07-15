import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { Printer, ArrowLeft } from 'lucide-react';

const CASE_STATUS_LABELS: Record<string, string> = {
  nicht_begonnen: 'Nicht begonnen', in_planung: 'In Planung', in_arbeit: 'In Arbeit',
  in_verzug: 'In Verzug', abgeschlossen: 'Abgeschlossen', verworfen: 'Verworfen', archiv: 'Archiv',
  ready_for_review: 'Zur Prüfung', blocked: 'Blockiert',
};

const PROJECT_STATUS_LABELS: Record<string, string> = {
  active: 'Aktiv', completed: 'Abgeschlossen', archived: 'Archiviert',
};

const VISIBILITY_LABELS: Record<string, string> = {
  project_members: 'Nur Projektmitglieder', department: 'Abteilung', private: 'Privat',
};

interface ProjectRow {
  id: string;
  project_number: string;
  project_code: string | null;
  name: string;
  description: string | null;
  status: string;
  visibility: string;
  created_at: string;
  department_id: string | null;
  owner_id: string | null;
  created_by: string;
}

interface CaseRow {
  id: string;
  case_no: string | null;
  project_name: string;
  status: string;
  assignee_id: string | null;
  due_at: string | null;
  urgency: number | null;
}

interface MemberRow {
  user_id: string;
  role: string;
}

interface ActivityRow {
  id: string;
  actor_id: string;
  action: string;
  field: string | null;
  old_value: string | null;
  new_value: string | null;
  message: string | null;
  created_at: string;
}

const ACTION_LABELS: Record<string, string> = {
  EDIT: 'Geändert', CREATE: 'Erstellt', COMMENT: 'Kommentar', STATUS_CHANGE: 'Status geändert',
};

export default function PrintProject() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<ProjectRow | null>(null);
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [depts, setDepts] = useState<Record<string, string>>({});
  const [users, setUsers] = useState<Record<string, { display_name: string | null; short_code: string | null }>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const [projRes, caseRes, memRes, actRes, deptRes, userRes] = await Promise.all([
        supabase.from('projects').select('*').eq('id', id).maybeSingle(),
        supabase.from('cases')
          .select('id, case_no, project_name, status, assignee_id, due_at, urgency')
          .eq('project_id', id).eq('deleted', false)
          .order('created_at', { ascending: false }),
        supabase.from('project_members').select('user_id, role').eq('project_id', id),
        supabase.from('project_activity').select('id, actor_id, action, field, old_value, new_value, message, created_at')
          .eq('project_id', id).order('created_at', { ascending: false }).limit(100),
        supabase.from('departments').select('id, name'),
        supabase.from('users_profile').select('id, display_name, short_code'),
      ]);
      setProject((projRes.data || null) as ProjectRow | null);
      setCases((caseRes.data || []) as CaseRow[]);
      setMembers((memRes.data || []) as MemberRow[]);
      setActivity((actRes.data || []) as ActivityRow[]);
      const dm: Record<string, string> = {};
      (deptRes.data || []).forEach((d: any) => { dm[d.id] = d.name; });
      setDepts(dm);
      const um: Record<string, any> = {};
      (userRes.data || []).forEach((u: any) => { um[u.id] = { display_name: u.display_name, short_code: u.short_code }; });
      setUsers(um);
      setLoading(false);
    })();
  }, [id]);

  const fmtDate = (d: string | null | undefined) => (d ? format(new Date(d), 'dd.MM.yyyy') : '—');
  const fmtDateTime = (d: string | null | undefined) => (d ? format(new Date(d), 'dd.MM.yyyy HH:mm') : '—');
  const chili = (n?: number | null) => (n && n > 0 ? '🌶'.repeat(n) : '');
  const userLabel = (uid: string | null | undefined) => {
    if (!uid) return '—';
    const u = users[uid];
    if (!u) return '—';
    return u.short_code ? `${u.display_name || ''} (${u.short_code})` : (u.display_name || '—');
  };

  const stats = useMemo(() => {
    const total = cases.length;
    const done = cases.filter(c => c.status === 'abgeschlossen').length;
    const open = cases.filter(c => !['abgeschlossen', 'verworfen', 'archiv'].includes(c.status)).length;
    const overdue = cases.filter(c => c.status === 'in_verzug').length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    return { total, done, open, overdue, pct };
  }, [cases]);

  if (loading) return <div className="p-8 text-sm text-gray-600">Laden…</div>;
  if (!project) return <div className="p-8 text-sm text-gray-600">Projekt nicht gefunden.</div>;

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
        .print-page .badge { display: inline-block; padding: 1pt 6pt; border-radius: 999px; border: 1px solid #000; font-size: 8pt; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
        .print-page .progress-shell { width: 100%; height: 10pt; background: #eee; border-radius: 999px; overflow: hidden; border: 1px solid #ccc; }
        .print-page .progress-fill { height: 100%; background: #000; }
        .print-page table { width: 100%; border-collapse: collapse; font-size: 9pt; }
        .print-page th { text-align: left; font-weight: 600; border-bottom: 1px solid #000; padding: 3pt 4pt; }
        .print-page td { border-bottom: 1px dashed #ddd; padding: 3pt 4pt; vertical-align: top; }
        .print-page tr { break-inside: avoid; }
        .print-page .footer { margin-top: 14pt; padding-top: 6pt; border-top: 1px solid #ccc; font-size: 8pt; color: #777; display: flex; justify-content: space-between; }
      `}</style>

      <div className="no-print sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-xs text-gray-600 hover:text-black">
          <ArrowLeft className="h-3 w-3" /> Zurück
        </button>
        <div className="flex-1" />
        <button onClick={() => window.print()} className="flex items-center gap-2 px-3 py-1.5 rounded bg-black text-white text-xs font-medium hover:bg-gray-800">
          <Printer className="h-3.5 w-3.5" /> Drucken
        </button>
      </div>

      <div className="max-w-[190mm] mx-auto p-6">
        {/* Header */}
        <div className="print-section flex items-start justify-between border-b-2 border-black pb-3 mb-4">
          <div>
            <div className="sub mono">
              {project.project_number}{project.project_code ? ` · ${project.project_code}` : ''}
            </div>
            <h1>{project.name}</h1>
            <div className="sub mt-1">
              {depts[project.department_id || ''] || '—'} · Inhaber: {userLabel(project.owner_id || project.created_by)}
            </div>
          </div>
          <div className="text-right">
            <span className="badge">{PROJECT_STATUS_LABELS[project.status] || project.status}</span>
            <div className="sub mt-2">Sichtbarkeit: {VISIBILITY_LABELS[project.visibility] || project.visibility}</div>
            <div className="sub">Erstellt: {fmtDate(project.created_at)}</div>
          </div>
        </div>

        {/* Progress */}
        {stats.total > 0 && (
          <div className="print-section mb-4">
            <div className="flex items-baseline justify-between mb-1">
              <div className="text-xs font-semibold uppercase tracking-wider">Fortschritt</div>
              <div className="sub">{stats.done} von {stats.total} Vorgängen abgeschlossen · {stats.pct}%</div>
            </div>
            <div className="progress-shell">
              <div className="progress-fill" style={{ width: `${stats.pct}%` }} />
            </div>
          </div>
        )}

        {/* Overview */}
        <div className="print-section grid2 mb-2">
          <div>
            <h2>Projekt</h2>
            <dl className="kv">
              <dt>Nummer</dt><dd className="mono">{project.project_number}</dd>
              <dt>Kürzel</dt><dd>{project.project_code || '—'}</dd>
              <dt>Abteilung</dt><dd>{depts[project.department_id || ''] || '—'}</dd>
              <dt>Inhaber</dt><dd>{userLabel(project.owner_id)}</dd>
              <dt>Erstellt von</dt><dd>{userLabel(project.created_by)}</dd>
            </dl>
          </div>
          <div>
            <h2>Kennzahlen</h2>
            <dl className="kv">
              <dt>Vorgänge gesamt</dt><dd>{stats.total}</dd>
              <dt>Offen</dt><dd>{stats.open}</dd>
              <dt>In Verzug</dt><dd>{stats.overdue}</dd>
              <dt>Abgeschlossen</dt><dd>{stats.done}</dd>
              <dt>Mitglieder</dt><dd>{members.length}</dd>
            </dl>
          </div>
        </div>

        {project.description && (
          <div className="print-section mb-2">
            <h2>Beschreibung</h2>
            <div className="card sub" style={{ whiteSpace: 'pre-wrap' }}>{project.description}</div>
          </div>
        )}

        {/* Members */}
        {members.length > 0 && (
          <div className="print-section mb-2">
            <h2>Mitglieder ({members.length})</h2>
            <table>
              <thead><tr><th>Name</th><th>Rolle</th></tr></thead>
              <tbody>
                {members.map(m => (
                  <tr key={m.user_id}>
                    <td>{userLabel(m.user_id)}</td>
                    <td>{m.role}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Cases */}
        <div className="print-section mb-2">
          <h2>Verknüpfte Vorgänge ({cases.length})</h2>
          {cases.length === 0 && <div className="sub">Keine Vorgänge.</div>}
          {cases.length > 0 && (
            <table>
              <thead>
                <tr>
                  <th style={{ width: '22mm' }}>Nr.</th>
                  <th>Bezeichnung</th>
                  <th style={{ width: '28mm' }}>Status</th>
                  <th style={{ width: '24mm' }}>Bearbeiter</th>
                  <th style={{ width: '20mm' }}>Fällig</th>
                  <th style={{ width: '14mm' }}>Prio</th>
                </tr>
              </thead>
              <tbody>
                {cases.map(c => (
                  <tr key={c.id}>
                    <td className="mono">{c.case_no || '—'}</td>
                    <td>{c.project_name}</td>
                    <td>{CASE_STATUS_LABELS[c.status] || c.status}</td>
                    <td>{userLabel(c.assignee_id)}</td>
                    <td>{fmtDate(c.due_at)}</td>
                    <td>{chili(c.urgency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Activity */}
        {activity.length > 0 && (
          <div className="print-section mb-2">
            <h2>Aktivitäten ({activity.length})</h2>
            <table>
              <thead>
                <tr>
                  <th style={{ width: '28mm' }}>Zeitpunkt</th>
                  <th style={{ width: '24mm' }}>Akteur</th>
                  <th>Ereignis</th>
                </tr>
              </thead>
              <tbody>
                {activity.map(a => (
                  <tr key={a.id}>
                    <td>{fmtDateTime(a.created_at)}</td>
                    <td>{userLabel(a.actor_id)}</td>
                    <td>
                      {a.action === 'COMMENT' ? (
                        <span style={{ whiteSpace: 'pre-wrap' }}>{a.message}</span>
                      ) : (
                        <>
                          {ACTION_LABELS[a.action] || a.action}
                          {a.field ? ` · ${a.field}` : ''}
                          {a.old_value ? ` : ${a.old_value}` : ''}
                          {a.new_value ? ` → ${a.new_value}` : ''}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="footer">
          <div>Gedruckt: {format(new Date(), 'dd.MM.yyyy HH:mm')}</div>
          <div className="mono">{project.project_number}</div>
        </div>
      </div>
    </div>
  );
}
