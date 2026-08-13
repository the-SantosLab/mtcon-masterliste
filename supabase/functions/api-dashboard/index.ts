import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'npm:zod@3.23.8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-actor-id',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
};

const CASE_STATUS = [
  'nicht_begonnen', 'in_planung', 'in_arbeit', 'in_verzug',
  'abgeschlossen', 'verworfen', 'archiv', 'ready_for_review', 'blocked',
] as const;

const uuid = z.string().uuid();

const CaseCreateSchema = z.object({
  project_name: z.string().min(1).max(300),
  client_name: z.string().max(300).optional().nullable(),
  customer_no: z.string().max(100).optional().nullable(),
  internal_area_code: z.string().max(50).optional().nullable(),
  product_code: z.string().max(100).optional().nullable(),
  project_article_no: z.string().max(100).optional().nullable(),
  note: z.string().max(10000).optional().nullable(),
  sop: z.string().max(10000).optional().nullable(),
  status: z.enum(CASE_STATUS).optional(),
  assignee_id: uuid.optional().nullable(),
  department_id: uuid.optional().nullable(),
  project_id: uuid.optional().nullable(),
  received_at: z.string().optional().nullable(),
  due_at: z.string().optional().nullable(),
  estimated_hours: z.number().optional().nullable(),
  quantity: z.number().int().optional().nullable(),
  urgency: z.number().int().min(0).max(3).optional(),
  visibility: z.enum(['project_members', 'department', 'public', 'private']).optional(),
  watchers: z.array(uuid).optional(),
  watcher_departments: z.array(uuid).optional(),
});

const CaseUpdateSchema = CaseCreateSchema.partial();

const TaskCreateSchema = z.object({
  case_id: uuid,
  title: z.string().min(1).max(500),
  description: z.string().max(10000).optional().nullable(),
  department_id: uuid.optional().nullable(),
  assigned_to: uuid.optional().nullable(),
  due_at: z.string().optional().nullable(),
  urgency: z.number().int().min(0).max(3).optional(),
  sort_order: z.number().int().optional(),
  status: z.string().max(50).optional(),
  completed: z.boolean().optional(),
});

const TaskUpdateSchema = TaskCreateSchema.partial().omit({ case_id: true });

const NoteCreateSchema = z.object({
  case_id: uuid,
  body: z.string().min(1).max(20000),
});

const ProjectCreateSchema = z.object({
  name: z.string().min(1).max(300),
  description: z.string().max(10000).optional().nullable(),
  status: z.string().max(50).optional(),
  owner_id: uuid.optional().nullable(),
  department_id: uuid.optional().nullable(),
  project_code: z.string().max(50).optional().nullable(),
  visibility: z.string().max(50).optional(),
});

const ProjectUpdateSchema = ProjectCreateSchema.partial();

const TicketMessageSchema = z.object({
  ticket_id: uuid,
  body: z.string().min(1).max(20000),
  is_internal: z.boolean().optional(),
});

const WatcherSchema = z.object({
  watchers: z.array(uuid).optional(),
  watcher_departments: z.array(uuid).optional(),
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const DASHBOARD_API_KEY = Deno.env.get('DASHBOARD_API_KEY');
  if (!DASHBOARD_API_KEY) {
    return json({ error: 'Server misconfigured: DASHBOARD_API_KEY not set' }, 500);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader || authHeader !== `Bearer ${DASHBOARD_API_KEY}`) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const url = new URL(req.url);
  const resource = url.searchParams.get('resource');
  const id = url.searchParams.get('id');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '500'), 1000);
  const offset = parseInt(url.searchParams.get('offset') || '0');
  const method = req.method.toUpperCase();
  const isWrite = method !== 'GET';

  try {
    // --- Actor resolution (required for all write operations) ---
    let actorId: string | null = null;
    if (isWrite) {
      const raw = req.headers.get('x-actor-id');
      if (!raw || !uuid.safeParse(raw).success) {
        return json({ error: 'Header x-actor-id (UUID of an active users_profile) is required for write operations' }, 400);
      }
      const { data: actor, error: actorErr } = await supabase
        .from('users_profile')
        .select('id, active')
        .eq('id', raw)
        .maybeSingle();
      if (actorErr) throw actorErr;
      if (!actor || actor.active === false) {
        return json({ error: 'Unknown or inactive actor (x-actor-id)' }, 403);
      }
      actorId = actor.id;
    }

    const body = isWrite ? await readJson(req) : null;
    if (isWrite && body === undefined) return json({ error: 'Invalid JSON body' }, 400);

    switch (resource) {
      // ============================ CASES ============================
      case 'cases': {
        if (method === 'GET') {
          if (id) {
            const { data, error } = await supabase
              .from('cases').select(CASE_SELECT).eq('id', id).maybeSingle();
            if (error) throw error;
            if (!data) return json({ error: 'Case not found' }, 404);
            return json({ data });
          }
          const statusFilter = url.searchParams.get('status');
          const search = url.searchParams.get('q');
          const deptFilter = url.searchParams.get('department_id');
          const assigneeFilter = url.searchParams.get('assignee_id');
          const includeDeleted = url.searchParams.get('include_deleted') === 'true';
          let q = supabase.from('cases').select(CASE_SELECT)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);
          if (!includeDeleted) q = q.eq('deleted', false);
          if (statusFilter) q = q.eq('status', statusFilter);
          if (deptFilter) q = q.eq('department_id', deptFilter);
          if (assigneeFilter) q = q.eq('assignee_id', assigneeFilter);
          if (search) {
            const s = search.replace(/[%,()]/g, '');
            q = q.or(`case_no.ilike.%${s}%,project_name.ilike.%${s}%,client_name.ilike.%${s}%`);
          }
          const { data, error } = await q;
          if (error) throw error;
          return json({ data, meta: { limit, offset } });
        }

        if (method === 'POST') {
          const parsed = CaseCreateSchema.safeParse(body);
          if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
          const { data, error } = await supabase
            .from('cases')
            .insert({ ...parsed.data, created_by: actorId, last_changed_by: actorId, last_changed_at: new Date().toISOString() })
            .select(CASE_SELECT).single();
          if (error) throw error;
          await logActivity(supabase, data.id, actorId, 'created', 'Vorgang via API angelegt');
          return json({ data }, 201);
        }

        if (method === 'PATCH') {
          if (!id) return json({ error: 'id parameter required' }, 400);
          const parsed = CaseUpdateSchema.safeParse(body);
          if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
          if (Object.keys(parsed.data).length === 0) return json({ error: 'No fields to update' }, 400);
          const patch: Record<string, unknown> = {
            ...parsed.data,
            last_changed_by: actorId,
            last_changed_at: new Date().toISOString(),
          };
          if (parsed.data.status === 'abgeschlossen') {
            patch.completed_at = new Date().toISOString();
            patch.closed_by = actorId;
            patch.closed_at = new Date().toISOString();
          }
          const { data, error } = await supabase
            .from('cases').update(patch).eq('id', id).select(CASE_SELECT).maybeSingle();
          if (error) throw error;
          if (!data) return json({ error: 'Case not found' }, 404);
          return json({ data });
        }

        if (method === 'DELETE') {
          if (!id) return json({ error: 'id parameter required' }, 400);
          const { data, error } = await supabase
            .from('cases')
            .update({ deleted: true, deleted_at: new Date().toISOString(), deleted_by: actorId })
            .eq('id', id).select('id, case_no, deleted').maybeSingle();
          if (error) throw error;
          if (!data) return json({ error: 'Case not found' }, 404);
          return json({ data });
        }
        return json({ error: `Method ${method} not allowed for cases` }, 405);
      }

      // ========================= CASE TASKS =========================
      case 'case_tasks': {
        if (method === 'GET') {
          const caseId = url.searchParams.get('case_id');
          let q = supabase.from('case_tasks')
            .select('id, case_id, title, description, status, completed, completed_at, completed_by, department_id, assigned_to, due_at, urgency, sort_order, required_outputs, completed_outputs, created_at, created_by')
            .order('sort_order', { ascending: true })
            .range(offset, offset + limit - 1);
          if (caseId) q = q.eq('case_id', caseId);
          const { data, error } = await q;
          if (error) throw error;
          return json({ data, meta: { limit, offset } });
        }

        if (method === 'POST') {
          const parsed = TaskCreateSchema.safeParse(body);
          if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
          const { data, error } = await supabase
            .from('case_tasks')
            .insert({ ...parsed.data, created_by: actorId })
            .select('*').single();
          if (error) throw error;
          return json({ data }, 201);
        }

        if (method === 'PATCH') {
          if (!id) return json({ error: 'id parameter required' }, 400);
          const parsed = TaskUpdateSchema.safeParse(body);
          if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
          if (Object.keys(parsed.data).length === 0) return json({ error: 'No fields to update' }, 400);
          const patch: Record<string, unknown> = { ...parsed.data };
          if (parsed.data.completed === true) {
            patch.completed_at = new Date().toISOString();
            patch.completed_by = actorId;
          } else if (parsed.data.completed === false) {
            patch.completed_at = null;
            patch.completed_by = null;
          }
          const { data, error } = await supabase
            .from('case_tasks').update(patch).eq('id', id).select('*').maybeSingle();
          if (error) throw error;
          if (!data) return json({ error: 'Task not found' }, 404);
          return json({ data });
        }

        if (method === 'DELETE') {
          if (!id) return json({ error: 'id parameter required' }, 400);
          const { error } = await supabase.from('case_tasks').delete().eq('id', id);
          if (error) throw error;
          return json({ data: { id, deleted: true } });
        }
        return json({ error: `Method ${method} not allowed for case_tasks` }, 405);
      }

      // ========================= CASE NOTES =========================
      case 'case_notes': {
        if (method === 'GET') {
          const caseId = url.searchParams.get('case_id');
          if (!caseId) return json({ error: 'case_id parameter required' }, 400);
          const { data, error } = await supabase
            .from('case_notes')
            .select('id, case_id, body, author_id, created_at, updated_at, pinned')
            .eq('case_id', caseId)
            .order('created_at', { ascending: false });
          if (error) throw error;
          return json({ data });
        }
        if (method === 'POST') {
          const parsed = NoteCreateSchema.safeParse(body);
          if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
          const { data, error } = await supabase
            .from('case_notes')
            .insert({ ...parsed.data, author_id: actorId })
            .select('*').single();
          if (error) throw error;
          return json({ data }, 201);
        }
        return json({ error: `Method ${method} not allowed for case_notes` }, 405);
      }

      // ========================= CASE CHAT ==========================
      case 'case_chat': {
        const caseId = url.searchParams.get('case_id');
        if (method === 'GET') {
          if (!caseId) return json({ error: 'case_id parameter required' }, 400);
          const { data, error } = await supabase
            .from('case_chat_messages')
            .select('id, case_id, body, author_id, created_at, edited_at, system_kind')
            .eq('case_id', caseId)
            .is('deleted_at', null)
            .order('created_at', { ascending: true })
            .limit(limit);
          if (error) throw error;
          return json({ data });
        }
        if (method === 'POST') {
          const parsed = NoteCreateSchema.safeParse(body);
          if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
          const { data, error } = await supabase
            .from('case_chat_messages')
            .insert({ case_id: parsed.data.case_id, body: parsed.data.body, author_id: actorId })
            .select('*').single();
          if (error) throw error;
          return json({ data }, 201);
        }
        return json({ error: `Method ${method} not allowed for case_chat` }, 405);
      }

      // ========================= WATCHERS ===========================
      case 'case_watchers': {
        if (!id) return json({ error: 'id parameter (case id) required' }, 400);
        if (method === 'GET') {
          const { data, error } = await supabase
            .from('cases').select('id, case_no, watchers, watcher_departments').eq('id', id).maybeSingle();
          if (error) throw error;
          if (!data) return json({ error: 'Case not found' }, 404);
          return json({ data });
        }
        if (method === 'PATCH') {
          const parsed = WatcherSchema.safeParse(body);
          if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
          if (Object.keys(parsed.data).length === 0) return json({ error: 'No fields to update' }, 400);
          const { data, error } = await supabase
            .from('cases')
            .update({ ...parsed.data, last_changed_by: actorId, last_changed_at: new Date().toISOString() })
            .eq('id', id)
            .select('id, case_no, watchers, watcher_departments').maybeSingle();
          if (error) throw error;
          if (!data) return json({ error: 'Case not found' }, 404);
          return json({ data });
        }
        return json({ error: `Method ${method} not allowed for case_watchers` }, 405);
      }

      // ======================== CASE ACTIVITY =======================
      case 'case_activity': {
        if (method !== 'GET') return json({ error: `Method ${method} not allowed for case_activity` }, 405);
        const caseId = url.searchParams.get('case_id');
        if (!caseId) return json({ error: 'case_id parameter required' }, 400);
        const { data, error } = await supabase
          .from('case_activity')
          .select('id, case_id, task_id, action, field, old_value, new_value, message, actor_id, created_at')
          .eq('case_id', caseId)
          .order('created_at', { ascending: false })
          .limit(limit);
        if (error) throw error;
        return json({ data });
      }

      // =========================== TICKETS ==========================
      case 'tickets': {
        if (method !== 'GET') return json({ error: `Method ${method} not allowed for tickets` }, 405);
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
        if (method === 'GET') {
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
        if (method === 'POST') {
          const parsed = TicketMessageSchema.safeParse(body);
          if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
          const { data, error } = await supabase
            .from('ticket_messages')
            .insert({
              ticket_id: parsed.data.ticket_id,
              body: parsed.data.body,
              is_internal: parsed.data.is_internal ?? false,
              sender_type: 'staff',
              sender_id: actorId,
            })
            .select('*').single();
          if (error) throw error;
          return json({ data }, 201);
        }
        return json({ error: `Method ${method} not allowed for ticket_messages` }, 405);
      }

      // ========================== PROJECTS ==========================
      case 'projects': {
        if (method === 'GET') {
          if (id) {
            const { data, error } = await supabase
              .from('projects').select(PROJECT_SELECT).eq('id', id).maybeSingle();
            if (error) throw error;
            if (!data) return json({ error: 'Project not found' }, 404);
            return json({ data });
          }
          const { data, error } = await supabase
            .from('projects').select(PROJECT_SELECT)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);
          if (error) throw error;
          return json({ data, meta: { limit, offset } });
        }
        if (method === 'POST') {
          const parsed = ProjectCreateSchema.safeParse(body);
          if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
          const { data, error } = await supabase
            .from('projects')
            .insert({ ...parsed.data, owner_id: parsed.data.owner_id ?? actorId })
            .select(PROJECT_SELECT).single();
          if (error) throw error;
          return json({ data }, 201);
        }
        if (method === 'PATCH') {
          if (!id) return json({ error: 'id parameter required' }, 400);
          const parsed = ProjectUpdateSchema.safeParse(body);
          if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
          if (Object.keys(parsed.data).length === 0) return json({ error: 'No fields to update' }, 400);
          const { data, error } = await supabase
            .from('projects').update(parsed.data).eq('id', id).select(PROJECT_SELECT).maybeSingle();
          if (error) throw error;
          if (!data) return json({ error: 'Project not found' }, 404);
          return json({ data });
        }
        return json({ error: `Method ${method} not allowed for projects` }, 405);
      }

      case 'users': {
        if (method !== 'GET') return json({ error: `Method ${method} not allowed for users` }, 405);
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
        if (method !== 'GET') return json({ error: `Method ${method} not allowed for departments` }, 405);
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
        if (method !== 'GET') return json({ error: `Method ${method} not allowed for stats` }, 405);
        const [casesRes, ticketsRes, projectsRes, usersRes] = await Promise.all([
          supabase.from('cases').select('status', { count: 'exact', head: false }),
          supabase.from('support_tickets').select('status', { count: 'exact', head: false }),
          supabase.from('projects').select('status', { count: 'exact', head: false }),
          supabase.from('users_profile').select('id', { count: 'exact', head: true }).eq('active', true),
        ]);

        const tally = (rows: any[] | null, key: string) => {
          const out: Record<string, number> = {};
          (rows || []).forEach((r: any) => { out[r[key]] = (out[r[key]] || 0) + 1; });
          return out;
        };

        return json({
          cases: { total: casesRes.data?.length || 0, by_status: tally(casesRes.data, 'status') },
          tickets: { total: ticketsRes.data?.length || 0, by_status: tally(ticketsRes.data, 'status') },
          projects: { total: projectsRes.data?.length || 0, by_status: tally(projectsRes.data, 'status') },
          active_users: usersRes.count || 0,
        });
      }

      case 'schema':
      case null:
      case '':
        return json(API_INDEX);

      default:
        return json({
          error: 'Unknown resource.',
          available_resources: Object.keys(API_INDEX.resources),
        }, 400);
    }
  } catch (err: any) {
    console.error('API error:', err);
    return json({ error: err.message || 'Internal server error', details: err.details ?? null }, 500);
  }
});

const CASE_SELECT = `
  id, case_no, case_number, project_name, status, client_name, customer_no,
  internal_area_code, product_code, project_article_no, note, sop, visibility,
  received_at, due_at, started_at, completed_at, closed_at, estimated_hours, quantity,
  urgency, effective_urgency, priority_order, deleted, watchers, watcher_departments,
  created_at, last_changed_at, department_id, project_id, assignee_id,
  assignee:users_profile!cases_assignee_id_fkey(id, display_name, short_code),
  created_by_user:users_profile!cases_created_by_fkey(id, display_name, short_code),
  department:departments!cases_department_id_fkey(id, name, code),
  project:projects!cases_project_id_fkey(id, name, project_number)
`;

const PROJECT_SELECT = `
  id, name, project_number, project_code, description, status, visibility,
  created_at, updated_at, owner_id, department_id,
  owner:users_profile!projects_owner_id_fkey(id, display_name, short_code),
  department:departments!projects_department_id_fkey(id, name, code)
`;

const API_INDEX = {
  name: 'MTCON Masterliste API',
  auth: 'Authorization: Bearer <DASHBOARD_API_KEY>; writes additionally require header x-actor-id: <users_profile.id>',
  resources: {
    cases: ['GET (list, ?id= single)', 'POST', 'PATCH ?id=', 'DELETE ?id= (soft delete)'],
    case_tasks: ['GET ?case_id=', 'POST', 'PATCH ?id=', 'DELETE ?id='],
    case_notes: ['GET ?case_id=', 'POST'],
    case_chat: ['GET ?case_id=', 'POST'],
    case_watchers: ['GET ?id=', 'PATCH ?id='],
    case_activity: ['GET ?case_id='],
    tickets: ['GET'],
    ticket_messages: ['GET ?ticket_id=', 'POST'],
    projects: ['GET (list, ?id= single)', 'POST', 'PATCH ?id='],
    users: ['GET'],
    departments: ['GET'],
    stats: ['GET'],
  },
  filters: {
    cases: ['status', 'department_id', 'assignee_id', 'q', 'include_deleted', 'limit', 'offset'],
  },
};

async function readJson(req: Request): Promise<unknown | undefined> {
  try {
    const text = await req.text();
    if (!text) return {};
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

async function logActivity(
  supabase: any,
  caseId: string,
  actorId: string | null,
  action: string,
  message: string,
) {
  try {
    await supabase.from('case_activity').insert({
      case_id: caseId, actor_id: actorId, action, message,
    });
  } catch (e) {
    console.error('activity log failed', e);
  }
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
