import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { ImageIcon, Upload, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const db = supabase as any;
const BUCKET = 'article-images';
type Kind = 'drawing' | 'photo';
const LABEL: Record<Kind, string> = { drawing: 'Zeichnung', photo: 'Real / gerendert' };

/** Zwei Bilder je Artikel: Zeichnung und reales/gerendertes Bild. Bearbeitbar für Admins und Mitarbeitende. */
export function ArticleImages({ artNr, editable = false, size = 'md' }: { artNr: string | null | undefined; editable?: boolean; size?: 'sm' | 'md' }) {
  const { isAdmin, role } = useAuth();
  const canEdit = editable && (isAdmin || role === 'staff');
  const [paths, setPaths] = useState<Record<Kind, string | null>>({ drawing: null, photo: null });
  const [urls, setUrls] = useState<Record<Kind, string | null>>({ drawing: null, photo: null });
  const [zoom, setZoom] = useState<string | null>(null);
  const [busy, setBusy] = useState<Kind | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const target = useRef<Kind>('drawing');

  const load = async () => {
    if (!artNr) return;
    const { data } = await db.from('articles').select('drawing_image_path, photo_image_path').eq('art_nr', artNr).maybeSingle();
    const p = { drawing: data?.drawing_image_path ?? null, photo: data?.photo_image_path ?? null };
    setPaths(p);
    const u: Record<Kind, string | null> = { drawing: null, photo: null };
    for (const k of ['drawing', 'photo'] as Kind[]) {
      if (p[k]) u[k] = (await supabase.storage.from(BUCKET).createSignedUrl(p[k]!, 300)).data?.signedUrl ?? null;
    }
    setUrls(u);
  };
  useEffect(() => { setUrls({ drawing: null, photo: null }); load(); }, [artNr]);

  const save = async (next: Record<Kind, string | null>) => {
    const { error } = await db.rpc('set_article_images', { _art_nr: artNr, _drawing: next.drawing, _photo: next.photo });
    if (error) { toast.error(error.message); return false; }
    return true;
  };

  const upload = async (file: File) => {
    const k = target.current;
    if (!file.type.startsWith('image/')) { toast.error('Bitte eine Bilddatei wählen'); return; }
    setBusy(k);
    const path = `${artNr}/${k}-${Date.now()}.${file.name.split('.').pop() || 'jpg'}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true, contentType: file.type });
    if (error) { setBusy(null); toast.error(error.message); return; }
    const old = paths[k];
    if (await save({ ...paths, [k]: path })) {
      if (old) await supabase.storage.from(BUCKET).remove([old]);
      toast.success(`${LABEL[k]} gespeichert`);
      await load();
    }
    setBusy(null);
  };

  const remove = async (k: Kind) => {
    const old = paths[k];
    if (await save({ ...paths, [k]: null })) { if (old) await supabase.storage.from(BUCKET).remove([old]); load(); }
  };

  if (!artNr) return null;
  const box = size === 'sm' ? 'h-12 w-12' : 'h-28 w-28';
  return (
    <div className="flex gap-2">
      {(['drawing', 'photo'] as Kind[]).map((k) => (
        <div key={k} className="space-y-1">
          <div className={cn('relative overflow-hidden rounded border border-border bg-muted flex items-center justify-center', box)}>
            {urls[k] ? <button type="button" className="h-full w-full" onClick={() => setZoom(urls[k])} aria-label={`${LABEL[k]} vergrößern`}>
              <img src={urls[k]!} alt={`${LABEL[k]} ${artNr}`} className="h-full w-full object-contain" /></button>
              : <ImageIcon className="h-4 w-4 text-muted-foreground" />}
            {canEdit && paths[k] && <button type="button" onClick={() => remove(k)} className="absolute right-0.5 top-0.5 rounded bg-background/80 p-0.5" aria-label={`${LABEL[k]} entfernen`}><X className="h-3 w-3" /></button>}
          </div>
          {size === 'md' && <p className="text-[10px] text-muted-foreground">{LABEL[k]}</p>}
          {canEdit && size === 'md' && <Button type="button" size="sm" variant="outline" className="h-6 w-28 text-[10px]" disabled={busy === k}
            onClick={() => { target.current = k; input.current?.click(); }}><Upload className="h-3 w-3" />{paths[k] ? 'Ersetzen' : 'Hochladen'}</Button>}
        </div>
      ))}
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) upload(f); }} />
      <Dialog open={!!zoom} onOpenChange={(o) => !o && setZoom(null)}>
        <DialogContent className="max-w-3xl">{zoom && <img src={zoom} alt={`Artikel ${artNr}`} className="max-h-[75vh] w-full object-contain" />}</DialogContent>
      </Dialog>
    </div>
  );
}
