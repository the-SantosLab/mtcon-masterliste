import { supabase } from '@/integrations/supabase/client';
import { sanitizeFileName } from '@/lib/utils';
import { buildMeetingMinutesPdf, minutesFileName, MINUTES_NOTE_PREFIX, type MeetingMinutes } from '@/lib/meeting-minutes-pdf';

// Erkennt Besprechungs-Hinweise auch in zusammengesetzten Wörtern und bei den
// typischen Tippfehlern aus den echten Betreffzeilen (Besprechungsaufzeichnung,
// Besprechungstranskript, Besprechnung, Besprächungsinhalte, Sales Jour Fix …).
// "besprechen"/"besprich" (reines Verb) zählen bewusst nicht als Besprechung.
const MEETING_RE = /\b(besprech(?!en\b|e\b|st\b|t\b)\w*|besprechn\w*|bespräch\w*|transkript\w*|transcript\w*|protokoll\w*|meetings?\w*|jour\s?fix\w*|abstimmungstermin)\b/i;
// Teams-/Meet-Mitschriften: "0 Minuten 3 Sekunden" – ab drei Zeitstempeln gilt ein
// Text als Protokoll-Mitschrift, auch ohne das Wort "Besprechung".
const TRANSCRIPT_STAMP_RE = /\d+\s+Minuten/g;

/** Erkennt, ob eine eingegangene E-Mail eine Besprechung (Transkript/Notizen) enthält. */
export function looksLikeMeeting(subject?: string | null, body?: string | null): boolean {
  const s = subject ?? '';
  const b = (body ?? '').slice(0, 6000);
  if (MEETING_RE.test(s)) return true;
  if (MEETING_RE.test(b) && b.length > 300) return true;
  const stamps = (b.match(TRANSCRIPT_STAMP_RE) ?? []).length;
  return stamps >= 3 && b.length > 300;
}

/** Erzeugt per MTIQ ein Besprechungsprotokoll, legt es als Notiz mit PDF-Anhang im Vorgang ab. */
export async function createMeetingMinutesForCase(opts: {
  vorgangId: string;
  transcript: string;
  meetingDate?: string | null;
  userId: string;
  userEmail?: string | null;
}): Promise<string> {
  const { vorgangId, transcript, userId, userEmail } = opts;
  const meeting_date = (opts.meetingDate ?? new Date().toISOString()).slice(0, 10);
  const { data, error } = await supabase.functions.invoke('mtiq-meeting-minutes', {
    body: { vorgang_id: vorgangId, transcript, meeting_date, participants: '' },
  });
  if (error) throw error;
  if ((data as any)?.error) throw new Error((data as any).error);
  const m: MeetingMinutes = (data as any).minutes;

  const blob = buildMeetingMinutesPdf(m, userEmail ?? null).output('blob');
  const fileName = minutesFileName(m);
  const noteBody = `${MINUTES_NOTE_PREFIX} ${m.title} · ${new Date(m.date).toLocaleDateString('de-DE')}\n\n${m.summary}${m.conclusion ? `\n\nFazit: ${m.conclusion}` : ''}`;
  const { data: note, error: noteErr } = await supabase.from('case_notes')
    .insert({ case_id: vorgangId, body: noteBody, author_id: userId })
    .select('id').single();
  if (noteErr || !note) throw new Error(noteErr?.message ?? 'Notiz konnte nicht angelegt werden');

  const path = `cases/${vorgangId}/notes/${note.id}/${Date.now()}_${sanitizeFileName(fileName)}`;
  const { error: upErr } = await supabase.storage.from('case-attachments').upload(path, blob, { contentType: 'application/pdf' });
  if (upErr) throw new Error(`Upload fehlgeschlagen: ${upErr.message}`);
  const { error: attErr } = await (supabase as any).from('case_note_attachments').insert({
    note_id: note.id, case_id: vorgangId, storage_path: path, file_name: fileName,
    mime_type: 'application/pdf', size_bytes: blob.size, uploaded_by: userId,
  });
  if (attErr) throw new Error(attErr.message);
  return path;
}
