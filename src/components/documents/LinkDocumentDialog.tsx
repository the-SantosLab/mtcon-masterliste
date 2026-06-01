import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, Search, FileText, Link2 } from 'lucide-react';
import { searchDocuments, linkDocument, type DocumentRow, type DocumentEntityType, formatBytes } from '@/lib/documents';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';

interface Props {
  open: boolean;
  onClose: () => void;
  entityType: DocumentEntityType;
  entityId: string;
  onLinked: () => void;
}

export function LinkDocumentDialog({ open, onClose, entityType, entityId, onLinked }: Props) {
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [linking, setLinking] = useState<string | null>(null);

  const search = async (q: string) => {
    setQuery(q);
    setLoading(true);
    try {
      setResults(await searchDocuments(q));
    } finally {
      setLoading(false);
    }
  };

  const link = async (doc: DocumentRow) => {
    if (!user) return;
    setLinking(doc.id);
    try {
      await linkDocument({
        documentId: doc.id,
        entityType,
        entityId,
        linkedBy: user.id,
      });
      toast.success(`„${doc.title}" verknüpft`);
      onLinked();
      onClose();
    } catch (e: any) {
      toast.error('Verknüpfen fehlgeschlagen: ' + e.message);
    } finally {
      setLinking(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Dokument aus Repository verknüpfen</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              autoFocus
              placeholder="Titel, Dateiname oder Beschreibung suchen…"
              value={query}
              onChange={e => search(e.target.value)}
              className="pl-8 h-9 text-sm"
            />
          </div>

          <div className="max-h-[420px] overflow-y-auto -mx-1 px-1">
            {loading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : results.length === 0 ? (
              <p className="text-xs text-muted-foreground py-8 text-center">
                {query ? 'Keine Treffer' : 'Suche eingeben oder leer lassen für die zuletzt geänderten Dokumente'}
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {results.map(doc => (
                  <li key={doc.id} className="flex items-center gap-3 py-2">
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{doc.title}</p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {doc.file_name} · {formatBytes(doc.size_bytes)} · v{doc.current_version} ·{' '}
                        {formatDistanceToNow(new Date(doc.updated_at), { addSuffix: true, locale: de })}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => link(doc)}
                      disabled={linking === doc.id}
                    >
                      {linking === doc.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <><Link2 className="h-3.5 w-3.5 mr-1.5" />Verknüpfen</>
                      )}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="text-[10px] text-muted-foreground">
            Hinweis: Beim Verknüpfen wird das Dokument für alle, die diese Entität sehen dürfen, lesbar.
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Abbrechen</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
