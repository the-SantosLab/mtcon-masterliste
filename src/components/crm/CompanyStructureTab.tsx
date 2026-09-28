import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllCompanies } from '@/lib/crmData';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2, Plus, Building2, MapPin } from 'lucide-react';
import { toast } from 'sonner';

const LOC_TYPES: Record<string, string> = { standort: 'Standort', werk: 'Werk', lager: 'Lager', lieferadresse: 'Lieferadresse', rechnungsadresse: 'Rechnungsadresse' };
const emptyLoc = { name: '', location_type: 'standort', street: '', zip: '', city: '', country: '', phone: '' };

export function CompanyStructureTab({ companyId }: { companyId: string }) {
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [parentId, setParentId] = useState<string | null>(null);
  const [children, setChildren] = useState<{ id: string; name: string }[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [form, setForm] = useState<any>(emptyLoc);

  const load = async () => {
    const [cmp, { data: me }, { data: ch }, { data: locs }] = await Promise.all([
      fetchAllCompanies(),
      supabase.from('companies').select('parent_company_id').eq('id', companyId).single(),
      supabase.from('companies').select('id, name').eq('parent_company_id', companyId).order('name'),
      supabase.from('company_locations').select('*').eq('company_id', companyId).order('name'),
    ]);
    setCompanies((cmp ?? []).filter((c: any) => c.id !== companyId));
    setParentId((me as any)?.parent_company_id ?? null);
    setChildren(ch ?? []);
    setLocations(locs ?? []);
  };
  useEffect(() => { void load(); }, [companyId]);

  const saveParent = async (v: string) => {
    const val = v === '__none__' ? null : v;
    if (val && children.some(c => c.id === val)) { toast.error('Eine Tochter kann nicht Mutter sein'); return; }
    const { error } = await supabase.from('companies').update({ parent_company_id: val }).eq('id', companyId);
    if (error) return toast.error(error.message);
    setParentId(val); toast.success('Muttergesellschaft gespeichert');
  };

  const addLoc = async () => {
    if (!form.name.trim()) return toast.error('Name erforderlich');
    const { error } = await supabase.from('company_locations').insert({ ...form, company_id: companyId });
    if (error) return toast.error(error.message);
    setForm(emptyLoc); void load();
  };
  const delLoc = async (id: string) => {
    const { error } = await supabase.from('company_locations').delete().eq('id', id);
    if (error) return toast.error(error.message);
    void load();
  };

  const parent = companies.find(c => c.id === parentId);

  return (
    <div className="space-y-6 max-w-4xl">
      <section className="glass-card rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2"><Building2 className="h-4 w-4" />Firmenhierarchie</h3>
        <div className="space-y-1.5 max-w-sm">
          <Label className="text-xs">Muttergesellschaft</Label>
          <Select value={parentId ?? '__none__'} onValueChange={saveParent}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="__none__">— keine —</SelectItem>
              {companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          {parent && <Link to={`/crm/companies/${parent.id}`} className="text-[11px] text-primary hover:underline">→ {parent.name} öffnen</Link>}
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">Tochtergesellschaften ({children.length})</p>
          {children.length === 0 ? <p className="text-xs text-muted-foreground/70">Keine</p> : (
            <ul className="text-xs space-y-1">{children.map(c => <li key={c.id}><Link to={`/crm/companies/${c.id}`} className="hover:underline">{c.name}</Link></li>)}</ul>
          )}
        </div>
      </section>

      <section className="glass-card rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2"><MapPin className="h-4 w-4" />Standorte</h3>
        <table className="w-full text-xs">
          <thead><tr className="text-left text-muted-foreground text-[10px] uppercase"><th className="py-1">Name</th><th>Art</th><th>Adresse</th><th>Telefon</th><th /></tr></thead>
          <tbody>
            {locations.map(l => (
              <tr key={l.id} className="border-t border-border/40">
                <td className="py-1.5">{l.name}</td><td>{LOC_TYPES[l.location_type] ?? l.location_type}</td>
                <td>{[l.street, [l.zip, l.city].filter(Boolean).join(' '), l.country].filter(Boolean).join(', ')}</td>
                <td>{l.phone}</td>
                <td className="text-right"><Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => delLoc(l.id)}><Trash2 className="h-3 w-3" /></Button></td>
              </tr>
            ))}
            {locations.length === 0 && <tr><td colSpan={5} className="py-2 text-muted-foreground/70">Keine Standorte</td></tr>}
          </tbody>
        </table>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-2 border-t border-border/40">
          <Input placeholder="Name *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="h-8 text-xs" />
          <Select value={form.location_type} onValueChange={v => setForm({ ...form, location_type: v })}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{Object.entries(LOC_TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
          </Select>
          <Input placeholder="Straße" value={form.street} onChange={e => setForm({ ...form, street: e.target.value })} className="h-8 text-xs" />
          <Input placeholder="PLZ" value={form.zip} onChange={e => setForm({ ...form, zip: e.target.value })} className="h-8 text-xs" />
          <Input placeholder="Ort" value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} className="h-8 text-xs" />
          <Input placeholder="Land" value={form.country} onChange={e => setForm({ ...form, country: e.target.value })} className="h-8 text-xs" />
          <Input placeholder="Telefon" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="h-8 text-xs" />
          <Button size="sm" className="h-8 text-xs gap-1" onClick={addLoc}><Plus className="h-3 w-3" />Standort hinzufügen</Button>
        </div>
      </section>
    </div>
  );
}
