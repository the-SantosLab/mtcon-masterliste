import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check, ChevronsUpDown, Plus, X, Building2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export type PartnerOption = {
  id: string;
  name: string;
  customer_no: string | null;
  supplier_code: string | null;
  partner_role: "lead" | "customer" | "supplier" | "both";
  email: string | null;
};

type Props = {
  value: string | null;
  onChange: (id: string | null, partner: PartnerOption | null) => void;
  /** filter by role: 'customer' shows customer+both, 'supplier' shows supplier+both, 'any' shows all */
  role?: "customer" | "supplier" | "any";
  placeholder?: string;
  disabled?: boolean;
  className?: string;
};

export function PartnerPicker({ value, onChange, role = "any", placeholder = "Geschäftspartner wählen…", disabled, className }: Props) {
  const [open, setOpen] = useState(false);
  const [partners, setPartners] = useState<PartnerOption[]>([]);
  const [selected, setSelected] = useState<PartnerOption | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<"customer" | "supplier" | "both" | "lead">(role === "supplier" ? "supplier" : "customer");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    let q = supabase.from("companies")
      .select("id, name, customer_no, supplier_code, partner_role, email")
      .eq("is_active", true)
      .order("name");
    if (role === "customer") q = q.in("partner_role", ["customer", "both"]);
    if (role === "supplier") q = q.in("partner_role", ["supplier", "both"]);
    const { data, error } = await q;
    if (error) { toast.error(error.message); return; }
    setPartners((data as any) || []);
  };

  useEffect(() => { void load(); }, [role]);

  useEffect(() => {
    if (!value) { setSelected(null); return; }
    const found = partners.find(p => p.id === value);
    if (found) setSelected(found);
    else if (value) {
      // fetch single
      (async () => {
        const { data } = await supabase.from("companies")
          .select("id, name, customer_no, supplier_code, partner_role, email")
          .eq("id", value).maybeSingle();
        if (data) setSelected(data as any);
      })();
    }
  }, [value, partners]);

  const createNew = async () => {
    if (!newName.trim()) { toast.error("Name erforderlich"); return; }
    setSaving(true);
    const { data, error } = await supabase.from("companies")
      .insert({ name: newName.trim(), email: newEmail.trim() || null, partner_role: newRole, type: newRole === "supplier" ? "lieferant" as any : "kunde" as any })
      .select("id, name, customer_no, supplier_code, partner_role, email")
      .single();
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Partner angelegt");
    const p = data as any;
    setPartners(prev => [...prev, p].sort((a, b) => a.name.localeCompare(b.name)));
    onChange(p.id, p);
    setCreating(false);
    setNewName(""); setNewEmail("");
  };

  const labelOf = (p: PartnerOption) => {
    const num = p.partner_role === "supplier" ? p.supplier_code : (p.customer_no ?? p.supplier_code);
    return `${p.name}${num ? ` · ${num}` : ""}`;
  };

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            disabled={disabled}
            className="flex-1 justify-between h-9 font-normal"
          >
            <span className="flex items-center gap-2 truncate">
              <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="truncate">{selected ? labelOf(selected) : placeholder}</span>
            </span>
            <ChevronsUpDown className="h-3.5 w-3.5 opacity-50 shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[380px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Suchen…" />
            <CommandList>
              <CommandEmpty>
                <div className="px-3 py-4 text-xs text-muted-foreground">
                  Keine Treffer.
                  <Button size="sm" variant="ghost" className="ml-2 h-6" onClick={() => { setCreating(true); setOpen(false); }}>
                    <Plus className="h-3 w-3 mr-1" /> Neu anlegen
                  </Button>
                </div>
              </CommandEmpty>
              <CommandGroup>
                {partners.map(p => (
                  <CommandItem key={p.id} value={`${p.name} ${p.customer_no ?? ""} ${p.supplier_code ?? ""} ${p.email ?? ""}`}
                    onSelect={() => { onChange(p.id, p); setOpen(false); }}>
                    <Check className={cn("h-3.5 w-3.5 mr-2", value === p.id ? "opacity-100" : "opacity-0")} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs truncate">{p.name}</div>
                      <div className="text-[10px] text-muted-foreground truncate">
                        {p.customer_no || p.supplier_code || "—"} {p.email ? `· ${p.email}` : ""} · {p.partner_role}
                      </div>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
              <div className="border-t border-border p-1">
                <Button size="sm" variant="ghost" className="w-full justify-start h-7 text-xs"
                  onClick={() => { setCreating(true); setOpen(false); }}>
                  <Plus className="h-3 w-3 mr-2" /> Neuen Geschäftspartner anlegen
                </Button>
              </div>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {selected && !disabled && (
        <Button type="button" size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => onChange(null, null)} title="Verknüpfung entfernen">
          <X className="h-3.5 w-3.5" />
        </Button>
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Geschäftspartner anlegen</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Name *</Label>
              <Input value={newName} onChange={e => setNewName(e.target.value)} autoFocus />
            </div>
            <div>
              <Label className="text-xs">E-Mail</Label>
              <Input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Rolle</Label>
              <Select value={newRole} onValueChange={v => setNewRole(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="lead">Lead</SelectItem>
                  <SelectItem value="customer">Kunde</SelectItem>
                  <SelectItem value="supplier">Lieferant</SelectItem>
                  <SelectItem value="both">Kunde + Lieferant</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground mt-1">Kunden- bzw. Lieferantennummer wird automatisch vergeben.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreating(false)}>Abbrechen</Button>
            <Button onClick={createNew} disabled={saving}>Anlegen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
