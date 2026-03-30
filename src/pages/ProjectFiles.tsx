import { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import {
  Folder, FolderOpen, FolderPlus, Upload, File, Trash2,
  ChevronRight, ArrowLeft, RefreshCw, Download,
  Users, UserPlus, X, Crown, Pencil, MoreVertical,
} from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

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
}

interface Project {
  id: string;
  project_number: string;
  project_code: string;
  name: string;
  status: string;
  owner_id: string | null;
  created_by: string;
}

interface Member {
  id: string;
  user_id: string;
  role: string;
  profile: { display_name: string; short_code: string } | null;
}

interface Profile {
  id: string;
  display_name: string;
  short_code: string;
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

  // Members state
  const [members, setMembers] = useState<Member[]>([]);
  const [allProfiles, setAllProfiles] = useState<Profile[]>([]);
  const [membersOpen, setMembersOpen] = useState(false);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [addUserId, setAddUserId] = useState('');
  const [addRole, setAddRole] = useState('member');
  const [addingMember, setAddingMember] = useState(false);

  // Folder management
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [editFolderId, setEditFolderId] = useState<string | null>(null);
  const [editFolderName, setEditFolderName] = useState('');
  const [creatingSub, setCreatingSub] = useState(false);

  const isOwner = project && (project.owner_id === user?.id || project.created_by === user?.id);
  const canManageMembers = isAdmin || isOwner;
  const canManageFolders = !isViewer;

  // Load project + folders
  useEffect(() => {
    if (!id) return;
    Promise.all([
      supabase.from('projects').select('id, project_number, project_code, name, status, owner_id, created_by').eq('id', id).single(),
      supabase.from('project_folders').select('*').eq('project_id', id).order('sort_order'),
    ]).then(([projRes, foldersRes]) => {
      if (projRes.data) setProject(projRes.data as Project);
      const f = (foldersRes.data || []) as ProjectFolder[];
      setFolders(f);
      if (f.length > 0) setActiveFolder(f[0]);
    });
    supabase.from('users_profile').select('id, display_name, short_code').eq('active', true).order('display_name')
      .then(r => setAllProfiles((r.data || []) as Profile[]));
  }, [id]);

  // Load members
  const loadMembers = async () => {
    if (!id) return;
    const { data } = await supabase
      .from('project_members')
      .select('id, user_id, role')
      .eq('project_id', id);
    if (data) {
      // enrich with profiles
      const enriched = (data as { id: string; user_id: string; role: string }[]).map(m => ({
        ...m,
        profile: allProfiles.find(p => p.id === m.user_id) ?? null,
      }));
      setMembers(enriched);
    }
  };

  useEffect(() => {
    if (allProfiles.length > 0 && id) loadMembers();
  }, [allProfiles, id]);

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
    if (error) toast.error('Upload fehlgeschlagen: ' + error.message);
    else { toast.success(`${file.name} hochgeladen`); loadFiles(activeFolder.path); }
    setUploading(false);
    e.target.value = '';
  };

  const handleDelete = async (fileName: string) => {
    if (!activeFolder) return;
    const { error } = await supabase.storage.from('project-files').remove([`${activeFolder.path}${fileName}`]);
    if (error) { toast.error('Fehler: ' + error.message); return; }
    toast.success('Datei gelöscht');
    loadFiles(activeFolder.path);
  };

  const handleDownload = async (fileName: string) => {
    if (!activeFolder) return;
    const { data, error } = await supabase.storage.from('project-files').download(`${activeFolder.path}${fileName}`);
    if (error || !data) { toast.error('Download fehlgeschlagen'); return; }
    const url = URL.createObjectURL(data);
    const a = document.createElement('a');
    a.href = url; a.download = fileName;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleAddMember = async () => {
    if (!addUserId || !id) return;
    setAddingMember(true);
    const { error } = await supabase.from('project_members').insert({
      project_id: id, user_id: addUserId, role: addRole,
    });
    if (error) toast.error('Fehler: ' + error.message);
    else { toast.success('Mitglied hinzugefügt'); loadMembers(); }
    setAddingMember(false);
    setAddMemberOpen(false);
    setAddUserId('');
    setAddRole('member');
  };

  const handleRemoveMember = async (memberId: string) => {
    const { error } = await supabase.from('project_members').delete().eq('id', memberId);
    if (error) toast.error('Fehler: ' + error.message);
    else { toast.success('Mitglied entfernt'); loadMembers(); }
  };

  const loadFolders = async () => {
    const { data } = await supabase.from('project_folders').select('*').eq('project_id', id).order('sort_order');
    const f = (data || []) as ProjectFolder[];
    setFolders(f);
    return f;
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim() || !project) return;
    const safeName = newFolderName.trim();
    const basePath = `${project.project_code || project.project_number}/`;
    const path = `${basePath}${safeName}/`;
    const nextOrder = folders.length;
    const { error } = await supabase.from('project_folders').insert({
      project_id: project.id,
      name: safeName,
      path,
      sort_order: nextOrder,
    });
    if (error) { toast.error('Fehler: ' + error.message); return; }
    // Create .keep file in storage to ensure folder exists
    await supabase.storage.from('project-files').upload(`${path}.keep`, new Blob(['']));
    toast.success(`Ordner "${safeName}" erstellt`);
    setNewFolderName('');
    setNewFolderOpen(false);
    const updated = await loadFolders();
    const created = updated.find(f => f.name === safeName);
    if (created) setActiveFolder(created);
  };

  const handleRenameFolder = async () => {
    if (!editFolderId || !editFolderName.trim() || !project) return;
    const folder = folders.find(f => f.id === editFolderId);
    if (!folder) return;
    const basePath = `${project.project_code || project.project_number}/`;
    const newPath = `${basePath}${editFolderName.trim()}/`;
    const { error } = await supabase.from('project_folders').update({
      name: editFolderName.trim(),
      path: newPath,
    }).eq('id', editFolderId);
    if (error) { toast.error('Fehler: ' + error.message); return; }
    toast.success('Ordner umbenannt');
    setEditFolderId(null);
    setEditFolderName('');
    await loadFolders();
    if (activeFolder?.id === editFolderId) {
      setActiveFolder({ ...folder, name: editFolderName.trim(), path: newPath });
    }
  };

  const handleDeleteFolder = async (folderId: string) => {
    const folder = folders.find(f => f.id === folderId);
    if (!folder) return;
    if (!confirm(`Ordner "${folder.name}" wirklich löschen? Dateien im Ordner bleiben im Speicher erhalten.`)) return;
    const { error } = await supabase.from('project_folders').delete().eq('id', folderId);
    if (error) { toast.error('Fehler: ' + error.message); return; }
    toast.success('Ordner gelöscht');
    const updated = await loadFolders();
    if (activeFolder?.id === folderId) {
      setActiveFolder(updated.length > 0 ? updated[0] : null);
    }
  };

  if (!project) return (
    <AppLayout><div className="text-xs text-muted-foreground p-8">Laden…</div></AppLayout>
  );

  const memberIds = new Set(members.map(m => m.user_id));
  const availableProfiles = allProfiles.filter(p => !memberIds.has(p.id));

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
          {/* Members Button */}
          <Button
            variant="outline" size="sm"
            onClick={() => setMembersOpen(true)}
            className="h-8 text-xs gap-1.5"
          >
            <Users className="h-3.5 w-3.5" />
            Team ({members.length})
          </Button>
        </div>

        <div className="flex gap-4 h-[calc(100vh-14rem)]">
          {/* Folder Sidebar */}
          <div className="w-56 shrink-0 rounded-md border border-border bg-card overflow-hidden flex flex-col">
            <div className="px-3 py-2.5 border-b border-border flex items-center justify-between">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Ordner</p>
              {canManageFolders && (
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setNewFolderOpen(true)} title="Neuer Ordner">
                  <FolderPlus className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              )}
            </div>

            {/* New folder inline */}
            {newFolderOpen && (
              <div className="px-2 py-2 border-b border-border space-y-1.5">
                <Input
                  value={newFolderName}
                  onChange={e => setNewFolderName(e.target.value)}
                  placeholder="Ordnername…"
                  className="h-7 text-xs"
                  autoFocus
                  onKeyDown={e => { if (e.key === 'Enter') handleCreateFolder(); if (e.key === 'Escape') { setNewFolderOpen(false); setNewFolderName(''); } }}
                />
                <div className="flex gap-1">
                  <Button size="sm" className="h-6 text-[11px] flex-1" onClick={handleCreateFolder} disabled={!newFolderName.trim()}>Erstellen</Button>
                  <Button variant="ghost" size="sm" className="h-6 text-[11px]" onClick={() => { setNewFolderOpen(false); setNewFolderName(''); }}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto py-1">
              {folders.length === 0 && !newFolderOpen ? (
                <div className="px-3 py-4 text-center">
                  <p className="text-[11px] text-muted-foreground mb-2">Keine Ordner</p>
                  {canManageFolders && (
                    <Button variant="outline" size="sm" className="h-6 text-[11px]" onClick={() => setNewFolderOpen(true)}>
                      <FolderPlus className="h-3 w-3 mr-1" />Ordner erstellen
                    </Button>
                  )}
                </div>
              ) : folders.map(f => (
                <div
                  key={f.id}
                  className={cn(
                    'flex items-center gap-1 w-full px-2 py-1.5 text-xs transition-colors group',
                    activeFolder?.id === f.id
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-foreground hover:bg-muted/50',
                  )}
                >
                  {editFolderId === f.id ? (
                    <div className="flex items-center gap-1 flex-1 min-w-0">
                      <Input
                        value={editFolderName}
                        onChange={e => setEditFolderName(e.target.value)}
                        className="h-6 text-xs flex-1"
                        autoFocus
                        onKeyDown={e => { if (e.key === 'Enter') handleRenameFolder(); if (e.key === 'Escape') setEditFolderId(null); }}
                      />
                      <Button size="sm" className="h-6 px-1.5" onClick={handleRenameFolder}><ChevronRight className="h-3 w-3" /></Button>
                      <Button variant="ghost" size="sm" className="h-6 px-1" onClick={() => setEditFolderId(null)}><X className="h-3 w-3" /></Button>
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={() => setActiveFolder(f)}
                        className="flex items-center gap-2 flex-1 min-w-0 text-left"
                      >
                        {activeFolder?.id === f.id
                          ? <FolderOpen className="h-3.5 w-3.5 shrink-0" />
                          : <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                        <span className="truncate">{f.name}</span>
                      </button>
                      {canManageFolders && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-muted">
                              <MoreVertical className="h-3 w-3 text-muted-foreground" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-36">
                            <DropdownMenuItem className="text-xs gap-2" onClick={() => { setEditFolderId(f.id); setEditFolderName(f.name); }}>
                              <Pencil className="h-3 w-3" />Umbenennen
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-xs gap-2 text-destructive focus:text-destructive" onClick={() => handleDeleteFolder(f.id)}>
                              <Trash2 className="h-3 w-3" />Löschen
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </>
                  )}
                </div>
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
                <Button variant="ghost" size="sm" onClick={() => activeFolder && loadFiles(activeFolder.path)} className="h-7 text-xs text-muted-foreground">
                  <RefreshCw className="h-3 w-3" />
                </Button>
                {!isViewer && (
                  <>
                    <input ref={fileRef} type="file" className="hidden" onChange={handleUpload} />
                    <Button size="sm" onClick={() => fileRef.current?.click()} disabled={uploading || !activeFolder} className="h-7 text-xs gap-1.5">
                      <Upload className="h-3.5 w-3.5" />
                      {uploading ? 'Lädt…' : 'Hochladen'}
                    </Button>
                  </>
                )}
              </div>
            </div>

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
                            <button onClick={() => handleDownload(f.name)} className="text-muted-foreground hover:text-foreground transition-colors" title="Herunterladen">
                              <Download className="h-3.5 w-3.5" />
                            </button>
                            {(isAdmin || !isViewer) && (
                              <button onClick={() => handleDelete(f.name)} className="text-muted-foreground hover:text-destructive transition-colors" title="Löschen">
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

      {/* Members Panel Dialog */}
      <Dialog open={membersOpen} onOpenChange={setMembersOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="text-sm font-semibold flex items-center gap-2">
                <Users className="h-4 w-4" />
                Team-Mitglieder
              </DialogTitle>
              {canManageMembers && (
                <Button size="sm" variant="outline" onClick={() => setAddMemberOpen(true)} className="h-7 text-xs gap-1.5">
                  <UserPlus className="h-3.5 w-3.5" />Hinzufügen
                </Button>
              )}
            </div>
          </DialogHeader>

          <div className="space-y-1 max-h-80 overflow-y-auto">
            {members.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">Keine Mitglieder</p>
            ) : members.map(m => (
              <div key={m.id} className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-muted/50 group">
                <div className="flex items-center gap-2.5">
                  <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-[10px] font-medium text-primary">
                      {m.profile?.short_code?.slice(0, 2).toUpperCase() ?? '?'}
                    </span>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-foreground">{m.profile?.display_name ?? m.user_id}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      {m.role === 'manager' && <Crown className="h-3 w-3 text-amber-500" />}
                      <span className="text-[11px] text-muted-foreground capitalize">{m.role === 'manager' ? 'Projektleiter' : 'Mitglied'}</span>
                    </div>
                  </div>
                </div>
                {canManageMembers && m.user_id !== project?.owner_id && m.user_id !== project?.created_by && (
                  <button
                    onClick={() => handleRemoveMember(m.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Member Dialog */}
      <Dialog open={addMemberOpen} onOpenChange={setAddMemberOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">Mitglied hinzufügen</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Benutzer</Label>
              <Select value={addUserId} onValueChange={setAddUserId}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Benutzer wählen" /></SelectTrigger>
                <SelectContent>
                  {availableProfiles.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.display_name} ({p.short_code})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Rolle</Label>
              <Select value={addRole} onValueChange={setAddRole}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Mitglied</SelectItem>
                  <SelectItem value="manager">Projektleiter</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleAddMember} disabled={!addUserId || addingMember} className="w-full h-8 text-xs">
              {addingMember ? 'Wird hinzugefügt…' : 'Hinzufügen'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
