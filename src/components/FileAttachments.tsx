import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Paperclip, Download, Trash2, Loader2, X, FileText, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
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

  const fetchFiles = async () => {
    const { data, error } = await supabase.storage.from(bucket).list(folder, { sortBy: { column: 'created_at', order: 'desc' } });
    if (!error && data) {
      setFiles(data.filter(f => f.name !== '.emptyFolderPlaceholder') as StorageFile[]);
    }
    setLoading(false);
  };

  useEffect(() => { fetchFiles(); }, [bucket, folder]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(e.target.files)) {
        const path = `${folder}/${Date.now()}_${file.name}`;
        const { error } = await supabase.storage.from(bucket).upload(path, file);
        if (error) throw error;
      }
      toast.success('Datei(en) hochgeladen');
      fetchFiles();
    } catch (err: any) {
      toast.error('Upload fehlgeschlagen: ' + (err.message || ''));
    } finally {
      setUploading(false);
      e.target.value = '';
    }
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
    if (url) window.open(url, '_blank');
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
              className={cn(
                'flex items-center gap-2 rounded-md border border-border bg-muted/30 group',
                compact ? 'px-2 py-1' : 'px-3 py-2'
              )}
            >
              <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-xs text-foreground truncate flex-1">{displayName(f.name)}</span>
              {f.metadata?.size && <span className="text-[10px] text-muted-foreground shrink-0">{formatSize(f.metadata.size)}</span>}
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
        <label className={cn(
          'inline-flex items-center gap-1.5 text-xs cursor-pointer transition-opacity hover:opacity-70 text-primary',
          uploading && 'pointer-events-none opacity-50'
        )}>
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
          {uploading ? 'Wird hochgeladen…' : 'Datei anhängen'}
          <input type="file" className="hidden" onChange={handleUpload} multiple disabled={uploading} />
        </label>
      )}
    </div>
  );
}
