import { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  Folder, FolderOpen, Upload, File, Trash2,
  ChevronRight, ArrowLeft, RefreshCw, Download,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface ProjectFolder {
  id: string;
  name: string;
  path: string;
  sort_order: number;
}

interface StorageFile {
  name: string;
  id: string | null;
  metadata?: { size?: number; mimetype?: string };
  updated_at?: string;
}

interface Project {
  id: string;
  project_number: string;
  project_code: string;
  name: string;
  status: string;
}

function formatBytes(bytes: number): string {
  if (!bytes) return '–';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ProjectFiles() {
  const { id } = useParams<{ id: string }>();
  const { user, isAdmin, isViewer } = useAuth();
  const { preferences } = usePreferences();
  const compact = preferences.compactTables;
  const cellCls = compact ? 'px-3 py-1.5 text-xs' : 'px-4 py-2.5 text-xs';

  const [project, setProject] = useState<Project | null>(null);
  const [folders, setFolders] = useState<ProjectFolder[]>([]);
  const [activeFolder, setActiveFolder] = useState<ProjectFolder | null>(null);
  const [files, setFiles] = useState<StorageFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Load project + folders
  useEffect(() => {
    if (!id) return;
    Promise.all([
      supabase.from('projects').select('id, project_number, project_code, name, status').eq('id', id).single(),
      supabase.from('project_folders').select('*').eq('project_id', id).order('sort_order'),
    ]).then(([projRes, foldersRes]) => {
      if (projRes.data) setProject(projRes.data as Project);
      const f = (foldersRes.data || []) as ProjectFolder[];
      setFolders(f);
      if (f.length > 0) setActiveFolder(f[0]);
    });
  }, [id]);

  // Load files whenever active folder changes
  useEffect(() => {
    if (!activeFolder) return;
    loadFiles(activeFolder.path);
  }, [activeFolder]);

  const loadFiles = async (folderPath: string) => {
    setLoadingFiles(true);
    const { data, error } = await supabase.storage
      .from('project-files')
      .list(folderPath.endsWith('/') ? folderPath.slice(0, -1) : folderPath, { limit: 200 });
    if (error) {
      toast.error('Fehler beim Laden: ' + error.message);
      setFiles([]);
    } else {
      // Filter out .keep placeholder
      setFiles((data || []).filter(f => f.name !== '.keep') as StorageFile[]);
    }
    setLoadingFiles(false);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!activeFolder || !e.target.files?.length) return;
    setUploading(true);
    const file = e.target.files[0];
    const filePath = `${activeFolder.path}${file.name}`;
    const { error } = await supabase.storage
      .from('project-files')
      .upload(filePath, file, { upsert: true });
    if (error) {
      toast.error('Upload fehlgeschlagen: ' + error.message);
    } else {
      toast.success(`${file.name} hochgeladen`);
      loadFiles(activeFolder.path);
    }
    setUploading(false);
    e.target.value = '';
  };

  const handleDelete = async (fileName: string) => {
    if (!activeFolder) return;
    const filePath = `${activeFolder.path}${fileName}`;
    const { error } = await supabase.storage.from('project-files').remove([filePath]);
    if (error) { toast.error('Fehler: ' + error.message); return; }
    toast.success('Datei gelöscht');
    loadFiles(activeFolder.path);
  };

  const handleDownload = async (fileName: string) => {
    if (!activeFolder) return;
    const filePath = `${activeFolder.path}${fileName}`;
    const { data, error } = await supabase.storage.from('project-files').download(filePath);
    if (error || !data) { toast.error('Download fehlgeschlagen'); return; }
    const url = URL.createObjectURL(data);
    const a = document.createElement('a');
    a.href = url; a.download = fileName;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!project) return (
    <AppLayout>
      <div className="text-xs text-muted-foreground p-8">Laden…</div>
    </AppLayout>
  );

  return (
    <AppLayout>
      <div className="space-y-4 max-w-6xl">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link to="/projects" className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">{project.project_number}</span>
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
              <h1 className="text-lg font-semibold text-foreground">{project.name}</h1>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">Datei-Ablage</p>
          </div>
        </div>

        <div className="flex gap-4 h-[calc(100vh-14rem)]">
          {/* Folder Sidebar */}
          <div className="w-52 shrink-0 rounded-md border border-border bg-card overflow-hidden flex flex-col">
            <div className="px-3 py-2.5 border-b border-border">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Ordner</p>
            </div>
            <div className="flex-1 overflow-y-auto py-1">
              {folders.length === 0 ? (
                <p className="px-3 py-4 text-[11px] text-muted-foreground">Keine Ordner</p>
              ) : folders.map(f => (
                <button
                  key={f.id}
                  onClick={() => setActiveFolder(f)}
                  className={cn(
                    'flex items-center gap-2 w-full px-3 py-2 text-xs text-left transition-colors',
                    activeFolder?.id === f.id
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-foreground hover:bg-muted/50',
                  )}
                >
                  {activeFolder?.id === f.id
                    ? <FolderOpen className="h-3.5 w-3.5 shrink-0" />
                    : <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                  <span className="truncate">{f.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* File Area */}
          <div className="flex-1 rounded-md border border-border bg-card overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
              <div className="flex items-center gap-2">
                <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-foreground">{activeFolder?.name || '–'}</span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost" size="sm"
                  onClick={() => activeFolder && loadFiles(activeFolder.path)}
                  className="h-7 text-xs text-muted-foreground"
                >
                  <RefreshCw className="h-3 w-3" />
                </Button>
                {!isViewer && (
                  <>
                    <input ref={fileRef} type="file" className="hidden" onChange={handleUpload} />
                    <Button
                      size="sm"
                      onClick={() => fileRef.current?.click()}
                      disabled={uploading || !activeFolder}
                      className="h-7 text-xs gap-1.5"
                    >
                      <Upload className="h-3.5 w-3.5" />
                      {uploading ? 'Lädt…' : 'Hochladen'}
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* File Table */}
            <div className="flex-1 overflow-y-auto">
              {loadingFiles ? (
                <div className="flex items-center justify-center h-full text-xs text-muted-foreground">Laden…</div>
              ) : files.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-3">
                  <Upload className="h-10 w-10 text-muted-foreground/30" />
                  <p className="text-xs text-muted-foreground">Noch keine Dateien — Datei hochladen</p>
                  {!isViewer && (
                    <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} className="h-7 text-xs">
                      <Upload className="h-3.5 w-3.5 mr-1.5" />Datei wählen
                    </Button>
                  )}
                </div>
              ) : (
                <table className="w-full">
                  <thead className="sticky top-0 bg-card z-10">
                    <tr className="border-b border-border">
                      <th className={cn(cellCls, 'text-left font-medium text-muted-foreground')}>Name</th>
                      <th className={cn(cellCls, 'text-left font-medium text-muted-foreground')}>Typ</th>
                      <th className={cn(cellCls, 'text-left font-medium text-muted-foreground')}>Größe</th>
                      <th className={cn(cellCls, 'text-left font-medium text-muted-foreground')}></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {files.map(f => (
                      <tr key={f.id ?? f.name} className="hover:bg-muted/40 transition-colors group">
                        <td className={cellCls}>
                          <div className="flex items-center gap-2">
                            <File className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="text-foreground truncate max-w-xs">{f.name}</span>
                          </div>
                        </td>
                        <td className={cn(cellCls, 'text-muted-foreground font-mono')}>
                          {f.metadata?.mimetype?.split('/')[1]?.toUpperCase() || '–'}
                        </td>
                        <td className={cn(cellCls, 'text-muted-foreground tabular-nums')}>
                          {formatBytes(f.metadata?.size ?? 0)}
                        </td>
                        <td className={cellCls}>
                          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => handleDownload(f.name)}
                              className="text-muted-foreground hover:text-foreground transition-colors"
                              title="Herunterladen"
                            >
                              <Download className="h-3.5 w-3.5" />
                            </button>
                            {(isAdmin || !isViewer) && (
                              <button
                                onClick={() => handleDelete(f.name)}
                                className="text-muted-foreground hover:text-destructive transition-colors"
                                title="Löschen"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="border-t border-border px-4 py-2 flex items-center justify-between">
              <p className="text-[11px] text-muted-foreground">{files.length} Datei{files.length !== 1 ? 'en' : ''}</p>
              <p className="text-[11px] text-muted-foreground font-mono">{activeFolder?.path}</p>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
