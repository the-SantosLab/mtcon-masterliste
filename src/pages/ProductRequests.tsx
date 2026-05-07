import { useEffect, useState, useCallback } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, CheckCircle2, XCircle, Clock, Pencil } from 'lucide-react';
import { z } from 'zod';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

const CATEGORIES = ['Steckverbinder', 'Gehäuse', 'Kontakt', 'Sonstiges'] as const;
type Category = (typeof CATEGORIES)[number];

const requestSchema = z.object({
  product_name: z.string().trim().min(1, 'Produktname erforderlich').max(120),
  article_number: z.string().trim().max(60).optional().or(z.literal('')),
  category: z.enum(CATEGORIES),
  description: z.string().trim().max(2000).optional().or(z.literal('')),
  request_reason: z.string().trim().min(1, 'Grund erforderlich').max(2000),
});

type Status = 'ausstehend' | 'genehmigt' | 'abgelehnt';

interface ProductRequest {
  id: string;
  product_name: string;
  article_number: string | null;
  category: string;
  description: string | null;
  request_reason: string;
  requested_by: string;
  status: Status;
  rejection_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  approved_product_id: string | null;
  created_at: string;
  updated_at: string;
}

const STATUS_LABEL: Record<Status, string> = {
  ausstehend: 'Ausstehend',
  genehmigt: 'Genehmigt',
  abgelehnt: 'Abgelehnt',
};

function StatusBadge({ status }: { status: Status }) {
  const Icon = status === 'genehmigt' ? CheckCircle2 : status === 'abgelehnt' ? XCircle : Clock;
  const cls =
    status === 'genehmigt'
      ? 'bg-[hsl(var(--status-done))]/15 text-[hsl(var(--status-done))] border-[hsl(var(--status-done))]/30'
      : status === 'abgelehnt'
      ? 'bg-destructive/15 text-destructive border-destructive/30'
      : 'bg-[hsl(var(--status-planning))]/15 text-[hsl(var(--status-planning))] border-[hsl(var(--status-planning))]/30';
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border', cls)}>
      <Icon className="h-3 w-3" />
      {STATUS_LABEL[status]}
    </span>
  );
}

export default function ProductRequests() {
  const { user, isAdmin, isViewer } = useAuth();
  const [requests, setRequests] = useState<ProductRequest[]>([]);
  const [profiles, setProfiles] = useState<Record<string, { display_name: string; short_code: string }>>({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'mine' | 'all' | Status>(isAdmin ? 'ausstehend' : 'mine');
  const [createOpen, setCreateOpen] = useState(false);
  const [reviewing, setReviewing] = useState<ProductRequest | null>(null);

  const fetchRequests = useCallback(async () => {
    const { data, error } = await supabase
      .from('product_requests' as any)
      .select('*')
      .order('created_at', { ascending: false });
    if (error) { console.error(error); setLoading(false); return; }
    const list = (data || []) as ProductRequest[];
    setRequests(list);
    const ids = Array.from(new Set([
      ...list.map(r => r.requested_by),
      ...list.map(r => r.reviewed_by).filter(Boolean) as string[],
    ]));
    if (ids.length) {
      const { data: profs } = await supabase.from('users_profile').select('id, display_name, short_code').in('id', ids);
      const map: Record<string, { display_name: string; short_code: string }> = {};
      (profs || []).forEach((p: any) => { map[p.id] = { display_name: p.display_name, short_code: p.short_code }; });
      setProfiles(map);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchRequests();
    const ch = supabase
      .channel('product-requests')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'product_requests' }, () => fetchRequests())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fetchRequests]);

  const filtered = requests.filter(r => {
    if (tab === 'mine') return r.requested_by === user?.id;
    if (tab === 'all') return true;
    return r.status === tab;
  });

  return (
    <AppLayout>
      <div className="space-y-4 max-w-5xl">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-lg font-semibold text-foreground">Produktvorschläge</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isAdmin ? 'Anfragen prüfen und in die Stammdaten übernehmen' : 'Neue Produkte zur Aufnahme in die Stammdaten vorschlagen'}
            </p>
          </div>
          {!isViewer && (
            <Button size="sm" onClick={() => setCreateOpen(true)} className="h-8 text-xs gap-1.5">
              <Plus className="h-3.5 w-3.5" />Produkt vorschlagen
            </Button>
          )}
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList className="bg-secondary">
            {isAdmin && <TabsTrigger value="ausstehend" className="text-xs">Ausstehend</TabsTrigger>}
            {isAdmin && <TabsTrigger value="genehmigt" className="text-xs">Genehmigt</TabsTrigger>}
            {isAdmin && <TabsTrigger value="abgelehnt" className="text-xs">Abgelehnt</TabsTrigger>}
            {isAdmin && <TabsTrigger value="all" className="text-xs">Alle</TabsTrigger>}
            <TabsTrigger value="mine" className="text-xs">Meine Anfragen</TabsTrigger>
          </TabsList>

          <TabsContent value={tab} className="mt-3">
            <RequestList
              loading={loading}
              requests={filtered}
              profiles={profiles}
              isAdmin={isAdmin}
              onReview={setReviewing}
            />
          </TabsContent>
        </Tabs>
      </div>

      <CreateRequestDialog open={createOpen} onOpenChange={setCreateOpen} userId={user?.id} onCreated={fetchRequests} />

      {reviewing && (
        <ReviewDialog
          request={reviewing}
          isAdmin={isAdmin}
          currentUserId={user?.id}
          onClose={() => setReviewing(null)}
          onChanged={fetchRequests}
        />
      )}
    </AppLayout>
  );
}

function RequestList({
  loading, requests, profiles, isAdmin, onReview,
}: {
  loading: boolean;
  requests: ProductRequest[];
  profiles: Record<string, { display_name: string; short_code: string }>;
  isAdmin: boolean;
  onReview: (r: ProductRequest) => void;
}) {
  if (loading) return <p className="text-xs text-muted-foreground py-6 text-center">Laden …</p>;
  if (requests.length === 0) return <p className="text-xs text-muted-foreground py-6 text-center">Keine Anfragen</p>;
  return (
    <div className="rounded-md border border-border bg-card overflow-hidden">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border">
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Produkt</th>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Kategorie</th>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Anfragender</th>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Datum</th>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
            <th className="px-3 py-2 w-20" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {requests.map(r => (
            <tr key={r.id} className="hover:bg-muted/40 transition-colors cursor-pointer" onClick={() => onReview(r)}>
              <td className="px-3 py-2.5">
                <div className="font-medium text-foreground">{r.product_name}</div>
                {r.article_number && <div className="text-[10px] font-mono text-muted-foreground">{r.article_number}</div>}
              </td>
              <td className="px-3 py-2.5 text-muted-foreground">{r.category}</td>
              <td className="px-3 py-2.5 text-muted-foreground">{profiles[r.requested_by]?.short_code || '–'}</td>
              <td className="px-3 py-2.5 text-muted-foreground">{format(new Date(r.created_at), 'dd.MM.yyyy')}</td>
              <td className="px-3 py-2.5"><StatusBadge status={r.status} /></td>
              <td className="px-3 py-2.5 text-right">
                <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={(e) => { e.stopPropagation(); onReview(r); }}>
                  {isAdmin && r.status === 'ausstehend' ? 'Prüfen' : 'Details'}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CreateRequestDialog({
  open, onOpenChange, userId, onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  userId?: string;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    product_name: '', article_number: '', category: 'Steckverbinder' as Category, description: '', request_reason: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const reset = () => setForm({ product_name: '', article_number: '', category: 'Steckverbinder', description: '', request_reason: '' });

  const submit = async () => {
    if (!userId) return;
    const parsed = requestSchema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setSubmitting(true);
    const payload = {
      ...parsed.data,
      article_number: parsed.data.article_number || null,
      description: parsed.data.description || null,
      requested_by: userId,
    };
    const { error } = await supabase.from('product_requests' as any).insert(payload);
    setSubmitting(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Vorschlag eingereicht');
    reset();
    onOpenChange(false);
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Produkt vorschlagen</DialogTitle>
          <DialogDescription className="text-xs">
            Dein Vorschlag wird von einem Admin geprüft, bevor er in die Stammdaten aufgenommen wird.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Produktname *</Label>
            <Input value={form.product_name} onChange={e => setForm(f => ({ ...f, product_name: e.target.value }))} className="h-8 text-xs" maxLength={120} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Artikelnummer</Label>
              <Input value={form.article_number} onChange={e => setForm(f => ({ ...f, article_number: e.target.value }))} className="h-8 text-xs" maxLength={60} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Kategorie *</Label>
              <Select value={form.category} onValueChange={(v) => setForm(f => ({ ...f, category: v as Category }))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Beschreibung</Label>
            <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} className="text-xs resize-none" maxLength={2000} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Grund der Anfrage *</Label>
            <Textarea value={form.request_reason} onChange={e => setForm(f => ({ ...f, request_reason: e.target.value }))} rows={3} className="text-xs resize-none" maxLength={2000} placeholder="Warum soll dieses Produkt aufgenommen werden?" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} className="h-8 text-xs">Abbrechen</Button>
          <Button size="sm" onClick={submit} disabled={submitting} className="h-8 text-xs">
            {submitting ? 'Speichern …' : 'Vorschlag einreichen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReviewDialog({
  request, isAdmin, currentUserId, onClose, onChanged,
}: {
  request: ProductRequest;
  isAdmin: boolean;
  currentUserId?: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const isPending = request.status === 'ausstehend';
  const canEdit = isAdmin || (isPending && request.requested_by === currentUserId);
  const [form, setForm] = useState({
    product_name: request.product_name,
    article_number: request.article_number || '',
    category: request.category as Category,
    description: request.description || '',
    request_reason: request.request_reason,
  });
  const [rejectReason, setRejectReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);

  const saveEdits = async (silent = false) => {
    const parsed = requestSchema.safeParse(form);
    if (!parsed.success) { toast.error(parsed.error.issues[0].message); return false; }
    const { error } = await supabase.from('product_requests' as any).update({
      ...parsed.data,
      article_number: parsed.data.article_number || null,
      description: parsed.data.description || null,
    }).eq('id', request.id);
    if (error) { toast.error(error.message); return false; }
    if (!silent) toast.success('Änderungen gespeichert');
    onChanged();
    return true;
  };

  const approve = async () => {
    if (!currentUserId) return;
    setBusy(true);
    if (editing) {
      const ok = await saveEdits(true);
      if (!ok) { setBusy(false); return; }
    }
    // Generate code from article number or product name
    const baseCode = (form.article_number || form.product_name).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20) || 'PROD';
    let code = baseCode;
    let suffix = 1;
    // Ensure unique code
    while (true) {
      const { data: existing } = await supabase.from('products').select('id').eq('code', code).maybeSingle();
      if (!existing) break;
      suffix += 1;
      code = `${baseCode}-${suffix}`;
      if (suffix > 50) break;
    }
    const { data: prod, error: prodErr } = await supabase.from('products').insert({ code, name: form.product_name }).select().single();
    if (prodErr) { setBusy(false); toast.error('Produkt konnte nicht angelegt werden: ' + prodErr.message); return; }
    const { error } = await supabase.from('product_requests' as any).update({
      status: 'genehmigt',
      reviewed_by: currentUserId,
      reviewed_at: new Date().toISOString(),
      approved_product_id: prod.id,
      rejection_reason: null,
    }).eq('id', request.id);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Genehmigt – Produkt "${prod.name}" angelegt`);
    onChanged();
    onClose();
  };

  const reject = async () => {
    if (!currentUserId) return;
    if (!rejectReason.trim()) { toast.error('Bitte Ablehnungsgrund angeben'); return; }
    setBusy(true);
    const { error } = await supabase.from('product_requests' as any).update({
      status: 'abgelehnt',
      reviewed_by: currentUserId,
      reviewed_at: new Date().toISOString(),
      rejection_reason: rejectReason.trim().slice(0, 1000),
    }).eq('id', request.id);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Anfrage abgelehnt');
    onChanged();
    onClose();
  };

  return (
    <Dialog open={true} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Produktanfrage <StatusBadge status={request.status} />
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {editing ? (
            <>
              <div className="space-y-1">
                <Label className="text-xs">Produktname</Label>
                <Input value={form.product_name} onChange={e => setForm(f => ({ ...f, product_name: e.target.value }))} className="h-8 text-xs" maxLength={120} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Artikelnummer</Label>
                  <Input value={form.article_number} onChange={e => setForm(f => ({ ...f, article_number: e.target.value }))} className="h-8 text-xs" maxLength={60} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Kategorie</Label>
                  <Select value={form.category} onValueChange={(v) => setForm(f => ({ ...f, category: v as Category }))}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map(c => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Beschreibung</Label>
                <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} className="text-xs resize-none" maxLength={2000} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Grund</Label>
                <Textarea value={form.request_reason} onChange={e => setForm(f => ({ ...f, request_reason: e.target.value }))} rows={2} className="text-xs resize-none" maxLength={2000} />
              </div>
            </>
          ) : (
            <div className="grid grid-cols-2 gap-3 text-xs">
              <Field label="Produktname" value={request.product_name} />
              <Field label="Artikelnummer" value={request.article_number || '–'} />
              <Field label="Kategorie" value={request.category} />
              <Field label="Eingereicht am" value={format(new Date(request.created_at), 'dd.MM.yyyy HH:mm')} />
              <div className="col-span-2">
                <Label className="text-xs text-muted-foreground">Beschreibung</Label>
                <p className="text-foreground whitespace-pre-wrap mt-0.5">{request.description || '–'}</p>
              </div>
              <div className="col-span-2">
                <Label className="text-xs text-muted-foreground">Grund</Label>
                <p className="text-foreground whitespace-pre-wrap mt-0.5">{request.request_reason}</p>
              </div>
              {request.rejection_reason && (
                <div className="col-span-2 rounded-md border border-destructive/30 bg-destructive/5 p-2.5">
                  <Label className="text-xs text-destructive">Ablehnungsgrund</Label>
                  <p className="text-foreground whitespace-pre-wrap mt-0.5">{request.rejection_reason}</p>
                </div>
              )}
            </div>
          )}

          {isAdmin && isPending && !editing && (
            <div className="space-y-1 pt-2 border-t border-border">
              <Label className="text-xs">Ablehnungsgrund (optional, nur bei Ablehnung)</Label>
              <Textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} rows={2} className="text-xs resize-none" maxLength={1000} />
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 flex-wrap">
          {canEdit && !editing && (
            <Button variant="outline" size="sm" onClick={() => setEditing(true)} className="h-8 text-xs gap-1">
              <Pencil className="h-3.5 w-3.5" />Bearbeiten
            </Button>
          )}
          {editing && (
            <>
              <Button variant="outline" size="sm" onClick={() => setEditing(false)} className="h-8 text-xs">Abbrechen</Button>
              <Button size="sm" onClick={async () => { const ok = await saveEdits(); if (ok) setEditing(false); }} className="h-8 text-xs">Speichern</Button>
            </>
          )}
          {isAdmin && isPending && !editing && (
            <>
              <Button variant="destructive" size="sm" onClick={reject} disabled={busy} className="h-8 text-xs gap-1">
                <XCircle className="h-3.5 w-3.5" />Ablehnen
              </Button>
              <Button size="sm" onClick={approve} disabled={busy} className="h-8 text-xs gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" />Genehmigen & anlegen
              </Button>
            </>
          )}
          {!editing && (!isAdmin || !isPending) && (
            <Button variant="outline" size="sm" onClick={onClose} className="h-8 text-xs">Schließen</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <p className="text-foreground mt-0.5">{value}</p>
    </div>
  );
}
