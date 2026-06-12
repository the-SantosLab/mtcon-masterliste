import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Loader2, Plus, Search, Building2, Download } from "lucide-react";
import { toast } from "sonner";

type Partner = {
  id: string;
  name: string;
  partner_role: "lead" | "customer" | "supplier" | "both";
  is_active: boolean;
  customer_no: string | null;
  supplier_code: string | null;
  email: string | null;
  phone: string | null;
  vat_id: string | null;
  tax_no: string | null;
  language: string | null;
  default_currency: string | null;
  billing_street: string | null;
  billing_zip: string | null;
  billing_city: string | null;
  billing_country: string | null;
  shipping_same_as_billing: boolean;
  shipping_street: string | null;
  shipping_zip: string | null;
  shipping_city: string | null;
  shipping_country: string | null;
  payment_terms_days: number | null;
  payment_terms_text: string | null;
  discount_pct: number | null;
  credit_limit: number | null;
  bank_name: string | null;
  iban: string | null;
  bic: string | null;
  notes: string | null;
  created_at: string;
};

type Tab = "all" | "customer" | "supplier" | "lead";

const ROLE_LABEL: Record<string, string> = {
  lead: "Lead", customer: "Kunde", supplier: "Lieferant", both: "Kunde + Lieferant",
};

const ROLE_COLOR: Record<string, string> = {
  lead: "bg-slate-500/20 text-slate-200 border-slate-500/30",
  customer: "bg-blue-500/20 text-blue-200 border-blue-500/30",
  supplier: "bg-amber-500/20 text-amber-200 border-amber-500/30",
  both: "bg-violet-500/20 text-violet-200 border-violet-500/30",
};

export default function AdminPartners() {
  const { isAdmin, role, loading: authLoading } = useAuth();
  const canEdit = isAdmin || role === "staff";
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("all");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Partner | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("companies")
      .select("*")
      .order("name");
    if (error) toast.error(error.message);
    setPartners((data as any) || []);
    setLoading(false);
  };

  useEffect(() => { if (!authLoading) void load(); }, [authLoading]);

  const filtered = useMemo(() => {
    let list = partners;
    if (tab === "customer") list = list.filter(p => p.partner_role === "customer" || p.partner_role === "both");
    else if (tab === "supplier") list = list.filter(p => p.partner_role === "supplier" || p.partner_role === "both");
    else if (tab === "lead") list = list.filter(p => p.partner_role === "lead");
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      list = list.filter(p =>
        p.name.toLowerCase().includes(needle) ||
        (p.customer_no ?? "").toLowerCase().includes(needle) ||
        (p.supplier_code ?? "").toLowerCase().includes(needle) ||
        (p.email ?? "").toLowerCase().includes(needle) ||
        (p.vat_id ?? "").toLowerCase().includes(needle)
      );
    }
    return list;
  }, [partners, tab, q]);

  const counts = useMemo(() => ({
    all: partners.length,
    customer: partners.filter(p => p.partner_role === "customer" || p.partner_role === "both").length,
    supplier: partners.filter(p => p.partner_role === "supplier" || p.partner_role === "both").length,
    lead: partners.filter(p => p.partner_role === "lead").length,
  }), [partners]);

  const save = async () => {
    if (!selected) return;
    setSaving(true);
    const { id, created_at, ...rest } = selected as any;
    const { error } = await supabase.from("companies").update(rest).eq("id", id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Gespeichert");
    setSelected(null);
    void load();
  };

  const exportCsv = () => {
    const headers = ["Name","Rolle","Kunden-Nr","Lieferanten-Nr","E-Mail","Telefon","USt-ID","Straße","PLZ","Ort","Land","Zahlungsziel (Tage)","IBAN"];
    const rows = filtered.map(p => [
      p.name, ROLE_LABEL[p.partner_role], p.customer_no ?? "", p.supplier_code ?? "",
      p.email ?? "", p.phone ?? "", p.vat_id ?? "",
      p.billing_street ?? "", p.billing_zip ?? "", p.billing_city ?? "", p.billing_country ?? "",
      p.payment_terms_days?.toString() ?? "", p.iban ?? "",
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `geschaeftspartner_${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  if (authLoading) return null;
  if (!canEdit && !isAdmin) return <Navigate to="/" replace />;

  return (
    <AppLayout>
      <div className="p-6 max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
              <Building2 className="h-5 w-5" /> Geschäftspartner
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">Kunden, Lieferanten und Leads zentral verwalten.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={!filtered.length}>
              <Download className="h-3.5 w-3.5 mr-1.5" /> CSV
            </Button>
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="h-3.5 w-3.5 mr-1.5" /> Partner anlegen
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-3 mb-4">
          <Tabs value={tab} onValueChange={v => setTab(v as Tab)}>
            <TabsList>
              <TabsTrigger value="all">Alle <span className="ml-1.5 text-[10px] opacity-70">{counts.all}</span></TabsTrigger>
              <TabsTrigger value="customer">Kunden <span className="ml-1.5 text-[10px] opacity-70">{counts.customer}</span></TabsTrigger>
              <TabsTrigger value="supplier">Lieferanten <span className="ml-1.5 text-[10px] opacity-70">{counts.supplier}</span></TabsTrigger>
              <TabsTrigger value="lead">Leads <span className="ml-1.5 text-[10px] opacity-70">{counts.lead}</span></TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Name, Nummer, E-Mail, USt-ID…" className="pl-8 h-9" />
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card/40 backdrop-blur-xl overflow-hidden">
          {loading ? (
            <div className="py-12 text-center"><Loader2 className="h-4 w-4 animate-spin inline text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-xs text-muted-foreground">Keine Einträge.</div>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-muted/30">
                <tr className="text-left text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Rolle</th>
                  <th className="px-3 py-2 font-medium">Nummer</th>
                  <th className="px-3 py-2 font-medium">E-Mail</th>
                  <th className="px-3 py-2 font-medium">Ort</th>
                  <th className="px-3 py-2 font-medium">USt-ID</th>
                  <th className="px-3 py-2 font-medium text-right">Zahlung</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => (
                  <tr key={p.id} className="border-t border-border/40 hover:bg-muted/20 cursor-pointer" onClick={() => setSelected(p)}>
                    <td className="px-3 py-2 text-foreground">
                      {p.name}
                      {!p.is_active && <span className="ml-2 text-[10px] text-muted-foreground">(inaktiv)</span>}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className={`text-[10px] ${ROLE_COLOR[p.partner_role]}`}>{ROLE_LABEL[p.partner_role]}</Badge>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground tabular-nums">
                      {p.customer_no && <div>{p.customer_no}</div>}
                      {p.supplier_code && <div>{p.supplier_code}</div>}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{p.email ?? "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{[p.billing_zip, p.billing_city].filter(Boolean).join(" ") || "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{p.vat_id ?? "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground text-right">{p.payment_terms_days != null ? `${p.payment_terms_days} T` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Detail dialog */}
      <Dialog open={!!selected} onOpenChange={o => !o && setSelected(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              {selected?.name || "Partner"}
              {selected && <Badge variant="outline" className={`text-[10px] ${ROLE_COLOR[selected.partner_role]}`}>{ROLE_LABEL[selected.partner_role]}</Badge>}
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <section className="grid grid-cols-2 gap-3">
                <Field label="Name *"><Input value={selected.name} onChange={e => setSelected({ ...selected, name: e.target.value })} /></Field>
                <Field label="Rolle">
                  <Select value={selected.partner_role} onValueChange={v => setSelected({ ...selected, partner_role: v as any })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="lead">Lead</SelectItem>
                      <SelectItem value="customer">Kunde</SelectItem>
                      <SelectItem value="supplier">Lieferant</SelectItem>
                      <SelectItem value="both">Kunde + Lieferant</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Kunden-Nr."><Input value={selected.customer_no ?? ""} disabled className="opacity-60" /></Field>
                <Field label="Lieferanten-Nr."><Input value={selected.supplier_code ?? ""} disabled className="opacity-60" /></Field>
                <Field label="E-Mail"><Input type="email" value={selected.email ?? ""} onChange={e => setSelected({ ...selected, email: e.target.value || null })} /></Field>
                <Field label="Telefon"><Input value={selected.phone ?? ""} onChange={e => setSelected({ ...selected, phone: e.target.value || null })} /></Field>
                <Field label="USt-ID"><Input value={selected.vat_id ?? ""} onChange={e => setSelected({ ...selected, vat_id: e.target.value || null })} /></Field>
                <Field label="Steuernummer"><Input value={selected.tax_no ?? ""} onChange={e => setSelected({ ...selected, tax_no: e.target.value || null })} /></Field>
                <Field label="Sprache"><Input value={selected.language ?? ""} onChange={e => setSelected({ ...selected, language: e.target.value || null })} placeholder="de" /></Field>
                <Field label="Währung"><Input value={selected.default_currency ?? ""} onChange={e => setSelected({ ...selected, default_currency: e.target.value || null })} placeholder="EUR" /></Field>
              </section>

              <section>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Rechnungsadresse</div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Straße"><Input value={selected.billing_street ?? ""} onChange={e => setSelected({ ...selected, billing_street: e.target.value || null })} /></Field>
                  <Field label="Land"><Input value={selected.billing_country ?? ""} onChange={e => setSelected({ ...selected, billing_country: e.target.value || null })} placeholder="DE" /></Field>
                  <Field label="PLZ"><Input value={selected.billing_zip ?? ""} onChange={e => setSelected({ ...selected, billing_zip: e.target.value || null })} /></Field>
                  <Field label="Ort"><Input value={selected.billing_city ?? ""} onChange={e => setSelected({ ...selected, billing_city: e.target.value || null })} /></Field>
                </div>
              </section>

              <section>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Lieferadresse</div>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Switch checked={selected.shipping_same_as_billing}
                      onCheckedChange={v => setSelected({ ...selected, shipping_same_as_billing: v })} />
                    identisch mit Rechnungsadresse
                  </label>
                </div>
                {!selected.shipping_same_as_billing && (
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Straße"><Input value={selected.shipping_street ?? ""} onChange={e => setSelected({ ...selected, shipping_street: e.target.value || null })} /></Field>
                    <Field label="Land"><Input value={selected.shipping_country ?? ""} onChange={e => setSelected({ ...selected, shipping_country: e.target.value || null })} /></Field>
                    <Field label="PLZ"><Input value={selected.shipping_zip ?? ""} onChange={e => setSelected({ ...selected, shipping_zip: e.target.value || null })} /></Field>
                    <Field label="Ort"><Input value={selected.shipping_city ?? ""} onChange={e => setSelected({ ...selected, shipping_city: e.target.value || null })} /></Field>
                  </div>
                )}
              </section>

              <section>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Zahlung & Bank</div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Zahlungsziel (Tage)"><Input type="number" value={selected.payment_terms_days ?? ""} onChange={e => setSelected({ ...selected, payment_terms_days: e.target.value ? parseInt(e.target.value) : null })} /></Field>
                  <Field label="Skonto %"><Input type="number" step="0.01" value={selected.discount_pct ?? ""} onChange={e => setSelected({ ...selected, discount_pct: e.target.value ? parseFloat(e.target.value) : null })} /></Field>
                  <Field label="Zahlungstext (frei)"><Input value={selected.payment_terms_text ?? ""} onChange={e => setSelected({ ...selected, payment_terms_text: e.target.value || null })} placeholder="z. B. 14 Tage netto, 2% Skonto 7 Tage" /></Field>
                  <Field label="Kreditlimit"><Input type="number" step="0.01" value={selected.credit_limit ?? ""} onChange={e => setSelected({ ...selected, credit_limit: e.target.value ? parseFloat(e.target.value) : null })} /></Field>
                  <Field label="Bank"><Input value={selected.bank_name ?? ""} onChange={e => setSelected({ ...selected, bank_name: e.target.value || null })} /></Field>
                  <Field label="BIC"><Input value={selected.bic ?? ""} onChange={e => setSelected({ ...selected, bic: e.target.value || null })} /></Field>
                  <div className="col-span-2">
                    <Field label="IBAN"><Input value={selected.iban ?? ""} onChange={e => setSelected({ ...selected, iban: e.target.value || null })} className="font-mono" /></Field>
                  </div>
                </div>
              </section>

              <section className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs">
                  <Switch checked={selected.is_active} onCheckedChange={v => setSelected({ ...selected, is_active: v })} />
                  Aktiv
                </label>
                <Link to={`/bestellungen?company=${selected.id}`} className="text-xs text-primary hover:underline">Bestellungen anzeigen →</Link>
              </section>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSelected(null)}>Schließen</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Speichert…" : "Speichern"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create dialog */}
      <CreateDialog open={creating} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); void load(); }} />
    </AppLayout>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function CreateDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"lead" | "customer" | "supplier" | "both">("customer");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim()) { toast.error("Name erforderlich"); return; }
    setSaving(true);
    const { error } = await supabase.from("companies").insert({
      name: name.trim(),
      email: email.trim() || null,
      partner_role: role,
      type: role === "supplier" ? "lieferant" as any : "kunde" as any,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Partner angelegt");
    setName(""); setEmail(""); setRole("customer");
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Neuen Geschäftspartner anlegen</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Field label="Name *"><Input value={name} onChange={e => setName(e.target.value)} autoFocus /></Field>
          <Field label="E-Mail"><Input type="email" value={email} onChange={e => setEmail(e.target.value)} /></Field>
          <Field label="Rolle">
            <Select value={role} onValueChange={v => setRole(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="lead">Lead</SelectItem>
                <SelectItem value="customer">Kunde</SelectItem>
                <SelectItem value="supplier">Lieferant</SelectItem>
                <SelectItem value="both">Kunde + Lieferant</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <p className="text-[11px] text-muted-foreground">Kunden- / Lieferantennummer wird automatisch vergeben (K-00001 bzw. L-00001).</p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Abbrechen</Button>
          <Button onClick={submit} disabled={saving}>Anlegen</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
