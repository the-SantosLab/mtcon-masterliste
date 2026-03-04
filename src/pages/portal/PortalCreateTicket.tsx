import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PortalLayout } from '@/components/PortalLayout';
import { usePortalAuth } from '@/contexts/PortalAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, ArrowLeft, Paperclip, X } from 'lucide-react';
import { toast } from 'sonner';

export default function PortalCreateTicket() {
  const { customer } = usePortalAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [form, setForm] = useState({
    title: '',
    description: '',
    priority: 'medium',
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(prev => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  const removeFile = (idx: number) => {
    setFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title || !form.description) {
      toast.error('Bitte füllen Sie Titel und Beschreibung aus.');
      return;
    }

    setLoading(true);
    try {
      const { data: ticket, error } = await supabase
        .from('support_tickets')
        .insert({
          title: form.title,
          description: form.description,
          priority: form.priority as any,
          customer_id: customer!.id,
        })
        .select('id')
        .single();

      if (error) throw error;

      // Upload attachments
      for (const file of files) {
        const path = `tickets/${ticket.id}/${Date.now()}_${file.name}`;
        await supabase.storage.from('support-attachments').upload(path, file);
      }

      // Add initial message with description
      await supabase.from('ticket_messages').insert({
        ticket_id: ticket.id,
        sender_type: 'customer',
        sender_id: customer!.auth_user_id,
        body: form.description,
      });

      toast.success('Ticket wurde erstellt');
      navigate(`/portal/tickets/${ticket.id}`);
    } catch (err: any) {
      toast.error('Fehler: ' + (err.message || 'Ticket konnte nicht erstellt werden'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <PortalLayout>
      <div className="space-y-4 max-w-2xl">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/portal/tickets')} className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-semibold text-foreground">Neues Ticket erstellen</h1>
            <p className="text-xs text-muted-foreground">Beschreiben Sie Ihr Anliegen</p>
          </div>
        </div>

        <Card>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Betreff <span className="text-destructive">*</span></Label>
                <Input
                  value={form.title}
                  onChange={e => setForm({ ...form, title: e.target.value })}
                  placeholder="Kurze Zusammenfassung Ihres Anliegens"
                  className="h-9 text-sm"
                  required
                  disabled={loading}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Priorität</Label>
                <Select
                  value={form.priority}
                  onValueChange={v => setForm({ ...form, priority: v })}
                  disabled={loading}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Niedrig</SelectItem>
                    <SelectItem value="medium">Mittel</SelectItem>
                    <SelectItem value="high">Hoch</SelectItem>
                    <SelectItem value="critical">Kritisch</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Beschreibung <span className="text-destructive">*</span></Label>
                <Textarea
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  placeholder="Beschreiben Sie Ihr Anliegen so detailliert wie möglich..."
                  rows={8}
                  className="text-sm"
                  required
                  disabled={loading}
                />
              </div>

              {/* File attachments */}
              <div className="space-y-1.5">
                <Label className="text-xs">Anhänge</Label>
                <div className="flex flex-wrap gap-2">
                  {files.map((f, i) => (
                    <div key={i} className="flex items-center gap-1.5 bg-muted rounded-md px-2.5 py-1.5 text-xs">
                      <Paperclip className="h-3 w-3 text-muted-foreground" />
                      <span className="truncate max-w-[150px]">{f.name}</span>
                      <button type="button" onClick={() => removeFile(i)} className="text-muted-foreground hover:text-foreground">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
                <label className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline cursor-pointer">
                  <Paperclip className="h-3.5 w-3.5" />
                  Datei hinzufügen
                  <input type="file" className="hidden" onChange={handleFileChange} multiple disabled={loading} />
                </label>
              </div>

              <div className="flex gap-3 pt-2">
                <Button type="submit" className="h-9 text-sm" disabled={loading}>
                  {loading && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
                  Ticket absenden
                </Button>
                <Button type="button" variant="outline" className="h-9 text-sm" onClick={() => navigate('/portal/tickets')} disabled={loading}>
                  Abbrechen
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </PortalLayout>
  );
}
