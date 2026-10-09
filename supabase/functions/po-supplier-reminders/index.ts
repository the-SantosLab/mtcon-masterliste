// Automatic supplier emails for purchase orders:
//  - status_query: once per confirmed date, when the confirmed delivery date is within 14 days
//  - delivery_delay: once per confirmed date, when the date has passed and quantities are still open
// Runs daily via pg_cron (idempotent). Admins may also trigger a manual send for one PO.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, sendResendEmail } from '../_shared/email-helpers.ts';

type EmailType = 'status_query' | 'delivery_delay';
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fmtDate = (d: string) => { const [y, m, dd] = d.split('-'); return `${dd}.${m}.${y}`; };
const isoDay = (offset = 0) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + offset); return d.toISOString().slice(0, 10); };

function render(tpl: string, vars: Record<string, string>) {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');
}

async function processPO(admin: any, po: any, type: EmailType, templates: Record<string, any>, opts: { manual: boolean; userId?: string }) {
  const { data: items } = await admin.from('purchase_order_items')
    .select('position, art_nr, description, qty_ordered, qty_received').eq('po_id', po.id).order('position');
  const open = (items ?? []).filter((i: any) => Number(i.qty_ordered) - Number(i.qty_received) > 0);
  if (!opts.manual && open.length === 0) return 'skipped';
  const list = (type === 'delivery_delay' ? open : (items ?? []))
    .map((i: any) => `- ${i.art_nr}${i.description ? ' ' + i.description : ''}: ${i.qty_ordered} bestellt${Number(i.qty_received) > 0 ? `, ${i.qty_received} geliefert` : ''}`)
    .join('\n');
  const s = po.suppliers ?? {};
  const tpl = templates[type];
  const vars = {
    po_no: po.po_no ?? '', supplier_name: s.name ?? '', contact_name: s.contact_name || 'Damen und Herren',
    delivery_date: fmtDate(po.confirmed_delivery_date), items: list,
  };
  const subject = render(tpl.subject, vars);
  const body = render(tpl.body, vars);
  const base = { po_id: po.id, email_type: type, trigger_date: po.confirmed_delivery_date, subject, body, manual: opts.manual, sent_by: opts.userId ?? null };

  if (!s.email) {
    await admin.from('purchase_order_email_logs').insert({ ...base, status: 'no_recipient', recipient_name: s.contact_name ?? null });
    await admin.from('purchase_orders').update({
      needs_clarification: true,
      clarification_reason: `Keine E-Mail-Adresse beim Lieferanten ${s.name ?? ''} hinterlegt – ${type === 'status_query' ? 'Statusabfrage' : 'Verzugsmeldung'} nicht versendet`,
    }).eq('id', po.id);
    return 'no_recipient';
  }

  const html = `<div style="font-family:-apple-system,Segoe UI,sans-serif;font-size:14px;line-height:1.55;color:#1a1a1a;white-space:pre-wrap">${esc(body)}</div>`;
  const ok = await sendResendEmail(s.email, subject, html);
  await admin.from('purchase_order_email_logs').insert({
    ...base, status: ok ? 'sent' : 'failed', recipient_email: s.email, recipient_name: s.contact_name ?? null,
    error: ok ? null : 'Versand fehlgeschlagen',
  });
  if (ok) {
    const patch: Record<string, unknown> = type === 'status_query'
      ? { status_query_mailed_at: new Date().toISOString() }
      : { supplier_delay_mailed_at: new Date().toISOString() };
    if (po.needs_clarification) { patch.needs_clarification = false; patch.clarification_reason = null; }
    await admin.from('purchase_orders').update(patch).eq('id', po.id);
  }
  return ok ? 'sent' : 'failed';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const body = await req.json().catch(() => ({}));
    const { data: tplRows } = await admin.from('purchase_email_templates').select('*');
    const templates = Object.fromEntries((tplRows ?? []).map((t: any) => [t.email_type, t]));
    const select = 'id, po_no, status, confirmed_delivery_date, needs_clarification, suppliers(name, contact_name, email)';

    // Manual send for one PO (admin/staff only)
    if (body?.po_id) {
      const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
      const { data: claims } = await admin.auth.getClaims(token);
      const uid = claims?.claims?.sub as string | undefined;
      if (!uid) return json({ error: 'Nicht angemeldet' }, 401);
      const { data: roles } = await admin.from('user_roles').select('role').eq('user_id', uid);
      if (!(roles ?? []).some((r: any) => r.role === 'admin' || r.role === 'staff')) return json({ error: 'Keine Berechtigung' }, 403);
      const type = body.email_type as EmailType;
      if (type !== 'status_query' && type !== 'delivery_delay') return json({ error: 'Ungültiger Typ' }, 400);
      const { data: po } = await admin.from('purchase_orders').select(select).eq('id', body.po_id).maybeSingle();
      if (!po) return json({ error: 'Bestellung nicht gefunden' }, 404);
      if (!po.confirmed_delivery_date) return json({ error: 'Kein bestätigter Liefertermin hinterlegt' }, 400);
      if (po.status === 'received' || po.status === 'cancelled') return json({ error: 'Bestellung ist geliefert oder storniert' }, 400);
      return json({ result: await processPO(admin, po, type, templates, { manual: true, userId: uid }) });
    }

    // Daily automatic run
    const today = isoDay(0);
    const in14 = isoDay(14);
    const { data: pos, error } = await admin.from('purchase_orders').select(select)
      .in('status', ['ordered', 'partial']).not('confirmed_delivery_date', 'is', null);
    if (error) throw error;

    const stats = { status_query: 0, delivery_delay: 0, no_recipient: 0, failed: 0 };
    for (const po of pos ?? []) {
      const d = po.confirmed_delivery_date as string;
      let type: EmailType | null = null;
      if (d < today) type = 'delivery_delay';
      else if (d <= in14) type = 'status_query';
      if (!type) continue;
      // Dedupe: one automatic attempt per PO, type and confirmed date (sent or no_recipient)
      const { count } = await admin.from('purchase_order_email_logs').select('id', { count: 'exact', head: true })
        .eq('po_id', po.id).eq('email_type', type).eq('trigger_date', d).eq('manual', false).in('status', ['sent', 'no_recipient']);
      if ((count ?? 0) > 0) continue;
      if (type === 'delivery_delay') {
        await admin.from('purchase_orders').update({ delay_flagged_at: new Date().toISOString() }).eq('id', po.id).is('delay_flagged_at', null);
      }
      const r = await processPO(admin, po, type, templates, { manual: false });
      if (r === 'sent') stats[type]++;
      else if (r === 'no_recipient') stats.no_recipient++;
      else if (r === 'failed') stats.failed++;
    }
    return json(stats);
  } catch (e) {
    console.error(e);
    return json({ error: String(e) }, 500);
  }
});
