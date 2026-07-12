import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { STATUS_LABELS } from '@/lib/case-utils';
import { format } from 'date-fns';
import { Printer, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface CaseRow {
  id: string;
  case_no: string;
  project_name: string;
  status: string;
  due_at: string | null;
  urgency: number | null;
  department_id: string | null;
}
interface TaskRow {
  id: string;
  case_id: string;
  title: string;
  status: string | null;
  completed: boolean;
  due_at: string | null;
  urgency: number | null;
}

const ORDER = ['in_verzug', 'in_arbeit', 'ready_for_review', 'in_planung', 'nicht_begonnen', 'blocked'];

export default function PrintMyTasks() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [depts, setDepts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const [caseRes, taskRes, deptRes] = await Promise.all([
        supabase
          .from('cases')
          .select('id, case_no, project_name, status, due_at, urgency, department_id')
          .eq('assigned_to', user.id)
          .eq('deleted', false)
          .not('status', 'in', '(abgeschlossen,archiv)')
          .order('due_at', { ascending: true, nullsFirst: false }),
        supabase
          .from('case_tasks')
          .select('id, case_id, title, status, completed, due_at, urgency')
          .eq('assigned_to', user.id)
          .is('archived_at', null)
          .eq('completed', false)
          .order('due_at', { ascending: true, nullsFirst: false }),
        supabase.from('departments').select('id, name'),
      ]);
      setCases((caseRes.data || []) as CaseRow[]);
      setTasks((taskRes.data || []) as TaskRow[]);
      const dm: Record<string, string> = {};
      (deptRes.data || []).forEach((d: any) => { dm[d.id] = d.name; });
      setDepts(dm);
      setLoading(false);
    })();
  }, [user?.id]);

  const grouped = useMemo(() => {
    const map: Record<string, CaseRow[]> = {};
    cases.forEach(c => { (map[c.status] ||= []).push(c); });
    return ORDER.filter(s => map[s]?.length).map(s => ({ status: s, cases: map[s] }));
  }, [cases]);

  const tasksByCase = useMemo(() => {
    const m: Record<string, TaskRow[]> = {};
    tasks.forEach(t => { (m[t.case_id] ||= []).push(t); });
    return m;
  }, [tasks]);

  const orphanTasks = tasks.filter(t => !cases.some(c => c.id === t.case_id));

  const chili = (n?: number | null) => (n && n > 0 ? '🌶'.repeat(n) : '');
  const fmtDate = (d: string | null) => (d ? format(new Date(d), 'dd.MM.yyyy') : '—');

  return (
    <div className="print-page bg-white text-black min-h-screen">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-page { padding: 0 !important; }
          .print-section { break-inside: avoid; page-break-inside: avoid; }
          @page { size: A4; margin: 12mm 10mm; }
        }
        .print-page { font-family: 'Inter', system-ui, sans-serif; font-size: 10pt; line-height: 1.35; }
        .print-page h1 { font-size: 16pt; font-weight: 700; }
        .print-page h2 { font-size: 12pt; font-weight: 600; margin-top: 10pt; border-bottom: 1px solid #000; padding-bottom: 2pt; }
        .print-page table { width: 100%; border-collapse: collapse; margin-top: 4pt; }
        .print-page th, .print-page td { text-align: left; padding: 2pt 4pt; border-bottom: 1px solid #ccc; vertical-align: top; }
        .print-page th { font-size: 8pt; font-weight: 600; text-transform: uppercase; color: #444; border-bottom: 1px solid #000; }
        .print-page .sub { font-size: 8.5pt; color: #555; }
        .print-page .check { display: inline-block; width: 10pt; height: 10pt; border: 1px solid #000; margin-right: 4pt; vertical-align: middle; }
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
        <div className="flex items-end justify-between border-b border-black pb-2 mb-3">
          <div>
            <h1>Meine Aufgaben</h1>
            <div className="sub">{profile?.display_name} · {profile?.short_code}</div>
          </div>
          <div className="sub text-right">
            Stand: {format(new Date(), 'dd.MM.yyyy HH:mm')}<br />
            {cases.length} Vorgänge · {tasks.length} offene Unteraufgaben
          </div>
        </div>

        {loading && <p className="sub">Laden…</p>}

        {!loading && grouped.length === 0 && orphanTasks.length === 0 && (
          <p className="sub mt-6">Keine offenen Aufgaben.</p>
        )}

        {grouped.map(g => (
          <div key={g.status} className="print-section mb-3">
            <h2>{STATUS_LABELS[g.status as keyof typeof STATUS_LABELS] || g.status} ({g.cases.length})</h2>
            <table>
              <thead>
                <tr>
                  <th style={{ width: '18mm' }}>Nr.</th>
                  <th>Vorgang / Aufgabe</th>
                  <th style={{ width: '28mm' }}>Abteilung</th>
                  <th style={{ width: '20mm' }}>Fällig</th>
                  <th style={{ width: '14mm' }}>Prio</th>
                  <th style={{ width: '30mm' }}>Notizen</th>
                </tr>
              </thead>
              <tbody>
                {g.cases.map(c => {
                  const ts = tasksByCase[c.id] || [];
                  return (
                    <>
                      <tr key={c.id}>
                        <td className="font-mono">{c.case_no}</td>
                        <td className="font-medium">{c.project_name}</td>
                        <td className="sub">{depts[c.department_id || ''] || '—'}</td>
                        <td>{fmtDate(c.due_at)}</td>
                        <td>{chili(c.urgency)}</td>
                        <td></td>
                      </tr>
                      {ts.map(t => (
                        <tr key={t.id}>
                          <td></td>
                          <td colSpan={1}>
                            <span className="check" />
                            <span className="sub">{t.title}</span>
                          </td>
                          <td className="sub">{t.status || '—'}</td>
                          <td className="sub">{fmtDate(t.due_at)}</td>
                          <td className="sub">{chili(t.urgency)}</td>
                          <td></td>
                        </tr>
                      ))}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}

        {orphanTasks.length > 0 && (
          <div className="print-section mb-3">
            <h2>Weitere offene Unteraufgaben ({orphanTasks.length})</h2>
            <table>
              <thead>
                <tr>
                  <th></th>
                  <th>Aufgabe</th>
                  <th style={{ width: '20mm' }}>Status</th>
                  <th style={{ width: '20mm' }}>Fällig</th>
                  <th style={{ width: '14mm' }}>Prio</th>
                  <th style={{ width: '30mm' }}>Notizen</th>
                </tr>
              </thead>
              <tbody>
                {orphanTasks.map(t => (
                  <tr key={t.id}>
                    <td><span className="check" /></td>
                    <td>{t.title}</td>
                    <td className="sub">{t.status || '—'}</td>
                    <td className="sub">{fmtDate(t.due_at)}</td>
                    <td>{chili(t.urgency)}</td>
                    <td></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
