import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Navigate } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';

export default function AdminMasterData() {
  const { isAdmin, loading: authLoading } = useAuth();
  if (!authLoading && !isAdmin) return <Navigate to="/" replace />;

  return (
    <AppLayout>
      <div className="space-y-4 max-w-3xl">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Stammdaten</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Kunden, Produkte & Bereiche verwalten</p>
        </div>
        <Tabs defaultValue="customers">
          <TabsList className="bg-secondary">
            <TabsTrigger value="customers" className="text-xs">Kunden</TabsTrigger>
            <TabsTrigger value="products" className="text-xs">Produkte</TabsTrigger>
            <TabsTrigger value="areas" className="text-xs">Bereiche</TabsTrigger>
          </TabsList>
          <TabsContent value="customers"><CustomersTab /></TabsContent>
          <TabsContent value="products"><ProductsTab /></TabsContent>
          <TabsContent value="areas"><AreasTab /></TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}

function CustomersTab() {
  const [items, setItems] = useState<Tables<'customers'>[]>([]);
  const [no, setNo] = useState('');
  const [name, setName] = useState('');
  const fetchData = async () => { const { data } = await supabase.from('customers').select('*').order('customer_no'); setItems(data || []); };
  useEffect(() => { fetchData(); }, []);
  const add = async () => {
    if (!no || !name) return;
    const { error } = await supabase.from('customers').insert({ customer_no: no, name });
    if (error) { toast.error(error.message); return; }
    setNo(''); setName(''); fetchData(); toast.success('Kunde hinzugefügt');
  };
  const remove = async (id: string) => { await supabase.from('customers').delete().eq('id', id); fetchData(); };
  return (
    <div className="space-y-3 mt-3">
      <div className="rounded-md border border-border bg-card overflow-hidden">
        <table className="w-full text-xs">
          <thead><tr className="border-b border-border"><th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Nr.</th><th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Name</th><th className="px-4 py-2.5 w-10"></th></tr></thead>
          <tbody className="divide-y divide-border">
            {items.map(i => (
              <tr key={i.id} className="hover:bg-muted/40 transition-colors">
                <td className="px-4 py-2.5 font-mono">{i.customer_no}</td>
                <td className="px-4 py-2.5 text-foreground">{i.name}</td>
                <td className="px-4 py-2.5">
                  <button onClick={() => remove(i.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-2">
        <Input value={no} onChange={e => setNo(e.target.value)} placeholder="Kundennr." className="w-28 h-8 text-xs" />
        <Input value={name} onChange={e => setName(e.target.value)} placeholder="Name" className="flex-1 h-8 text-xs" />
        <Button size="sm" onClick={add} className="h-8 text-xs"><Plus className="h-3.5 w-3.5 mr-1" />Hinzufügen</Button>
      </div>
    </div>
  );
}

function ProductsTab() {
  const [items, setItems] = useState<Tables<'products'>[]>([]);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const fetchData = async () => { const { data } = await supabase.from('products').select('*').order('code'); setItems(data || []); };
  useEffect(() => { fetchData(); }, []);
  const add = async () => {
    if (!code || !name) return;
    const { error } = await supabase.from('products').insert({ code, name });
    if (error) { toast.error(error.message); return; }
    setCode(''); setName(''); fetchData(); toast.success('Produkt hinzugefügt');
  };
  const remove = async (id: string) => { await supabase.from('products').delete().eq('id', id); fetchData(); };
  return (
    <div className="space-y-3 mt-3">
      <div className="rounded-md border border-border bg-card overflow-hidden">
        <table className="w-full text-xs">
          <thead><tr className="border-b border-border"><th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Code</th><th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Name</th><th className="px-4 py-2.5 w-10"></th></tr></thead>
          <tbody className="divide-y divide-border">
            {items.map(i => (
              <tr key={i.id} className="hover:bg-muted/40 transition-colors">
                <td className="px-4 py-2.5 font-mono">{i.code}</td>
                <td className="px-4 py-2.5 text-foreground">{i.name}</td>
                <td className="px-4 py-2.5">
                  <button onClick={() => remove(i.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-2">
        <Input value={code} onChange={e => setCode(e.target.value)} placeholder="Code" className="w-28 h-8 text-xs" />
        <Input value={name} onChange={e => setName(e.target.value)} placeholder="Name" className="flex-1 h-8 text-xs" />
        <Button size="sm" onClick={add} className="h-8 text-xs"><Plus className="h-3.5 w-3.5 mr-1" />Hinzufügen</Button>
      </div>
    </div>
  );
}

function AreasTab() {
  const [items, setItems] = useState<Tables<'internal_areas'>[]>([]);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const fetchData = async () => { const { data } = await supabase.from('internal_areas').select('*').order('code'); setItems(data || []); };
  useEffect(() => { fetchData(); }, []);
  const add = async () => {
    if (!code || !name) return;
    const { error } = await supabase.from('internal_areas').insert({ code, name });
    if (error) { toast.error(error.message); return; }
    setCode(''); setName(''); fetchData(); toast.success('Bereich hinzugefügt');
  };
  const remove = async (id: string) => { await supabase.from('internal_areas').delete().eq('id', id); fetchData(); };
  return (
    <div className="space-y-3 mt-3">
      <div className="rounded-md border border-border bg-card overflow-hidden">
        <table className="w-full text-xs">
          <thead><tr className="border-b border-border"><th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Code</th><th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Name</th><th className="px-4 py-2.5 w-10"></th></tr></thead>
          <tbody className="divide-y divide-border">
            {items.map(i => (
              <tr key={i.id} className="hover:bg-muted/40 transition-colors">
                <td className="px-4 py-2.5 font-mono">{i.code}</td>
                <td className="px-4 py-2.5 text-foreground">{i.name}</td>
                <td className="px-4 py-2.5">
                  <button onClick={() => remove(i.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-2">
        <Input value={code} onChange={e => setCode(e.target.value)} placeholder="Code" className="w-28 h-8 text-xs" />
        <Input value={name} onChange={e => setName(e.target.value)} placeholder="Name" className="flex-1 h-8 text-xs" />
        <Button size="sm" onClick={add} className="h-8 text-xs"><Plus className="h-3.5 w-3.5 mr-1" />Hinzufügen</Button>
      </div>
    </div>
  );
}
