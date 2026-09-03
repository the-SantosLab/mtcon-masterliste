import { useEffect, useState } from 'react';
import { FileText, ExternalLink, Download, Printer, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { MINUTES_FILE_PREFIX } from '@/lib/meeting-minutes-pdf';
import { toast } from 'sonner';

const BUCKET = 'case-attachments';

interface MinutesRow { id: string; storage_path: string; file_name: string; created_at: string; size_bytes: number | null }

/**
 * Button "Protokolle" im Vorgang: listet MTIQ-Besprechungsprotokolle (PDF)
 * mit Anzeigen / Herunterladen / Drucken. Nur sichtbar, wenn Protokolle existieren.
 */
export function CaseMinutesButton({ caseId, refreshKey }: { caseId: string; refreshKey?: number }) {
  const [rows, setRows] = useState<MinutesRow[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const { data } = await (supabase as any)
        .from('case_note_attachments')
        .select('id, storage_path, file_name, created_at, size_bytes')
        .eq('case_id', caseId)
        .like('file_name', `${MINUTES_FILE_PREFIX}%`)
        .order('created_at', { ascending: false });
      if (alive) setRows((data ?? []) as MinutesRow[]);
    };
    void load();
    const ch = supabase.channel(`case-minutes-${caseId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'case_note_attachments', filter: `case_id=eq.${caseId}` }, () => load())
      .subscribe();
    return () => { alive = false; supabase.removeChannel(ch); };
  }, [caseId, refreshKey]);

  if (rows.length === 0) return null;

  const signed = async (r: MinutesRow, download: boolean) => {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(r.storage_path, 300, download ? { download: r.file_name } : undefined);
    if (error || !data?.signedUrl) { toast.error('Protokoll konnte nicht geladen werden'); return null; }
    return data.signedUrl;
  };

  const open = async (r: MinutesRow) => { const u = await signed(r, false); if (u) window.open(u, '_blank', 'noopener'); };
  const download = async (r: MinutesRow) => { const u = await signed(r, true); if (u) window.open(u, '_blank', 'noopener'); };
  const print = async (r: MinutesRow) => {
    setBusyId(r.id);
    try {
      const { data, error } = await supabase.storage.from(BUCKET).download(r.storage_path);
      if (error || !data) throw error ?? new Error('download');
      const url = URL.createObjectURL(data);
      const frame = document.createElement('iframe');
      frame.style.position = 'fixed'; frame.style.right = '0'; frame.style.bottom = '0';
      frame.style.width = '0'; frame.style.height = '0'; frame.style.border = '0';
      frame.src = url;
      frame.onload = () => {
        try { frame.contentWindow?.focus(); frame.contentWindow?.print(); } catch { window.open(url, '_blank', 'noopener'); }
        setTimeout(() => { URL.revokeObjectURL(url); frame.remove(); }, 60_000);
      };
      document.body.appendChild(frame);
    } catch {
      toast.error('Drucken nicht möglich');
    } finally { setBusyId(null); }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
          <FileText className="h-3.5 w-3.5" />Protokolle
          <span className="ml-0.5 rounded-full bg-muted px-1.5 text-[10px] tabular-nums">{rows.length}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-2">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-1 pb-1.5">Besprechungsprotokolle</div>
        <div className="max-h-72 overflow-y-auto space-y-1">
          {rows.map(r => (
            <div key={r.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50">
              <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-xs truncate" title={r.file_name}>{r.file_name}</div>
                <div className="text-[10px] text-muted-foreground">
                  {new Date(r.created_at).toLocaleString('de-DE')}{r.size_bytes ? ` · ${(r.size_bytes / 1024).toFixed(0)} KB` : ''}
                </div>
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                <Button variant="ghost" size="icon" className="h-7 w-7" title="Anzeigen" onClick={() => open(r)}><ExternalLink className="h-3.5 w-3.5" /></Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" title="Herunterladen" onClick={() => download(r)}><Download className="h-3.5 w-3.5" /></Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" title="Drucken" disabled={busyId === r.id} onClick={() => print(r)}>
                  {busyId === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
