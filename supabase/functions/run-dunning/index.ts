// Dunning runner: scans overdue invoices, computes next stage per settings,
// creates invoice_reminders rows and sends emails via Resend.
// Callable via HTTP (Bearer CRON_SECRET) or manually with { dry_run, invoice_ids? }.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const APP_URL = 'https://mtcon.kscommand.com';

type Invoice = {
  id: string; invoice_no: string; customer_name: string | null;
  customer_email: string | null; due_date: string | null;
  total_amount: number | null; paid_amount: number | null;
  payment_status: string; reminder_stage: number;
  doc_kind: string; locked: boolean; currency: string;
};
type Settings = {
  enabled: boolean;
  stage1_days: number; stage2_days: number; stage3_days: number;
  stage1_fee: number;  stage2_fee: number;  stage3_fee: number;
  sender_name: string; sender_email: string; bcc_email: string | null;
};

const daysBetween = (a: Date, b: Date) => Math.floor((a.getTime() - b.getTime()) / 86400000);

function nextStageFor(inv: Invoice, s: Settings, today: Date): { stage: number; fee: number } | null {
  if (!inv.due_date) return null;
  const due = new Date(inv.due_date + 'T00:00:00Z');
  const overdueDays = daysBetween(today, due);
  const cur = inv.reminder_stage ?? 0;
  if (cur === 0 && overdueDays >= s.stage1_days) return { stage: 1, fee: s.stage1_fee };
  if (cur === 1 && overdueDays >= s.stage1_days + s.stage2_days) return { stage: 2, fee: s.stage2_fee };
  if (cur === 2 && overdueDays >= s.stage1_days + s.stage2_days + s.stage3_days) return { stage: 3, fee: s.stage3_fee };
  return null;
}

function emailHtml(inv: Invoice, stage: number, fee: number, s: Settings) {
  const outstanding = Math.max(0, Number(inv.total_amount || 0) - Number(inv.paid_amount || 0));
  const label = stage === 1 ? 'Zahlungserinnerung' : stage === 2 ? '2. Mahnung' : '3. Mahnung';
  const extra = stage >= 3
    ? '<p>Sollte der Betrag nicht innerhalb der nächsten 7 Tage bei uns eingehen, geben wir den Vorgang zur weiteren Bearbeitung an unser Inkasso ab.</p>'
    : '';
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1a1a1a;">
    <h2 style="font-size:18px;margin:0 0 12px;">${label} – Rechnung ${inv.invoice_no}</h2>
    <p>Sehr geehrte Damen und Herren,</p>
    <p>zu unserer Rechnung <strong>${inv.invoice_no}</strong> vom ${inv.due_date ?? ''} konnten wir bisher keinen Zahlungseingang feststellen.</p>
    <table style="border-collapse:collapse;margin:16px 0;font-size:14px;">
      <tr><td style="padding:4px 12px 4px 0;">Rechnungsbetrag</td><td>${Number(inv.total_amount||0).toLocaleString('de-DE',{minimumFractionDigits:2})} ${inv.currency}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;">Bereits gezahlt</td><td>${Number(inv.paid_amount||0).toLocaleString('de-DE',{minimumFractionDigits:2})} ${inv.currency}</td></tr>
      ${fee > 0 ? `<tr><td style="padding:4px 12px 4px 0;">Mahngebühr</td><td>${fee.toLocaleString('de-DE',{minimumFractionDigits:2})} ${inv.currency}</td></tr>` : ''}
      <tr><td style="padding:4px 12px 4px 0;font-weight:600;border-top:1px solid #ddd;">Offener Betrag</td>
          <td style="font-weight:600;border-top:1px solid #ddd;">${(outstanding + fee).toLocaleString('de-DE',{minimumFractionDigits:2})} ${inv.currency}</td></tr>
    </table>
    <p>Wir bitten Sie, den offenen Betrag umgehend zu begleichen.</p>
    ${extra}
    <p style="margin-top:24px;">Mit freundlichen Grüßen<br/>${s.sender_name}</p>
  </div>`;
}

async function sendMail(to: string, subject: string, html: string, s: Settings) {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) throw new Error('RESEND_API_KEY missing');
  const body: any = { from: `${s.sender_name} <${s.sender_email}>`, to: [to], subject, html };
  if (s.bcc_email) body.bcc = [s.bcc_email];
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
  return await res.json();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  let payload: any = {};
  try { payload = await req.json(); } catch { /* GET */ }
  const dryRun: boolean = !!payload.dry_run;
  const manualIds: string[] | undefined = payload.invoice_ids;

  const cronSecret = Deno.env.get('CRON_SECRET');
  const auth = req.headers.get('Authorization') ?? '';
  const isCron = cronSecret && auth === `Bearer ${cronSecret}`;
  const isService = auth.startsWith('Bearer ') && auth.slice(7) === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!isCron && !isService && !manualIds) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const { data: settingsRow } = await admin.from('dunning_settings').select('*').eq('id', true).maybeSingle();
  const s: Settings = settingsRow as any;
  if (!s || (!s.enabled && !manualIds && !dryRun)) {
    return new Response(JSON.stringify({ skipped: 'disabled' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  let query = admin.from('invoices').select('id,invoice_no,customer_name,customer_email,due_date,total_amount,paid_amount,payment_status,reminder_stage,doc_kind,locked,currency')
    .in('payment_status', ['open','partial','overdue'])
    .eq('doc_kind', 'invoice')
    .not('due_date', 'is', null);
  if (manualIds && manualIds.length) query = query.in('id', manualIds);
  const { data: invoices, error } = await query;
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  const today = new Date();
  const results: any[] = [];
  for (const inv of (invoices ?? []) as Invoice[]) {
    const next = nextStageFor(inv, s, today);
    if (!next) continue;
    const to = inv.customer_email;
    if (!to) { results.push({ invoice: inv.invoice_no, skipped: 'no_email', would_be_stage: next.stage }); continue; }
    if (dryRun) { results.push({ invoice: inv.invoice_no, stage: next.stage, fee: next.fee, dry_run: true, to }); continue; }
    try {
      const subject = next.stage === 1
        ? `Zahlungserinnerung – Rechnung ${inv.invoice_no}`
        : `${next.stage}. Mahnung – Rechnung ${inv.invoice_no}`;
      await sendMail(to, subject, emailHtml(inv, next.stage, next.fee, s), s);
      await admin.from('invoice_reminders').insert({
        invoice_id: inv.id, stage: next.stage, fee: next.fee, sent_to: to,
        note: manualIds ? 'Manuell ausgelöst' : 'Automatisch (cron)',
      });
      results.push({ invoice: inv.invoice_no, stage: next.stage, sent_to: to });
    } catch (e) {
      console.error('Dunning send failed', inv.invoice_no, e);
      results.push({ invoice: inv.invoice_no, error: String(e) });
    }
  }

  return new Response(JSON.stringify({ processed: results.length, results }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
