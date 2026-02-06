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
        <div><h1 className="text-2xl font-bold text-foreground">Stammdaten</h1><p className="text-sm text-muted-foreground">Kunden, Produkte & Bereiche verwalten</p></div>
        <Tabs defaultValue="customers">
          <TabsList><TabsTrigger value="customers">Kunden</TabsTrigger><TabsTrigger value="products">Produkte</TabsTrigger><TabsTrigger value="areas">Bereiche</TabsTrigger></TabsList>
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
  const fetch = async () => { const { data } = await supabase.from('customers').select('*').order('customer_no'); setItems(data || []); };
  useEffect(() => { fetch(); }, []);
  const add = async () => {
    if (!no || !name) return;
    const { error } = await supabase.from('customers').insert({ customer_no: no, name });
    if (error) { toast.error(error.message); return; }
    setNo(''); setName(''); fetch(); toast.success('Kunde hinzugefügt');
  };
  const remove = async (id: string) => { await supabase.from('customers').delete().eq('id', id); fetch(); };
  return (
    <div className="space-y-3 mt-3">
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border text-xs text-muted-foreground"><th className="px-4 py-2 text-left">Nr.</th><th className="px-4 py-2 text-left">Name</th><th className="px-4 py-2"></th></tr></thead>
          <tbody className="divide-y divide-border">
            {items.map(i => (<tr key={i.id} className="hover:bg-muted/30"><td className="px-4 py-2 font-mono">{i.customer_no}</td><td className="px-4 py-2">{i.name}</td><td className="px-4 py-2"><Button variant="ghost" size="sm" onClick={() => remove(i.id)}><Trash2 className="h-3 w-3 text-destructive" /></Button></td></tr>))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-2">
        <Input value={no} onChange={e => setNo(e.target.value)} placeholder="Kundennr." className="w-32" />
        <Input value={name} onChange={e => setName(e.target.value)} placeholder="Name" className="flex-1" />
        <Button size="sm" onClick={add}><Plus className="h-4 w-4 mr-1" />Hinzufügen</Button>
      </div>
    </div>
  );
}

function ProductsTab() {
  const [items, setItems] = useState<Tables<'products'>[]>([]);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const fetch = async () => { const { data } = await supabase.from('products').select('*').order('code'); setItems(data || []); };
  useEffect(() => { fetch(); }, []);
  const add = async () => {
    if (!code || !name) return;
    const { error } = await supabase.from('products').insert({ code, name });
    if (error) { toast.error(error.message); return; }
    setCode(''); setName(''); fetch(); toast.success('Produkt hinzugefügt');
  };
  const remove = async (id: string) => { await supabase.from('products').delete().eq('id', id); fetch(); };
  return (
    <div className="space-y-3 mt-3">
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border text-xs text-muted-foreground"><th className="px-4 py-2 text-left">Code</th><th className="px-4 py-2 text-left">Name</th><th className="px-4 py-2"></th></tr></thead>
          <tbody className="divide-y divide-border">
            {items.map(i => (<tr key={i.id} className="hover:bg-muted/30"><td className="px-4 py-2 font-mono">{i.code}</td><td className="px-4 py-2">{i.name}</td><td className="px-4 py-2"><Button variant="ghost" size="sm" onClick={() => remove(i.id)}><Trash2 className="h-3 w-3 text-destructive" /></Button></td></tr>))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-2">
        <Input value={code} onChange={e => setCode(e.target.value)} placeholder="Code" className="w-32" />
        <Input value={name} onChange={e => setName(e.target.value)} placeholder="Name" className="flex-1" />
        <Button size="sm" onClick={add}><Plus className="h-4 w-4 mr-1" />Hinzufügen</Button>
      </div>
    </div>
  );
}

function AreasTab() {
  const [items, setItems] = useState<Tables<'internal_areas'>[]>([]);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const fetch = async () => { const { data } = await supabase.from('internal_areas').select('*').order('code'); setItems(data || []); };
  useEffect(() => { fetch(); }, []);
  const add = async () => {
    if (!code || !name) return;
    const { error } = await supabase.from('internal_areas').insert({ code, name });
    if (error) { toast.error(error.message); return; }
    setCode(''); setName(''); fetch(); toast.success('Bereich hinzugefügt');
  };
  const remove = async (id: string) => { await supabase.from('internal_areas').delete().eq('id', id); fetch(); };
  return (
    <div className="space-y-3 mt-3">
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border text-xs text-muted-foreground"><th className="px-4 py-2 text-left">Code</th><th className="px-4 py-2 text-left">Name</th><th className="px-4 py-2"></th></tr></thead>
          <tbody className="divide-y divide-border">
            {items.map(i => (<tr key={i.id} className="hover:bg-muted/30"><td className="px-4 py-2 font-mono">{i.code}</td><td className="px-4 py-2">{i.name}</td><td className="px-4 py-2"><Button variant="ghost" size="sm" onClick={() => remove(i.id)}><Trash2 className="h-3 w-3 text-destructive" /></Button></td></tr>))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-2">
        <Input value={code} onChange={e => setCode(e.target.value)} placeholder="Code" className="w-32" />
        <Input value={name} onChange={e => setName(e.target.value)} placeholder="Name" className="flex-1" />
        <Button size="sm" onClick={add}><Plus className="h-4 w-4 mr-1" />Hinzufügen</Button>
      </div>
    </div>
  );
}
