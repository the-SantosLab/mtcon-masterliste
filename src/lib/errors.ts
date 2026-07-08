import { toast } from 'sonner';

type AnyErr = { code?: string; message?: string; details?: string; hint?: string; status?: number } | Error | null | undefined;

export type ErrContext =
  | 'case_note'
  | 'case_chat'
  | 'case_task'
  | 'case_subtask'
  | 'case_email'
  | 'case_attachment'
  | 'case_watcher'
  | 'project_watcher'
  | 'case_status'
  | 'case_assignee'
  | 'case_update'
  | 'storage_upload'
  | 'generic';

interface Friendly {
  title: string;
  description?: string;
}

const PERMISSION_HINT: Record<ErrContext, string> = {
  case_note: 'Du bist weder Ersteller, Bearbeiter noch Watcher dieses Vorgangs. Bitte wende Dich an den Vorgangsverantwortlichen und lasse Dich als Watcher eintragen.',
  case_chat: 'Du kannst in diesem Vorgang nicht chatten. Bitte lasse Dich vom Vorgangsverantwortlichen als Watcher hinzufügen.',
  case_task: 'Du darfst hier keine Aufgabe anlegen oder ändern. Bitte wende Dich an den zuständigen Bearbeiter oder eine Führungskraft der Abteilung.',
  case_subtask: 'Du darfst diese Unteraufgabe nicht ändern. Nur der Ersteller, der Zugewiesene oder eine Führungskraft der Abteilung sind berechtigt.',
  case_email: 'Du darfst in diesem Vorgang keine E-Mails verwalten. Bitte lasse Dich als Watcher eintragen.',
  case_attachment: 'Du darfst hier keine Anhänge hochladen oder löschen. Bitte wende Dich an den Vorgangsverantwortlichen.',
  case_watcher: 'Nur Ersteller, Bearbeiter oder Admins dürfen Watcher verwalten.',
  project_watcher: 'Nur Projektleiter, Ersteller oder Admins dürfen Projekt-Watcher verwalten.',
  case_status: 'Nur der zugewiesene Bearbeiter, eine Führungskraft der Abteilung oder ein Admin darf den Status ändern.',
  case_assignee: 'Du darfst die Zuweisung nicht ändern. Das ist Bearbeitern, Führungskräften oder Admins vorbehalten.',
  case_update: 'Du darfst diesen Vorgang nicht bearbeiten. Bitte lasse Dich vom Vorgangsverantwortlichen als Watcher eintragen.',
  storage_upload: 'Du darfst in diesen Ordner keine Dateien laden. Bitte wende Dich an einen Admin.',
  generic: 'Dir fehlt die nötige Berechtigung. Bitte wende Dich an einen Admin oder den Vorgangsverantwortlichen.',
};

const isPermissionError = (e: AnyErr) => {
  if (!e) return false;
  const code = (e as any).code as string | undefined;
  const msg = (e as any).message as string | undefined;
  const status = (e as any).status as number | undefined;
  if (code === '42501') return true;
  if (status === 401 || status === 403) return true;
  return !!msg && /row[- ]level security|permission denied|not allowed|unauthorized|forbidden/i.test(msg);
};

export function humanizeError(error: AnyErr, context: ErrContext = 'generic', fallback = 'Fehler beim Speichern'): Friendly {
  if (!error) return { title: fallback };
  const code = (error as any).code as string | undefined;
  const msg = ((error as any).message as string | undefined) || '';

  if (isPermissionError(error)) {
    return { title: 'Keine Berechtigung', description: PERMISSION_HINT[context] };
  }
  if (code === '23505') {
    return { title: 'Eintrag existiert bereits', description: 'Ein Datensatz mit diesen Angaben ist bereits vorhanden.' };
  }
  if (code === '23503') {
    return { title: 'Verknüpfung ungültig', description: 'Ein referenzierter Datensatz fehlt oder wurde gelöscht. Bitte Seite neu laden.' };
  }
  if (code === '23502') {
    return { title: 'Pflichtfeld fehlt', description: 'Bitte fülle alle Pflichtfelder aus.' };
  }
  if (code === '23514') {
    return { title: 'Ungültiger Wert', description: msg || 'Der eingegebene Wert ist nicht erlaubt.' };
  }
  if (code === 'PGRST116') {
    return { title: 'Nicht gefunden', description: 'Der Datensatz existiert nicht mehr oder ist für Dich nicht sichtbar.' };
  }
  if (/network|fetch|failed to fetch/i.test(msg)) {
    return { title: 'Verbindung unterbrochen', description: 'Bitte prüfe Deine Internetverbindung und versuche es erneut.' };
  }
  if (/payload too large|exceeded the maximum/i.test(msg)) {
    return { title: 'Datei zu groß', description: 'Die Datei überschreitet das erlaubte Limit.' };
  }
  return { title: fallback, description: msg || undefined };
}

export function toastError(error: AnyErr, context: ErrContext = 'generic', fallback = 'Fehler beim Speichern') {
  const { title, description } = humanizeError(error, context, fallback);
  toast.error(title, description ? { description, duration: 8000 } : undefined);
}
