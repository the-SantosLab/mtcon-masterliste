import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Paperclip, Download, Trash2, Loader2, X, FileText, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { cn, sanitizeFileName } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface FileAttachmentsProps {
  bucket: string;
  folder: string; // e.g. "tickets/abc123" or "cases/abc123"
  canUpload?: boolean;
  canDelete?: boolean;
  compact?: boolean;
}

interface StorageFile {
  name: string;
  id: string;
  created_at: string;
  metadata?: { size?: number; mimetype?: string };
}

export function FileAttachments({ bucket, folder, canUpload = false, canDelete = false, compact = false }: FileAttachmentsProps) {
  const [files, setFiles] = useState<StorageFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const fetchFiles = async () => {
    const { data, error } = await supabase.storage.from(bucket).list(folder, { sortBy: { column: 'created_at', order: 'desc' } });
    if (!error && data) {
      setFiles(data.filter(f => f.name !== '.emptyFolderPlaceholder') as StorageFile[]);
    }
    setLoading(false);
  };

  useEffect(() => { fetchFiles(); }, [bucket, folder]);

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
      toast.error('Upload fehlgeschlagen: ' + (err.message || ''));
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

  const getSignedUrl = async (fileName: string) => {
    const path = `${folder}/${fileName}`;
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 300);
    if (error || !data?.signedUrl) {
      toast.error('Datei konnte nicht geöffnet werden');
      return null;
    }
    return data.signedUrl;
  };

  const handleOpen = async (fileName: string) => {
    const url = await getSignedUrl(fileName);
    if (!url) return;
    const isPdf = fileName.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      window.open(url, '_blank');
      return;
    }
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('Fetch fehlgeschlagen');
      const buf = await res.arrayBuffer();
      const blob = new Blob([buf], { type: 'application/pdf' });
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, '_blank');
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    } catch (err: any) {
      toast.error('PDF konnte nicht geladen werden');
      window.open(url, '_blank');
    }
  };

  const handleDownload = async (fileName: string) => {
    const path = `${folder}/${fileName}`;
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 300, { download: true });
    if (error || !data?.signedUrl) {
      toast.error('Download fehlgeschlagen');
      return;
    }
    window.open(data.signedUrl, '_blank');
  };

  const handleDelete = async (fileName: string) => {
    const path = `${folder}/${fileName}`;
    const { error } = await supabase.storage.from(bucket).remove([path]);
    if (error) {
      toast.error('Löschen fehlgeschlagen');
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
                  className="text-muted-foreground hover:text-destructive transition-colors shrink-0 opacity-0 group-hover:opacity-100"
                  title="Löschen"
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
