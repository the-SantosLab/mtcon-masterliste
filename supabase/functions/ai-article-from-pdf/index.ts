import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const key = Deno.env.get('LOVABLE_API_KEY');
    if (!key) return new Response(JSON.stringify({ error: 'Missing LOVABLE_API_KEY' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const { file_name, file_data } = await req.json();
    if (!file_data) return new Response(JSON.stringify({ error: 'file_data required (base64 PDF)' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const system = `Du bist ein Experte für elektromechanische Komponenten (Stecker, Pins, Gehäuse).
Extrahiere aus dem PDF-Datenblatt strukturierte Artikeldaten für ein ERP-System.
Gib NUR JSON zurück mit folgenden Feldern (alle optional, leer lassen wenn unklar):
- art_nr (Hersteller-Artikelnummer)
- matchcode (kurzer Suchbegriff, max 20 Zeichen)
- bezeich_1 (Hauptbezeichnung)
- bezeich_2 (Zusatzbezeichnung)
- mat_art (Materialart: ROHM/HALB/FERT/HAND)
- me (Mengeneinheit: ST/KG/M)
- koerper, ausfuehrung, pins, material, galvanik, hoehe, gewinde, pinlaenge, rastermass, dichtring
- erni_nr, ics_nr, eisos_nr, weber_art_nr
- memo_ext (Beschreibung max 500 Zeichen)
- confidence (0-1)
- notes (was unsicher ist)`;

    const body = {
      model: 'google/gemini-2.5-flash',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: [
          { type: 'text', text: 'Extrahiere die Artikeldaten aus diesem Datenblatt.' },
          { type: 'file', file: { filename: file_name ?? 'datasheet.pdf', file_data: `data:application/pdf;base64,${file_data}` } },
        ] },
      ],
      response_format: { type: 'json_object' },
    };

    const r = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Lovable-API-Key': key },
      body: JSON.stringify(body),
    });

    if (!r.ok) {
      const txt = await r.text();
      return new Response(JSON.stringify({ error: `AI ${r.status}`, detail: txt }), { status: r.status === 429 || r.status === 402 ? r.status : 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const json = await r.json();
    const content = json?.choices?.[0]?.message?.content ?? '{}';
    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(content); } catch { parsed = { raw: content }; }

    return new Response(JSON.stringify({ extracted: parsed }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
