import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const KIND_PRESETS = [
  { value: "system", label: "System", color: "190 90% 55%" },
  { value: "tool", label: "Tool", color: "180 70% 55%" },
  { value: "sop", label: "SOP", color: "260 70% 65%" },
  { value: "process", label: "Prozess", color: "30 90% 60%" },
];

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function CreateCustomNodeDialog({ open, onClose, onCreated }: Props) {
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("system");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!title.trim()) return;
    setSaving(true);
    const preset = KIND_PRESETS.find((k) => k.value === kind);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("map_custom_nodes").insert({
      title: title.trim(),
      kind,
      color: preset?.color ?? null,
      description: description.trim() || null,
      created_by: u.user?.id ?? null,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setTitle("");
    setDescription("");
    onCreated();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Neuer Node</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Titel</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="z. B. Email-Gateway" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Typ</Label>
            <div className="flex flex-wrap gap-1.5">
              {KIND_PRESETS.map((k) => (
                <button
                  key={k.value}
                  type="button"
                  onClick={() => setKind(k.value)}
                  className="px-2.5 py-1 text-[11px] rounded border transition-colors"
                  style={{
                    borderColor: kind === k.value ? `hsl(${k.color})` : "hsl(0 0% 100% / 0.12)",
                    color: kind === k.value ? `hsl(${k.color})` : "hsl(0 0% 100% / 0.55)",
                    background: kind === k.value ? `hsl(${k.color} / 0.12)` : "transparent",
                  }}
                >
                  {k.label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Beschreibung (optional)</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Abbrechen</Button>
          <Button onClick={submit} disabled={saving || !title.trim()}>Anlegen</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
