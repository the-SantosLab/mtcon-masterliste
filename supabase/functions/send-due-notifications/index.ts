import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Cron-secret guard: only the scheduler (knowing CRON_SECRET) may invoke this function
  const cronSecret = Deno.env.get('CRON_SECRET');
  if (!cronSecret || req.headers.get('Authorization') !== `Bearer ${cronSecret}`) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Find cases due tomorrow that are still active
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  const { data: cases, error } = await supabase
    .from('cases')
    .select('id, case_no, project_name, due_at, assignee_id, case_number')
    .eq('due_at', tomorrowStr)
    .in('status', ['nicht_begonnen', 'in_planung', 'in_arbeit', 'in_verzug'])
    .not('assignee_id', 'is', null);

  if (error) {
    console.error('Error fetching cases:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!cases || cases.length === 0) {
    console.log('No cases due tomorrow.');
    return new Response(JSON.stringify({ sent: 0 }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Insert one notification per assignee (deduplicated by case)
  const notifications = cases.map((c) => ({
    user_id: c.assignee_id as string,
    type: 'due_tomorrow',
    title: `Fälligkeit morgen: ${c.case_number ?? c.case_no}`,
    body: `Vorgang „${c.project_name}" ist morgen fällig.`,
    href: `/cases/${c.id}`,
    read: false,
  }));

  const { error: insertError } = await supabase
    .from('notifications')
    .insert(notifications);

  if (insertError) {
    console.error('Error inserting notifications:', insertError);
    return new Response(JSON.stringify({ error: insertError.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  console.log(`Sent ${notifications.length} due-tomorrow notifications.`);
  return new Response(JSON.stringify({ sent: notifications.length }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
