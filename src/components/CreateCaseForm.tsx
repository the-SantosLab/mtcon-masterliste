import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command';
import { Plus, ChevronsUpDown, Check, Lightbulb, ArrowLeft, ArrowRight, ChevronDown, Sparkles, Loader2, Feather, Wand2 } from 'lucide-react';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { MtiqButton } from '@/components/MtiqButton';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { Tables } from '@/integrations/supabase/types';

interface ProjectOption { id: string; project_number: string; name: string; }
interface DeptOption { id: string; name: string; code: string | null; parent_id: string | null; }
interface Profile { id: string; display_name: string; short_code: string; department_id: string | null; }

export type CreateCaseFormPrefill = Partial<{
  project_name: string; project_id: string; department_id: string; team_id: string; assignee_id: string;
  customer_no: string; client_name: string; internal_area_code: string; product_code: string;
  project_article_no: string; received_at: string; due_at: string; note: string; estimated_hours: string;
  sop: string; quantity: string; project_duration: string; description: string;
}>;

interface CreateCaseFormProps {
  userId: string;
  onCreated: () => void;
  defaultProjectId?: string;
  prefill?: CreateCaseFormPrefill;
}

const STEPS = [
  { id: 1, title: 'Projektname' },
  { id: 2, title: 'Zuständigkeit' },
  { id: 3, title: 'Kunde & Produkt' },
  { id: 4, title: 'Termine & Details' },
  { id: 5, title: 'Bemerkung & Abschluss' },
];

const DRAFT_KEY_PREFIX = 'createCaseDraft:v1:';
const draftKeyFor = (projectId?: string) => `${DRAFT_KEY_PREFIX}${projectId || 'global'}`;

export function CreateCaseForm({ userId, onCreated, defaultProjectId, prefill }: CreateCaseFormProps) {
  // Only auto-restore drafts when there is no explicit prefill (e.g. duplicate flow).
  const draftKey = draftKeyFor(defaultProjectId);
  const initialDraft = (() => {
    if (prefill) return null;
    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && parsed.form) return parsed as { form: Record<string, string>; step?: number };
    } catch {}
    return null;
  })();

  const [step, setStep] = useState<number>(initialDraft?.step ?? 1);
  const [form, setForm] = useState({
    project_name: '', project_id: defaultProjectId || '', department_id: '', team_id: '', assignee_id: '',
    customer_no: '', client_name: '', internal_area_code: '', product_code: '',
    project_article_no: '', received_at: new Date().toISOString().slice(0, 10), due_at: '', note: '', estimated_hours: '',
    sop: '', quantity: '', project_duration: '', description: '',
    ...(prefill || {}),
    ...(initialDraft?.form || {}),
  });
  const [draftRestored, setDraftRestored] = useState<boolean>(!!initialDraft);

  const [prefillDeptMapped, setPrefillDeptMapped] = useState(false);

  const [customers, setCustomers] = useState<Tables<'customers'>[]>([]);
  const [products, setProducts] = useState<Tables<'products'>[]>([]);
  const [areas, setAreas] = useState<Tables<'internal_areas'>[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [departments, setDepartments] = useState<DeptOption[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [writableDeptIds, setWritableDeptIds] = useState<Set<string> | null>(null);
  const [saving, setSaving] = useState(false);
  const submittingRef = useRef(false);

  const [customerSearch, setCustomerSearch] = useState('');
  const [customerOpen, setCustomerOpen] = useState(false);
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerNo, setNewCustomerNo] = useState('');

  const [productSearch, setProductSearch] = useState('');
  const [productOpen, setProductOpen] = useState(false);

  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [userIsAdmin, setUserIsAdmin] = useState(false);

  const [suggestProductOpen, setSuggestProductOpen] = useState(false);
  const [suggestForm, setSuggestForm] = useState({ product_name: '', article_number: '', category: '', description: '', request_reason: '' });
  const [suggestSaving, setSuggestSaving] = useState(false);

  // Templates
  const [templates, setTemplates] = useState<{ id: string; title: string; description: string | null; sequential_mode: boolean; due_required: boolean; lock_mode: 'hard' | 'soft'; department_ids: string[]; tasks: { title: string; description: string | null; department_id: string | null; order_index: number }[] }[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [userDeptId, setUserDeptId] = useState<string | null>(null);
  const [pendingTemplateTasks, setPendingTemplateTasks] = useState<{ title: string; description: string | null; department_id: string | null }[]>([]);
  const [pendingTemplateId, setPendingTemplateId] = useState<string | null>(null);
  const [noteTouched, setNoteTouched] = useState(false);
  const [mtiqLoading, setMtiqLoading] = useState(false);
  const [mtiqHintDismissed, setMtiqHintDismissed] = useState(false);
  const [mtiqApplied, setMtiqApplied] = useState(false);
  const [descBlurred, setDescBlurred] = useState(false);
  const [productSectionOpen, setProductSectionOpen] = useState(true);
  const [projectInfoOpen, setProjectInfoOpen] = useState(true);

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  // Auto-save draft to localStorage on every change (skip when used in prefill/duplicate flow).
  useEffect(() => {
    if (prefill) return;
    try {
      const hasContent = Object.entries(form).some(([k, v]) => {
        if (k === 'received_at' || k === 'project_id') return false;
        return typeof v === 'string' && v.trim().length > 0;
      });
      if (hasContent) {
        localStorage.setItem(draftKey, JSON.stringify({ form, step }));
      } else {
        localStorage.removeItem(draftKey);
      }
    } catch {}
  }, [form, step, draftKey, prefill]);

  const discardDraft = () => {
    try { localStorage.removeItem(draftKey); } catch {}
    setForm({
      project_name: '', project_id: defaultProjectId || '', department_id: '', team_id: '', assignee_id: '',
      customer_no: '', client_name: '', internal_area_code: '', product_code: '',
      project_article_no: '', received_at: new Date().toISOString().slice(0, 10), due_at: '', note: '', estimated_hours: '',
      sop: '', quantity: '', project_duration: '', description: '',
    });
    setStep(1);
    setDraftRestored(false);
  };


  const [deptMembers, setDeptMembers] = useState<{ department_id: string; user_id: string }[]>([]);

  useEffect(() => {
    const fetchAllCustomers = async () => {
      const pageSize = 1000;
      let from = 0;
      let all: Tables<'customers'>[] = [];
      while (true) {
        const { data, error } = await supabase.from('customers').select('*').order('name').range(from, from + pageSize - 1);
        if (error || !data) break;
        all = all.concat(data);
        if (data.length < pageSize) break;
        from += pageSize;
      }
      return { data: all };
    };
    Promise.all([
      fetchAllCustomers(),
      supabase.from('products').select('*').order('name'),
      supabase.from('internal_areas').select('*').order('name'),
      supabase.from('projects').select('id, project_number, name').eq('status', 'active').order('created_at', { ascending: false }),
      supabase.from('departments').select('id, name, code, parent_id, owner_id, is_active, private_inbox').eq('is_active', true).order('sort_order'),
      supabase.from('users_profile').select('id, display_name, short_code, department_id').eq('active', true).order('display_name'),
      supabase.from('user_roles').select('role').eq('user_id', userId),
      (supabase as any).from('department_members').select('department_id, user_id, role').eq('user_id', userId),
      (supabase as any).from('department_members').select('department_id, user_id'),
    ]).then(([cust, prod, ar, proj, dept, prof, roles, perms, members]) => {
      setCustomers(cust.data || []);
      setProducts(prod.data || []);
      setAreas(ar.data || []);
      const projectsData = (proj.data || []) as ProjectOption[];
      setProjects(projectsData);
      const deptData = (dept.data || []) as (DeptOption & { owner_id: string | null; private_inbox?: boolean })[];
      setDepartments(deptData);
      setProfiles((prof.data || []) as Profile[]);
      setDeptMembers(((members as any)?.data || []) as { department_id: string; user_id: string }[]);

      const isAdmin = (roles.data || []).some((r: any) => r.role === 'admin');
      setUserIsAdmin(isAdmin);
      if (isAdmin) {
        setWritableDeptIds(new Set(deptData.map(d => d.id)));
      } else {
        const writePerms = new Set((perms.data || []).filter((p: any) => p.role === 'write' || p.role === 'lead').map((p: any) => p.department_id));
        const allowed = new Set<string>();
        for (const d of deptData) {
          if ((d as any).private_inbox) allowed.add(d.id);
          else if (d.owner_id === userId) allowed.add(d.id);
          else if (!d.owner_id && writePerms.has(d.id)) allowed.add(d.id);
        }
        setWritableDeptIds(allowed);
      }

      if (defaultProjectId) {
        const preset = projectsData.find(p => p.id === defaultProjectId);
        if (preset) {
          setForm(f => ({ ...f, project_id: preset.id, project_name: f.project_name || preset.name }));
        }
      }
    });

    // Load templates and user's department
    Promise.all([
      (supabase as any).from('case_templates').select('id, title, description, sequential_mode, due_required, lock_mode').order('title'),
      (supabase as any).from('case_template_departments').select('template_id, department_id'),
      (supabase as any).from('case_template_tasks').select('template_id, title, description, department_id, order_index').order('order_index'),
      supabase.from('users_profile').select('department_id, display_name').eq('id', userId).maybeSingle(),
    ]).then(([tplRes, joinRes, taskRes, profRes]: any[]) => {
      const joins = (joinRes.data || []) as { template_id: string; department_id: string }[];
      const tasks = (taskRes.data || []) as any[];
      const tpls = ((tplRes.data || []) as any[]).map(t => ({
        ...t,
        sequential_mode: !!t.sequential_mode,
        due_required: !!t.due_required,
        lock_mode: (t.lock_mode === 'soft' ? 'soft' : 'hard') as 'hard' | 'soft',
        department_ids: joins.filter(j => j.template_id === t.id).map(j => j.department_id),
        tasks: tasks.filter(x => x.template_id === t.id),
      }));
      setTemplates(tpls);
      const myDeptId = (profRes.data as any)?.department_id ?? null;
      const myDisplayName = (profRes.data as any)?.display_name ?? '';
      setUserDeptId(myDeptId);
      // Prefill defaults: MTCON Abteilung = users own dept; Auftraggeber = Ersteller
      setForm(f => ({
        ...f,
        department_id: f.department_id || myDeptId || '',
        client_name: f.client_name || myDisplayName,
      }));
    });
  }, [defaultProjectId, userId]);

  // Map user's department to top-level + team if it's a sub-department.
  useEffect(() => {
    if (!userDeptId || departments.length === 0) return;
    setForm(f => {
      if (f.department_id && f.department_id !== userDeptId) return f;
      const own = departments.find(d => d.id === userDeptId);
      if (!own) return f;
      if (own.parent_id) {
        return { ...f, department_id: own.parent_id, team_id: f.team_id || own.id };
      }
      return { ...f, department_id: own.id };
    });
  }, [userDeptId, departments]);

  // One-shot: if prefill.department_id is a sub-dept, map to parent + team.
  useEffect(() => {
    if (prefillDeptMapped || !prefill?.department_id || departments.length === 0) return;
    const own = departments.find(d => d.id === prefill.department_id);
    if (!own) { setPrefillDeptMapped(true); return; }
    if (own.parent_id) {
      setForm(f => ({ ...f, department_id: own.parent_id!, team_id: own.id }));
    }
    setPrefillDeptMapped(true);
  }, [prefill, departments, prefillDeptMapped]);

  // Default-collapse Produkt / Projektinfos for HR / Marketing departments.
  useEffect(() => {
    const dept = departments.find(d => d.id === (form.department_id || ''));
    if (!dept) return;
    const haystack = `${dept.name} ${dept.code || ''}`.toLowerCase();
    const noProductFocus = /\b(hr|human resources|personal|marketing)\b/.test(haystack);
    setProductSectionOpen(!noProductFocus);
    setProjectInfoOpen(!noProductFocus);
  }, [form.department_id, departments]);


  const visibleTemplates = useMemo(() => {
    if (!userDeptId) return templates;
    const matching = templates.filter(t => t.department_ids.length === 0 || t.department_ids.includes(userDeptId));
    return matching.length ? matching : templates;
  }, [templates, userDeptId]);

  const applyTemplate = (id: string) => {
    setSelectedTemplateId(id);
    if (!id) { setPendingTemplateTasks([]); setPendingTemplateId(null); return; }
    const tpl = templates.find(t => t.id === id);
    if (!tpl) return;
    setForm(f => ({
      ...f,
      project_name: f.project_name || tpl.title,
      note: f.note || (tpl.description || ''),
    }));
    setPendingTemplateTasks(tpl.tasks.map(t => ({
      title: t.title, description: t.description, department_id: t.department_id,
    })));
    setPendingTemplateId(id);
    toast.success('Template wurde übernommen – bitte anpassen');
  };


  // Wenn ein Projekt verknüpft ist, dürfen Vorgänge auch in fremde Abteilungen
  // angelegt werden (RLS erlaubt das). Nach Erstellung kann der Ersteller den
  // Vorgang dann nicht mehr bearbeiten, sofern er kein Schreibrecht hat.
  const crossDeptViaProject = !!form.project_id;
  const topLevel = useMemo(() => {
    const all = departments.filter(d => !d.parent_id);
    if (!writableDeptIds || crossDeptViaProject) return all;
    return all.filter(d => writableDeptIds.has(d.id) || departments.some(c => c.parent_id === d.id && writableDeptIds.has(c.id)));
  }, [departments, writableDeptIds, crossDeptViaProject]);
  const teams = useMemo(() => {
    const all = departments.filter(d => d.parent_id === form.department_id);
    if (!writableDeptIds || crossDeptViaProject) return all;
    return all.filter(d => writableDeptIds.has(d.id));
  }, [departments, form.department_id, writableDeptIds, crossDeptViaProject]);
  const effectiveDeptId = form.team_id || form.department_id;

  const deptProfiles = useMemo(() => {
    if (!effectiveDeptId) return profiles;
    const deptIds = new Set<string>();
    deptIds.add(effectiveDeptId);
    departments.filter(d => d.parent_id === effectiveDeptId).forEach(d => deptIds.add(d.id));
    const parent = departments.find(d => d.id === effectiveDeptId);
    if (parent?.parent_id) deptIds.add(parent.parent_id);
    const extraUserIds = new Set(
      deptMembers.filter(m => deptIds.has(m.department_id)).map(m => m.user_id)
    );
    return profiles.filter(p => (p.department_id && deptIds.has(p.department_id)) || extraUserIds.has(p.id));
  }, [effectiveDeptId, profiles, departments, deptMembers]);

  const filteredCustomers = useMemo(() => {
    if (!customerSearch) return customers;
    const s = customerSearch.toLowerCase();
    return customers.filter(c => c.name.toLowerCase().includes(s) || c.customer_no.toLowerCase().includes(s));
  }, [customers, customerSearch]);

  const filteredProducts = useMemo(() => {
    if (!productSearch) return products;
    const s = productSearch.toLowerCase();
    return products.filter(p => p.name.toLowerCase().includes(s) || p.code.toLowerCase().includes(s));
  }, [products, productSearch]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (form.project_name.length < 3) { setSuggestions([]); return; }
      const { data } = await supabase.from('cases')
        .select('project_name, customer_no, product_code, client_name, department_id, internal_area_code, note')
        .ilike('project_name', `%${form.project_name}%`)
        .eq('deleted', false)
        .order('created_at', { ascending: false })
        .limit(5);
      setSuggestions(data || []);
    }, 500);
    return () => clearTimeout(timer);
  }, [form.project_name]);

  const applySuggestion = (s: any) => {
    setForm(f => ({
      ...f,
      customer_no: s.customer_no || f.customer_no,
      product_code: s.product_code || f.product_code,
      client_name: s.client_name || f.client_name,
      department_id: s.department_id || f.department_id,
      internal_area_code: s.internal_area_code || f.internal_area_code,
    }));
    setShowSuggestions(false);
    toast.success('Daten aus ähnlichem Vorgang übernommen');
  };

  const handleDeptChange = (v: string) => {
    set('department_id', v === '_none' ? '' : v);
    set('team_id', '');
    set('assignee_id', '');
  };

  const handleProjectChange = (projectId: string) => {
    const proj = projects.find(p => p.id === projectId);
    set('project_id', projectId);
    if (proj) set('project_name', proj.name);
  };

  const createCustomer = async () => {
    if (!newCustomerName.trim() || !newCustomerNo.trim()) {
      toast.error('Name und Kundennummer sind Pflicht');
      return;
    }
    const { data, error } = await supabase.from('customers').insert({
      name: newCustomerName.trim(),
      customer_no: newCustomerNo.trim(),
    }).select().single();
    if (error) { toast.error('Fehler: ' + error.message); return; }
    setCustomers(prev => [...prev, data]);
    set('customer_no', data.customer_no);
    setNewCustomerOpen(false);
    setNewCustomerName('');
    setNewCustomerNo('');
    toast.success('Kunde erstellt');
  };

  const selectProductOrCreate = async (value: string) => {
    const existing = products.find(p => p.code === value);
    if (existing) {
      set('product_code', existing.code);
      setProductOpen(false);
      return;
    }
    if (userIsAdmin) {
      const code = value.toUpperCase().replace(/[^A-Z0-9-]/g, '').substring(0, 20) || value;
      const { data, error } = await supabase.from('products').insert({ code, name: value }).select().single();
      if (error) { toast.error('Fehler: ' + error.message); return; }
      setProducts(prev => [...prev, data]);
      set('product_code', data.code);
      toast.success('Produkt erstellt');
      setProductOpen(false);
    } else {
      // Mitarbeiter: Vorschlag öffnen
      setSuggestForm({ product_name: value, article_number: '', category: '', description: '', request_reason: '' });
      setProductOpen(false);
      setSuggestProductOpen(true);
    }
  };

  const submitProductSuggestion = async () => {
    if (!suggestForm.product_name.trim()) { toast.error('Produktname ist Pflicht'); return; }
    if (!suggestForm.category.trim()) { toast.error('Kategorie ist Pflicht'); return; }
    if (!suggestForm.request_reason.trim()) { toast.error('Begründung ist Pflicht'); return; }
    setSuggestSaving(true);
    const { error } = await supabase.from('product_requests').insert({
      product_name: suggestForm.product_name.trim(),
      article_number: suggestForm.article_number.trim() || null,
      category: suggestForm.category.trim(),
      description: suggestForm.description.trim() || null,
      request_reason: suggestForm.request_reason.trim(),
      requested_by: userId,
    });
    setSuggestSaving(false);
    if (error) { toast.error('Fehler: ' + error.message); return; }
    toast.success('Produktvorschlag eingereicht – ein Admin prüft ihn.');
    setSuggestProductOpen(false);
  };

  const submit = async () => {
    if (!form.project_name) { toast.error('Projektname ist Pflicht'); setStep(1); return; }
    if (!form.department_id) { toast.error('Abteilung ist Pflicht'); setStep(1); return; }
    setSaving(true);
    const finalDeptId = form.team_id || form.department_id;
    const tplForCase = pendingTemplateId ? templates.find(t => t.id === pendingTemplateId) : null;
    const { data: newCase, error } = await supabase.from('cases').insert({
      project_name: form.project_name,
      project_id: form.project_id || null,
      department_id: finalDeptId,
      assignee_id: form.assignee_id || null,
      customer_no: form.customer_no || null,
      client_name: form.client_name || null,
      internal_area_code: form.internal_area_code || null,
      product_code: form.product_code || null,
      project_article_no: form.project_article_no || null,
      received_at: form.received_at || new Date().toISOString().slice(0, 10),
      due_at: form.due_at || null,
      estimated_hours: form.estimated_hours ? Number(form.estimated_hours) : null,
      sop: form.sop || null,
      quantity: form.quantity ? Number(form.quantity) : null,
      project_duration: form.project_duration || null,
      sequential_mode: tplForCase?.sequential_mode || false,
      due_required: tplForCase?.due_required || false,
      lock_mode: tplForCase?.lock_mode || 'hard',
      created_by: userId,
      last_changed_by: userId,
      last_changed_at: new Date().toISOString(),
    } as any).select('id').single();
    setSaving(false);
    if (error || !newCase) { toast.error('Fehler: ' + error?.message); return; }
    await supabase.from('case_activity').insert({ case_id: newCase.id, action: 'CREATE', actor_id: userId });
    if (form.description && form.description.trim()) {
      await (supabase as any).from('case_notes').insert({
        case_id: newCase.id,
        author_id: userId,
        body: form.description.trim(),
        pinned: true,
      });
    }
    if (form.note && form.note.trim() && form.note.trim() !== form.description.trim()) {
      await (supabase as any).from('case_notes').insert({
        case_id: newCase.id,
        author_id: userId,
        body: form.note.trim(),
        pinned: true,
      });
    }
    if (pendingTemplateTasks.length) {
      await (supabase as any).from('case_tasks').insert(
        pendingTemplateTasks.map((t, i) => ({
          case_id: newCase.id,
          title: t.title,
          description: t.description,
          department_id: t.department_id,
          sort_order: i,
          created_by: userId,
        })),
      );
      if (pendingTemplateId) {
        await (supabase as any).from('case_templates').update({ last_used_at: new Date().toISOString() }).eq('id', pendingTemplateId);
      }
    }
    try { await supabase.functions.invoke('notify-vorgang-created', { body: { caseId: newCase.id, actorId: userId } }); } catch {}
    try { localStorage.removeItem(draftKey); } catch {}
    toast.success('Vorgang erstellt');
    onCreated();
  };

  const selectedCustomer = customers.find(c => c.customer_no === form.customer_no);
  const selectedProduct = products.find(p => p.code === form.product_code);

  const canProceed = () => {
    if (step === 1) return form.project_name.trim().length > 0;
    return true;
  };

  const next = () => {
    if (!canProceed()) {
      if (step === 1) toast.error('Projektname ist Pflicht');
      return;
    }
    setStep(s => Math.min(s + 1, STEPS.length));
  };

  const prev = () => setStep(s => Math.max(s - 1, 1));

  return (
    <>
      <div className="space-y-4">
        {draftRestored && (
          <div className="flex items-center justify-between gap-3 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-[11px]">
            <span className="text-foreground">
              Entwurf wiederhergestellt – deine letzten Eingaben wurden geladen.
            </span>
            <button
              type="button"
              onClick={discardDraft}
              className="text-muted-foreground hover:text-foreground underline underline-offset-2"
            >
              Entwurf verwerfen
            </button>
          </div>
        )}
        {/* Stepper */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
              Schritt {step} von {STEPS.length}
            </span>
            <span className="text-xs font-medium text-foreground">{STEPS[step - 1].title}</span>
          </div>
          <div className="flex gap-1">
            {STEPS.map(s => (
              <div
                key={s.id}
                className={cn(
                  'h-1 flex-1 rounded-full transition-colors',
                  s.id < step ? 'bg-primary' : s.id === step ? 'bg-primary/70' : 'bg-muted',
                )}
              />
            ))}
          </div>
        </div>

        <div className="space-y-3 min-h-[260px]">
          {/* STEP 1: Projektname */}
          {step === 1 && (
            <div className="space-y-3 animate-in fade-in slide-in-from-right-2 duration-200">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Label className="text-xs text-muted-foreground">Beschreibung / fixierte Notiz</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className="inline-flex items-center justify-center rounded-full h-5 w-5 bg-primary/10 text-primary hover:bg-primary/20 transition-colors focus:outline-none focus:ring-1 focus:ring-primary/40"
                        >
                          <Sparkles className="h-3 w-3" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent side="top" align="start" sideOffset={8} className="w-64 space-y-2 text-xs p-3">
                        <div className="flex items-start gap-2">
                          <Sparkles className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                          <div className="space-y-1.5">
                            <p className="font-medium text-foreground">MTIQ Tipp</p>
                            <p className="text-muted-foreground text-[11px] leading-relaxed">
                              MTIQ kann deine Beschreibung klarer und verständlicher formulieren. Gib mindestens 20 Zeichen ein.
                            </p>
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                  <MtiqButton
                    text={form.description}
                    onResult={(t) => { set('description', t); setMtiqApplied(true); setMtiqHintDismissed(true); }}
                    disabled={mtiqLoading || !form.description.trim()}
                    minChars={1}
                  />


                </div>
                <Textarea
                  value={form.description}
                  onChange={e => { set('description', e.target.value); if (mtiqApplied) setMtiqApplied(false); }}
                  onBlur={() => setDescBlurred(true)}
                  rows={4}
                  className="text-xs"
                  placeholder={'Was möchte ich?\n z.B. Anpassung Abfragemasken bei Vorgangsanlage\nWas ist das Ziel?\n z.B. verbesserte / leichtere Eingabeführung systemseitig für MTCON-Masterlistennutzer'}
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Vorgangsname bzw. Kurzbeschreibungs-Titel der neu anzulegenden Aufgabe *</Label>
                <div className="relative">
                  <Input
                    value={form.project_name}
                    onChange={e => set('project_name', e.target.value)}
                    placeholder="Projekt Alpha"
                    autoFocus
                    className="h-8 text-xs"
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); next(); } }}
                  />
                  {suggestions.length > 0 && form.project_name.length >= 3 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-8 px-2 text-amber-500"
                      onClick={() => setShowSuggestions(!showSuggestions)}
                      title="Ähnliche Vorgänge gefunden"
                    >
                      <Lightbulb className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>

              {showSuggestions && suggestions.length > 0 && (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
                  <p className="text-[11px] font-medium text-amber-600">Ähnliche Vorgänge – Daten übernehmen?</p>
                  {suggestions.map((s, i) => (
                    <button
                      type="button"
                      key={i}
                      onClick={() => applySuggestion(s)}
                      className="w-full text-left rounded px-2 py-1.5 text-xs hover:bg-amber-500/10 transition-colors"
                    >
                      <span className="font-medium">{s.project_name}</span>
                      <span className="text-muted-foreground ml-2">
                        {[s.customer_no, s.product_code].filter(Boolean).join(' · ')}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Zuordnung und Integration auf bestehende Vorgänge + / Projekte (optional)</Label>
                <Select value={form.project_id || '_none'} onValueChange={v => v === '_none' ? set('project_id', '') : handleProjectChange(v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Kein Projekt" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Kein Projekt</SelectItem>
                    {projects.map(p => (
                      <SelectItem key={p.id} value={p.id} className="text-left justify-start">
                        <span className="font-mono text-[11px] text-muted-foreground mr-1.5">{p.project_number}</span>{p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {visibleTemplates.length > 0 && (
                <div className="space-y-1 rounded-md border border-primary/30 bg-primary/5 p-2.5">
                  <Label className="text-xs text-muted-foreground">Aus Template erstellen? (optional)</Label>
                  <Select value={selectedTemplateId || '_none'} onValueChange={v => applyTemplate(v === '_none' ? '' : v)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Template wählen" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">Ohne Template</SelectItem>
                      {visibleTemplates.map(t => (
                        <SelectItem key={t.id} value={t.id} className="text-left justify-start">{t.title} <span className="text-muted-foreground ml-1.5">({t.tasks.length})</span></SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {pendingTemplateTasks.length > 0 && (
                    <p className="text-[10px] text-muted-foreground">{pendingTemplateTasks.length} Unteraufgaben werden mit angelegt.</p>
                  )}
                </div>
              )}

              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Vorgangsnummer</Label>
                <Input value="wird automatisch vergeben" disabled className="h-8 text-xs bg-muted/50 text-muted-foreground" />
              </div>
            </div>
          )}

          {/* STEP 2: Zuständigkeit */}
          {step === 2 && (
            <div className="space-y-3 animate-in fade-in slide-in-from-right-2 duration-200">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">MTCON Abteilung</Label>
                  <Select value={form.department_id || '_none'} onValueChange={handleDeptChange}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Wählen" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">Keine Abteilung</SelectItem>
                      {topLevel.map(d => (
                        <SelectItem key={d.id} value={d.id} className="text-left justify-start">
                          <span className="flex items-center text-left w-full">
                            {d.code ? <span className="font-mono text-[11px] text-muted-foreground mr-1.5">{d.code}</span> : null}{d.name}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">MTCON Abteilungsteilbereich</Label>
                  <Select value={form.team_id || '_none'} onValueChange={v => set('team_id', v === '_none' ? '' : v)} disabled={!form.department_id || teams.length === 0}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={!form.department_id ? '–' : teams.length === 0 ? 'Keine' : 'Wählen'} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">Kein Teilbereich</SelectItem>
                      {teams.map(t => (
                        <SelectItem key={t.id} value={t.id} className="text-left justify-start">
                          {t.code ? `${t.code} – ${t.name}` : t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">MTCON Teammitglied (optional)</Label>
                <Select value={form.assignee_id || '_none'} onValueChange={v => set('assignee_id', v === '_none' ? '' : v)}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder={effectiveDeptId ? 'Mitarbeiter wählen' : 'Erst Abteilung wählen (optional)'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Keine direkte Zuordnung – Vorgang landet im Abteilungspool frei zur Abholung</SelectItem>
                    {(effectiveDeptId ? deptProfiles : profiles).map(p => (
                      <SelectItem key={p.id} value={p.id} className="text-xs">
                        <span className="font-mono text-[11px] text-muted-foreground mr-1.5">{p.short_code}</span>{p.display_name}
                      </SelectItem>
                    ))}
                    {effectiveDeptId && deptProfiles.length === 0 && (
                      <div className="px-2 py-1.5 text-[11px] text-muted-foreground">Keine Mitarbeiter dieser Abteilung</div>
                    )}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground">Vorgang landet zuerst bei diesem Mitarbeiter.</p>
              </div>
            </div>
          )}

          {/* STEP 3: Kunde & Produkt */}
          {step === 3 && (
            <div className="space-y-3 animate-in fade-in slide-in-from-right-2 duration-200">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Kunde</Label>
                  <Popover open={customerOpen} onOpenChange={setCustomerOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" role="combobox" className="w-full h-8 text-xs justify-between font-normal">
                        {selectedCustomer ? `${selectedCustomer.customer_no} – ${selectedCustomer.name}` : 'Kunde wählen…'}
                        <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[280px] p-0" align="start">
                      <Command shouldFilter={false}>
                        <CommandInput placeholder="Suchen…" value={customerSearch} onValueChange={setCustomerSearch} className="text-xs" />
                        <CommandList>
                          <CommandEmpty className="py-2 text-xs text-center text-muted-foreground">Kein Kunde gefunden</CommandEmpty>
                          <CommandGroup>
                            {filteredCustomers.map(c => (
                              <CommandItem
                                key={c.id}
                                value={`${c.customer_no} ${c.name}`}
                                onSelect={() => { set('customer_no', c.customer_no); setCustomerOpen(false); }}
                                className="text-xs"
                              >
                                <Check className={cn('mr-2 h-3 w-3', form.customer_no === c.customer_no ? 'opacity-100' : 'opacity-0')} />
                                <span className="font-mono text-[11px] text-muted-foreground mr-1.5">{c.customer_no}</span>{c.name}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                          <CommandGroup>
                            <CommandItem onSelect={() => { setNewCustomerOpen(true); setCustomerOpen(false); }} className="text-xs text-primary">
                              <Plus className="mr-2 h-3 w-3" />Neuen Kunden erstellen
                            </CommandItem>
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Auftraggeber</Label>
                  <Input value={form.client_name} onChange={e => set('client_name', e.target.value)} className="h-8 text-xs" />
                </div>
              </div>

              <div className="rounded-md border border-border/60">
                <button
                  type="button"
                  onClick={() => setProductSectionOpen(o => !o)}
                  className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-muted/30 transition-colors"
                >
                  <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Produktinformationen</span>
                  <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', productSectionOpen && 'rotate-180')} />
                </button>
                {productSectionOpen && (
                  <div className="px-3 pb-3 pt-1 space-y-3 border-t border-border/60">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Produkt</Label>
                        <Popover open={productOpen} onOpenChange={setProductOpen}>
                          <PopoverTrigger asChild>
                            <Button variant="outline" role="combobox" className="w-full h-8 text-xs justify-between font-normal">
                              {selectedProduct ? `${selectedProduct.code} – ${selectedProduct.name}` : 'Produkt wählen…'}
                              <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[280px] p-0" align="start">
                            <Command>
                              <CommandInput placeholder="Suchen oder neues eingeben…" value={productSearch} onValueChange={setProductSearch} className="text-xs" />
                              <CommandList>
                                <CommandEmpty className="py-2 text-xs text-center text-muted-foreground">
                                  {productSearch.trim() ? (
                                    <button
                                      type="button"
                                      onClick={() => selectProductOrCreate(productSearch.trim())}
                                      className="text-primary hover:underline"
                                    >
                                      {userIsAdmin ? `„${productSearch.trim()}" als neues Produkt erstellen` : `„${productSearch.trim()}" als Produktvorschlag einreichen`}
                                    </button>
                                  ) : 'Kein Produkt gefunden'}
                                </CommandEmpty>
                                <CommandGroup>
                                  {filteredProducts.map(p => (
                                    <CommandItem
                                      key={p.id}
                                      value={`${p.code} ${p.name}`}
                                      onSelect={() => { set('product_code', p.code); setProductOpen(false); }}
                                      className="text-xs"
                                    >
                                      <Check className={cn('mr-2 h-3 w-3', form.product_code === p.code ? 'opacity-100' : 'opacity-0')} />
                                      <span className="font-mono text-[11px] text-muted-foreground mr-1.5">{p.code}</span>{p.name}
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Bereich intern</Label>
                        <Select value={form.internal_area_code} onValueChange={v => set('internal_area_code', v)}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Wählen" /></SelectTrigger>
                          <SelectContent>{areas.map(a => <SelectItem key={a.id} value={a.code}>{a.code} – {a.name}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Projekt-/Artikelnummer</Label>
                      <Input value={form.project_article_no} onChange={e => set('project_article_no', e.target.value)} className="h-8 text-xs" />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 4: Termine & Details */}
          {step === 4 && (
            <div className="space-y-3 animate-in fade-in slide-in-from-right-2 duration-200">
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1"><Label className="text-xs text-muted-foreground">Auftragseingang</Label><Input type="date" value={form.received_at} onChange={e => set('received_at', e.target.value)} className="h-8 text-xs" /></div>
                <div className="space-y-1"><Label className="text-xs text-muted-foreground">Endtermin</Label><Input type="date" value={form.due_at} onChange={e => set('due_at', e.target.value)} className="h-8 text-xs" /></div>
                <div className="space-y-1"><Label className="text-xs text-muted-foreground">Geschätzte Std.</Label><Input type="number" value={form.estimated_hours} onChange={e => set('estimated_hours', e.target.value)} className="h-8 text-xs" /></div>
              </div>

              <div className="rounded-md border border-border bg-muted/20">
                <button
                  type="button"
                  onClick={() => setProjectInfoOpen(o => !o)}
                  className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-muted/40 transition-colors"
                >
                  <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Projektinformationen</span>
                  <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', projectInfoOpen && 'rotate-180')} />
                </button>
                {projectInfoOpen && (
                  <div className="px-3 pb-3 pt-1 border-t border-border/60">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-1"><Label className="text-xs text-muted-foreground">SOP</Label><Input value={form.sop} onChange={e => set('sop', e.target.value)} placeholder="z.B. KW 26/2026" className="h-8 text-xs" /></div>
                      <div className="space-y-1"><Label className="text-xs text-muted-foreground">Stückzahl</Label><Input type="number" value={form.quantity} onChange={e => set('quantity', e.target.value)} className="h-8 text-xs" /></div>
                      <div className="space-y-1"><Label className="text-xs text-muted-foreground">Projektdauer</Label><Input value={form.project_duration} onChange={e => set('project_duration', e.target.value)} placeholder="z.B. 6 Wochen" className="h-8 text-xs" /></div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 5: Bemerkung & Zusammenfassung */}
          {step === 5 && (
            <div className="space-y-3 animate-in fade-in slide-in-from-right-2 duration-200">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  Bemerkung (wird als angepinnte Notiz gespeichert)
                  {!noteTouched && form.description.trim() && (
                    <span className="ml-1 text-[10px] text-muted-foreground/80">– aus Beschreibung übernommen</span>
                  )}
                </Label>
                <Textarea
                  value={noteTouched ? form.note : (form.note || form.description)}
                  onChange={e => { setNoteTouched(true); set('note', e.target.value); }}
                  rows={3}
                  className="text-xs"
                />
              </div>

              <div className="rounded-md border border-border bg-muted/20 p-3 space-y-1.5">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2">Zusammenfassung</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <span className="text-muted-foreground">Projektname</span><span className="font-medium">{form.project_name || '–'}</span>
                  <span className="text-muted-foreground">Abteilung</span><span>{departments.find(d => d.id === form.department_id)?.name || '–'}</span>
                  <span className="text-muted-foreground">Teilbereich</span><span>{departments.find(d => d.id === form.team_id)?.name || '–'}</span>
                  <span className="text-muted-foreground">Mitarbeiter</span><span>{profiles.find(p => p.id === form.assignee_id)?.display_name || 'Pool'}</span>
                  <span className="text-muted-foreground">Kunde</span><span>{selectedCustomer?.name || '–'}</span>
                  <span className="text-muted-foreground">Produkt</span><span>{selectedProduct?.name || '–'}</span>
                  <span className="text-muted-foreground">Endtermin</span><span>{form.due_at || '–'}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={prev}
            disabled={step === 1}
            className="h-8 text-xs"
          >
            <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Zurück
          </Button>
          {step < STEPS.length ? (
            <Button type="button" size="sm" onClick={next} disabled={!canProceed()} className="h-8 text-xs">
              Weiter <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          ) : (
            <Button type="button" size="sm" onClick={submit} disabled={saving} className="h-8 text-xs">
              {saving ? 'Speichern…' : 'Vorgang anlegen'}
            </Button>
          )}
        </div>
      </div>

      {/* New Customer Dialog */}
      <Dialog open={newCustomerOpen} onOpenChange={setNewCustomerOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="text-sm font-semibold">Neuen Kunden erstellen</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Kundennummer *</Label>
              <Input value={newCustomerNo} onChange={e => setNewCustomerNo(e.target.value)} className="h-8 text-xs" placeholder="z.B. K-001" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Name *</Label>
              <Input value={newCustomerName} onChange={e => setNewCustomerName(e.target.value)} className="h-8 text-xs" placeholder="Firmenname" />
            </div>
            <Button onClick={createCustomer} className="w-full h-8 text-xs">Kunde erstellen</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={suggestProductOpen} onOpenChange={setSuggestProductOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">Produkt vorschlagen</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-[11px] text-muted-foreground">
              Das Produkt existiert noch nicht in den Stammdaten. Reiche einen Vorschlag ein – ein Admin prüft und legt es bei Genehmigung an.
            </p>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Produktname *</Label>
              <Input value={suggestForm.product_name} onChange={e => setSuggestForm(f => ({ ...f, product_name: e.target.value }))} className="h-8 text-xs" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Artikelnummer</Label>
                <Input value={suggestForm.article_number} onChange={e => setSuggestForm(f => ({ ...f, article_number: e.target.value }))} className="h-8 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Kategorie *</Label>
                <Input value={suggestForm.category} onChange={e => setSuggestForm(f => ({ ...f, category: e.target.value }))} className="h-8 text-xs" placeholder="z.B. Steckverbinder" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Beschreibung</Label>
              <Textarea value={suggestForm.description} onChange={e => setSuggestForm(f => ({ ...f, description: e.target.value }))} className="text-xs min-h-[60px]" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Begründung *</Label>
              <Textarea value={suggestForm.request_reason} onChange={e => setSuggestForm(f => ({ ...f, request_reason: e.target.value }))} className="text-xs min-h-[60px]" placeholder="Warum wird dieses Produkt benötigt?" />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setSuggestProductOpen(false)}>Abbrechen</Button>
              <Button size="sm" className="h-8 text-xs" onClick={submitProductSuggestion} disabled={suggestSaving}>
                {suggestSaving ? 'Wird gesendet…' : 'Vorschlag einreichen'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>

  );
}
