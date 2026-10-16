import { useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Users, Plus, Upload, Pencil, UserPlus, Briefcase, Mail, Phone, Activity, EyeOff,
  Loader2, AlertCircle, RefreshCw, ArrowUpRight, Check,
} from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, Tooltip } from 'recharts';
import { toast } from 'sonner';
import { CrmLayout } from '@/components/CrmLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  buildContactViews, contactPages, filterForPage, fullName, groupByResponsible, isInactive,
  INACTIVE_AFTER_DAYS, type Contact, type ContactActivity, type ContactDeal, type ContactPageKey, type ContactView,
} from '@/lib/contactPages';
import type { Tables } from '@/integrations/supabase/types';
import { cn } from '@/lib/utils';

const icons = { data: Pencil, assign: UserPlus, owners: Briefcase, email: Mail, phone: Phone, history: Activity, inactive: EyeOff };
const emailLabel = { ohne: 'Keine Adresse', abgemeldet: 'Abgemeldet', unzustellbar: 'Unzustellbar', freigegeben: 'Einwilligung erteilt', ohne_freigabe: 'Ohne Einwilligung' } as const;
const emailTone = { ohne: 'text-muted-foreground', abgemeldet: 'text-status-overdue', unzustellbar: 'text-status-overdue', freigegeben: 'text-status-done', ohne_freigabe: 'text-status-working' } as const;
const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString('de-DE') : '–');
const DAY = 86_400_000;
const daysSince = (d: string | null, now = Date.now()) => (d ? Math.floor((now - new Date(d).getTime()) / DAY) : null);

async function paged<T>(read: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const out: T[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await read(from, from + 499);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if ((data ?? []).length < 500) return out;
  }
}

function Metric({ label, value, tone = '' }: { label: string; value: number; tone?: string }) {
  return <div className="py-4 px-4 border-l border-border first:border-l-0"><div className={cn('text-3xl font-medium tabular-nums', tone)}>{value}</div><div className="text-xs text-muted-foreground mt-1">{label}</div></div>;
}

export default function ContactWorkspace({ page: key }: { page?: ContactPageKey }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { pathname } = useLocation();
  const page = contactPages.find(p => p.key === key);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['crm-contact-workspace', user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const [contacts, companies, activities, deals, unsubscribes, bounced, staff] = await Promise.all([
        paged<Contact>((f, t) => supabase.from('contacts').select('*').order('id').range(f, t)),
        paged<Tables<'companies'>>((f, t) => supabase.from('companies').select('*').order('id').range(f, t)),
        paged<ContactActivity>((f, t) => supabase.from('crm_activities').select('id, contact_id, owner_id, subject, type, created_at, completed_at, due_at').not('contact_id', 'is', null).order('id').range(f, t)),
        paged<ContactDeal>((f, t) => supabase.from('deals').select('id, primary_contact_id, owner_id, updated_at').not('primary_contact_id', 'is', null).order('id').range(f, t)),
        paged<{ contact_id: string }>((f, t) => supabase.from('crm_unsubscribes').select('contact_id').eq('is_unsubscribed', true).order('contact_id').range(f, t)),
        paged<{ contact_id: string }>((f, t) => supabase.from('crm_email_tracking').select('contact_id').not('contact_id', 'is', null).not('bounced_at', 'is', null).order('id').range(f, t)),
        paged<{ id: string; display_name: string | null; short_code: string | null }>((f, t) => supabase.from('users_profile').select('id, display_name, short_code').order('id').range(f, t)),
      ]);
      return { contacts, companies, activities, deals, unsubscribes, bounced, staff };
    },
  });

  const d = query.data;
  const views = useMemo(() => (d
    ? buildContactViews(
      d.contacts, d.activities, d.deals,
      new Set(d.unsubscribes.map(u => u.contact_id)),
      new Set(d.bounced.map(b => b.contact_id)),
    )
    : []), [d]);
  const companyNames = useMemo(() => new Map((d?.companies ?? []).map(c => [c.id, c.name])), [d]);
  const staffNames = useMemo(() => new Map((d?.staff ?? []).map(s => [s.id, s.display_name || s.short_code || 'Unbekannt'])), [d]);

  const rows = useMemo(() => filterForPage(key ?? null, views)
    .filter(v => `${fullName(v.c)} ${v.c.email ?? ''} ${v.c.phone ?? ''} ${v.c.position ?? ''} ${companyNames.get(v.c.company_id) ?? ''}`.toLowerCase().includes(search.toLowerCase())),
  [views, key, search, companyNames]);

  const planFollowUp = async (v: ContactView, subject: string, msg: string) => {
    if (!user) return;
    setBusy(v.c.id);
    const { error } = await supabase.from('crm_activities').insert({
      type: 'task', subject, contact_id: v.c.id, company_id: v.c.company_id,
      owner_id: user.id, due_at: new Date(Date.now() + 7 * DAY).toISOString(), auto_generated: false,
    });
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    toast.success(msg);
    await qc.invalidateQueries({ queryKey: ['crm-contact-workspace', user.id] });
  };

  const action = (v: ContactView) => (key === 'assign' || key === 'inactive')
    ? <Button size="sm" variant="outline" disabled={busy === v.c.id} onClick={() => void planFollowUp(v, `Kontakt nachfassen: ${fullName(v.c)}`, 'Nachfassung geplant')}>
      {busy === v.c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Check className="h-3.5 w-3.5 mr-1" />Nachfassen</>}
    </Button>
    : <Button asChild size="sm" variant="ghost"><Link to={`/crm/contacts?edit=${v.c.id}`}>Bearbeiten<ArrowUpRight className="h-3.5 w-3.5 ml-1" /></Link></Button>;

  const detail = (v: ContactView) => {
    if (key === 'data' || !key) return v.gaps.length ? <span className="text-status-working">{v.gaps.join(', ')}</span> : <span className="text-status-done">Vollständig</span>;
    if (key === 'email') return <span className={emailTone[v.email]}>{emailLabel[v.email]}<span className="text-muted-foreground ml-2">{v.c.email}</span></span>;
    if (key === 'history') return v.lastSubject ? <span>{v.lastSubject} <span className="text-muted-foreground">· {fmt(v.lastActivityAt)} · {v.activityCount} Aktivitäten</span></span> : <span className="text-muted-foreground">Kein Verlauf</span>;
    if (key === 'inactive') { const n = daysSince(v.lastActivityAt); return n === null ? <span className="text-status-overdue">Nie kontaktiert</span> : <span className="text-status-overdue">Kein Kontakt seit {n} Tagen</span>; }
    if (key === 'assign') return <span className="text-status-overdue">Niemand zuständig</span>;
    return <span className="tabular-nums">{v.activityCount}</span>;
  };
  const detailHead = { data: 'Fehlende Angaben', assign: 'Status', owners: 'Zuständig', email: 'E-Mail-Status', phone: 'Nummern', history: 'Letzte Aktivität', inactive: 'Letzter Kontakt' }[key ?? 'data'];

  const table = (list = rows) => list.length === 0
    ? <p className="text-xs text-muted-foreground py-8 text-center">Keine Kontakte in diesem Bereich.</p>
    : <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="text-left text-muted-foreground border-b border-border"><th className="py-2 font-normal">Kontakt</th><th className="font-normal">Firma</th><th className="font-normal">{detailHead}</th><th /></tr></thead>
      <tbody>{list.slice(0, 300).map(v => <tr key={v.c.id} className="border-b border-border/60">
        <td className="py-2.5 font-medium">{fullName(v.c)}<div className="text-muted-foreground font-normal">{v.c.position ?? '–'}</div></td>
        <td className="text-muted-foreground">{companyNames.get(v.c.company_id) ?? <span className="text-status-overdue">Fehlt</span>}</td>
        <td>{detail(v)}</td>
        <td className="text-right whitespace-nowrap">{key === 'phone'
          ? <span className="flex gap-1 justify-end">{v.c.phone && <Button asChild size="sm" variant="ghost"><a href={`tel:${v.c.phone}`}>{v.c.phone}</a></Button>}{v.c.mobile && <Button asChild size="sm" variant="ghost"><a href={`tel:${v.c.mobile}`}>Mobil</a></Button>}</span>
          : action(v)}</td>
      </tr>)}</tbody></table>
      {list.length > 300 && <p className="text-xs text-muted-foreground py-3">300 von {list.length} angezeigt – Suche verfeinern.</p>}</div>;

  const open = (label: string, n: number, to: string) => <Link key={label} to={to} className="flex justify-between items-center py-3.5 text-xs hover:text-primary"><span>{label}</span><span className="flex gap-3 items-center"><span className="tabular-nums text-lg font-medium">{n}</span><ArrowUpRight className="h-3.5 w-3.5" /></span></Link>;

  const content = () => {
    if (!d) return null;
    if (key === 'owners') {
      const groups = groupByResponsible(rows, id => staffNames.get(id) ?? 'Unbekannt');
      return groups.length === 0
        ? <p className="text-xs text-muted-foreground py-8 text-center">Keine Kontakte.</p>
        : <div className="grid md:grid-cols-2 gap-x-8">{groups.map(g => <div key={g.name} className="border-b border-border py-4">
          <div className="flex justify-between text-sm mb-2"><span className="font-medium">{g.name}</span><span className="tabular-nums text-muted-foreground">{g.members.length}</span></div>
          <div className="flex flex-wrap gap-1.5">{g.members.slice(0, 20).map(v => <Link key={v.c.id} to={`/crm/contacts?edit=${v.c.id}`} className="text-xs px-2 py-1 rounded border border-border hover:border-primary hover:text-primary">{fullName(v.c)}</Link>)}{g.members.length > 20 && <span className="text-xs text-muted-foreground py-1">+{g.members.length - 20}</span>}</div>
        </div>)}</div>;
    }
    if (key === 'phone') {
      const byCompany = new Map<string, ContactView[]>();
      for (const v of rows) { const k = companyNames.get(v.c.company_id) ?? 'Ohne Firma'; byCompany.set(k, [...(byCompany.get(k) ?? []), v]); }
      const groups = [...byCompany].sort((a, b) => b[1].length - a[1].length);
      return groups.length === 0
        ? <p className="text-xs text-muted-foreground py-8 text-center">Keine Kontakte mit Telefonnummer.</p>
        : <div className="divide-y divide-border">{groups.map(([name, list]) => <div key={name} className="py-4">
          <h3 className="text-sm font-medium mb-2">{name} <span className="text-xs text-muted-foreground">{list.length}</span></h3>
          <div className="grid sm:grid-cols-2 gap-x-8">{list.slice(0, 40).map(v => <div key={v.c.id} className="flex justify-between gap-3 py-1.5 text-xs">
            <Link to={`/crm/contacts?edit=${v.c.id}`} className="hover:text-primary">{fullName(v.c)}<span className="text-muted-foreground ml-2">{v.c.position ?? ''}</span></Link>
            <span className="tabular-nums text-muted-foreground whitespace-nowrap">{[v.c.phone, v.c.mobile].filter(Boolean).join(' · ') || '–'}</span>
          </div>)}</div>
        </div>)}</div>;
    }
    if (key === 'email') return <>{table()}<h2 className="text-sm font-medium mt-8 mb-3">Ohne E-Mail-Adresse <span className="text-xs text-muted-foreground">{views.filter(v => v.email === 'ohne').length}</span></h2>{table(views.filter(v => v.email === 'ohne').filter(v => `${fullName(v.c)} ${companyNames.get(v.c.company_id) ?? ''}`.toLowerCase().includes(search.toLowerCase())))}</>;
    return table();
  };

  return <CrmLayout>
    <header className="flex flex-wrap items-start justify-between gap-3 mb-5">
      <div><div className="flex items-center gap-2 text-xs text-muted-foreground mb-2"><Users className="h-3.5 w-3.5" />Kunden gewinnen<span>/</span>Ansprechpartner</div><h1 className="text-xl font-medium">{page?.title ?? 'Ansprechpartner'}</h1></div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="icon" aria-label="Aktualisieren" onClick={() => void query.refetch()}><RefreshCw className={cn('h-4 w-4', query.isFetching && 'animate-spin')} /></Button>
        <Button asChild size="sm" variant="outline"><Link to="/crm/contacts?action=import"><Upload className="h-4 w-4 mr-1.5" />Importieren</Link></Button>
        <Button asChild size="sm"><Link to="/crm/contacts?action=new"><Plus className="h-4 w-4 mr-1.5" />Kontakt anlegen</Link></Button>
      </div>
    </header>
    <nav aria-label="Ansprechpartnerseiten" className="flex gap-1 overflow-x-auto border-b border-border pb-3 mb-6">
      <Button asChild size="sm" variant={pathname === '/crm/ansprechpartner' ? 'secondary' : 'ghost'} className="shrink-0 text-xs"><Link to="/crm/ansprechpartner"><Users className="h-3.5 w-3.5 mr-1.5" />Übersicht</Link></Button>
      {contactPages.map(p => { const I = icons[p.key]; return <Button asChild key={p.key} size="sm" variant={pathname === p.path ? 'secondary' : 'ghost'} className="shrink-0 text-xs"><Link to={p.path}><I className="h-3.5 w-3.5 mr-1.5" />{p.short}</Link></Button>; })}
      <Button asChild size="sm" variant="ghost" className="shrink-0 text-xs"><Link to="/crm/contacts"><ArrowUpRight className="h-3.5 w-3.5 mr-1.5" />Vollständige Liste</Link></Button>
    </nav>
    {query.isLoading ? <div role="status" className="flex justify-center gap-2 text-muted-foreground py-20"><Loader2 className="h-5 w-5 animate-spin" />Kontakte werden geladen…</div>
    : query.isError ? <div role="alert" className="py-12 text-center space-y-3"><AlertCircle className="h-6 w-6 mx-auto text-destructive" /><p>Kontakte konnten nicht geladen werden.</p><Button variant="outline" onClick={() => void query.refetch()}>Erneut versuchen</Button></div>
    : d && <>
      <div className="grid grid-cols-2 md:grid-cols-4 border-y border-border mb-7">
        <Metric label="Kontakte" value={views.length} />
        <Metric label="Entscheider" value={views.filter(v => v.c.is_decision_maker).length} tone="text-status-done" />
        <Metric label="Ohne Zuständige:n" value={views.filter(v => !v.responsible).length} tone={views.some(v => !v.responsible) ? 'text-status-overdue' : 'text-muted-foreground'} />
        <Metric label={`Ohne Kontakt (${INACTIVE_AFTER_DAYS} T.)`} value={views.filter(v => isInactive(v.lastActivityAt)).length} tone="text-status-working" />
      </div>
      {!key && <section className="grid lg:grid-cols-2 gap-8 mb-8">
        <div><h2 className="text-sm font-medium mb-4">Betreuung</h2><div className="h-48"><ResponsiveContainer width="100%" height="100%"><BarChart data={[{ name: 'Mit Zuständigkeit', Anzahl: views.filter(v => v.responsible).length }, { name: 'Ohne Zuständigkeit', Anzahl: views.filter(v => !v.responsible).length }]}><XAxis dataKey="name" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip cursor={false} content={({ active, payload }) => active && payload?.length ? <div className="rounded border border-border bg-popover p-2 text-xs">{String(payload[0]?.payload.name)}: {payload[0]?.value}</div> : null} /><Bar dataKey="Anzahl" fill="hsl(var(--status-working))" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div></div>
        <div><h2 className="text-sm font-medium mb-3">Was ist zu tun</h2><div className="divide-y divide-border">
          {open('Kontakte ohne Zuständige:n', views.filter(v => !v.responsible).length, '/crm/ansprechpartner/zuweisen')}
          {open('Mit fehlenden Angaben', views.filter(v => v.gaps.length).length, '/crm/ansprechpartner/pflegen')}
          {open('Ohne E-Mail-Adresse', views.filter(v => v.email === 'ohne').length, '/crm/ansprechpartner/email')}
          {open('Ohne Telefonnummer', views.filter(v => !v.c.phone && !v.c.mobile).length, '/crm/ansprechpartner/telefon')}
          {open(`Ohne Kontakt seit ${INACTIVE_AFTER_DAYS} Tagen`, views.filter(v => isInactive(v.lastActivityAt)).length, '/crm/ansprechpartner/inaktiv')}
        </div></div>
      </section>}
      <section>
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap"><h2 className="text-sm font-medium">{page?.title ?? 'Kontakte mit den größten Lücken'} <span className="text-xs text-muted-foreground ml-1">{rows.length}</span></h2><Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Suchen…" className="h-8 w-56 text-xs" /></div>
        {content()}
      </section>
    </>}
  </CrmLayout>;
}
