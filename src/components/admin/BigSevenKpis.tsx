import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import {
  ClipboardList, AlertTriangle, Timer, FolderKanban, LifeBuoy, Target, Wallet, ArrowRight,
} from 'lucide-react';

interface Props {
  /** Startdatum des Zeitraumfilters (null = gesamt) */
  startDate: Date | null;
  rangeLabel: string;
  /** Leads ohne Admin-Recht sehen keine ERP/CRM-Zahlen */
  showFinance: boolean;
  refreshKey?: number;
}

interface Kpi {
  key: string;
  label: string;
  value: string;
  sub: string;
  icon: React.ElementType;
  accent: string;
  href?: string;
  tone?: 'ok' | 'warn' | 'crit' | 'neutral';
}

const fmtEUR = (n: number) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
const fmtInt = (n: number) => n.toLocaleString('de-DE');
const fmtPct = (n: number) => `${(Math.round(n * 10) / 10).toLocaleString('de-DE')} %`;
const fmtDays = (n: number) => `${(Math.round(n * 10) / 10).toLocaleString('de-DE')} Tage`;

const ACTIVE_STATUSES = ['nicht_begonnen', 'in_planung', 'in_arbeit', 'in_verzug'];
const OPEN_TICKET_STATUSES = ['open', 'in_progress', 'waiting'];
const OPEN_DEAL_STAGES = ['anfrage', 'qualifikation', 'angebot_versendet', 'verhandlung'];

export function BigSevenKpis({ startDate, rangeLabel, showFinance, refreshKey }: Props) {
  const [loading, setLoading] = useState(true);
  const [cases, setCases] = useState<{ status: string; due_at: string | null; created_at: string; closed_at: string | null }[]>([]);
  const [projects, setProjects] = useState<{ status: string; created_at: string }[]>([]);
  const [tickets, setTickets] = useState<{ status: string; created_at: string }[]>([]);
  const [deals, setDeals] = useState<{ stage: string; value_estimated: number | null; created_at: string }[]>([]);
  const [invoices, setInvoices] = useState<{ payment_status: string; total_amount: number | null; paid_amount: number | null; created_at: string }[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const queries: PromiseLike<any>[] = [
        supabase.from('cases').select('status, due_at, created_at, closed_at').eq('deleted', false).limit(5000),
        supabase.from('projects').select('status, created_at').limit(5000),
        supabase.from('support_tickets').select('status, created_at').limit(5000),
      ];
      if (showFinance) {
        queries.push(
          (supabase as any).from('deals').select('stage, value_estimated, created_at').limit(5000),
          (supabase as any).from('invoices').select('payment_status, total_amount, paid_amount, created_at').neq('status', 'draft').limit(5000),
        );
      }
      const res = await Promise.all(queries);
      if (cancelled) return;
      setCases(res[0]?.data ?? []);
      setProjects(res[1]?.data ?? []);
      setTickets(res[2]?.data ?? []);
      if (showFinance) {
        setDeals(res[3]?.data ?? []);
        setInvoices(res[4]?.data ?? []);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [showFinance, refreshKey]);

  const kpis = useMemo<Kpi[]>(() => {
    const today = new Date().toISOString().split('T')[0];
    const inRange = (iso: string) => !startDate || new Date(iso) >= startDate;

    // 1 · Offene Vorgänge
    const fCases = cases.filter(c => inRange(c.created_at));
    const active = fCases.filter(c => ACTIVE_STATUSES.includes(c.status));

    // 2 · Verzugsquote
    const overdue = active.filter(c => c.status === 'in_verzug' || (c.due_at && c.due_at < today));
    const overdueRate = active.length ? (overdue.length / active.length) * 100 : 0;

    // 3 · Ø Durchlaufzeit (abgeschlossen im Zeitraum)
    const closed = cases.filter(c => c.status === 'abgeschlossen' && c.closed_at && inRange(c.closed_at));
    const leadDays = closed.length
      ? closed.reduce((s, c) => s + (new Date(c.closed_at!).getTime() - new Date(c.created_at).getTime()) / 86_400_000, 0) / closed.length
      : 0;

    // 4 · Aktive Projekte
    const fProjects = projects.filter(p => inRange(p.created_at));
    const activeProjects = fProjects.filter(p => p.status === 'active');

    // 5 · Offene Support-Tickets
    const fTickets = tickets.filter(t => inRange(t.created_at));
    const openTickets = fTickets.filter(t => OPEN_TICKET_STATUSES.includes(t.status));

    const list: Kpi[] = [
      {
        key: 'open', label: 'Offene Vorgänge', value: fmtInt(active.length),
        sub: `${fmtInt(fCases.length)} gesamt · ${rangeLabel}`, icon: ClipboardList,
        accent: 'bg-primary/10 text-primary', href: '/cases', tone: 'neutral',
      },
      {
        key: 'overdue', label: 'Verzugsquote', value: fmtPct(overdueRate),
        sub: `${fmtInt(overdue.length)} von ${fmtInt(active.length)} aktiven`, icon: AlertTriangle,
        accent: 'bg-[hsl(var(--status-overdue))]/10 text-[hsl(var(--status-overdue))]', href: '/cases',
        tone: overdueRate >= 25 ? 'crit' : overdueRate >= 10 ? 'warn' : 'ok',
      },
      {
        key: 'lead', label: 'Ø Durchlaufzeit', value: closed.length ? fmtDays(leadDays) : '–',
        sub: `${fmtInt(closed.length)} abgeschlossen · ${rangeLabel}`, icon: Timer,
        accent: 'bg-[hsl(var(--status-planning))]/10 text-[hsl(var(--status-planning))]', href: '/cases', tone: 'neutral',
      },
      {
        key: 'projects', label: 'Aktive Projekte', value: fmtInt(activeProjects.length),
        sub: `${fmtInt(fProjects.length)} Projekte gesamt`, icon: FolderKanban,
        accent: 'bg-[hsl(var(--status-working))]/10 text-[hsl(var(--status-working))]', href: '/projects', tone: 'neutral',
      },
      {
        key: 'tickets', label: 'Offene Support-Tickets', value: fmtInt(openTickets.length),
        sub: `${fmtInt(fTickets.length)} Tickets gesamt`, icon: LifeBuoy,
        accent: 'bg-[hsl(var(--status-open))]/10 text-[hsl(var(--status-open))]', href: '/support',
        tone: openTickets.length >= 20 ? 'warn' : 'neutral',
      },
    ];

    if (showFinance) {
      // 6 · Pipeline-Wert (offene Deals)
      const openDeals = deals.filter(d => OPEN_DEAL_STAGES.includes(d.stage) && inRange(d.created_at));
      const pipeline = openDeals.reduce((s, d) => s + (Number(d.value_estimated) || 0), 0);

      // 7 · Offene Posten (nicht bezahlte Rechnungen, unabhängig vom Zeitraum)
      const unpaid = invoices.filter(i => ['open', 'partial', 'overdue'].includes(i.payment_status ?? 'open'));
      const openAmount = unpaid.reduce((s, i) => s + ((Number(i.total_amount) || 0) - (Number(i.paid_amount) || 0)), 0);
      const overdueInv = unpaid.filter(i => i.payment_status === 'overdue');
      const overdueAmount = overdueInv.reduce((s, i) => s + ((Number(i.total_amount) || 0) - (Number(i.paid_amount) || 0)), 0);

      list.push(
        {
          key: 'pipeline', label: 'Pipeline-Wert', value: fmtEUR(pipeline),
          sub: `${fmtInt(openDeals.length)} offene Deals · ${rangeLabel}`, icon: Target,
          accent: 'bg-[hsl(var(--status-done))]/10 text-[hsl(var(--status-done))]', href: '/crm/deals', tone: 'neutral',
        },
        {
          key: 'receivables', label: 'Offene Posten', value: fmtEUR(openAmount),
          sub: `${fmtInt(unpaid.length)} Rechnungen · ${fmtEUR(overdueAmount)} überfällig`, icon: Wallet,
          accent: 'bg-[hsl(var(--status-rejected))]/10 text-[hsl(var(--status-rejected))]', href: '/erp/invoices',
          tone: overdueAmount > 0 ? 'warn' : 'ok',
        },
      );
    }
    return list;
  }, [cases, projects, tickets, deals, invoices, startDate, rangeLabel, showFinance]);

  return (
    <section aria-labelledby="big7-heading">
      <div className="flex items-baseline justify-between mb-2">
        <h2 id="big7-heading" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Big 7 · Zentrale Kennzahlen
        </h2>
        <span className="text-[11px] text-muted-foreground/70">
          {loading ? 'Lade…' : `Zeitraum: ${rangeLabel}`}
        </span>
      </div>
      <div className={cn(
        'grid gap-3 grid-cols-2 md:grid-cols-4',
        showFinance ? 'xl:grid-cols-7' : 'xl:grid-cols-5',
      )}>
        {kpis.map(k => {
          const Icon = k.icon;
          const inner = (
            <div className={cn(
              'h-full rounded-md border bg-card px-4 py-3.5 flex flex-col gap-2 transition-colors',
              k.href && 'hover:bg-muted/40 cursor-pointer',
              k.tone === 'crit' ? 'border-[hsl(var(--status-overdue))]/50'
                : k.tone === 'warn' ? 'border-[hsl(var(--status-working))]/50'
                : 'border-border',
              loading && 'opacity-60',
            )}>
              <div className="flex items-center justify-between">
                <div className={cn('h-8 w-8 rounded-lg flex items-center justify-center shrink-0', k.accent)}>
                  <Icon className="h-4 w-4" />
                </div>
                {k.href && <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40" />}
              </div>
              <div>
                <p className="text-xl font-bold text-foreground tabular-nums leading-none truncate" title={k.value}>{k.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{k.label}</p>
                <p className="text-[11px] text-muted-foreground/60 mt-0.5 truncate" title={k.sub}>{k.sub}</p>
              </div>
            </div>
          );
          return k.href
            ? <Link key={k.key} to={k.href} className="block h-full">{inner}</Link>
            : <div key={k.key}>{inner}</div>;
        })}
      </div>
    </section>
  );
}
