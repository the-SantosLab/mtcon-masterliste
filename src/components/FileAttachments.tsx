import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Paperclip, Download, Trash2, Loader2, X, FileText, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { toastError } from '@/lib/errors';
import { cn, sanitizeFileName } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface FileAttachmentsProps {
  bucket: string;
  folder: string; // primary folder e.g. "tickets/abc123"
  fallbackFolders?: string[]; // additional read-only folders to merge (legacy paths)
  canUpload?: boolean;
  canDelete?: boolean;
  compact?: boolean;
}

interface StorageFile {
  name: string;
  id: string;
  created_at: string;
  metadata?: { size?: number; mimetype?: string };
  _folder?: string;
}

export function FileAttachments({ bucket, folder, fallbackFolders = [], canUpload = false, canDelete = false, compact = false }: FileAttachmentsProps) {
  const [files, setFiles] = useState<StorageFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const fetchFiles = async () => {
    const folders = [folder, ...fallbackFolders];
    const results = await Promise.all(folders.map(f =>
      supabase.storage.from(bucket).list(f, { sortBy: { column: 'created_at', order: 'desc' } })
        .then(r => (r.data || []).filter(x => x.name !== '.emptyFolderPlaceholder').map(x => ({ ...x, _folder: f } as StorageFile)))
    ));
    setFiles(results.flat());
    setLoading(false);
  };

  useEffect(() => { fetchFiles(); }, [bucket, folder, fallbackFolders.join('|')]);


  const uploadFiles = async (fileList: FileList | File[]) => {
    const arr = Array.from(fileList);
    if (arr.length === 0) return;
    setUploading(true);
    try {
      for (const file of arr) {
        const path = `${folder}/${Date.now()}_${sanitizeFileName(file.name)}`;
        const { error } = await supabase.storage.from(bucket).upload(path, file);
        if (error) throw error;
      }
      toast.success('Datei(en) hochgeladen');
      fetchFiles();
    } catch (err: any) {
      toastError(err, 'storage_upload', 'Upload fehlgeschlagen');
    } finally {
      setUploading(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    await uploadFiles(e.target.files);
    e.target.value = '';
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (!canUpload || uploading) return;
    e.preventDefault();
    if (e.dataTransfer.types.includes('Files')) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    if (!canUpload || uploading) return;
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.length) uploadFiles(e.dataTransfer.files);
  };

  const folderOf = (fileName: string) =>
    files.find(f => f.name === fileName)?._folder || folder;

  const getSignedUrl = async (fileName: string) => {
    const path = `${folderOf(fileName)}/${fileName}`;
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 300);
    if (error || !data?.signedUrl) {
      toast.error('Datei konnte nicht geöffnet werden');
      return null;
    }
    return data.signedUrl;
  };

  // Opens a URL in a new tab WITHOUT ever navigating the current tab.
  // Previously we fell back to `window.location.href = url` when window.open
  // returned null, which on mobile (especially PWA / in-app browsers) caused
  // the app to be unloaded — pressing "Back" then re-mounted the SPA and the
  // session appeared lost ("re-login required"). Using a synthetic anchor
  // click keeps the SPA mounted in all cases.
  const openInNewTab = (url: string, download?: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    if (download) a.download = download;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleOpen = async (fileName: string) => {
    const url = await getSignedUrl(fileName);
    if (!url) return;
    const isPdf = fileName.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      openInNewTab(url);
      return;
    }
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('Fetch fehlgeschlagen');
      const buf = await res.arrayBuffer();
      const blob = new Blob([buf], { type: 'application/pdf' });
      const blobUrl = URL.createObjectURL(blob);
      openInNewTab(blobUrl);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    } catch (err: any) {
      toast.error('PDF konnte nicht geladen werden');
      openInNewTab(url);
    }
  };

  const handleDownload = async (fileName: string) => {
    const path = `${folderOf(fileName)}/${fileName}`;
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 300, { download: true });
    if (error || !data?.signedUrl) {
      toastError(null, 'case_attachment', 'Download fehlgeschlagen');
      return;
    }
    openInNewTab(data.signedUrl, displayName(fileName));
  };

  const handleDelete = async (fileName: string) => {
    if (!window.confirm(`Anhang „${displayName(fileName)}" wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.`)) return;
    const path = `${folderOf(fileName)}/${fileName}`;
    const { error } = await supabase.storage.from(bucket).remove([path]);
    if (error) {
      toastError(null, 'case_attachment', 'Löschen fehlgeschlagen');
      return;
    }
    toast.success('Datei gelöscht');
    fetchFiles();
  };


  const formatSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const displayName = (name: string) => {
    // Remove timestamp prefix: "1234567890_filename.pdf" -> "filename.pdf"
    const match = name.match(/^\d+_(.+)$/);
    return match ? match[1] : name;
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-2">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Anhänge laden…</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {files.length === 0 && !canUpload && (
        <p className="text-xs text-muted-foreground">Keine Anhänge</p>
      )}

      {files.length > 0 && (
        <div className="space-y-1">
          {files.map(f => (
            <div
              key={f.id || f.name}
              data-compact-row
              className={cn(
                'flex items-center gap-2 rounded-md border border-border bg-muted/30 group',
                compact ? 'px-2 py-1' : 'px-3 py-2'
              )}
            >
              <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <button
                onClick={() => handleOpen(f.name)}
                className="text-xs text-primary hover:underline truncate flex-1 text-left"
                title="Datei öffnen"
              >
                {displayName(f.name)}
              </button>
              {f.metadata?.size && <span className="text-[10px] text-muted-foreground shrink-0">{formatSize(f.metadata.size)}</span>}
              <button
                onClick={() => handleOpen(f.name)}
                className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                title="Öffnen"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => handleDownload(f.name)}
                className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                title="Herunterladen"
              >
                <Download className="h-3.5 w-3.5" />
              </button>
              {canDelete && (
                <button
                  onClick={() => handleDelete(f.name)}
                  className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                  title="Anhang löschen"
                  aria-label="Anhang löschen"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {canUpload && (
        <div
          onDragOver={handleDragOver}
          onDragEnter={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            'rounded-md border-2 border-dashed transition-colors px-4 py-3 flex items-center justify-center text-center',
            isDragging
              ? 'border-primary bg-primary/5 text-primary'
              : 'border-muted-foreground/40 text-muted-foreground hover:border-muted-foreground/70',
            uploading && 'opacity-50 pointer-events-none',
          )}
        >
          {isDragging ? (
            <span className="text-xs font-medium">Datei ablegen…</span>
          ) : (
            <label className="inline-flex items-center gap-1.5 text-xs cursor-pointer hover:text-foreground transition-colors">
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
              {uploading ? 'Wird hochgeladen…' : 'Datei anhängen oder hierher ziehen'}
              <input type="file" className="hidden" onChange={handleUpload} multiple disabled={uploading} />
            </label>
          )}
        </div>
      )}
    </div>
  );
}
