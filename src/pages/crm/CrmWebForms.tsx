import { useEffect, useState } from 'react';
import { CrmLayout } from '@/components/crm/CrmLayout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Copy, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const FN_BASE = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/web-lead-intake`;

export default function CrmWebForms() {
  const [rows, setRows] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ slug: '', name: '', description: '', is_active: true, default_source: 'website', redirect_url: '', allowed_origins: '' });

  const load = async () => {
    const { data } = await supabase.from('crm_web_form_endpoints').select('*').order('created_at', { ascending: false });
    setRows(data ?? []);
  };
  useEffect(() => { void load(); }, []);

  const save = async () => {
    if (!form.slug || !form.name) { toast.error('Slug & Name erforderlich'); return; }
    setSaving(true);
    const { error } = await supabase.from('crm_web_form_endpoints').insert({
      slug: form.slug, name: form.name, description: form.description,
      is_active: form.is_active, default_source: form.default_source,
      redirect_url: form.redirect_url || null,
      allowed_origins: form.allowed_origins.split(',').map(s => s.trim()).filter(Boolean),
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Endpoint angelegt'); setOpen(false);
    setForm({ slug: '', name: '', description: '', is_active: true, default_source: 'website', redirect_url: '', allowed_origins: '' });
    void load();
  };

  const remove = async (id: string) => {
    if (!confirm('Endpoint löschen?')) return;
    await supabase.from('crm_web_form_endpoints').delete().eq('id', id);
    void load();
  };

  const copyUrl = (slug: string) => {
    navigator.clipboard.writeText(`${FN_BASE}/${slug}`);
    toast.success('URL kopiert');
  };

  const snippet = (slug: string) => `<form method="POST" action="${FN_BASE}/${slug}">
  <input name="company_name" placeholder="Firma" required />
  <input name="contact_name" placeholder="Name" required />
  <input name="email" type="email" placeholder="E-Mail" required />
  <input name="phone" placeholder="Telefon" />
  <textarea name="message" placeholder="Ihre Nachricht"></textarea>
  <input name="website_url" type="text" style="display:none" tabindex="-1" autocomplete="off" />
  <label><input type="checkbox" name="email_opt_in" value="1" /> Newsletter erhalten</label>
  <button type="submit">Senden</button>
</form>`;

  return (
    <CrmLayout>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-lg font-semibold">Webformulare</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Endpunkte für Lead-Capture von externen Websites</p>
        </div>
        <Button size="sm" className="h-8 text-xs" onClick={() => setOpen(true)}><Plus className="h-3.5 w-3.5 mr-1" />Neuer Endpoint</Button>
      </div>

      <div className="space-y-3">
        {rows.length === 0 && <div className="text-center text-xs text-muted-foreground py-10 border border-dashed border-border rounded-lg">Noch keine Endpoints angelegt</div>}
        {rows.map(r => (
          <div key={r.id} className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-start justify-between mb-2">
              <div>
                <div className="flex items-center gap-2"><h3 className="text-sm font-medium">{r.name}</h3>{!r.is_active && <span className="text-[10px] px-1.5 py-0.5 bg-muted rounded">inaktiv</span>}</div>
                <div className="text-[10px] text-muted-foreground font-mono mt-0.5">{r.slug}</div>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => copyUrl(r.slug)}><Copy className="h-3.5 w-3.5" /></Button>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => remove(r.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            </div>
            {r.description && <p className="text-xs text-muted-foreground mb-2">{r.description}</p>}
            <details className="text-[11px]">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">HTML-Snippet anzeigen</summary>
              <pre className="mt-2 p-3 bg-muted rounded text-[10px] overflow-x-auto">{snippet(r.slug)}</pre>
            </details>
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Neuer Webformular-Endpoint</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className="text-[11px]">Slug *</Label><Input value={form.slug} onChange={e => setForm({ ...form, slug: e.target.value.replace(/[^a-z0-9-]/g, '') })} placeholder="kontakt" className="h-8 text-xs" /></div>
              <div className="space-y-1.5"><Label className="text-[11px]">Name *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="h-8 text-xs" /></div>
            </div>
            <div className="space-y-1.5"><Label className="text-[11px]">Beschreibung</Label><Textarea rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className="text-[11px]">Lead-Quelle</Label><Input value={form.default_source} onChange={e => setForm({ ...form, default_source: e.target.value })} className="h-8 text-xs" /></div>
              <div className="space-y-1.5"><Label className="text-[11px]">Redirect-URL</Label><Input value={form.redirect_url} onChange={e => setForm({ ...form, redirect_url: e.target.value })} className="h-8 text-xs" placeholder="https://…/danke" /></div>
            </div>
            <div className="space-y-1.5"><Label className="text-[11px]">Erlaubte Origins (komma-getrennt, optional)</Label><Input value={form.allowed_origins} onChange={e => setForm({ ...form, allowed_origins: e.target.value })} className="h-8 text-xs" placeholder="https://mtcon.de, https://www.mtcon.de" /></div>
            <label className="flex items-center gap-2 text-xs"><Switch checked={form.is_active} onCheckedChange={v => setForm({ ...form, is_active: v })} />Aktiv</label>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Abbrechen</Button>
            <Button size="sm" onClick={save} disabled={saving}>{saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Speichern'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </CrmLayout>
  );
}
