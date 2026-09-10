// Lightweight in-memory job queue for client-side PDF generation.
// Läuft die eigentliche jsPDF-Erzeugung in einem Micro-Task / mit await tick,
// so dass der Click sofort zurückkehrt und die UI reagierbar bleibt.
// Der Fortschritt wird über einen Store publiziert und vom PdfJobToaster
// als schwebende Karte gerendert.
export interface PdfDocumentOutput {
  output(type: 'blob'): Blob;
  save(fileName: string): void;
  internal?: {
    getDocumentProperties?: () => { title?: string };
  };
}

export type PdfJobStatus = 'queued' | 'running' | 'done' | 'error';

export interface PdfJob {
  id: string;
  label: string;              // z. B. "Rechnung R-2025-0007"
  status: PdfJobStatus;
  progress: number;           // 0..1
  phase: string;              // "Daten laden", "Layout", "Rendern"
  startedAt: number;
  finishedAt?: number;
  error?: string;
  fileName?: string;
  doc?: PdfDocumentOutput;
  blobUrl?: string;
  // wenn true, öffnet der Toaster nach Fertigstellung automatisch die Vorschau
  autoPreview?: boolean;
  // Callback für Vorschau-Öffnung
  onPreview?: (job: PdfJob) => void;
}

type Listener = () => void;

const jobs = new Map<string, PdfJob>();
const listeners = new Set<Listener>();
let snapshot: PdfJob[] = [];

function emit() {
  snapshot = Array.from(jobs.values()).sort((a, b) => b.startedAt - a.startedAt);
  listeners.forEach(l => l());
}

export const pdfJobs = {
  list(): PdfJob[] { return snapshot; },
  subscribe(l: Listener) { listeners.add(l); return () => listeners.delete(l); },
  get(id: string): PdfJob | undefined { return jobs.get(id); },
  update(id: string, patch: Partial<PdfJob>) {
    const j = jobs.get(id); if (!j) return;
    Object.assign(j, patch);
    emit();
  },
  remove(id: string) {
    const j = jobs.get(id);
    if (j?.blobUrl) URL.revokeObjectURL(j.blobUrl);
    jobs.delete(id);
    emit();
  },
};

const yieldFrame = () => new Promise<void>(resolve => {
  // rAF gibt dem Browser Zeit für Paint/Interaktion vor der nächsten Phase
  if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(() => resolve());
  else setTimeout(resolve, 0);
});

export interface EnqueueOpts {
  label: string;
  build: (report: (phase: string, progress: number) => void) => Promise<{ doc: PdfDocumentOutput; fileName: string }>;
  autoPreview?: boolean;
  onPreview?: (job: PdfJob) => void;
}

export function enqueuePdfJob(opts: EnqueueOpts): string {
  const id = `pdf_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const job: PdfJob = {
    id,
    label: opts.label,
    status: 'queued',
    progress: 0,
    phase: 'Warten',
    startedAt: Date.now(),
    autoPreview: opts.autoPreview,
    onPreview: opts.onPreview,
  };
  jobs.set(id, job);
  emit();

  // Sofort starten, aber asynchron — Click-Handler kehrt zurück.
  (async () => {
    try {
      pdfJobs.update(id, { status: 'running', phase: 'Daten laden', progress: 0.05 });
      await yieldFrame();
      const report = (phase: string, progress: number) => {
        pdfJobs.update(id, { phase, progress: Math.max(0, Math.min(0.95, progress)) });
      };
      const { doc, fileName } = await opts.build(report);
      await yieldFrame();
      const blob = doc.output('blob') as Blob;
      const blobUrl = URL.createObjectURL(blob);
      pdfJobs.update(id, {
        status: 'done', phase: 'Fertig', progress: 1,
        finishedAt: Date.now(), doc, blobUrl, fileName,
      });
      // Auto-Vorschau: gibt dem Toaster Zeit, den Job zu rendern
      if (opts.autoPreview && opts.onPreview) {
        setTimeout(() => {
          const j = pdfJobs.get(id);
          if (j) opts.onPreview!(j);
        }, 50);
      }
    } catch (e: any) {
      pdfJobs.update(id, {
        status: 'error', phase: 'Fehler', progress: 1,
        finishedAt: Date.now(), error: e?.message || String(e),
      });
    }
  })();

  return id;
}
