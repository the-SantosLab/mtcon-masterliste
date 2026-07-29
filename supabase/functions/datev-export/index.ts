// DATEV Buchungsstapel CSV export (Format V7, Vorlage EXTF 700).
// Exportiert bezahlte / stornierte Rechnungen + Gutschriften eines Zeitraums.
// Auth: eingeloggter Admin (per JWT vom Aufrufer weitergereicht).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Standardkonten SKR03
const DEFAULTS = {
  revenue_std: '8400',    // Erlöse 19 %
  revenue_red: '8300',    // Erlöse 7 %
  revenue_free: '8125',   // Steuerfreie Erlöse EU
  debitor_base: 10000,    // Kundennummer-Offset
  bank: '1200',
};

function csvEscape(v: any): string {
  if (v === null || v === undefined) return '';
  const s = String(v).replace(/"/g, '""');
  return `"${s}"`;
}

function fmtNum(n: number): string {
  return Number(n || 0).toFixed(2).replace('.', ',');
}

function fmtDate(d: string | null): string {
  if (!d) return '';
  const dt = new Date(d);
  const dd = String(dt.getUTCDate()).padStart(2,'0');
  const mm = String(dt.getUTCMonth()+1).padStart(2,'0');
  return `${dd}${mm}`;
}

function revenueAccount(taxRate: number | null, taxMode: string): string {
  if (taxMode === 'tax_free_eu' || taxMode === 'tax_free_third_country') return DEFAULTS.revenue_free;
  if (taxRate === 7) return DEFAULTS.revenue_red;
  return DEFAULTS.revenue_std;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  const supa = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData } = await supa.auth.getUser();
  if (!userData.user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: isAdmin } = await admin.rpc('has_role', { _user_id: userData.user.id, _role: 'admin' });
  if (!isAdmin) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  const { from, to } = await req.json().catch(() => ({ from: null, to: null }));
  if (!from || !to) return new Response(JSON.stringify({ error: 'from/to required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  const { data: invoices, error } = await admin.from('invoices')
    .select('id,invoice_no,invoice_date,total_amount,subtotal_amount,tax_amount,tax_mode,doc_kind,payment_status,customer_no,customer_name,currency,invoice_items(quantity,unit_price,line_total,tax_rate,description)')
    .gte('invoice_date', from)
    .lte('invoice_date', to)
    .in('payment_status', ['paid','partial','cancelled'])
    .order('invoice_no');
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  // Header (EXTF v700 Buchungsstapel — vereinfachte Variante mit Standardspalten)
  const header = [
    'Umsatz (ohne Soll-/Haben-Kz)','Soll-/Haben-Kennzeichen','WKZ Umsatz','Kurs','Basis-Umsatz','WKZ Basis-Umsatz',
    'Konto','Gegenkonto (ohne BU-Schlüssel)','BU-Schlüssel','Belegdatum','Belegfeld 1','Belegfeld 2',
    'Skonto','Buchungstext','Postensperre','Diverse Adressnummer','Geschäftspartnerbank','Sachverhalt','Zinssperre','Beleglink',
  ];
  const lines: string[] = [header.map(csvEscape).join(';')];

  for (const inv of invoices ?? []) {
    const sign = inv.doc_kind === 'credit_note' || inv.doc_kind === 'storno' ? -1 : 1;
    const debitor = inv.customer_no
      ? String(inv.customer_no).replace(/\D/g, '').slice(-5).padStart(5, '0')
      : String(DEFAULTS.debitor_base).padStart(5,'0');
    // Aggregate items per tax rate
    const buckets = new Map<number, number>();
    for (const it of (inv.invoice_items ?? []) as any[]) {
      const rate = Number(it.tax_rate ?? 19);
      const net = Number(it.line_total ?? (Number(it.quantity||0) * Number(it.unit_price||0)));
      buckets.set(rate, (buckets.get(rate) ?? 0) + net);
    }
    if (buckets.size === 0 && inv.subtotal_amount) {
      buckets.set(19, Number(inv.subtotal_amount));
    }
    const buSchluessel = (rate: number) => {
      if (inv.tax_mode === 'reverse_charge') return '94';
      if (inv.tax_mode === 'tax_free_eu') return '20';
      if (inv.tax_mode === 'small_business' || inv.tax_mode === 'tax_free_third_country') return '';
      if (rate === 19) return '9';
      if (rate === 7) return '8';
      return '';
    };
    for (const [rate, net] of buckets) {
      const gross = net * (1 + rate/100) * sign;
      const row = [
        fmtNum(Math.abs(gross)),
        gross >= 0 ? 'S' : 'H',
        inv.currency || 'EUR',
        '', '', '',
        `20000${debitor}`.slice(-5).padStart(5,'0'), // Debitor konto (5-stellig 10000+)
        revenueAccount(rate, inv.tax_mode || 'standard'),
        buSchluessel(rate),
        fmtDate(inv.invoice_date),
        inv.invoice_no,
        '',
        '',
        `${inv.doc_kind === 'credit_note' ? 'Gutschrift' : inv.doc_kind === 'storno' ? 'Storno' : 'Rechnung'} ${inv.customer_name ?? ''}`.slice(0,60),
        '', '', '', '', '', '',
      ];
      lines.push(row.map(csvEscape).join(';'));
    }
  }

  const csv = '\uFEFF' + lines.join('\r\n') + '\r\n';
  return new Response(csv, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="datev-export_${from}_${to}.csv"`,
    },
  });
});
