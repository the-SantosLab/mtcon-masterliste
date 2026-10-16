import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Camera, CameraOff, ScanLine } from 'lucide-react';

/** Kamera-Scanner (Barcode/QR) mit Eingabefeld für Handscanner oder manuelle Eingabe. */
export function CameraScanner({ onScan }: { onScan: (code: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const controls = useRef<IScannerControls | null>(null);
  const last = useRef<{ code: string; at: number }>({ code: '', at: 0 });
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState('');

  const stop = () => { controls.current?.stop(); controls.current = null; setActive(false); };
  useEffect(() => stop, []);

  const start = async () => {
    setError(null);
    try {
      const reader = new BrowserMultiFormatReader();
      setActive(true);
      controls.current = await reader.decodeFromConstraints(
        { video: { facingMode: { ideal: 'environment' } } }, video.current!,
        (res) => {
          if (!res) return;
          const code = res.getText(); const now = Date.now();
          if (code === last.current.code && now - last.current.at < 2500) return;
          last.current = { code, at: now };
          navigator.vibrate?.(60);
          onScan(code);
        });
    } catch (e: any) {
      setActive(false);
      setError(e?.name === 'NotAllowedError' ? 'Kamerazugriff wurde verweigert. Bitte in den Browser-Einstellungen erlauben.' : 'Kamera nicht verfügbar. Code bitte unten eingeben.');
    }
  };

  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-lg border border-border bg-muted aspect-[4/3]">
        <video ref={video} className={`h-full w-full object-cover ${active ? '' : 'hidden'}`} muted playsInline />
        {!active && <div className="absolute inset-0 flex items-center justify-center text-muted-foreground"><ScanLine className="h-10 w-10" /></div>}
        {active && <div className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 bg-primary/80" />}
      </div>
      <Button type="button" className="w-full h-11" variant={active ? 'outline' : 'default'} onClick={active ? stop : start}>
        {active ? <><CameraOff className="h-4 w-4 mr-2" />Kamera stoppen</> : <><Camera className="h-4 w-4 mr-2" />Kamera starten</>}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (manual.trim()) { onScan(manual); setManual(''); } }}>
        <Input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Artikelnummer eingeben oder Handscanner" className="h-11" aria-label="Code eingeben" />
        <Button type="submit" variant="outline" className="h-11">OK</Button>
      </form>
    </div>
  );
}
