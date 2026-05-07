import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PortalLayout } from '@/components/PortalLayout';
import { usePortalAuth } from '@/contexts/PortalAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, ArrowLeft, Paperclip, X } from 'lucide-react';
import { toast } from 'sonner';
import { sanitizeFileName } from '@/lib/utils';

export default function PortalCreateTicket() {
  const { customer } = usePortalAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [form, setForm] = useState({ title: '', description: '', priority: 'medium' });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) setFiles(prev => [...prev, ...Array.from(e.target.files!)]);
  };

  const removeFile = (idx: number) => setFiles(prev => prev.filter((_, i) => i !== idx));

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
        .insert({ title: form.title, description: form.description, priority: form.priority as any, customer_id: customer!.id })
        .select('id')
        .single();
      if (error) throw error;

      for (const file of files) {
        const path = `tickets/${ticket.id}/${Date.now()}_${sanitizeFileName(file.name)}`;
        await supabase.storage.from('support-attachments').upload(path, file);
      }

      await supabase.from('ticket_messages').insert({
        ticket_id: ticket.id, sender_type: 'customer', sender_id: customer!.auth_user_id, body: form.description,
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
      <div className="space-y-6 max-w-2xl">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/portal/tickets')}
            className="p-2 rounded-xl transition-colors hover:bg-white/5"
            style={{ color: 'hsl(var(--portal-text-secondary))' }}
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'hsl(var(--portal-text))' }}>
              Neues Ticket erstellen
            </h1>
            <p className="text-sm mt-0.5" style={{ color: 'hsl(var(--portal-text-secondary))' }}>
              Beschreiben Sie Ihr Anliegen
            </p>
          </div>
        </div>

        <div className="portal-glass-strong p-6 sm:p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <label className="text-xs font-medium" style={{ color: 'hsl(var(--portal-text-secondary))' }}>
                Betreff <span style={{ color: 'hsl(0, 60%, 60%)' }}>*</span>
              </label>
              <input
                value={form.title}
                onChange={e => setForm({ ...form, title: e.target.value })}
                placeholder="Kurze Zusammenfassung Ihres Anliegens"
                className="portal-input"
                required
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium" style={{ color: 'hsl(var(--portal-text-secondary))' }}>
                Priorität
              </label>
              <select
                value={form.priority}
                onChange={e => setForm({ ...form, priority: e.target.value })}
                className="portal-input"
                disabled={loading}
              >
                <option value="low">Niedrig</option>
                <option value="medium">Mittel</option>
                <option value="high">Hoch</option>
                <option value="critical">Kritisch</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium" style={{ color: 'hsl(var(--portal-text-secondary))' }}>
                Beschreibung <span style={{ color: 'hsl(0, 60%, 60%)' }}>*</span>
              </label>
              <textarea
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                placeholder="Beschreiben Sie Ihr Anliegen so detailliert wie möglich..."
                rows={8}
                className="portal-textarea"
                required
                disabled={loading}
              />
            </div>

            {/* File attachments */}
            <div className="space-y-2">
              <label className="text-xs font-medium" style={{ color: 'hsl(var(--portal-text-secondary))' }}>Anhänge</label>
              <div className="flex flex-wrap gap-2">
                {files.map((f, i) => (
                  <div key={i} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs"
                    style={{ background: 'hsl(var(--portal-surface))', color: 'hsl(var(--portal-text-secondary))' }}>
                    <Paperclip className="h-3 w-3" />
                    <span className="truncate max-w-[150px]">{f.name}</span>
                    <button type="button" onClick={() => removeFile(i)} className="hover:opacity-70">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
              <label className="inline-flex items-center gap-1.5 text-xs cursor-pointer hover:opacity-80 transition-opacity"
                style={{ color: 'hsl(var(--portal-accent))' }}>
                <Paperclip className="h-3.5 w-3.5" />
                Datei hinzufügen
                <input type="file" className="hidden" onChange={handleFileChange} multiple disabled={loading} />
              </label>
            </div>

            <div className="flex gap-3 pt-2">
              <button type="submit" className="portal-btn-primary" disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Ticket absenden
              </button>
              <button
                type="button"
                onClick={() => navigate('/portal/tickets')}
                disabled={loading}
                className="px-5 py-2.5 rounded-xl text-[13px] font-medium transition-colors hover:bg-white/5"
                style={{ color: 'hsl(var(--portal-text-secondary))', border: '1px solid hsl(var(--portal-glass-border) / 0.5)' }}
              >
                Abbrechen
              </button>
            </div>
          </form>
        </div>
      </div>
    </PortalLayout>
  );
}
