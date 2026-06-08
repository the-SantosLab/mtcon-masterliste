import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2, FileStack, FilePlus, SkipForward, FileText } from "lucide-react";

type Signal =
  | { type: "identifier"; value: string }
  | { type: "filename"; similarity: number }
  | { type: "customer"; customer_no: string }
  | { type: "extension"; ext: string };

type Candidate = {
  document_id: string;
  document_title: string;
  current_version: number;
  file_name: string;
  score: number;
  signals: Signal[];
};

type Proposal = {
  attachment_id: string;
  attachment_file_name: string;
  recommended_action: "new_version" | "new_document";
  top_match: Candidate | null;
  alternatives: Candidate[];
  identifiers: string[];
};

type Decision = {
  action: "new_version" | "new_document" | "skip";
  target_document_id?: string;
  change_note?: string;
  new_title?: string;
};

function describeSignal(s: Signal): string {
  switch (s.type) {
    case "identifier": return `Kennung: ${s.value}`;
    case "filename": return `Dateiname ${Math.round(s.similarity * 100)}% ähnlich`;
    case "customer": return `Kunde ${s.customer_no}`;
    case "extension": return `Endung .${s.ext}`;
  }
}

export function DocumentRouteSection({
  draftId,
  proposals,
  onCompleted,
}: {
  draftId: string;
  proposals: Proposal[];
  onCompleted?: () => void;
}) {
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const init: Record<string, Decision> = {};
    for (const p of proposals) {
      init[p.attachment_id] = {
        action: p.recommended_action,
        target_document_id: p.top_match?.document_id,
      };
    }
    setDecisions(init);
  }, [proposals]);

  const update = (id: string, patch: Partial<Decision>) =>
    setDecisions((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  const submit = async () => {
    setBusy(true);
    try {
      const payload = {
        draft_id: draftId,
        decisions: proposals.map((p) => ({
          attachment_id: p.attachment_id,
          ...decisions[p.attachment_id],
        })),
      };
      const { data, error } = await supabase.functions.invoke("mtiq-promote-to-documents", {
        body: payload,
      });
      if (error) throw error;
      const results = (data as any)?.results ?? [];
      const ok = results.filter((r: any) => r.status === "ok").length;
      const skipped = results.filter((r: any) => r.status === "skipped").length;
      const err = results.filter((r: any) => r.status === "error").length;
      if (err > 0) toast.warning(`${ok} übernommen · ${skipped} übersprungen · ${err} Fehler`);
      else toast.success(`${ok} Dokument(e) übernommen${skipped ? ` · ${skipped} übersprungen` : ""}`);
      onCompleted?.();
    } catch (e: any) {
      toast.error(e?.message ?? "Übernahme fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  };

  if (!proposals.length) {
    return (
      <div className="text-sm text-muted-foreground italic">
        Keine analysierbaren Anhänge im Eingang.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Dokumentablage
        </h2>
        <Button
          onClick={submit}
          disabled={busy}
          className="h-9 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white"
        >
          {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileStack className="h-4 w-4 mr-2" />}
          Übernehmen
        </Button>
      </div>

      <div className="space-y-3">
        {proposals.map((p) => {
          const dec = decisions[p.attachment_id] ?? { action: p.recommended_action };
          return (
            <div
              key={p.attachment_id}
              className="rounded-2xl border border-border dark:border-white/10 bg-white/[0.02] backdrop-blur-xl p-4 space-y-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-sm font-medium truncate">{p.attachment_file_name}</span>
                  </div>
                  {p.identifiers.length > 0 && (
                    <div className="text-[11px] text-muted-foreground mt-1">
                      Kennungen: {p.identifiers.join(", ")}
                    </div>
                  )}
                </div>
                <Badge
                  variant="outline"
                  className={
                    p.recommended_action === "new_version"
                      ? "border-amber-500/40 text-amber-600 dark:text-amber-300"
                      : "border-emerald-500/40 text-emerald-600 dark:text-emerald-300"
                  }
                >
                  Empfehlung: {p.recommended_action === "new_version" ? "Neue Version" : "Neu ablegen"}
                </Badge>
              </div>

              {p.top_match && (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-medium">
                      Ähnliches Dokument: {p.top_match.document_title}
                    </div>
                    <Badge variant="outline" className="text-[10px]">
                      v{p.top_match.current_version} → v{p.top_match.current_version + 1}
                    </Badge>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Datei: {p.top_match.file_name}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {p.top_match.signals.map((s, i) => (
                      <Badge key={i} variant="secondary" className="text-[10px]">
                        {describeSignal(s)}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {p.top_match && (
                  <Button
                    size="sm"
                    variant={dec.action === "new_version" ? "default" : "outline"}
                    onClick={() => update(p.attachment_id, { action: "new_version", target_document_id: p.top_match!.document_id })}
                    className="h-8"
                  >
                    <FileStack className="h-3.5 w-3.5 mr-1.5" />
                    Als v{p.top_match.current_version + 1} ablegen
                  </Button>
                )}
                <Button
                  size="sm"
                  variant={dec.action === "new_document" ? "default" : "outline"}
                  onClick={() => update(p.attachment_id, { action: "new_document", target_document_id: undefined })}
                  className="h-8"
                >
                  <FilePlus className="h-3.5 w-3.5 mr-1.5" />
                  Neu ablegen
                </Button>
                <Button
                  size="sm"
                  variant={dec.action === "skip" ? "default" : "outline"}
                  onClick={() => update(p.attachment_id, { action: "skip" })}
                  className="h-8"
                >
                  <SkipForward className="h-3.5 w-3.5 mr-1.5" />
                  Überspringen
                </Button>
              </div>

              {dec.action !== "skip" && (
                <Textarea
                  placeholder={
                    dec.action === "new_version"
                      ? "Versionshinweis (optional, z. B. Änderungsbeschreibung)…"
                      : "Beschreibung / Hinweis (optional)…"
                  }
                  value={dec.change_note ?? ""}
                  onChange={(e) => update(p.attachment_id, { change_note: e.target.value })}
                  rows={2}
                  className="text-xs"
                />
              )}

              {p.alternatives.length > 0 && dec.action === "new_version" && (
                <div className="text-[11px] text-muted-foreground">
                  Weitere Treffer:{" "}
                  {p.alternatives.map((a) => (
                    <button
                      key={a.document_id}
                      onClick={() => update(p.attachment_id, { target_document_id: a.document_id })}
                      className={`underline mr-2 ${dec.target_document_id === a.document_id ? "text-primary" : ""}`}
                    >
                      {a.document_title} (v{a.current_version})
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
