import { useEffect, useState, useSyncExternalStore } from 'react';
import { pdfJobs, PdfJob } from '@/lib/pdfJobs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FileText, Loader2, CheckCircle2, AlertCircle, X, Download, ExternalLink, Eye } from 'lucide-react';

/**
 * Floating job board bottom-right: zeigt laufende PDF-Jobs mit Fortschritt,
 * fertige Jobs mit "Öffnen / Herunterladen". Vorschau wird als Modal gezeigt.
 * UI blockiert nicht — jsPDF wird asynchron mit rAF-Yields ausgeführt.
 */
export function PdfJobToaster() {
  const list = useSyncExternalStore(
    (cb) => pdfJobs.subscribe(cb),
    () => pdfJobs.list(),
    () => pdfJobs.list(),
  );
  const [preview, setPreview] = useState<PdfJob | null>(null);

  // Auto-Cleanup fertiger Jobs nach 20 s (nur wenn keine Preview offen ist)
  useEffect(() => {
    const t = setInterval(() => {
      const now = Date.now();
      list.forEach(j => {
        if ((j.status === 'done' || j.status === 'error') && j.finishedAt && now - j.finishedAt > 20000) {
          if (preview?.id !== j.id) pdfJobs.remove(j.id);
        }
      });
    }, 5000);
    return () => clearInterval(t);
  }, [list, preview]);

  const visible = list.filter(j => j.status !== 'done' || Date.now() - (j.finishedAt || 0) < 20000);

  return (
    <>
      {visible.length > 0 && (
        <div className="fixed bottom-4 right-4 z-[60] w-80 space-y-2 pointer-events-none">
          {visible.map(job => (
            <JobCard key={job.id} job={job} onPreview={() => setPreview(job)} />
          ))}
        </div>
      )}
      <PreviewDialog job={preview} onClose={() => setPreview(null)} />
    </>
  );
}

function JobCard({ job, onPreview }: { job: PdfJob; onPreview: () => void }) {
  const pct = Math.round(job.progress * 100);
  return (
    <div className="pointer-events-auto rounded-lg border border-border/60 bg-card/95 backdrop-blur shadow-lg p-3 text-sm animate-in slide-in-from-right-5 fade-in duration-200">
      <div className="flex items-start gap-2">
        <div className="mt-0.5">
          {job.status === 'running' && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
          {job.status === 'queued' && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          {job.status === 'done' && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
          {job.status === 'error' && <AlertCircle className="h-4 w-4 text-destructive" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="font-medium truncate">{job.label}</div>
            <button
              type="button"
              onClick={() => pdfJobs.remove(job.id)}
              className="text-muted-foreground hover:text-foreground shrink-0"
              aria-label="Schließen"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {job.status === 'error' ? (job.error || 'Fehler') : job.phase}
          </div>
          {(job.status === 'running' || job.status === 'queued') && (
            <div className="mt-2 h-1 rounded bg-muted overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
          )}
          {job.status === 'done' && (
            <div className="mt-2 flex items-center gap-1.5">
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onPreview}>
                <Eye className="h-3 w-3 mr-1" /> Vorschau
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => job.doc?.save(job.fileName || 'dokument.pdf')}
              >
                <Download className="h-3 w-3 mr-1" /> Download
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PreviewDialog({ job, onClose }: { job: PdfJob | null; onClose: () => void }) {
  const open = !!job;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl w-[95vw] max-h-[92vh] p-0 overflow-hidden flex flex-col">
        <DialogHeader className="px-5 pt-4 pb-2 border-b border-border/50">
          <DialogTitle className="text-sm font-medium flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Vorschau — {job?.label}
            {job?.fileName && (
              <span className="text-xs text-muted-foreground font-normal ml-2">{job.fileName}</span>
            )}
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-[60vh] bg-muted/30">
          {job?.blobUrl && (
            <iframe
              src={`${job.blobUrl}#toolbar=0&navpanes=0`}
              title="PDF-Vorschau"
              className="w-full h-full min-h-[60vh]"
            />
          )}
        </div>
        <DialogFooter className="px-5 py-3 border-t border-border/50 gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => job?.blobUrl && window.open(job.blobUrl, '_blank')}
          >
            <ExternalLink className="h-4 w-4 mr-1" /> In neuem Tab
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => job?.doc?.save(job.fileName || 'dokument.pdf')}
          >
            <Download className="h-4 w-4 mr-1" /> Herunterladen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
