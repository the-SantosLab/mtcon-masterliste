import { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, Download, Upload, Loader2, Archive, ArchiveRestore, Save, Trash2 } from 'lucide-react';
import {
  listLinksForDocument, listVersions, addNewVersion, getSignedUrl, formatBytes, unlinkDocument,
  type DocumentRow, type DocumentLinkRow, type DocumentVersionRow,
} from '@/lib/documents';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

const ENTITY_LABEL: Record<string, string> = {
  case: 'Vorgang', project: 'Projekt', company: 'Firma', support_ticket: 'Support-Ticket',
};
const ENTITY_HREF: Record<string, (id: string) => string> = {
  case: id => `/cases/${id}`,
  project: id => `/projects/${id}`,
  company: id => `/crm/companies/${id}`,
  support_ticket: id => `/support/${id}`,
};

export default function DocumentDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [doc, setDoc] = useState<DocumentRow | null>(null);
  const [versions, setVersions] = useState<DocumentVersionRow[]>([]);
  const [links, setLinks] = useState<DocumentLinkRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    const { data } = await supabase.from('documents').select('*').eq('id', id).maybeSingle();
    if (data) {
      const d = data as any as DocumentRow;
      setDoc(d);
      setTitle(d.title);
      setDescription(d.description || '');
      setCategory(d.category || '');
    }
    setVersions(await listVersions(id));
    setLinks(await listLinksForDocument(id));
    setLoading(false);
  };
  useEffect(() => { load(); }, [id]);

  const save = async () => {
    if (!doc) return;
    setSaving(true);
    const { error } = await supabase.from('documents').update({
      title, description: description || null, category: category || null,
    }).eq('id', doc.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Gespeichert');
    load();
  };

  const onNewVersion = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !doc || !user) return;
    const note = prompt('Änderungsnotiz (optional)') || undefined;
    setUploading(true);
    try {
      await addNewVersion({ documentId: doc.id, file, uploadedBy: user.id, changeNote: note });
      toast.success(`Neue Version hochgeladen`);
      load();
    } catch (err: any) {
      toast.error('Fehler: ' + err.message);
    } finally { setUploading(false); }
  };

  const onDownload = async (path: string) => {
    const url = await getSignedUrl(path);
    if (!url) { toast.error('Download nicht möglich'); return; }
    window.open(url, '_blank');
  };

  const onArchiveToggle = async () => {
    if (!doc) return;
    const { error } = await supabase.from('documents').update({
      archived_at: doc.archived_at ? null : new Date().toISOString(),
    }).eq('id', doc.id);
    if (error) { toast.error(error.message); return; }
    toast.success(doc.archived_at ? 'Reaktiviert' : 'Archiviert');
    load();
  };

  const onUnlink = async (linkId: string) => {
    if (!confirm('Verknüpfung entfernen?')) return;
    try { await unlinkDocument(linkId); toast.success('Entfernt'); load(); }
    catch (err: any) { toast.error(err.message); }
  };

  if (loading) return <AppLayout><div className="flex items-center justify-center h-64"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div></AppLayout>;
  if (!doc) return <AppLayout><p className="text-center text-muted-foreground py-12">Dokument nicht gefunden</p></AppLayout>;

  return (
    <AppLayout>
      <div className="space-y-4 max-w-4xl">
        <div>
          <Button variant="ghost" size="sm" asChild className="mb-2">
            <Link to="/documents"><ArrowLeft className="h-4 w-4 mr-1.5" />Zurück</Link>
          </Button>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h1 className="text-lg font-semibold">{doc.title}</h1>
              <p className="text-xs text-muted-foreground">
                {doc.file_name} · {formatBytes(doc.size_bytes)} · v{doc.current_version}
                {doc.archived_at && ' · archiviert'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => onDownload(doc.storage_path)}>
                <Download className="h-3.5 w-3.5 mr-1.5" />Aktuelle Version
              </Button>
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Upload className="h-3.5 w-3.5 mr-1.5" />}
                Neue Version
              </Button>
              <input ref={fileRef} type="file" className="hidden" onChange={onNewVersion} />
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={onArchiveToggle}>
                {doc.archived_at ? <ArchiveRestore className="h-3.5 w-3.5 mr-1.5" /> : <Archive className="h-3.5 w-3.5 mr-1.5" />}
                {doc.archived_at ? 'Reaktivieren' : 'Archivieren'}
              </Button>
            </div>
          </div>
        </div>

        <div className="rounded-md border border-border bg-card p-5 space-y-3">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Metadaten</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] uppercase text-muted-foreground">Titel</label>
              <Input value={title} onChange={e => setTitle(e.target.value)} className="h-8 text-sm" />
            </div>
            <div>
              <label className="text-[10px] uppercase text-muted-foreground">Kategorie</label>
              <Input value={category} onChange={e => setCategory(e.target.value)} className="h-8 text-sm" placeholder="z. B. Vertrag, Datenblatt" />
            </div>
          </div>
          <div>
            <label className="text-[10px] uppercase text-muted-foreground">Beschreibung</label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} className="text-sm" />
          </div>
          <Button size="sm" onClick={save} disabled={saving} className="h-8 text-xs">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
            Speichern
          </Button>
        </div>

        <div className="rounded-md border border-border bg-card p-5 space-y-3">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Verknüpfungen ({links.length})
          </h3>
          {links.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">Keine Verknüpfungen</p>
          ) : (
            <ul className="divide-y divide-border">
              {links.map(l => (
                <li key={l.id} className="flex items-center gap-2 py-2">
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">{ENTITY_LABEL[l.entity_type] || l.entity_type}</Badge>
                  <Link to={ENTITY_HREF[l.entity_type]?.(l.entity_id) || '#'} className="text-sm hover:underline flex-1 truncate font-mono">
                    {l.entity_id}
                  </Link>
                  <span className="text-[11px] text-muted-foreground">{format(new Date(l.linked_at), 'dd.MM.yyyy', { locale: de })}</span>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => onUnlink(l.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-md border border-border bg-card p-5 space-y-3">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Versionen</h3>
          <ul className="divide-y divide-border">
            {versions.map(v => (
              <li key={v.id} className="flex items-center gap-2 py-2">
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">v{v.version_no}</Badge>
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{v.file_name}</p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {formatBytes(v.size_bytes)} · {format(new Date(v.uploaded_at), 'dd.MM.yyyy HH:mm', { locale: de })}
                    {v.change_note ? ` · ${v.change_note}` : ''}
                  </p>
                </div>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => onDownload(v.storage_path)}>
                  <Download className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </AppLayout>
  );
}
