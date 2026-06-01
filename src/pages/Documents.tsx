import { useEffect, useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileText, Upload, Loader2, Search, Archive, Download, ArrowLeft } from 'lucide-react';
import { uploadDocument, getSignedUrl, formatBytes, type DocumentRow } from '@/lib/documents';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';

export default function Documents() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [linkCounts, setLinkCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    let q = supabase.from('documents').select('*').order('updated_at', { ascending: false }).limit(500);
    if (!showArchived) q = q.is('archived_at', null);
    if (query.trim()) {
      const term = `%${query.trim()}%`;
      q = q.or(`title.ilike.${term},description.ilike.${term},file_name.ilike.${term}`);
    }
    const { data } = await q;
    const list = ((data as any) || []) as DocumentRow[];
    setDocs(list);

    if (list.length) {
      const { data: links } = await supabase
        .from('document_links')
        .select('document_id')
        .in('document_id', list.map(d => d.id));
      const counts: Record<string, number> = {};
      ((links as any) || []).forEach((l: any) => {
        counts[l.document_id] = (counts[l.document_id] || 0) + 1;
      });
      setLinkCounts(counts);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [query, showArchived]);

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !user) return;
    setUploading(true);
    try {
      const { alreadyExisted, document } = await uploadDocument({ file, ownerId: user.id });
      toast.success(alreadyExisted ? `Bereits vorhanden: „${document.title}"` : `„${document.title}" hochgeladen`);
      load();
    } catch (err: any) {
      toast.error('Fehler: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  const onDownload = async (doc: DocumentRow) => {
    const url = await getSignedUrl(doc.storage_path);
    if (!url) { toast.error('Download nicht möglich'); return; }
    window.open(url, '_blank');
  };

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-lg font-semibold">Dokumente</h1>
            <p className="text-xs text-muted-foreground">Zentrales Repository — ein Dokument, beliebig viele Verknüpfungen.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setShowArchived(s => !s)}>
              <Archive className="h-3.5 w-3.5 mr-1.5" />
              {showArchived ? 'Aktive zeigen' : 'Archiv zeigen'}
            </Button>
            <Button size="sm" className="h-8 text-xs" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Upload className="h-3.5 w-3.5 mr-1.5" />}
              Neu hochladen
            </Button>
            <input ref={fileRef} type="file" className="hidden" onChange={onUpload} />
          </div>
        </div>

        <div className="relative max-w-md">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Suche…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="pl-8 h-9 text-sm"
          />
        </div>

        <div className="rounded-md border border-border bg-card overflow-hidden">
          {loading ? (
            <div className="py-16 flex items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : docs.length === 0 ? (
            <p className="text-xs text-muted-foreground py-12 text-center">Keine Dokumente</p>
          ) : (
            <table className="w-full text-xs">
              <thead className="border-b border-border bg-muted/30 text-[10px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-3 py-2">Titel</th>
                  <th className="text-left font-medium px-3 py-2">Kategorie</th>
                  <th className="text-right font-medium px-3 py-2">Größe</th>
                  <th className="text-center font-medium px-3 py-2">Version</th>
                  <th className="text-center font-medium px-3 py-2">Verknüpfungen</th>
                  <th className="text-left font-medium px-3 py-2">Geändert</th>
                  <th></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {docs.map(d => (
                  <tr key={d.id} className="hover:bg-muted/30">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <Link to={`/documents/${d.id}`} className="font-medium hover:underline">{d.title}</Link>
                        {d.archived_at && <Badge variant="outline" className="text-[9px] px-1 py-0">archiviert</Badge>}
                      </div>
                      <p className="text-[10px] text-muted-foreground truncate max-w-md">{d.file_name}</p>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{d.category || '—'}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground">{formatBytes(d.size_bytes)}</td>
                    <td className="px-3 py-2 text-center">v{d.current_version}</td>
                    <td className="px-3 py-2 text-center">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">{linkCounts[d.id] || 0}</Badge>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {formatDistanceToNow(new Date(d.updated_at), { addSuffix: true, locale: de })}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => onDownload(d)} title="Herunterladen">
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
