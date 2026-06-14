import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { FolderTree, Plus, X } from "lucide-react";

type Dept = { id: string; name: string };
type Tpl = { department_id: string; folders: string[]; bucket: string };

export default function AdminFolderTemplates() {
  const [depts, setDepts] = useState<Dept[]>([]);
  const [tpls, setTpls] = useState<Record<string, Tpl>>({});
  const [editing, setEditing] = useState<Record<string, string>>({});

  const load = async () => {
    const [{ data: d }, { data: t }] = await Promise.all([
      supabase.from('departments').select('id, name').order('name'),
      (supabase.from('dept_folder_templates' as any).select('*')) as any,
    ]);
    setDepts(d || []);
    const map: Record<string, Tpl> = {};
    (t || []).forEach((x: Tpl) => map[x.department_id] = x);
    setTpls(map);
  };
  useEffect(() => { load(); }, []);

  const save = async (deptId: string, folders: string[]) => {
    const { error } = await (supabase.from('dept_folder_templates' as any).upsert({
      department_id: deptId, folders, bucket: tpls[deptId]?.bucket || 'case-attachments',
    }, { onConflict: 'department_id' })) as any;
    if (error) return toast.error(error.message);
    toast.success('Gespeichert');
    load();
  };

  const addFolder = (deptId: string) => {
    const v = (editing[deptId] || '').trim();
    if (!v) return;
    const cur = tpls[deptId]?.folders || [];
    save(deptId, [...cur, v]);
    setEditing({ ...editing, [deptId]: '' });
  };

  const removeFolder = (deptId: string, idx: number) => {
    const cur = tpls[deptId]?.folders || [];
    save(deptId, cur.filter((_, i) => i !== idx));
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-4 max-w-3xl">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2"><FolderTree className="h-5 w-5" /> Ordner-Vorlagen</h1>
          <p className="text-sm text-muted-foreground mt-1">Wird ein Vorgang in dieser Abteilung angelegt, werden die Ordner automatisch im Anhang-Bucket erstellt.</p>
        </div>

        <div className="space-y-3">
          {depts.map(d => {
            const tpl = tpls[d.id];
            const folders = tpl?.folders || [];
            return (
              <Card key={d.id} className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-medium text-sm">{d.name}</div>
                  <div className="text-[10px] text-muted-foreground font-mono">{tpl?.bucket || 'case-attachments'}</div>
                </div>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {folders.length === 0 && <span className="text-xs text-muted-foreground">Keine Vorlage</span>}
                  {folders.map((f, i) => (
                    <Badge key={i} variant="outline" className="font-mono text-xs gap-1">
                      {f}
                      <button onClick={() => removeFolder(d.id, i)} className="hover:text-rose-400"><X className="h-3 w-3" /></button>
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    className="h-8 text-xs font-mono max-w-xs"
                    placeholder="z. B. 04_Pruefung"
                    value={editing[d.id] || ''}
                    onChange={e => setEditing({ ...editing, [d.id]: e.target.value })}
                    onKeyDown={e => { if (e.key === 'Enter') addFolder(d.id); }}
                  />
                  <Button size="sm" variant="outline" onClick={() => addFolder(d.id)}><Plus className="h-3 w-3 mr-1" />Ordner</Button>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </AppLayout>
  );
}
