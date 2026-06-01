import { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileText, Upload, Link2, Loader2, ExternalLink, Trash2, Download } from 'lucide-react';
import {
  listLinksForEntity,
  uploadDocument,
  linkDocument,
  unlinkDocument,
  getSignedUrl,
  formatBytes,
  type DocumentEntityType,
  type DocumentRow,
  type DocumentLinkRow,
} from '@/lib/documents';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { LinkDocumentDialog } from './LinkDocumentDialog';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';

interface Props {
  entityType: DocumentEntityType;
  entityId: string;
  title?: string;
}

type Row = DocumentLinkRow & { document: DocumentRow };

export function DocumentSection({ entityType, entityId, title = 'Dokumente' }: Props) {
  const { user } = useAuth();
  const [links, setLinks] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      setLinks(await listLinksForEntity(entityType, entityId));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [entityType, entityId]);

  const onPickFile = () => fileInputRef.current?.click();

  const onFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !user) return;
    setUploading(true);
    try {
      const { document, alreadyExisted } = await uploadDocument({ file, ownerId: user.id });
      await linkDocument({
        documentId: document.id,
        entityType,
        entityId,
        linkedBy: user.id,
      });
      toast.success(
        alreadyExisted
          ? `Bereits vorhandenes Dokument „${document.title}" verknüpft`
          : `„${document.title}" hochgeladen und verknüpft`,
      );
      load();
    } catch (err: any) {
      toast.error('Fehler: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  const onUnlink = async (linkId: string) => {
    if (!confirm('Verknüpfung entfernen? Das Dokument bleibt im Repository.')) return;
    try {
      await unlinkDocument(linkId);
      toast.success('Verknüpfung entfernt');
      load();
    } catch (err: any) {
      toast.error('Fehler: ' + err.message);
    }
  };

  const onDownload = async (doc: DocumentRow) => {
    const url = await getSignedUrl(doc.storage_path);
    if (!url) { toast.error('Download nicht möglich'); return; }
    window.open(url, '_blank');
  };

  return (
    <div className="rounded-md border border-border bg-card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</h3>
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setLinkOpen(true)}>
            <Link2 className="h-3.5 w-3.5 mr-1.5" />Verknüpfen
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onPickFile} disabled={uploading}>
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Upload className="h-3.5 w-3.5 mr-1.5" />}
            Hochladen
          </Button>
          <input ref={fileInputRef} type="file" className="hidden" onChange={onFileSelected} />
        </div>
      </div>

      {loading ? (
        <div className="py-6 flex items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : links.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4 text-center">
          Keine Dokumente verknüpft
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {links.map(l => (
            <li key={l.id} className="flex items-center gap-2 py-2">
              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <Link to={`/documents/${l.document.id}`} className="text-sm font-medium hover:underline truncate">
                    {l.document.title}
                  </Link>
                  <Badge variant="outline" className="text-[9px] px-1 py-0">v{l.document.current_version}</Badge>
                </div>
                <p className="text-[11px] text-muted-foreground truncate">
                  {l.document.file_name} · {formatBytes(l.document.size_bytes)} ·{' '}
                  verknüpft {formatDistanceToNow(new Date(l.linked_at), { addSuffix: true, locale: de })}
                </p>
              </div>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => onDownload(l.document)} title="Herunterladen">
                <Download className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" asChild title="Öffnen">
                <Link to={`/documents/${l.document.id}`}><ExternalLink className="h-3.5 w-3.5" /></Link>
              </Button>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => onUnlink(l.id)} title="Verknüpfung entfernen">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <LinkDocumentDialog
        open={linkOpen}
        onClose={() => setLinkOpen(false)}
        entityType={entityType}
        entityId={entityId}
        onLinked={load}
      />
    </div>
  );
}
