import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import {
  Shield, ShieldCheck, Lock, Building, Car, Users as UsersIcon, Folder, FolderOpen, FolderArchive,
  Plus, Search, Upload, FileText, Download, Trash2, History, Pencil,
  CalendarClock, AlertTriangle, CheckCircle2, XCircle, Tag, X, ChevronRight, Settings2,
  Briefcase, Wallet, Hammer, Truck, Gavel, FileSignature, Paperclip, Archive, Receipt,
  Sparkles, Loader2, KeyRound, ArrowLeft,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format, differenceInDays, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';

interface Category {
  id: string;
  name: string;
  description: string | null;
  color: string;
  icon: string;
  sort_order: number;
  parent_id: string | null;
}

interface Policy {
  id: string;
  category_id: string | null;
  name: string;
  provider: string | null;
  policy_number: string | null;
  description: string | null;
  insured_object: string | null;
  start_date: string | null;
  end_date: string | null;
  renewal_date: string | null;
  notice_period_days: number | null;
  premium_amount: number | null;
  premium_currency: string | null;
  premium_interval: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  tags: string[] | null;
  status: string;
  source?: string | null;
  customer_id?: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface PolicyDocument {
  id: string;
  policy_id: string;
  storage_path: string;
  file_name: string;
  file_size: number | null;
  mime_type: string | null;
  doc_kind: string;
  version: number;
  replaced_by: string | null;
  is_current: boolean;
  description: string | null;
  uploaded_at: string;
}

const ICON_MAP: Record<string, any> = {
  'shield': Shield, 'shield-check': ShieldCheck, 'lock': Lock,
  'building': Building, 'car': Car, 'users': UsersIcon, 'folder': Folder,
  'folder-open': FolderOpen, 'folder-archive': FolderArchive, 'archive': Archive,
  'briefcase': Briefcase, 'wallet': Wallet, 'hammer': Hammer, 'truck': Truck,
  'gavel': Gavel, 'file-signature': FileSignature, 'paperclip': Paperclip,
  'receipt': Receipt, 'file-text': FileText,
};
const ICON_CHOICES = Object.keys(ICON_MAP);

const COLOR_MAP: Record<string, { bg: string; ring: string; text: string; glow: string }> = {
  sky:     { bg: 'bg-sky-500/10',     ring: 'ring-sky-500/30',     text: 'text-sky-400',     glow: 'shadow-[0_0_30px_-12px_hsl(199_89%_48%/0.5)]' },
  amber:   { bg: 'bg-amber-500/10',   ring: 'ring-amber-500/30',   text: 'text-amber-400',   glow: 'shadow-[0_0_30px_-12px_hsl(38_92%_50%/0.5)]' },
  violet:  { bg: 'bg-violet-500/10',  ring: 'ring-violet-500/30',  text: 'text-violet-400',  glow: 'shadow-[0_0_30px_-12px_hsl(258_90%_66%/0.5)]' },
  emerald: { bg: 'bg-emerald-500/10', ring: 'ring-emerald-500/30', text: 'text-emerald-400', glow: 'shadow-[0_0_30px_-12px_hsl(160_84%_39%/0.5)]' },
  rose:    { bg: 'bg-rose-500/10',    ring: 'ring-rose-500/30',    text: 'text-rose-400',    glow: 'shadow-[0_0_30px_-12px_hsl(351_83%_60%/0.5)]' },
  slate:   { bg: 'bg-slate-500/10',   ring: 'ring-slate-500/30',   text: 'text-slate-300',   glow: 'shadow-[0_0_30px_-12px_hsl(215_16%_47%/0.5)]' },
};
const COLOR_CHOICES = Object.keys(COLOR_MAP);

const EMPTY_FORM: Partial<Policy> = {
  name: '', provider: '', policy_number: '', category_id: null, description: '', insured_object: '',
  start_date: '', end_date: '', renewal_date: '', notice_period_days: 90,
  premium_amount: null, premium_currency: 'EUR', premium_interval: 'yearly',
  contact_name: '', contact_email: '', contact_phone: '',
  tags: [], status: 'active', notes: '', customer_id: null,
};

type EffectiveStatus = 'draft' | 'active' | 'expiring_soon' | 'expired' | 'cancelled' | 'archived';

function getEffectiveStatus(p: Policy): EffectiveStatus {
  if (p.status === 'draft') return 'draft';
  if (p.status === 'cancelled' || p.status === 'archived') return p.status as EffectiveStatus;
  if (p.end_date) {
    const days = differenceInDays(parseISO(p.end_date), new Date());
    if (days < 0) return 'expired';
    if (days <= 30) return 'expiring_soon';
  }
  return 'active';
}

const STATUS_META: Record<EffectiveStatus, { label: string; cls: string; icon: any }> = {
  draft:         { label: 'KI-Entwurf',   cls: 'bg-violet-500/10 text-violet-300 ring-violet-500/30',     icon: Sparkles },
  active:        { label: 'Aktiv',        cls: 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/30', icon: CheckCircle2 },
  expiring_soon: { label: 'Läuft bald',   cls: 'bg-amber-500/10 text-amber-400 ring-amber-500/30',       icon: CalendarClock },
  expired:       { label: 'Abgelaufen',   cls: 'bg-rose-500/10 text-rose-400 ring-rose-500/30',          icon: AlertTriangle },
  cancelled:     { label: 'Gekündigt',    cls: 'bg-slate-500/10 text-slate-300 ring-slate-500/30',       icon: XCircle },
  archived:      { label: 'Archiviert',   cls: 'bg-slate-500/10 text-slate-400 ring-slate-500/30',       icon: Folder },
};

function fmtMoney(amount: number | null, cur?: string | null) {
  if (amount == null) return '—';
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: cur || 'EUR' }).format(amount);
}
function fmtDate(d: string | null) {
  if (!d) return '—';
  try { return format(parseISO(d), 'dd.MM.yyyy', { locale: de }); } catch { return d; }
}
function fmtBytes(n: number | null) {
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} kB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export default function AdminGhv() {
  const { user, isAdmin, profile } = useAuth();
  const isManager = !!(profile as any)?.is_manager;
  const [hasCategoryGrant, setHasCategoryGrant] = useState(false);
  const [hasWriteGrant, setHasWriteGrant] = useState(false);
  const canRead = isAdmin || isManager;
  const canWrite = isAdmin || isManager;
  const nav = useNavigate();
  const { id: routeId } = useParams();

  useEffect(() => {
    if (!user?.id || isAdmin) return;
    (async () => {
      const { data } = await supabase
        .from('document_category_permissions' as any)
        .select('permission')
        .eq('principal_type', 'user')
        .eq('user_id', user.id)
        .in('permission', ['read', 'write']);
      const rows = (data ?? []) as any[];
      if (rows.length > 0) setHasCategoryGrant(true);
      if (rows.some(r => r.permission === 'write')) setHasWriteGrant(true);
    })();
  }, [user?.id, isAdmin]);


  const [categories, setCategories] = useState<Category[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [customers, setCustomers] = useState<{ id: string; name: string; customer_no: string | null }[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedCat, setSelectedCat] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<Policy>>(EMPTY_FORM);
  const [tagInput, setTagInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);


  const handleAnalyzeDocument = async (file: File) => {
    if (analyzing) return;
    const maxBytes = 15 * 1024 * 1024;
    if (file.size > maxBytes) {
      toast.error('Datei zu groß (max. 15 MB)');
      return;
    }
    setAnalyzing(true);
    try {
      const buf = await file.arrayBuffer();
      // chunked base64 to avoid stack overflow on large files
      const bytes = new Uint8Array(buf);
      let binary = '';
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as any);
      }
      const file_base64 = btoa(binary);
      const { data, error } = await supabase.functions.invoke('analyze-policy-document', {
        body: { file_base64, mime_type: file.type || 'application/pdf', file_name: file.name },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const fields = (data?.fields || {}) as Record<string, any>;

      // Merge only non-null/non-empty fields; never overwrite Kategorie
      setForm(prev => {
        const next: any = { ...prev };
        const assign = (key: string, value: any) => {
          if (value === null || value === undefined) return;
          if (typeof value === 'string' && value.trim() === '') return;
          next[key] = value;
        };
        assign('name', fields.name);
        assign('provider', fields.provider);
        assign('policy_number', fields.policy_number);
        assign('description', fields.description);
        assign('insured_object', fields.insured_object);
        assign('start_date', fields.start_date);
        assign('end_date', fields.end_date);
        assign('renewal_date', fields.renewal_date);
        if (typeof fields.notice_period_days === 'number') next.notice_period_days = fields.notice_period_days;
        if (typeof fields.premium_amount === 'number') next.premium_amount = fields.premium_amount;
        assign('premium_currency', fields.premium_currency);
        if (fields.premium_interval && ['monthly','quarterly','yearly','one_time'].includes(fields.premium_interval)) {
          next.premium_interval = fields.premium_interval;
        }
        assign('contact_name', fields.contact_name);
        assign('contact_email', fields.contact_email);
        assign('contact_phone', fields.contact_phone);
        assign('notes', fields.notes);
        if (Array.isArray(fields.tags) && fields.tags.length) {
          const merged = Array.from(new Set([...(prev.tags || []), ...fields.tags.filter((t: any) => typeof t === 'string')]));
          next.tags = merged.slice(0, 10);
        }
        return next;
      });

      const filled = Object.values(fields).filter(v => v !== null && v !== undefined && !(typeof v === 'string' && v.trim() === '') && !(Array.isArray(v) && v.length === 0)).length;

      // Keep the file to attach it after save (create) or upload immediately (edit)
      if (editingId) {
        await uploadDocument(file, undefined, editingId);
        toast.success(`Dokument analysiert · ${filled} Felder erkannt · gespeichert`);
      } else {
        setPendingFile(file);
        toast.success(`Dokument analysiert · ${filled} Felder erkannt · wird beim Speichern abgelegt`);
      }
    } catch (e: any) {
      toast.error(e?.message || 'Analyse fehlgeschlagen');
    } finally {
      setAnalyzing(false);
    }
  };


  const [detailId, setDetailId] = useState<string | null>(routeId || null);
  const [documents, setDocuments] = useState<PolicyDocument[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [showAllVersions, setShowAllVersions] = useState(false);

  const [catManagerOpen, setCatManagerOpen] = useState(false);
  const [expandedCats, setExpandedCats] = useState<Record<string, boolean>>({});
  const toggleExpand = (id: string) => setExpandedCats(s => ({ ...s, [id]: !s[id] }));

  useEffect(() => { setDetailId(routeId || null); }, [routeId]);

  const load = async () => {
    setLoading(true);
    const [catRes, polRes, cusRes] = await Promise.all([
      supabase.from('ghv_categories' as any).select('*').order('sort_order'),
      supabase.from('ghv_agreements' as any).select('*').order('updated_at', { ascending: false }),
      supabase.from('customers').select('id, name, customer_no').order('name').limit(5000),
    ]);
    setCategories((catRes.data || []) as any);
    setPolicies((polRes.data || []) as any);
    setCustomers((cusRes.data || []) as any);
    setLoading(false);
  };

  useEffect(() => { if (canRead) load(); }, [canRead]);

  const loadDocs = async (policyId: string) => {
    setDocsLoading(true);
    const { data } = await supabase.from('ghv_documents' as any)
      .select('*').eq('policy_id', policyId)
      .order('version', { ascending: false });
    setDocuments((data || []) as any);
    setDocsLoading(false);
  };
  useEffect(() => { if (detailId) loadDocs(detailId); }, [detailId]);

  const childrenByParent = useMemo(() => {
    const m: Record<string, Category[]> = {};
    for (const c of categories) {
      const key = c.parent_id || '__root__';
      (m[key] ||= []).push(c);
    }
    for (const k of Object.keys(m)) m[k].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
    return m;
  }, [categories]);
  const rootCategories = childrenByParent['__root__'] || [];

  const descendantIds = useMemo(() => {
    const map: Record<string, string[]> = {};
    const walk = (id: string): string[] => {
      if (map[id]) return map[id];
      const kids = childrenByParent[id] || [];
      const all = [id, ...kids.flatMap(k => walk(k.id))];
      map[id] = all;
      return all;
    };
    for (const c of categories) walk(c.id);
    return map;
  }, [categories, childrenByParent]);

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: policies.length, uncategorized: 0 };
    for (const c of categories) map[c.id] = 0;
    for (const p of policies) {
      if (!p.category_id) { map.uncategorized++; continue; }
      // count up the chain so parents include children
      let cur: Category | undefined = categories.find(c => c.id === p.category_id);
      while (cur) {
        map[cur.id] = (map[cur.id] || 0) + 1;
        cur = cur.parent_id ? categories.find(c => c.id === cur!.parent_id) : undefined;
      }
    }
    return map;
  }, [policies, categories]);

  const expiringCount = useMemo(
    () => policies.filter(p => ['expiring_soon', 'expired'].includes(getEffectiveStatus(p))).length,
    [policies],
  );

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    const selectedSet = selectedCat !== 'all' && selectedCat !== 'uncategorized'
      ? new Set(descendantIds[selectedCat] || [selectedCat])
      : null;
    return policies.filter(p => {
      if (selectedCat === 'uncategorized' && p.category_id) return false;
      if (selectedSet && (!p.category_id || !selectedSet.has(p.category_id))) return false;
      if (statusFilter !== 'all' && getEffectiveStatus(p) !== statusFilter) return false;
      if (s) {
        const cus = p.customer_id ? customers.find(c => c.id === p.customer_id) : null;
        const hay = [p.name, p.provider, p.policy_number, p.insured_object, p.description, p.notes, (p.tags || []).join(' '), cus?.name, cus?.customer_no]
          .filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [policies, selectedCat, statusFilter, search, descendantIds, customers]);

  const detailPolicy = policies.find(p => p.id === detailId) || null;
  const detailCategory = detailPolicy ? categories.find(c => c.id === detailPolicy.category_id) : null;
  const detailCustomer = detailPolicy?.customer_id ? customers.find(c => c.id === detailPolicy.customer_id) || null : null;

  // ---- editor ----
  const openCreate = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, category_id: selectedCat !== 'all' && selectedCat !== 'uncategorized' ? selectedCat : null });
    setPendingFile(null);
    setEditorOpen(true);
  };
  const openEdit = (p: Policy) => {
    setEditingId(p.id);
    setForm({ ...p });
    setPendingFile(null);
    setEditorOpen(true);
  };

  const addTag = () => {
    const t = tagInput.trim();
    if (!t) return;
    setForm(f => ({ ...f, tags: [...(f.tags || []), t] }));
    setTagInput('');
  };
  const removeTag = (i: number) => setForm(f => ({ ...f, tags: (f.tags || []).filter((_, idx) => idx !== i) }));

  const save = async () => {
    if (!form.name?.trim()) { toast.error('Bezeichnung ist Pflicht'); return; }
    setSaving(true);
    const payload: any = {
      ...form,
      name: form.name!.trim(),
      provider: form.provider || null,
      policy_number: form.policy_number || null,
      description: form.description || null,
      insured_object: form.insured_object || null,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      renewal_date: form.renewal_date || null,
      notice_period_days: form.notice_period_days || null,
      premium_amount: form.premium_amount === null || form.premium_amount === undefined || (form.premium_amount as any) === '' ? null : Number(form.premium_amount),
      contact_name: form.contact_name || null,
      contact_email: form.contact_email || null,
      contact_phone: form.contact_phone || null,
      notes: form.notes || null,
      customer_id: form.customer_id || null,
      tags: form.tags || [],
      updated_by: user?.id || null,
    };
    let newPolicyId: string | null = null;
    if (editingId) {
      const original = policies.find(p => p.id === editingId);
      const { error } = await supabase.from('ghv_agreements' as any).update(payload).eq('id', editingId);
      if (error) { toast.error('Fehler: ' + error.message); setSaving(false); return; }
      toast.success('Eintrag aktualisiert');
      // Log AI corrections for learning loop
      if (original && original.source === 'email_intake') {
        const trackFields: (keyof Policy)[] = [
          'name','provider','policy_number','insured_object','description',
          'start_date','end_date','renewal_date','notice_period_days',
          'premium_amount','premium_currency','premium_interval',
          'contact_name','contact_email','contact_phone','category_id',
        ];
        const corrections = trackFields
          .filter(f => String((original as any)[f] ?? '') !== String((payload as any)[f] ?? ''))
          .map(f => ({
            policy_id: editingId,
            field: String(f),
            ai_value: (original as any)[f] == null ? null : String((original as any)[f]),
            corrected_value: (payload as any)[f] == null ? null : String((payload as any)[f]),
            corrected_by: user?.id || null,
          }));
        void corrections;
      }
    } else {
      payload.created_by = user?.id || null;
      const { data, error } = await supabase.from('ghv_agreements' as any).insert(payload).select('id').single();
      if (error) { toast.error('Fehler: ' + error.message); setSaving(false); return; }
      toast.success('Eintrag angelegt');
      if (data) { newPolicyId = (data as any).id; setDetailId(newPolicyId); }
    }
    if (pendingFile && newPolicyId) {
      await uploadDocument(pendingFile, undefined, newPolicyId);
    }
    setPendingFile(null);
    setSaving(false);
    setEditorOpen(false);
    await load();
  };


  const deletePolicy = async (p: Policy) => {
    if (!confirm(`Police "${p.name}" inkl. aller Dokumente löschen?`)) return;
    // Best-effort: delete storage objects first
    const { data: docs } = await supabase.from('ghv_documents' as any).select('storage_path').eq('policy_id', p.id);
    const paths = (docs || []).map((d: any) => d.storage_path).filter(Boolean);
    if (paths.length) await supabase.storage.from('ghv-documents').remove(paths);
    const { error } = await supabase.from('ghv_agreements' as any).delete().eq('id', p.id);
    if (error) { toast.error('Fehler: ' + error.message); return; }
    toast.success('Eintrag gelöscht');
    setDetailId(null);
    await load();
  };

  // ---- documents ----
  const uploadDocument = async (file: File, replacesId?: string, policyIdOverride?: string) => {
    const policyId = policyIdOverride || detailId;
    if (!policyId) return;
    const ext = file.name.split('.').pop() || 'pdf';
    const key = `${policyId}/${crypto.randomUUID()}.${ext}`;
    const up = await supabase.storage.from('ghv-documents').upload(key, file, {
      cacheControl: '3600', upsert: false, contentType: file.type,
    });
    if (up.error) { toast.error('Upload fehlgeschlagen: ' + up.error.message); return; }

    let version = 1;
    if (replacesId) {
      const replaced = documents.find(d => d.id === replacesId);
      version = (replaced?.version || 1) + 1;
    }

    const { data: inserted, error: insErr } = await supabase.from('ghv_documents' as any).insert({
      policy_id: policyId,
      storage_path: key,
      file_name: file.name,
      file_size: file.size,
      mime_type: file.type,
      doc_kind: 'police',
      version,
      is_current: true,
      uploaded_by: user?.id || null,
    }).select('id').single();

    if (insErr) { toast.error('Fehler: ' + insErr.message); return; }

    if (replacesId && inserted) {
      await supabase.from('ghv_documents' as any).update({
        is_current: false, replaced_by: (inserted as any).id,
      }).eq('id', replacesId);
    }
    toast.success('Dokument hochgeladen');
    if (detailId === policyId) await loadDocs(policyId);
  };


  const downloadDoc = async (doc: PolicyDocument) => {
    const { data, error } = await supabase.storage.from('ghv-documents').createSignedUrl(doc.storage_path, 300);
    if (error || !data) { toast.error('Download fehlgeschlagen'); return; }
    window.open(data.signedUrl, '_blank');
  };

  const deleteDoc = async (doc: PolicyDocument) => {
    if (!confirm(`"${doc.file_name}" löschen?`)) return;
    await supabase.storage.from('ghv-documents').remove([doc.storage_path]);
    await supabase.from('ghv_documents' as any).delete().eq('id', doc.id);
    toast.success('Dokument gelöscht');
    if (detailId) await loadDocs(detailId);
  };

  if (!canRead) {
    return (
      <AppLayout>
        <div className="max-w-2xl">
          <div className="rounded-md border border-border bg-card p-6">
            <h1 className="text-base font-semibold text-foreground">GHV – Geheimhaltungserklärungen</h1>
            <p className="text-xs text-muted-foreground mt-1">Diese Ablage ist nur für Admins und Manager sichtbar.</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  const currentDocs = documents.filter(d => d.is_current);
  const archivedDocs = documents.filter(d => !d.is_current);

  return (
    <AppLayout>
      <div className="space-y-5">
        {/* Hero header with mesh-gradient feel */}
        <div className="relative overflow-hidden rounded-xl border border-border bg-card p-6">
          <div className="absolute inset-0 opacity-60 pointer-events-none"
               style={{ background: 'radial-gradient(800px 200px at 10% -10%, hsl(199 89% 48% / 0.18), transparent 60%), radial-gradient(600px 200px at 90% -20%, hsl(258 90% 66% / 0.18), transparent 60%)' }} />
          <div className="relative flex items-start justify-between gap-4 flex-wrap">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className="h-8 w-8 -ml-2" onClick={() => nav('/container')} title="Zurück zum 3D Container">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="h-8 w-8 rounded-md bg-primary/10 ring-1 ring-primary/30 flex items-center justify-center">
                  <FolderArchive className="h-4 w-4 text-primary" />
                </div>
                <h1 className="text-base font-semibold text-foreground">GHV – Geheimhaltungserklärungen</h1>
              </div>
              <p className="text-xs text-muted-foreground ml-8">Zentrale Ablage für Geheimhaltungserklärungen (NDAs) – mit Versionierung, Volltextsuche und Ablauf-Erinnerung.</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Einträge</div>
                <div className="text-xl font-semibold tabular-nums text-foreground">{policies.length}</div>
              </div>
              <div className={cn('text-right rounded-md px-3 py-1.5 ring-1', expiringCount > 0 ? 'bg-amber-500/10 ring-amber-500/30' : 'bg-muted/30 ring-border')}>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Aufmerksamkeit</div>
                <div className={cn('text-xl font-semibold tabular-nums', expiringCount > 0 ? 'text-amber-400' : 'text-foreground')}>{expiringCount}</div>
              </div>
              {canWrite && (
                <Button size="sm" onClick={openCreate} className="h-9 gap-1.5">
                  <Plus className="h-4 w-4" /> Neuer Eintrag
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-12 gap-5">
          {/* Sidebar */}
          <aside className="col-span-12 lg:col-span-3 space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Suche…"
                className="pl-9 h-9 text-xs bg-card"
              />
            </div>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 text-xs bg-card"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Status</SelectItem>
                <SelectItem value="draft">KI-Entwurf</SelectItem>
                <SelectItem value="active">Aktiv</SelectItem>
                <SelectItem value="expiring_soon">Läuft bald</SelectItem>
                <SelectItem value="expired">Abgelaufen</SelectItem>
                <SelectItem value="cancelled">Gekündigt</SelectItem>
                <SelectItem value="archived">Archiviert</SelectItem>
              </SelectContent>
            </Select>

            <div className="rounded-lg border border-border bg-card/60 backdrop-blur p-1.5 space-y-0.5">
              <div className="flex items-center justify-between px-2.5 py-1.5">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Kategorien</span>
                {canWrite && (
                  <button
                    onClick={() => setCatManagerOpen(true)}
                    className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                    title="Kategorien verwalten"
                  >
                    <Settings2 className="h-3 w-3" /> Verwalten
                  </button>
                )}
              </div>
              <CategoryRow
                active={selectedCat === 'all'}
                onClick={() => setSelectedCat('all')}
                icon={Folder} color="slate" label="Alle Kategorien" count={counts.all}
              />
              {rootCategories.map(c => (
                <CategoryTree
                  key={c.id}
                  cat={c}
                  depth={0}
                  selectedCat={selectedCat}
                  setSelectedCat={setSelectedCat}
                  expanded={expandedCats}
                  toggleExpand={toggleExpand}
                  childrenByParent={childrenByParent}
                  counts={counts}
                />
              ))}
              {counts.uncategorized > 0 && (
                <CategoryRow
                  active={selectedCat === 'uncategorized'}
                  onClick={() => setSelectedCat('uncategorized')}
                  icon={Folder} color="slate" label="Ohne Kategorie" count={counts.uncategorized}
                />
              )}
            </div>
          </aside>

          {/* Cards grid */}
          <section className="col-span-12 lg:col-span-9">
            {loading ? (
              <div className="text-center text-xs text-muted-foreground py-16">Laden…</div>
            ) : filtered.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border bg-card/30 p-12 text-center">
                <FolderOpen className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
                <p className="text-sm text-foreground">Noch keine Einträge in dieser Ansicht</p>
                <p className="text-xs text-muted-foreground mt-1">Lege deinen ersten Eintrag an oder wähle eine andere Kategorie.</p>
                {canWrite && (
                  <Button size="sm" onClick={openCreate} className="mt-4 gap-1.5">
                    <Plus className="h-4 w-4" /> Neuer Eintrag
                  </Button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {filtered.map(p => (
                  <PolicyCard
                    key={p.id}
                    policy={p}
                    category={categories.find(c => c.id === p.category_id) || null}
                    onClick={() => setDetailId(p.id)}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Detail Drawer */}
      <Sheet open={!!detailId} onOpenChange={(o) => { if (!o) setDetailId(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
          {detailPolicy && (() => {
            const eff = getEffectiveStatus(detailPolicy);
            const meta = STATUS_META[eff];
            const StatusIcon = meta.icon;
            const colorMeta = COLOR_MAP[detailCategory?.color || 'slate'];
            const CatIcon = ICON_MAP[detailCategory?.icon || 'shield'] || Shield;
            const daysLeft = detailPolicy.end_date ? differenceInDays(parseISO(detailPolicy.end_date), new Date()) : null;
            return (
              <>
                <SheetHeader className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className={cn('h-10 w-10 rounded-md ring-1 flex items-center justify-center shrink-0', colorMeta.bg, colorMeta.ring)}>
                      <CatIcon className={cn('h-5 w-5', colorMeta.text)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <SheetTitle className="text-base font-semibold text-foreground leading-tight">{detailPolicy.name}</SheetTitle>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {detailCategory?.name || 'Ohne Kategorie'}
                        {detailPolicy.provider && <> · {detailPolicy.provider}</>}
                        {detailPolicy.policy_number && <> · <span className="font-mono">{detailPolicy.policy_number}</span></>}
                        {detailCustomer && <div className="mt-0.5">Kunde: {detailCustomer.name}{detailCustomer.customer_no ? ` (${detailCustomer.customer_no})` : ''}</div>}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={cn('inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] ring-1', meta.cls)}>
                      <StatusIcon className="h-3 w-3" /> {meta.label}
                      {eff === 'expiring_soon' && daysLeft != null && <> · noch {daysLeft} Tage</>}
                      {eff === 'expired' && daysLeft != null && <> · seit {Math.abs(daysLeft)} Tagen</>}
                    </span>
                    {(detailPolicy.tags || []).map(t => (
                      <span key={t} className="inline-flex items-center gap-1 rounded-md bg-muted/40 px-2 py-1 text-[10px] text-muted-foreground">
                        <Tag className="h-2.5 w-2.5" /> {t}
                      </span>
                    ))}
                  </div>
                </SheetHeader>

                {detailPolicy.status === 'draft' && (
                  <div className="mt-4 rounded-md border border-violet-500/30 bg-violet-500/5 p-3 flex items-start gap-3">
                    <Sparkles className="h-4 w-4 text-violet-300 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-foreground">KI-Entwurf aus E-Mail</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        Diese Police wurde automatisch aus einem eingehenden PDF erstellt. Bitte Felder prüfen und bestätigen.
                      </div>
                    </div>
                    {canWrite && (
                      <Button
                        size="sm"
                        className="h-7 text-[11px] shrink-0"
                        onClick={async () => {
                          const { error } = await supabase
                            .from('ghv_agreements' as any)
                            .update({ status: 'active', updated_by: user?.id || null })
                            .eq('id', detailPolicy.id);
                          if (error) { toast.error('Fehler: ' + error.message); return; }
                          toast.success('Als aktiv übernommen');
                          await load();
                        }}
                      >
                        Als aktiv übernehmen
                      </Button>
                    )}
                  </div>
                )}

                <div className="mt-6 space-y-6">

                  {/* Key facts */}
                  <div className="grid grid-cols-2 gap-3">
                    <Fact label="Versichertes Objekt" value={detailPolicy.insured_object} full />
                    <Fact label="Laufzeit von" value={fmtDate(detailPolicy.start_date)} />
                    <Fact label="Laufzeit bis" value={fmtDate(detailPolicy.end_date)} />
                    <Fact label="Verlängerung" value={fmtDate(detailPolicy.renewal_date)} />
                    <Fact label="Kündigungsfrist" value={detailPolicy.notice_period_days ? `${detailPolicy.notice_period_days} Tage` : '—'} />
                    <Fact label="Prämie" value={`${fmtMoney(detailPolicy.premium_amount, detailPolicy.premium_currency)} / ${
                      detailPolicy.premium_interval === 'monthly' ? 'Monat'
                      : detailPolicy.premium_interval === 'quarterly' ? 'Quartal'
                      : detailPolicy.premium_interval === 'one_time' ? 'einmalig'
                      : 'Jahr'
                    }`} />
                  </div>

                  {(detailPolicy.contact_name || detailPolicy.contact_email || detailPolicy.contact_phone) && (
                    <div className="rounded-md border border-border bg-muted/20 p-3 space-y-1">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Ansprechpartner</div>
                      {detailPolicy.contact_name && <div className="text-xs text-foreground">{detailPolicy.contact_name}</div>}
                      {detailPolicy.contact_email && <a href={`mailto:${detailPolicy.contact_email}`} className="block text-xs text-primary hover:underline">{detailPolicy.contact_email}</a>}
                      {detailPolicy.contact_phone && <div className="text-xs text-muted-foreground">{detailPolicy.contact_phone}</div>}
                    </div>
                  )}

                  {detailPolicy.description && (
                    <div className="space-y-1">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Beschreibung</div>
                      <p className="text-xs text-foreground whitespace-pre-wrap leading-relaxed">{detailPolicy.description}</p>
                    </div>
                  )}
                  {detailPolicy.notes && (
                    <div className="space-y-1">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Interne Notizen</div>
                      <p className="text-xs text-foreground whitespace-pre-wrap leading-relaxed">{detailPolicy.notes}</p>
                    </div>
                  )}

                  {/* Documents */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Dokumente</div>
                      {canWrite && (
                        <label className="inline-flex items-center gap-1.5 cursor-pointer text-[11px] text-primary hover:underline">
                          <Upload className="h-3 w-3" /> Hochladen
                          <input type="file" className="hidden"
                            onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadDocument(f); e.currentTarget.value = ''; }} />
                        </label>
                      )}
                    </div>
                    {docsLoading ? (
                      <div className="text-[11px] text-muted-foreground py-4">Lade Dokumente…</div>
                    ) : currentDocs.length === 0 ? (
                      <div className="rounded-md border border-dashed border-border bg-muted/10 p-4 text-center">
                        <FileText className="h-6 w-6 mx-auto text-muted-foreground/40 mb-1" />
                        <p className="text-[11px] text-muted-foreground">Noch keine Dokumente</p>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {currentDocs.map(doc => <DocRow key={doc.id} doc={doc} canWrite={canWrite} onDownload={downloadDoc} onDelete={deleteDoc} onReplace={(f) => uploadDocument(f, doc.id)} />)}
                      </div>
                    )}

                    {archivedDocs.length > 0 && (
                      <div className="pt-1">
                        <button
                          onClick={() => setShowAllVersions(s => !s)}
                          className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <History className="h-3 w-3" />
                          {showAllVersions ? 'Vorversionen ausblenden' : `${archivedDocs.length} Vorversion${archivedDocs.length !== 1 ? 'en' : ''} anzeigen`}
                        </button>
                        {showAllVersions && (
                          <div className="space-y-1 mt-2 opacity-70">
                            {archivedDocs.map(doc => <DocRow key={doc.id} doc={doc} canWrite={canWrite} onDownload={downloadDoc} onDelete={deleteDoc} archived />)}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {canWrite && (
                    <div className="flex items-center justify-between gap-2 border-t border-border pt-4">
                      <Button variant="ghost" size="sm" className="h-8 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10" onClick={() => deletePolicy(detailPolicy)}>
                        <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Police löschen
                      </Button>
                      <Button size="sm" onClick={() => openEdit(detailPolicy)} className="h-8 text-xs gap-1.5">
                        <Pencil className="h-3.5 w-3.5" /> Bearbeiten
                      </Button>
                    </div>
                  )}
                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>

      {/* Editor Dialog */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent
          className="max-w-2xl max-h-[90vh] overflow-y-auto"
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">
              {editingId ? 'Police bearbeiten' : 'Neue Police anlegen'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5 flex items-center justify-between gap-3">
              <div className="flex items-start gap-2 min-w-0">
                <Sparkles className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-foreground">Dokument analysieren (MTIQ)</p>
                  <p className="text-[10px] text-muted-foreground leading-tight">
                    PDF oder Bild hochladen – die Felder werden automatisch ausgefüllt.
                  </p>
                </div>
              </div>
              <label className={cn(
                'inline-flex items-center gap-1.5 h-7 px-2.5 rounded text-[11px] font-medium cursor-pointer transition-colors shrink-0',
                analyzing ? 'bg-muted text-muted-foreground cursor-wait' : 'bg-primary text-primary-foreground hover:bg-primary/90',
              )}>
                {analyzing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                {analyzing ? 'Analysiere…' : 'Datei wählen'}
                <input
                  type="file"
                  accept="application/pdf,image/*"
                  className="hidden"
                  disabled={analyzing}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleAnalyzeDocument(f);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>

            {pendingFile && !editingId && (
              <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-3 py-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-[11px] text-foreground truncate">{pendingFile.name}</span>
                  <span className="text-[10px] text-muted-foreground shrink-0">{fmtBytes(pendingFile.size)} · wird beim Speichern abgelegt</span>
                </div>
                <button type="button" onClick={() => setPendingFile(null)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}


            <div className="grid grid-cols-2 gap-3">
              <Field label="Bezeichnung *" className="col-span-2">
                <Input value={form.name || ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="h-8 text-xs" placeholder="z.B. Betriebshaftpflicht 2026" />
              </Field>
              <Field label="Kunde (CRM)" className="col-span-2">
                <CustomerCombobox
                  customers={customers}
                  value={form.customer_id || null}
                  onChange={(id) => setForm(f => ({ ...f, customer_id: id }))}
                />
              </Field>
              <Field label="Kategorie">
                <Select value={form.category_id || '_none'} onValueChange={v => setForm(f => ({ ...f, category_id: v === '_none' ? null : v }))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Kategorie" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Ohne Kategorie</SelectItem>
                    {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Status">
                <Select value={form.status || 'active'} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Aktiv</SelectItem>
                    <SelectItem value="cancelled">Gekündigt</SelectItem>
                    <SelectItem value="archived">Archiviert</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Versicherer">
                <Input value={form.provider || ''} onChange={e => setForm(f => ({ ...f, provider: e.target.value }))} className="h-8 text-xs" placeholder="z.B. Allianz" />
              </Field>
              <Field label="Policennummer">
                <Input value={form.policy_number || ''} onChange={e => setForm(f => ({ ...f, policy_number: e.target.value }))} className="h-8 text-xs font-mono" />
              </Field>
              <Field label="Versichertes Objekt" className="col-span-2">
                <Input value={form.insured_object || ''} onChange={e => setForm(f => ({ ...f, insured_object: e.target.value }))} className="h-8 text-xs" />
              </Field>

              <Field label="Laufzeit von">
                <Input type="date" value={form.start_date || ''} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} className="h-8 text-xs" />
              </Field>
              <Field label="Laufzeit bis">
                <Input type="date" value={form.end_date || ''} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} className="h-8 text-xs" />
              </Field>
              <Field label="Verlängerungsdatum">
                <Input type="date" value={form.renewal_date || ''} onChange={e => setForm(f => ({ ...f, renewal_date: e.target.value }))} className="h-8 text-xs" />
              </Field>
              <Field label="Kündigungsfrist (Tage)">
                <Input type="number" min={0} value={form.notice_period_days ?? ''} onChange={e => setForm(f => ({ ...f, notice_period_days: e.target.value ? Number(e.target.value) : null }))} className="h-8 text-xs" />
              </Field>

              <Field label="Prämie (Betrag)">
                <Input type="number" step="0.01" value={form.premium_amount ?? ''} onChange={e => setForm(f => ({ ...f, premium_amount: e.target.value === '' ? null : (Number(e.target.value) as any) }))} className="h-8 text-xs" />
              </Field>
              <Field label="Intervall">
                <Select value={form.premium_interval || 'yearly'} onValueChange={v => setForm(f => ({ ...f, premium_interval: v }))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">monatlich</SelectItem>
                    <SelectItem value="quarterly">quartalsweise</SelectItem>
                    <SelectItem value="yearly">jährlich</SelectItem>
                    <SelectItem value="one_time">einmalig</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Ansprechpartner Name">
                <Input value={form.contact_name || ''} onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))} className="h-8 text-xs" />
              </Field>
              <Field label="E-Mail">
                <Input type="email" value={form.contact_email || ''} onChange={e => setForm(f => ({ ...f, contact_email: e.target.value }))} className="h-8 text-xs" />
              </Field>
              <Field label="Telefon" className="col-span-2">
                <Input value={form.contact_phone || ''} onChange={e => setForm(f => ({ ...f, contact_phone: e.target.value }))} className="h-8 text-xs" />
              </Field>

              <Field label="Tags" className="col-span-2">
                <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5 min-h-[34px]">
                  {(form.tags || []).map((t, i) => (
                    <span key={i} className="inline-flex items-center gap-1 rounded bg-muted/40 px-1.5 py-0.5 text-[10px] text-foreground">
                      {t}
                      <button onClick={() => removeTag(i)} className="text-muted-foreground hover:text-foreground"><X className="h-2.5 w-2.5" /></button>
                    </span>
                  ))}
                  <input
                    value={tagInput}
                    onChange={e => setTagInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); } }}
                    onBlur={addTag}
                    placeholder="Tag eingeben + Enter"
                    className="flex-1 min-w-[120px] bg-transparent text-xs outline-none"
                  />
                </div>
              </Field>

              <Field label="Beschreibung" className="col-span-2">
                <Textarea rows={2} value={form.description || ''} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="text-xs resize-none" />
              </Field>
              <Field label="Interne Notizen" className="col-span-2">
                <Textarea rows={3} value={form.notes || ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="text-xs resize-none" />
              </Field>
            </div>
          </div>

          <DialogFooter className="mt-4">
            <Button variant="ghost" size="sm" onClick={() => setEditorOpen(false)} className="h-8 text-xs">Abbrechen</Button>
            <Button size="sm" onClick={save} disabled={saving} className="h-8 text-xs">
              {saving ? 'Speichern…' : editingId ? 'Speichern' : 'Anlegen'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Category Manager */}
      <CategoryManager
        open={catManagerOpen}
        onOpenChange={setCatManagerOpen}
        categories={categories}
        childrenByParent={childrenByParent}
        rootCategories={rootCategories}
        onChanged={load}
        canWrite={canWrite}
      />
    </AppLayout>
  );
}

// ---- Subcomponents ----

function CategoryRow({ active, onClick, icon: Icon, color, label, count }: {
  active: boolean; onClick: () => void; icon: any; color: string; label: string; count: number;
}) {
  const c = COLOR_MAP[color] || COLOR_MAP.slate;
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center justify-between gap-2 rounded-md px-2.5 py-2 text-xs transition-all group',
        active ? 'bg-muted/60 ring-1 ring-border' : 'hover:bg-muted/30',
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        <div className={cn('h-6 w-6 rounded ring-1 flex items-center justify-center shrink-0', c.bg, c.ring)}>
          <Icon className={cn('h-3 w-3', c.text)} />
        </div>
        <span className={cn('truncate', active ? 'text-foreground font-medium' : 'text-muted-foreground group-hover:text-foreground')}>{label}</span>
      </div>
      <span className="text-[10px] tabular-nums text-muted-foreground shrink-0">{count}</span>
    </button>
  );
}

function CustomerCombobox({ customers, value, onChange }: {
  customers: { id: string; name: string; customer_no: string | null }[];
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = value ? customers.find(c => c.id === value) : null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" className="h-8 w-full justify-between text-xs font-normal">
          <span className="truncate">
            {selected ? `${selected.name}${selected.customer_no ? ` (${selected.customer_no})` : ''}` : 'Kein Kunde zugeordnet'}
          </span>
          <ChevronRight className="h-3.5 w-3.5 opacity-50 rotate-90 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Kunde suchen…" className="h-8 text-xs" />
          <CommandList>
            <CommandEmpty className="py-4 text-center text-xs text-muted-foreground">Kein Treffer</CommandEmpty>
            <CommandGroup>
              <CommandItem value="__none__" onSelect={() => { onChange(null); setOpen(false); }} className="text-xs">
                Kein Kunde zugeordnet
              </CommandItem>
              {customers.map(c => (
                <CommandItem
                  key={c.id}
                  value={`${c.name} ${c.customer_no || ''}`}
                  onSelect={() => { onChange(c.id); setOpen(false); }}
                  className="text-xs"
                >
                  {c.name}{c.customer_no ? ` (${c.customer_no})` : ''}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function PolicyCard({ policy, category, onClick }: { policy: Policy; category: Category | null; onClick: () => void }) {
  const eff = getEffectiveStatus(policy);
  const meta = STATUS_META[eff];
  const StatusIcon = meta.icon;
  const c = COLOR_MAP[category?.color || 'slate'];
  const Icon = ICON_MAP[category?.icon || 'shield'] || Shield;
  const daysLeft = policy.end_date ? differenceInDays(parseISO(policy.end_date), new Date()) : null;

  return (
    <button
      onClick={onClick}
      className={cn(
        'group text-left rounded-lg border border-border bg-card p-4 transition-all hover:border-primary/40 hover:-translate-y-0.5',
        'hover:shadow-[0_8px_30px_-10px_hsl(var(--primary)/0.3)]',
      )}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className={cn('h-9 w-9 rounded-md ring-1 flex items-center justify-center shrink-0', c.bg, c.ring)}>
          <Icon className={cn('h-4 w-4', c.text)} />
        </div>
        <span className={cn('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] ring-1', meta.cls)}>
          <StatusIcon className="h-2.5 w-2.5" /> {meta.label}
        </span>
      </div>
      <div className="space-y-1">
        <div className="text-sm font-medium text-foreground line-clamp-2 leading-snug group-hover:text-primary transition-colors">
          {policy.name}
        </div>
        <div className="text-[11px] text-muted-foreground truncate">
          {policy.provider || '—'}
          {policy.policy_number && <span className="font-mono"> · {policy.policy_number}</span>}
        </div>
      </div>
      <div className="mt-3 pt-3 border-t border-border/60 flex items-center justify-between text-[11px]">
        <div className="flex items-center gap-1 text-muted-foreground">
          <CalendarClock className="h-3 w-3" />
          {policy.end_date ? (
            <span className={cn(eff === 'expiring_soon' && 'text-amber-400', eff === 'expired' && 'text-rose-400')}>
              bis {fmtDate(policy.end_date)}
              {eff === 'expiring_soon' && daysLeft != null && ` · ${daysLeft}T`}
            </span>
          ) : <span>unbefristet</span>}
        </div>
        <div className="text-foreground tabular-nums font-medium">
          {fmtMoney(policy.premium_amount, policy.premium_currency)}
        </div>
      </div>
    </button>
  );
}

function Fact({ label, value, full }: { label: string; value: any; full?: boolean }) {
  return (
    <div className={cn('space-y-0.5', full && 'col-span-2')}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-xs text-foreground">{value || '—'}</div>
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('space-y-1', className)}>
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function DocRow({ doc, canWrite, onDownload, onDelete, onReplace, archived }: {
  doc: PolicyDocument; canWrite: boolean;
  onDownload: (d: PolicyDocument) => void;
  onDelete: (d: PolicyDocument) => void;
  onReplace?: (f: File) => void;
  archived?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-card/50 px-3 py-2">
      <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-xs text-foreground truncate">{doc.file_name}</div>
        <div className="text-[10px] text-muted-foreground">
          v{doc.version} · {fmtBytes(doc.file_size)} · {fmtDate(doc.uploaded_at)}
          {archived && <> · ersetzt</>}
        </div>
      </div>
      <button onClick={() => onDownload(doc)} title="Herunterladen" className="text-muted-foreground hover:text-foreground p-1">
        <Download className="h-3.5 w-3.5" />
      </button>
      {canWrite && onReplace && !archived && (
        <label title="Neue Version hochladen" className="text-muted-foreground hover:text-foreground p-1 cursor-pointer">
          <Upload className="h-3.5 w-3.5" />
          <input type="file" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onReplace(f); e.currentTarget.value = ''; }} />
        </label>
      )}
      {canWrite && (
        <button onClick={() => onDelete(doc)} title="Löschen" className="text-muted-foreground hover:text-rose-400 p-1">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

// ---- Category tree (sidebar) ----
function CategoryTree({
  cat, depth, selectedCat, setSelectedCat, expanded, toggleExpand, childrenByParent, counts,
}: {
  cat: Category;
  depth: number;
  selectedCat: string;
  setSelectedCat: (id: string) => void;
  expanded: Record<string, boolean>;
  toggleExpand: (id: string) => void;
  childrenByParent: Record<string, Category[]>;
  counts: Record<string, number>;
}) {
  const kids = childrenByParent[cat.id] || [];
  const hasKids = kids.length > 0;
  const isOpen = expanded[cat.id] ?? depth === 0;
  const c = COLOR_MAP[cat.color] || COLOR_MAP.slate;
  const Icon = ICON_MAP[cat.icon] || Folder;
  const isActive = selectedCat === cat.id;
  return (
    <div>
      <div
        className={cn(
          'w-full flex items-center gap-1 rounded-md pr-2 text-xs transition-all group',
          isActive ? 'bg-muted/60 ring-1 ring-border' : 'hover:bg-muted/30',
        )}
        style={{ paddingLeft: `${depth * 12}px` }}
      >
        <button
          onClick={() => hasKids ? toggleExpand(cat.id) : setSelectedCat(cat.id)}
          className="p-1 text-muted-foreground hover:text-foreground"
          aria-label={hasKids ? 'aufklappen' : ''}
        >
          {hasKids ? (
            <ChevronRight className={cn('h-3 w-3 transition-transform', isOpen && 'rotate-90')} />
          ) : (
            <span className="inline-block h-3 w-3" />
          )}
        </button>
        <button
          onClick={() => setSelectedCat(cat.id)}
          className="flex-1 flex items-center justify-between gap-2 min-w-0 py-1.5"
        >
          <div className="flex items-center gap-2 min-w-0">
            <div className={cn('h-5 w-5 rounded ring-1 flex items-center justify-center shrink-0', c.bg, c.ring)}>
              <Icon className={cn('h-3 w-3', c.text)} />
            </div>
            <span className={cn('truncate', isActive ? 'text-foreground font-medium' : 'text-muted-foreground group-hover:text-foreground')}>
              {cat.name}
            </span>
          </div>
          <span className="text-[10px] tabular-nums text-muted-foreground shrink-0">{counts[cat.id] || 0}</span>
        </button>
      </div>
      {hasKids && isOpen && (
        <div className="mt-0.5 space-y-0.5">
          {kids.map(k => (
            <CategoryTree
              key={k.id}
              cat={k}
              depth={depth + 1}
              selectedCat={selectedCat}
              setSelectedCat={setSelectedCat}
              expanded={expanded}
              toggleExpand={toggleExpand}
              childrenByParent={childrenByParent}
              counts={counts}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Category manager dialog ----
function CategoryManager({
  open, onOpenChange, categories, childrenByParent, rootCategories, onChanged, canWrite,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  categories: Category[];
  childrenByParent: Record<string, Category[]>;
  rootCategories: Category[];
  onChanged: () => Promise<void> | void;
  canWrite: boolean;
}) {
  const [editing, setEditing] = useState<Partial<Category> & { id?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [permsForCategory, setPermsForCategory] = useState<Category | null>(null);

  const startNew = (parent_id: string | null = null) => {
    setEditing({ name: '', description: '', color: 'slate', icon: 'folder', sort_order: 100, parent_id });
  };
  const startEdit = (c: Category) => setEditing({ ...c });

  const save = async () => {
    if (!editing) return;
    if (!editing.name?.trim()) { toast.error('Name ist Pflicht'); return; }
    setBusy(true);
    const payload: any = {
      name: editing.name.trim(),
      description: editing.description || null,
      color: editing.color || 'slate',
      icon: editing.icon || 'folder',
      sort_order: editing.sort_order ?? 100,
      parent_id: editing.parent_id || null,
    };
    let error;
    if (editing.id) {
      ({ error } = await supabase.from('ghv_categories' as any).update(payload).eq('id', editing.id));
    } else {
      ({ error } = await supabase.from('ghv_categories' as any).insert(payload));
    }
    setBusy(false);
    if (error) { toast.error('Fehler: ' + error.message); return; }
    toast.success(editing.id ? 'Kategorie aktualisiert' : 'Kategorie angelegt');
    setEditing(null);
    await onChanged();
  };

  const remove = async (c: Category) => {
    const kids = childrenByParent[c.id] || [];
    const msg = kids.length
      ? `Kategorie "${c.name}" und ${kids.length} Unterkategorie(n) freisetzen? Einträge bleiben erhalten, werden aber ohne Kategorie geführt.`
      : `Kategorie "${c.name}" löschen? Zugeordnete Einträge bleiben erhalten (ohne Kategorie).`;
    if (!confirm(msg)) return;
    const { error } = await supabase.from('ghv_categories' as any).delete().eq('id', c.id);
    if (error) { toast.error('Fehler: ' + error.message); return; }
    toast.success('Kategorie gelöscht');
    await onChanged();
  };

  const renderRow = (c: Category, depth: number) => {
    const kids = childrenByParent[c.id] || [];
    const Icon = ICON_MAP[c.icon] || Folder;
    const cm = COLOR_MAP[c.color] || COLOR_MAP.slate;
    return (
      <div key={c.id}>
        <div
          className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/40 group"
          style={{ paddingLeft: `${8 + depth * 16}px` }}
        >
          <div className={cn('h-6 w-6 rounded ring-1 flex items-center justify-center shrink-0', cm.bg, cm.ring)}>
            <Icon className={cn('h-3 w-3', cm.text)} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs text-foreground truncate">{c.name}</div>
            {c.description && <div className="text-[10px] text-muted-foreground truncate">{c.description}</div>}
          </div>
          {canWrite && (
            <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
              <button onClick={() => setPermsForCategory(c)} title="Rechte verwalten" className="p-1 text-muted-foreground hover:text-foreground">
                <KeyRound className="h-3 w-3" />
              </button>
              <button onClick={() => startNew(c.id)} title="Unterkategorie anlegen" className="p-1 text-muted-foreground hover:text-foreground">
                <Plus className="h-3 w-3" />
              </button>
              <button onClick={() => startEdit(c)} title="Bearbeiten" className="p-1 text-muted-foreground hover:text-foreground">
                <Pencil className="h-3 w-3" />
              </button>
              <button onClick={() => remove(c)} title="Löschen" className="p-1 text-muted-foreground hover:text-rose-400">
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>
        {kids.map(k => renderRow(k, depth + 1))}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-sm">Kategorien verwalten</DialogTitle>
        </DialogHeader>

        {editing ? (
          <div className="space-y-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {editing.id ? 'Kategorie bearbeiten' : 'Neue Kategorie'}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Name</Label>
                <Input value={editing.name || ''} onChange={e => setEditing(s => ({ ...s!, name: e.target.value }))} className="h-8 text-xs" />
              </div>
              <div className="col-span-2">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Beschreibung</Label>
                <Input value={editing.description || ''} onChange={e => setEditing(s => ({ ...s!, description: e.target.value }))} className="h-8 text-xs" />
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Oberkategorie</Label>
                <Select
                  value={editing.parent_id || '__none__'}
                  onValueChange={v => setEditing(s => ({ ...s!, parent_id: v === '__none__' ? null : v }))}
                >
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Keine (Hauptkategorie) —</SelectItem>
                    {categories
                      .filter(c => c.id !== editing.id) // prevent self
                      .map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Sortierung</Label>
                <Input
                  type="number"
                  value={editing.sort_order ?? 100}
                  onChange={e => setEditing(s => ({ ...s!, sort_order: Number(e.target.value) }))}
                  className="h-8 text-xs"
                />
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Farbe</Label>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {COLOR_CHOICES.map(col => {
                    const cm = COLOR_MAP[col];
                    return (
                      <button
                        key={col}
                        onClick={() => setEditing(s => ({ ...s!, color: col }))}
                        className={cn('h-6 w-6 rounded ring-1', cm.bg, cm.ring, editing.color === col && 'ring-2 ring-primary')}
                        title={col}
                      />
                    );
                  })}
                </div>
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Icon</Label>
                <div className="flex flex-wrap gap-1 mt-1">
                  {ICON_CHOICES.map(ic => {
                    const I = ICON_MAP[ic];
                    return (
                      <button
                        key={ic}
                        onClick={() => setEditing(s => ({ ...s!, icon: ic }))}
                        className={cn(
                          'h-7 w-7 rounded border border-border flex items-center justify-center hover:bg-muted/40',
                          editing.icon === ic && 'ring-2 ring-primary',
                        )}
                        title={ic}
                      >
                        <I className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" size="sm" onClick={() => setEditing(null)} className="h-8 text-xs">Abbrechen</Button>
              <Button size="sm" onClick={save} disabled={busy} className="h-8 text-xs">{busy ? 'Speichern…' : 'Speichern'}</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[11px] text-muted-foreground">
                Kategorien können beliebig verschachtelt, umbenannt und gelöscht werden. Einträge bleiben bei Löschung erhalten.
              </p>
              {canWrite && (
                <Button size="sm" onClick={() => startNew(null)} className="h-8 text-xs gap-1.5">
                  <Plus className="h-3.5 w-3.5" /> Neue Hauptkategorie
                </Button>
              )}
            </div>
            <div className="rounded-md border border-border bg-card/40 max-h-[55vh] overflow-y-auto p-1">
              {rootCategories.length === 0 ? (
                <div className="text-center text-xs text-muted-foreground py-8">Noch keine Kategorien.</div>
              ) : (
                rootCategories.map(c => renderRow(c, 0))
              )}
            </div>
          </div>
        )}
      </DialogContent>
      {permsForCategory && (
        <CategoryPermissionsDialog
          category={permsForCategory}
          onClose={() => setPermsForCategory(null)}
        />
      )}
    </Dialog>
  );
}

// ---- Category permissions dialog ----
interface DocCategoryPermission {
  id: string;
  category_id: string;
  principal_type: 'user' | 'department';
  user_id: string | null;
  department_id: string | null;
  permission: 'read' | 'write';
}

function CategoryPermissionsDialog({ category, onClose }: { category: Category; onClose: () => void }) {
  const [perms, setPerms] = useState<DocCategoryPermission[]>([]);
  const [users, setUsers] = useState<{ id: string; display_name: string | null; short_code: string | null }[]>([]);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // new entry form
  const [newType, setNewType] = useState<'user' | 'department'>('user');
  const [newPrincipal, setNewPrincipal] = useState<string>('');
  const [newPermission, setNewPermission] = useState<'read' | 'write'>('read');

  const load = async () => {
    setLoading(true);
    const [p, u, d] = await Promise.all([
      supabase.from('document_category_permissions' as any).select('*').eq('category_id', category.id),
      supabase.from('users_profile').select('id, display_name, short_code').order('display_name'),
      supabase.from('departments').select('id, name').order('name'),
    ]);
    if (p.data) setPerms(p.data as any);
    if (u.data) setUsers(u.data as any);
    if (d.data) setDepartments(d.data as any);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [category.id]);

  const userLabel = (id: string) => {
    const u = users.find(x => x.id === id);
    return u?.display_name || u?.short_code || id.slice(0, 8);
  };
  const deptLabel = (id: string) => departments.find(d => d.id === id)?.name || id.slice(0, 8);

  const add = async () => {
    if (!newPrincipal) { toast.error('Bitte Nutzer oder Abteilung wählen'); return; }
    setBusy(true);
    const payload: any = {
      category_id: category.id,
      principal_type: newType,
      user_id: newType === 'user' ? newPrincipal : null,
      department_id: newType === 'department' ? newPrincipal : null,
      permission: newPermission,
    };
    // Upsert-like: delete existing for same principal first to allow permission change
    if (newType === 'user') {
      await supabase.from('document_category_permissions' as any)
        .delete().eq('category_id', category.id).eq('principal_type', 'user').eq('user_id', newPrincipal);
    } else {
      await supabase.from('document_category_permissions' as any)
        .delete().eq('category_id', category.id).eq('principal_type', 'department').eq('department_id', newPrincipal);
    }
    const { error } = await supabase.from('document_category_permissions' as any).insert(payload);
    setBusy(false);
    if (error) { toast.error('Fehler: ' + error.message); return; }
    toast.success('Berechtigung gespeichert');
    setNewPrincipal('');
    setNewPermission('read');
    await load();
  };

  const updatePerm = async (id: string, permission: 'read' | 'write') => {
    const { error } = await supabase.from('document_category_permissions' as any)
      .update({ permission }).eq('id', id);
    if (error) { toast.error('Fehler: ' + error.message); return; }
    await load();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from('document_category_permissions' as any).delete().eq('id', id);
    if (error) { toast.error('Fehler: ' + error.message); return; }
    await load();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-sm">Rechte · {category.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Admins haben immer vollen Zugriff. Manager können standardmäßig lesen.
            Hier zusätzlich freischalten: Nutzer oder Abteilung mit Lese- oder Schreibrecht.
          </p>

          <div className="rounded-md border border-border bg-card/40 divide-y divide-border">
            {loading ? (
              <div className="text-center text-xs text-muted-foreground py-6">Lädt…</div>
            ) : perms.length === 0 ? (
              <div className="text-center text-xs text-muted-foreground py-6">
                Keine zusätzlichen Berechtigungen — nur Admin (+ Manager lesend).
              </div>
            ) : (
              perms.map(p => (
                <div key={p.id} className="flex items-center gap-2 px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-foreground truncate">
                      {p.principal_type === 'user'
                        ? userLabel(p.user_id!)
                        : deptLabel(p.department_id!)}
                    </div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {p.principal_type === 'user' ? 'Nutzer' : 'Abteilung'}
                    </div>
                  </div>
                  <Select value={p.permission} onValueChange={(v: any) => updatePerm(p.id, v)}>
                    <SelectTrigger className="h-7 text-[11px] w-24"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="read">Lesen</SelectItem>
                      <SelectItem value="write">Schreiben</SelectItem>
                    </SelectContent>
                  </Select>
                  <button onClick={() => remove(p.id)} className="p-1 text-muted-foreground hover:text-rose-400" title="Entfernen">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="space-y-2 rounded-md border border-border bg-card/40 p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Neuen Eintrag hinzufügen</div>
            <div className="grid grid-cols-12 gap-2">
              <Select value={newType} onValueChange={(v: any) => { setNewType(v); setNewPrincipal(''); }}>
                <SelectTrigger className="h-8 text-xs col-span-3"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">Nutzer</SelectItem>
                  <SelectItem value="department">Abteilung</SelectItem>
                </SelectContent>
              </Select>
              <Select value={newPrincipal} onValueChange={setNewPrincipal}>
                <SelectTrigger className="h-8 text-xs col-span-5">
                  <SelectValue placeholder={newType === 'user' ? 'Nutzer wählen…' : 'Abteilung wählen…'} />
                </SelectTrigger>
                <SelectContent>
                  {newType === 'user'
                    ? users.map(u => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.display_name || u.short_code || u.id.slice(0, 8)}
                        </SelectItem>
                      ))
                    : departments.map(d => (
                        <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                      ))}
                </SelectContent>
              </Select>
              <Select value={newPermission} onValueChange={(v: any) => setNewPermission(v)}>
                <SelectTrigger className="h-8 text-xs col-span-2"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="read">Lesen</SelectItem>
                  <SelectItem value="write">Schreiben</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" onClick={add} disabled={busy || !newPrincipal} className="h-8 text-xs col-span-2">
                Hinzufügen
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-8 text-xs">Schließen</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
