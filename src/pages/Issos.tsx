import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Download,
  Search,
  Mail,
  FileText,
  Tag,
  Calendar,
  RefreshCcw,
  ArrowLeft,
} from "lucide-react";

type IssosDoc = {
  id: string;
  intake_id: string;
  source_email_from: string | null;
  source_email_subject: string | null;
  source_email_message_id: string | null;
  received_at: string;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  file_size: number | null;
  sender_hint: string | null;
  snapshot_date: string | null;
  document_type: string | null;
  summary: string | null;
  tags: string[] | null;
  notes: string | null;
  ai_reasoning: string | null;
  status: "new" | "reviewed" | "archived";
  created_at: string;
};

const STATUS_LABEL: Record<IssosDoc["status"], string> = {
  new: "Neu",
  reviewed: "Geprüft",
  archived: "Archiviert",
};

const STATUS_VARIANT: Record<IssosDoc["status"], "default" | "secondary" | "outline"> = {
  new: "default",
  reviewed: "secondary",
  archived: "outline",
};

function formatBytes(n: number | null): string {
  if (!n || n <= 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function Issos() {
  const navigate = useNavigate();
  const [docs, setDocs] = useState<IssosDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | IssosDoc["status"]>("all");
  const [active, setActive] = useState<IssosDoc | null>(null);
  const [notesDraft, setNotesDraft] = useState("");

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("issos_documents")
      .select("*")
      .order("received_at", { ascending: false })
      .limit(500);
    if (error) {
      toast.error("ISSOS-Dokumente konnten nicht geladen werden", { description: error.message });
    } else {
      setDocs((data as IssosDoc[]) || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel("issos_documents_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "issos_documents" },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return docs.filter((d) => {
      if (statusFilter !== "all" && d.status !== statusFilter) return false;
      if (!s) return true;
      return (
        (d.file_name || "").toLowerCase().includes(s) ||
        (d.source_email_subject || "").toLowerCase().includes(s) ||
        (d.source_email_from || "").toLowerCase().includes(s) ||
        (d.sender_hint || "").toLowerCase().includes(s) ||
        (d.summary || "").toLowerCase().includes(s) ||
        (d.tags || []).some((t) => t.toLowerCase().includes(s))
      );
    });
  }, [docs, search, statusFilter]);

  const groupedByIntake = useMemo(() => {
    const map = new Map<string, IssosDoc[]>();
    for (const d of filtered) {
      const arr = map.get(d.intake_id) || [];
      arr.push(d);
      map.set(d.intake_id, arr);
    }
    return Array.from(map.entries()).sort((a, b) => {
      const ta = Math.max(...a[1].map((x) => new Date(x.received_at).getTime()));
      const tb = Math.max(...b[1].map((x) => new Date(x.received_at).getTime()));
      return tb - ta;
    });
  }, [filtered]);

  const openDoc = (d: IssosDoc) => {
    setActive(d);
    setNotesDraft(d.notes || "");
  };

  const downloadDoc = async (d: IssosDoc) => {
    const { data, error } = await supabase.storage
      .from("issos-documents")
      .createSignedUrl(d.storage_path, 300);
    if (error || !data?.signedUrl) {
      toast.error("Download fehlgeschlagen", { description: error?.message });
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener");
  };

  const updateStatus = async (d: IssosDoc, status: IssosDoc["status"]) => {
    const { error } = await (supabase as any)
      .from("issos_documents")
      .update({ status })
      .eq("id", d.id);
    if (error) {
      toast.error("Status konnte nicht geändert werden", { description: error.message });
      return;
    }
    setActive((cur) => (cur && cur.id === d.id ? { ...cur, status } : cur));
    load();
  };

  const saveNotes = async () => {
    if (!active) return;
    const { error } = await (supabase as any)
      .from("issos_documents")
      .update({ notes: notesDraft })
      .eq("id", active.id);
    if (error) {
      toast.error("Notiz konnte nicht gespeichert werden", { description: error.message });
      return;
    }
    toast.success("Notiz gespeichert");
    setActive({ ...active, notes: notesDraft });
    load();
  };

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate('/container')} title="Zurück zum 3D Container">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">ISSOS (APS Delta)</h1>
              <p className="text-sm text-muted-foreground">
                Automatisch erkannte APS-Delta-Eingänge. Jeder Anhang wird einzeln archiviert und ist hier strukturiert auffindbar.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Suchen (Datei, Betreff, Tag …)"
                className="pl-8 w-64"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Status</SelectItem>
                <SelectItem value="new">Neu</SelectItem>
                <SelectItem value="reviewed">Geprüft</SelectItem>
                <SelectItem value="archived">Archiviert</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={load} aria-label="Neu laden">
              <RefreshCcw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Laden…</p>
        ) : groupedByIntake.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              Noch keine APS-Delta-Eingänge erfasst.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {groupedByIntake.map(([intakeId, items]) => {
              const head = items[0];
              return (
                <Card key={intakeId} className="overflow-hidden">
                  <CardContent className="p-0">
                    <div className="px-4 py-3 border-b bg-muted/30 flex flex-wrap items-center gap-x-4 gap-y-1">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <span className="truncate max-w-[28rem]">
                          {head.source_email_subject || "(kein Betreff)"}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {head.source_email_from || "—"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        <Calendar className="inline h-3 w-3 mr-1" />
                        {formatDate(head.received_at)}
                      </span>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {items.length} {items.length === 1 ? "Datei" : "Dateien"}
                      </span>
                    </div>
                    <ul className="divide-y">
                      {items.map((d) => (
                        <li
                          key={d.id}
                          className="px-4 py-3 flex items-center gap-3 hover:bg-muted/40 cursor-pointer"
                          onClick={() => openDoc(d)}
                        >
                          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{d.file_name}</div>
                            <div className="text-xs text-muted-foreground truncate">
                              {d.document_type || "—"}
                              {d.snapshot_date && ` · Stichtag ${d.snapshot_date}`}
                              {d.sender_hint && ` · ${d.sender_hint}`}
                              {` · ${formatBytes(d.file_size)}`}
                            </div>
                            {d.tags && d.tags.length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {d.tags.slice(0, 6).map((t) => (
                                  <Badge key={t} variant="outline" className="text-[10px] py-0">
                                    <Tag className="h-2.5 w-2.5 mr-1" />
                                    {t}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                          <Badge variant={STATUS_VARIANT[d.status]} className="text-[10px]">
                            {STATUS_LABEL[d.status]}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => { e.stopPropagation(); downloadDoc(d); }}
                            aria-label="Herunterladen"
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={!!active} onOpenChange={(o) => { if (!o) setActive(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="break-all pr-6 text-sm md:text-base">{active?.file_name}</DialogTitle>
          </DialogHeader>
          {active && (
            <div className="space-y-3 text-sm break-words">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="break-words"><span className="text-muted-foreground">Typ:</span> {active.document_type || "—"}</div>
                <div className="break-words"><span className="text-muted-foreground">Stichtag:</span> {active.snapshot_date || "—"}</div>
                <div className="break-words"><span className="text-muted-foreground">Eingang:</span> {formatDate(active.received_at)}</div>
                <div className="break-words"><span className="text-muted-foreground">Größe:</span> {formatBytes(active.file_size)}</div>
                <div className="sm:col-span-2 break-all"><span className="text-muted-foreground">Absender:</span> {active.source_email_from || "—"}</div>
                <div className="sm:col-span-2 break-words"><span className="text-muted-foreground">Betreff:</span> {active.source_email_subject || "—"}</div>
              </div>

              {active.summary && (
                <div>
                  <div className="text-muted-foreground mb-1">Zusammenfassung</div>
                  <p className="leading-relaxed whitespace-pre-wrap break-words rounded border bg-muted/20 p-2 text-xs">{active.summary}</p>
                </div>
              )}

              {active.tags && active.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {active.tags.map((t) => (
                    <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>
                  ))}
                </div>
              )}

              {active.ai_reasoning && (
                <div className="rounded border bg-muted/30 p-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">KI-Einordnung: </span>{active.ai_reasoning}
                </div>
              )}

              <div>
                <div className="text-muted-foreground mb-1">Interne Notiz</div>
                <Textarea
                  value={notesDraft}
                  onChange={(e) => setNotesDraft(e.target.value)}
                  rows={3}
                  placeholder="Bemerkung hinzufügen …"
                />
              </div>

              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-xs">Status:</span>
                <Select value={active.status} onValueChange={(v) => updateStatus(active, v as IssosDoc["status"])}>
                  <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">Neu</SelectItem>
                    <SelectItem value="reviewed">Geprüft</SelectItem>
                    <SelectItem value="archived">Archiviert</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            {active && (
              <>
                <Button variant="outline" onClick={() => downloadDoc(active)}>
                  <Download className="h-4 w-4 mr-2" />Datei öffnen
                </Button>
                <Button onClick={saveNotes}>Notiz speichern</Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
