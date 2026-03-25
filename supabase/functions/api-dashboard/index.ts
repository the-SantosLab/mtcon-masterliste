import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // --- Auth: static API key ---
  const DASHBOARD_API_KEY = Deno.env.get('DASHBOARD_API_KEY');
  if (!DASHBOARD_API_KEY) {
    return json({ error: 'Server misconfigured: DASHBOARD_API_KEY not set' }, 500);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader || authHeader !== `Bearer ${DASHBOARD_API_KEY}`) {
    return json({ error: 'Unauthorized' }, 401);
  }

  // --- Supabase admin client ---
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // --- Routing via query param: ?resource=cases|tickets|projects|users|departments ---
  const url = new URL(req.url);
  const resource = url.searchParams.get('resource');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '500'), 1000);
  const offset = parseInt(url.searchParams.get('offset') || '0');

  try {
    switch (resource) {
      case 'cases': {
        const statusFilter = url.searchParams.get('status');
        let q = supabase
          .from('cases')
          .select(`
            id, case_no, case_number, project_name, status, client_name, customer_no,
            internal_area_code, product_code, project_article_no, note, visibility,
            received_at, due_at, started_at, completed_at, closed_at, estimated_hours,
            created_at, last_changed_at, department_id,
            assignee:users_profile!cases_assignee_id_fkey(id, display_name, short_code),
            created_by_user:users_profile!cases_created_by_fkey(id, display_name, short_code),
            department:departments!cases_department_id_fkey(id, name, code),
            project:projects!cases_project_id_fkey(id, name, project_number)
          `)
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);
        if (statusFilter) q = q.eq('status', statusFilter);
        const { data, error, count } = await q;
        if (error) throw error;
        return json({ data, meta: { limit, offset } });
      }

      case 'tickets': {
        const statusFilter = url.searchParams.get('status');
        let q = supabase
          .from('support_tickets')
          .select(`
            id, ticket_number, title, description, status, priority,
            created_at, updated_at, resolved_at, closed_at,
            customer:portal_customers!support_tickets_customer_id_fkey(id, display_name, company_name, email),
            assignee:users_profile!support_tickets_assigned_to_fkey(id, display_name, short_code)
          `)
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);
        if (statusFilter) q = q.eq('status', statusFilter);
        const { data, error } = await q;
        if (error) throw error;
        return json({ data, meta: { limit, offset } });
      }

      case 'ticket_messages': {
        const ticketId = url.searchParams.get('ticket_id');
        if (!ticketId) return json({ error: 'ticket_id parameter required' }, 400);
        const { data, error } = await supabase
          .from('ticket_messages')
          .select('id, body, sender_type, sender_id, is_internal, created_at')
          .eq('ticket_id', ticketId)
          .order('created_at', { ascending: true });
        if (error) throw error;
        return json({ data });
      }

      case 'projects': {
        const { data, error } = await supabase
          .from('projects')
          .select(`
            id, name, project_number, project_code, description, status, visibility,
            created_at, updated_at,
            owner:users_profile!projects_owner_id_fkey(id, display_name, short_code),
            department:departments!projects_department_id_fkey(id, name, code)
          `)
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);
        if (error) throw error;
        return json({ data, meta: { limit, offset } });
      }

      case 'users': {
        const { data, error } = await supabase
          .from('users_profile')
          .select(`
            id, display_name, short_code, active, is_admin, is_manager,
            created_at, updated_at,
            department:departments!users_profile_department_id_fkey(id, name, code),
            role:user_roles(role)
          `)
          .order('display_name');
        if (error) throw error;
        return json({ data });
      }

      case 'departments': {
        const { data, error } = await supabase
          .from('departments')
          .select(`
            id, name, code, is_active, sort_order, parent_id,
            manager:users_profile!departments_manager_user_id_fkey(id, display_name, short_code)
          `)
          .order('sort_order');
        if (error) throw error;
        return json({ data });
      }

      case 'stats': {
        const [casesRes, ticketsRes, projectsRes, usersRes] = await Promise.all([
          supabase.from('cases').select('status', { count: 'exact', head: false }),
          supabase.from('support_tickets').select('status', { count: 'exact', head: false }),
          supabase.from('projects').select('status', { count: 'exact', head: false }),
          supabase.from('users_profile').select('id', { count: 'exact', head: true }).eq('active', true),
        ]);

        const casesByStatus: Record<string, number> = {};
        (casesRes.data || []).forEach((c: any) => {
          casesByStatus[c.status] = (casesByStatus[c.status] || 0) + 1;
        });

        const ticketsByStatus: Record<string, number> = {};
        (ticketsRes.data || []).forEach((t: any) => {
          ticketsByStatus[t.status] = (ticketsByStatus[t.status] || 0) + 1;
        });

        const projectsByStatus: Record<string, number> = {};
        (projectsRes.data || []).forEach((p: any) => {
          projectsByStatus[p.status] = (projectsByStatus[p.status] || 0) + 1;
        });

        return json({
          cases: { total: casesRes.data?.length || 0, by_status: casesByStatus },
          tickets: { total: ticketsRes.data?.length || 0, by_status: ticketsByStatus },
          projects: { total: projectsRes.data?.length || 0, by_status: projectsByStatus },
          active_users: usersRes.count || 0,
        });
      }

      default:
        return json({
          error: 'Unknown resource. Use ?resource=cases|tickets|ticket_messages|projects|users|departments|stats',
          available_resources: ['cases', 'tickets', 'ticket_messages', 'projects', 'users', 'departments', 'stats'],
        }, 400);
    }
  } catch (err: any) {
    console.error('API error:', err);
    return json({ error: err.message || 'Internal server error' }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
