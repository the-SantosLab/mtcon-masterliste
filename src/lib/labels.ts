import QRCode from 'qrcode';

export type LabelItem = { code: string; title: string; sub?: string | null };

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/** Öffnet ein Druckfenster mit QR-Etiketten (62×29 mm, eines pro Seite). Der QR-Code enthält genau den Code. */
export async function printLabels(items: LabelItem[]) {
  if (!items.length) return;
  const w = window.open('', '_blank', 'width=480,height=640');
  if (!w) throw new Error('Druckfenster wurde vom Browser blockiert');
  const parts = await Promise.all(items.map(async (i) => {
    const svg = await QRCode.toString(i.code, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' });
    return `<div class="l"><div class="q">${svg}</div><div class="t"><b>${esc(i.code)}</b><span>${esc(i.title)}</span>${i.sub ? `<small>${esc(i.sub)}</small>` : ''}</div></div>`;
  }));
  w.document.write(`<!doctype html><html><head><title>Etiketten</title><style>
    @page{size:62mm 29mm;margin:0}body{margin:0;font-family:Arial,sans-serif;color:#000}
    .l{width:62mm;height:29mm;box-sizing:border-box;padding:2mm;display:flex;gap:2mm;align-items:center;page-break-after:always;overflow:hidden}
    .q{width:25mm;height:25mm;flex:none}.q svg{width:100%;height:100%}
    .t{display:flex;flex-direction:column;gap:1mm;min-width:0;font-size:8pt;line-height:1.15}
    .t b{font-family:monospace;font-size:10pt;word-break:break-all}.t span{max-height:7mm;overflow:hidden}.t small{font-size:7pt}
  </style></head><body>${parts.join('')}<script>window.onload=()=>{window.print()}</script></body></html>`);
  w.document.close();
}
