import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { FileText, Search, Plus, Pencil, Trash2, Copy } from 'lucide-react';
import { toast } from 'sonner';

interface Template {
  id: string;
  title: string;
  body: string;
  category: string;
}

interface TicketTemplatesProps {
  onSelect: (body: string) => void;
}

export function TicketTemplates({ onSelect }: TicketTemplatesProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [search, setSearch] = useState('');
  const [editDialog, setEditDialog] = useState(false);
  const [editTemplate, setEditTemplate] = useState<Partial<Template> | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) fetchTemplates();
  }, [open]);

  const fetchTemplates = async () => {
    const { data } = await supabase.from('response_templates').select('*').order('category').order('title');
    setTemplates((data as any[]) || []);
  };

  const filtered = templates.filter(t =>
    t.title.toLowerCase().includes(search.toLowerCase()) ||
    t.body.toLowerCase().includes(search.toLowerCase()) ||
    t.category.toLowerCase().includes(search.toLowerCase())
  );

  const handleSelect = (t: Template) => {
    onSelect(t.body);
    setOpen(false);
    toast.success('Vorlage eingefügt');
  };

  const handleSave = async () => {
    if (!editTemplate?.title?.trim() || !editTemplate?.body?.trim()) return;
    setSaving(true);
    try {
      if (editTemplate.id) {
        await supabase.from('response_templates').update({
          title: editTemplate.title,
          body: editTemplate.body,
          category: editTemplate.category || 'Allgemein',
          updated_at: new Date().toISOString(),
        }).eq('id', editTemplate.id);
      } else {
        await supabase.from('response_templates').insert({
          title: editTemplate.title,
          body: editTemplate.body,
          category: editTemplate.category || 'Allgemein',
          created_by: user!.id,
        } as any);
      }
      toast.success('Vorlage gespeichert');
      setEditDialog(false);
      setEditTemplate(null);
      fetchTemplates();
    } catch {
      toast.error('Fehler beim Speichern');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    await supabase.from('response_templates').delete().eq('id', id);
    toast.success('Vorlage gelöscht');
    fetchTemplates();
  };

  return (
    <>
      <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setOpen(true)}>
        <FileText className="h-3.5 w-3.5 mr-1.5" />Vorlagen
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-sm">Antwort-Vorlagen</DialogTitle>
          </DialogHeader>

          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Vorlagen durchsuchen..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8 h-9 text-xs"
              />
            </div>
            <Button size="sm" className="h-9 text-xs" onClick={() => {
              setEditTemplate({ title: '', body: '', category: 'Allgemein' });
              setEditDialog(true);
            }}>
              <Plus className="h-3.5 w-3.5 mr-1" />Neu
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-1.5 min-h-0">
            {filtered.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-8">Keine Vorlagen gefunden</p>
            )}
            {filtered.map(t => (
              <div
                key={t.id}
                className="group border border-border rounded-md p-3 hover:bg-muted/50 cursor-pointer transition-colors"
                onClick={() => handleSelect(t)}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium">{t.title}</span>
                  <div className="flex items-center gap-1">
                    <Badge variant="outline" className="text-[9px] px-1.5 py-0">{t.category}</Badge>
                    <Button
                      variant="ghost" size="sm" className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
                      onClick={e => { e.stopPropagation(); setEditTemplate(t); setEditDialog(true); }}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost" size="sm" className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 text-destructive"
                      onClick={e => { e.stopPropagation(); handleDelete(t.id); }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground line-clamp-2">{t.body}</p>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit/Create dialog */}
      <Dialog open={editDialog} onOpenChange={setEditDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">{editTemplate?.id ? 'Vorlage bearbeiten' : 'Neue Vorlage'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Titel"
              value={editTemplate?.title || ''}
              onChange={e => setEditTemplate(prev => ({ ...prev!, title: e.target.value }))}
              className="text-xs h-9"
            />
            <Input
              placeholder="Kategorie (z.B. Nachfrage, Lösung, Allgemein)"
              value={editTemplate?.category || ''}
              onChange={e => setEditTemplate(prev => ({ ...prev!, category: e.target.value }))}
              className="text-xs h-9"
            />
            <Textarea
              placeholder="Vorlagentext..."
              value={editTemplate?.body || ''}
              onChange={e => setEditTemplate(prev => ({ ...prev!, body: e.target.value }))}
              rows={6}
              className="text-xs"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEditDialog(false)}>Abbrechen</Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>Speichern</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
