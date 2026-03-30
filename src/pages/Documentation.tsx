import { useRef, useCallback, useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { Badge, Rule, Card, Table, Code, Tip, Warning, SubHeading } from '@/components/docs/DocComponents';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import {
  Moon, Building2, FolderOpen, Hash, Shield, Users, Layers,
  GitBranch, Lock, LayoutDashboard, ClipboardList, Search,
  FolderKanban, Settings, Bell, FileUp, UserPlus, Eye,
  KeyRound, Database, BarChart3, Columns, BookOpen, Printer, List,
  Headphones, Globe, Network, Workflow, Lightbulb, FolderPlus, Plug,
} from 'lucide-react';

interface Section {
  id: string;
  label: string;
  icon: React.ElementType;
}

const SECTIONS: Section[] = [
  { id: 'overview', label: 'Übersicht', icon: Layers },
  { id: 'login', label: 'Anmeldung & Zugang', icon: KeyRound },
  { id: 'navigation', label: 'Navigation & Layout', icon: LayoutDashboard },
  { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
  { id: 'cases', label: 'Vorgänge', icon: ClipboardList },
  { id: 'workflow', label: 'Workflow & Automatisierung', icon: Workflow },
  { id: 'autofill', label: 'Autofill & Lernfunktion', icon: Lightbulb },
  { id: 'projects', label: 'Projekte', icon: FolderKanban },
  { id: 'files', label: 'Dateiablage', icon: FileUp },
  { id: 'support', label: 'Support-Tickets', icon: Headphones },
  { id: 'portal', label: 'Kundenportal', icon: Globe },
  { id: 'attachments', label: 'Anhänge & Dokumente', icon: FileUp },
  { id: 'darkmode', label: 'Dark Mode & Tabellen', icon: Moon },
  { id: 'departments', label: 'Abteilungen', icon: Building2 },
  { id: 'numbering', label: 'Auto-Nummerierung', icon: Hash },
  { id: 'roles', label: 'Rollen & Rechte', icon: Shield },
  { id: 'admin', label: 'Admin-Verwaltung', icon: Settings },
  { id: 'notifications', label: 'Benachrichtigungen', icon: Bell },
  { id: 'search', label: 'Suche & Kommandos', icon: Search },
  { id: 'api', label: 'API-Schnittstelle', icon: Plug },
  { id: 'rls', label: 'RLS-Logik & Policies', icon: Lock },
  { id: 'schema', label: 'Datenmodell', icon: GitBranch },
  { id: 'shortcuts', label: 'Tastenkürzel', icon: Columns },
];

export default function Documentation() {
  const contentRef = useRef<HTMLDivElement>(null);
  const [tocOpen, setTocOpen] = useState(false);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  const tocLinks = (onNavigate?: () => void) => (
    <>
      {SECTIONS.map(s => (
        <a
          key={s.id}
          href={`#${s.id}`}
          onClick={onNavigate}
          className="flex items-center gap-2 px-2 py-1.5 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
        >
          <s.icon className="h-3 w-3 shrink-0" />
          {s.label}
        </a>
      ))}
    </>
  );

  return (
    <AppLayout>
      <div className="flex gap-6 max-w-6xl">
        {/* Mobile TOC Button */}
        <div className="fixed bottom-4 right-4 z-40 lg:hidden print:hidden">
          <Sheet open={tocOpen} onOpenChange={setTocOpen}>
            <SheetTrigger asChild>
              <Button size="icon" className="h-11 w-11 rounded-full shadow-lg">
                <List className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0">
              <SheetHeader className="px-4 pt-4 pb-2">
                <SheetTitle className="text-sm">Inhaltsverzeichnis</SheetTitle>
              </SheetHeader>
              <div className="px-2 pb-4 space-y-0.5 overflow-y-auto max-h-[calc(100vh-5rem)]">
                {tocLinks(() => setTocOpen(false))}
              </div>
            </SheetContent>
          </Sheet>
        </div>

        {/* Sidebar TOC */}
        <div className="hidden lg:block w-48 shrink-0">
          <div className="sticky top-0 space-y-0.5 pt-1 max-h-[calc(100vh-6rem)] overflow-y-auto">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-2 pb-2">Inhalt</p>
            {tocLinks()}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 space-y-5 min-w-0 print-content" ref={contentRef}>

          {/* ─── ÜBERSICHT ─── */}
          <div id="overview">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <h1 className="text-lg font-semibold text-foreground">Masterliste — Dokumentation</h1>
                <div className="flex items-center gap-2 mt-1">
                  <Badge color="primary">v3.0</Badge>
                  <span className="text-[11px] text-muted-foreground">Vollständige Benutzer- und Systemdokumentation</span>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrint}
                className="h-8 text-xs gap-1.5 print:hidden shrink-0"
              >
                <Printer className="h-3.5 w-3.5" />
                PDF / Drucken
              </Button>
            </div>

            <Card title="Was ist Masterliste?" id="overview-card">
              <p>
                <strong className="text-foreground">Masterliste</strong> ist eine web-basierte Projekt- und Vorgangsmanagement-Anwendung,
                die speziell für die zentrale Erfassung, Zuweisung und Bearbeitung von Vorgängen (Cases) und Projekten entwickelt wurde. 
                Die Software bietet ein Excel-ähnliches Masterlisten-Konzept, erweitert um digitale Workflows, automatische Nummerierung, 
                Dateiverwaltung, Support-Ticketing mit Kundenportal und Echtzeit-Benachrichtigungen.
              </p>

              <SubHeading>Kernfunktionen auf einen Blick</SubHeading>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {[
                  ['📋', 'Vorgangsverwaltung', 'Erstellen, zuweisen, bearbeiten — mit Audit-Trail, Unteraufgaben und Auto-Workflow'],
                  ['📁', 'Projektverwaltung', 'Projekte mit automatischer Ordnerstruktur und Team-Management'],
                  ['📊', 'Dashboard & KPIs', 'Echtzeit-Übersicht mit Status-Verteilung und Auslastungs-Charts'],
                  ['🎫', 'Support-Tickets', 'Ticketsystem für Kundenanfragen mit Prioritäten und Chat-Verlauf'],
                  ['🌐', 'Kundenportal', 'Eigenständiges Portal unter /portal für externe Kunden'],
                  ['📎', 'Anhänge & Dokumente', 'Dateien direkt an Vorgänge und Tickets anhängen, öffnen und herunterladen'],
                  ['🔐', 'Rollen & RLS', '3-stufiges Rollensystem mit Row-Level-Security auf Datenbankebene'],
                  ['🌙', 'Dark Mode', 'Glassmorphism Dark-Theme als Standard, umschaltbar pro User'],
                  ['⚡', 'Workflow-Automatisierung', 'Unteraufgaben mit Abteilungszuweisung und automatischem Weiterschieben'],
                  ['💡', 'Autofill & Lernfunktion', 'Intelligente Vorschläge basierend auf bisherigen Vorgängen'],
                  ['👤', 'Inline-Erstellung', 'Kunden und Produkte direkt beim Vorgang erstellen'],
                  ['#️⃣', 'Auto-Nummerierung', 'Atomare Projekt-, Vorgang- und Ticket-Nummern'],
                  ['🔔', 'Benachrichtigungen', 'Echtzeit-Notifications bei Statusänderungen'],
                  ['🔌', 'REST API', 'Externe API-Schnittstelle mit Bearer-Token für Dashboard-Integration'],
                  ['⌘', 'Command Palette', 'Schnellsuche via ⌘K / Ctrl+K'],
                  ['📂', 'Ordner-Verwaltung', 'Ordner erstellen, umbenennen und löschen in der Dateiablage'],
                ].map(([icon, title, desc]) => (
                  <div key={title} className="rounded border border-border bg-muted/30 px-3 py-2.5">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span>{icon}</span>
                      <span className="text-xs font-medium text-foreground">{title}</span>
                    </div>
                    <p className="text-[11px]">{desc}</p>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* ─── ANMELDUNG ─── */}
          <Card title="Anmeldung & Zugang" id="login">
            <p>
              Der Zugang zur Anwendung erfolgt über die Login-Seite unter <Badge color="primary">/auth</Badge>. 
              Es gibt <strong className="text-foreground">keine öffentliche Registrierung</strong> — neue Benutzer werden ausschließlich 
              von Administratoren über die Mitarbeiterverwaltung angelegt.
            </p>

            <SubHeading>Login-Prozess</SubHeading>
            <div className="space-y-1 mt-1">
              <Rule label="E-Mail + Passwort" value="Standard-Anmeldung über E-Mail und Passwort" color="success" />
              <Rule label="Passwort vergessen" value="Link auf der Login-Seite → E-Mail mit Reset-Link wird gesendet" color="success" />
              <Rule label="Passwort zurücksetzen" value="Über /reset-password — Link ist 24h gültig" color="success" />
              <Rule label="Passwort ändern" value="Im Profil-Dropdown (Sidebar unten) → Passwort ändern (min. 8 Zeichen)" color="success" />
            </div>

            <SubHeading>Erstanmeldung neuer Benutzer</SubHeading>
            <p>
              Ein Admin legt den Benutzer an (Verwaltung → Mitarbeiter → «Neuer Mitarbeiter»). 
              Der Benutzer erhält automatisch einen Account und muss dann über «Passwort vergessen» sein eigenes Passwort setzen.
            </p>

            <Warning>
              Es gibt keine Selbstregistrierung. Alle Benutzerkonten werden zentral vom Admin erstellt.
            </Warning>
          </Card>

          {/* ─── NAVIGATION ─── */}
          <Card title="Navigation & Layout" id="navigation">
            <p>
              Die Anwendung verwendet ein Sidebar-Layout mit einer festen linken Navigation und einem Hauptinhaltsbereich rechts.
              Das Design nutzt ein Premium Glassmorphism-Theme mit halbtransparenten Oberflächen und Backdrop-Blur-Effekten.
            </p>

            <SubHeading>Hauptnavigation (Sidebar)</SubHeading>
            <Table
              headers={['Menüpunkt', 'Route', 'Beschreibung']}
              rows={[
                ['Suche', '⌘K', 'Öffnet die Command Palette (Schnellsuche)'],
                ['Dashboard', '/', 'Übersicht mit KPIs und eigenen Vorgängen'],
                ['Vorgänge', '/cases', 'Masterliste aller Vorgänge mit Filtern'],
                ['Kanban', '/cases/kanban', 'Kanban-Board-Ansicht der Vorgänge'],
                ['Projekte', '/projects', 'Projektliste mit Status und Sichtbarkeit'],
                ['Support', '/support', 'Support-Tickets von Kunden verwalten'],
                ['Dokumentation', '/docs', 'Diese Seite'],
              ]}
            />

            <SubHeading>Admin-Navigation (nur für Admins sichtbar)</SubHeading>
            <Table
              headers={['Menüpunkt', 'Route', 'Beschreibung']}
              rows={[
                ['Dashboard', '/admin/dashboard', 'Erweitertes Dashboard mit Charts und Statistiken'],
                ['Mitarbeiter', '/admin/users', 'Benutzerverwaltung: Rollen, Abteilungen, Status'],
                ['Abteilungen', '/admin/departments', 'Abteilungen anlegen und verwalten'],
                ['Stammdaten', '/admin/master-data', 'Kunden, Produkte, Bereiche, CSV-Import'],
              ]}
            />

            <SubHeading>Profil-Dropdown (unten links in der Sidebar)</SubHeading>
            <p>Über das Profil-Menü können folgende Einstellungen vorgenommen werden:</p>
            <div className="space-y-1 mt-1">
              <Rule label="Dark/Light Mode" value="Umschalter zwischen Hell- und Dunkel-Modus" color="success" />
              <Rule label="Tabellen kompakt/normal" value="Reduziert das Padding in allen Tabellen" color="success" />
              <Rule label="Passwort ändern" value="Dialog zum Ändern des eigenen Passworts (min. 8 Zeichen)" color="success" />
              <Rule label="Abmelden" value="Beendet die aktuelle Sitzung" color="warn" />
            </div>

            <SubHeading>Responsive Design</SubHeading>
            <p>
              Auf Mobilgeräten wird die Sidebar ausgeblendet und über ein Hamburger-Menü (☰) erreichbar. 
              Die Benachrichtigungs-Glocke und Suche sind in der mobilen Kopfzeile verfügbar.
            </p>
          </Card>

          {/* ─── DASHBOARD ─── */}
          <Card title="Dashboard" id="dashboard">
            <p>
              Das Dashboard (<Badge color="primary">/</Badge>) zeigt eine Echtzeit-Übersicht aller Vorgänge mit automatischer Aktualisierung 
              via Realtime-Subscription.
            </p>

            <SubHeading>KPI-Karten (oben)</SubHeading>
            <Table
              headers={['KPI', 'Beschreibung']}
              rows={[
                ['Offen', 'Vorgänge mit Status „Nicht begonnen"'],
                ['In Arbeit', 'Vorgänge mit Status „In Arbeit" oder „In Planung"'],
                ['In Verzug', 'Vorgänge mit Status „In Verzug" oder überschrittenem Endtermin'],
                ['Heute fällig', 'Vorgänge deren Endtermin heute ist'],
                ['Diese Woche', 'Vorgänge die in den nächsten 7 Tagen fällig sind'],
              ]}
            />

            <SubHeading>Listen-Bereiche</SubHeading>
            <div className="space-y-1 mt-1">
              <Rule label="Meine Vorgänge" value="Aktive Vorgänge, die dem eingeloggten Benutzer zugewiesen sind (max. 10)" color="success" />
              <Rule label="Frei zum Abholen" value="Nicht zugewiesene, aktive Vorgänge — können per Klick ‚abgeholt' werden" color="success" />
            </div>

            <Tip>
              Beide Listen sind Links — ein Klick auf «Alle anzeigen» führt zur Vorgangsliste mit voreingestelltem Filter.
            </Tip>

            <SubHeading>Admin Dashboard</SubHeading>
            <p>
              Unter <Badge color="primary">/admin/dashboard</Badge> (nur für Admins) gibt es ein erweitertes Dashboard mit:
            </p>
            <div className="space-y-1 mt-1">
              <Rule label="Statusverteilung" value="Donut-Chart der aktiven Vorgänge nach Status" color="success" />
              <Rule label="Auslastung" value="Horizontales Balkendiagramm: aktive Vorgänge pro Bearbeiter + davon in Verzug" color="success" />
              <Rule label="Zeitfilter" value="Filter nach Gesamt / 7 Tage / 30 Tage / Quartal" color="success" />
              <Rule label="Echtzeit" value="Automatische Aktualisierung bei Datenänderungen" color="success" />
            </div>
          </Card>

          {/* ─── VORGÄNGE ─── */}
          <Card title="Vorgänge (Cases)" id="cases">
            <p>
              Vorgänge sind die zentrale Arbeitseinheit im System. Sie repräsentieren einzelne Aufgaben, Aufträge 
              oder Arbeitspakete, die einem Bearbeiter zugewiesen und durch verschiedene Status geführt werden.
            </p>

            <SubHeading>Vorgangsliste (/cases)</SubHeading>
            <p>Die Masterliste zeigt alle Vorgänge in Tabellenform mit folgenden Spalten:</p>
            <Table
              headers={['Spalte', 'Beschreibung']}
              rows={[
                ['Status', 'Farbkodierter Status-Badge'],
                ['Nr.', 'Automatisch vergebene Vorgangsnummer (VOR-YYYY-nnnn)'],
                ['Projektname', 'Bezeichnung des Vorgangs'],
                ['Projekt', 'Verknüpftes Projekt (falls vorhanden) mit Projekt-Nr.'],
                ['Bearbeiter', 'Kürzel des zugewiesenen Mitarbeiters'],
                ['Abteilung', 'Zugeordnete Abteilung des Vorgangs'],
                ['Kunde', 'Kundennummer'],
                ['Endtermin', 'Fälligkeitsdatum'],
                ['Aktionen', 'Abholen / Freigeben / Abschließen'],
              ]}
            />

            <SubHeading>Filter-Optionen</SubHeading>
            <div className="space-y-1 mt-1">
              <Rule label="Textsuche" value="Durchsucht Vorgangsnr., Projektname, Kunde, Artikelnr., verknüpftes Projekt" color="success" />
              <Rule label="Status-Filter" value="Alle 9 Status-Werte einzeln filterbar" color="success" />
              <Rule label="Bearbeiter-Filter" value="Alle Mitarbeiter + ‚Nicht zugewiesen'" color="success" />
              <Rule label="Projekt-Filter" value="Alle aktiven Projekte + ‚Ohne Projekt'" color="success" />
              <Rule label="Abteilungs-Filter" value="Alle Abteilungen + ‚Ohne Abteilung' — inkludiert Unter-Abteilungen (Teams)" color="success" />
              <Rule label="‚Nur meine'" value="Toggle-Button — zeigt nur eigene zugewiesene Vorgänge (wird im LocalStorage gespeichert)" color="success" />
            </div>

            <SubHeading>Vorgang-Status-Workflow</SubHeading>
            <Table
              headers={['Status', 'Bedeutung', 'Farbe']}
              rows={[
                ['Nicht begonnen', 'Vorgang erstellt, noch nicht bearbeitet', 'Grau'],
                ['In Planung', 'Planung läuft, noch nicht aktiv bearbeitet', 'Blau'],
                ['In Arbeit', 'Aktive Bearbeitung durch zugewiesenen Mitarbeiter', 'Gelb/Orange'],
                ['In Verzug', 'Endtermin überschritten oder manuell markiert', 'Rot'],
                ['Abgeschlossen', 'Vorgang erfolgreich fertiggestellt', 'Grün'],
                ['Zur Prüfung', 'Alle Unteraufgaben erledigt — Vorgang wartet auf Freigabe/Prüfung', 'Amber'],
                ['Blockiert', 'Workflow-Problem: nächste Unteraufgabe hat keine Abteilung', 'Rot/Destructive'],
                ['Verworfen', 'Vorgang wurde abgelehnt/storniert', 'Rot/Grau'],
                ['Archiv', 'Abgelegter Vorgang, nicht mehr aktiv', 'Grau'],
              ]}
            />

            <SubHeading>Aktionen auf Vorgänge</SubHeading>
            <Table
              headers={['Aktion', 'Wer', 'Bedingung']}
              rows={[
                ['Abholen (Claim)', 'Staff / Admin', 'Vorgang hat keinen Bearbeiter und ist nicht abgeschlossen'],
                ['Freigeben (Unclaim)', 'Zugewiesener User', 'Vorgang ist nicht abgeschlossen'],
                ['Abschließen', 'Zugewiesener User / Admin', 'Vorgang ist nicht abgeschlossen'],
                ['Status ändern', 'Zugewiesener User / Admin', 'Im Vorgang-Detail, über Dropdown'],
                ['Abteilung verschieben', 'Staff / Admin', 'Setzt Status auf „Nicht begonnen", entfernt Bearbeiter und Startzeitpunkt — Vorgang ist wieder abholbereit'],
              ]}
            />

            <SubHeading>Vorgang erstellen</SubHeading>
            <p>Über den Button «Neuer Vorgang» in der Vorgangsliste (nur Staff/Admin). Die Vorgangsnummer wird automatisch vergeben.</p>
            <div className="space-y-1 mt-1">
              <Rule label="Projektname" value="Beschreibender Name des Vorgangs (Pflichtfeld)" color="warn" />
              <Rule label="Vorgangsnummer" value="Wird automatisch als VOR-YYYY-nnnn vergeben (kein manuelles Eingabefeld)" color="success" />
              <Rule label="Kunde" value="Autocomplete-Auswahl bestehender Kunden oder inline ‚Neuen Kunden erstellen'" color="success" />
              <Rule label="Produkt" value="Freitext + Vorschläge aus Produktliste — neue Produkte werden automatisch gespeichert" color="success" />
              <Rule label="Abteilung & Team" value="Abteilung wählen, optional Unter-Abteilung (Team)" color="success" />
              <Rule label="Zuständig" value="Mitarbeiter innerhalb der gewählten Abteilung zuweisen" color="success" />
              <Rule label="Projektinfos" value="SOP, Menge, Projektdauer — eigener Bereich für erweiterte Informationen" color="success" />
              <Rule label="Anhänge" value="Dateien können direkt beim Erstellen angehängt werden" color="success" />
            </div>
            <p className="mt-2">
              Optionale Felder: Verknüpftes Projekt, Kunde, Auftraggeber, Produkt, Bereich intern, 
              Projekt-/Artikelnr., Auftragseingang, Endtermin, Notiz, geschätzte Stunden, SOP, Menge, Projektdauer.
            </p>

            <SubHeading>Inline-Erstellung von Kunden & Produkten</SubHeading>
            <p>
              Beim Erstellen eines Vorgangs können <strong className="text-foreground">neue Kunden</strong> und 
              <strong className="text-foreground"> neue Produkte</strong> direkt im Formular angelegt werden, 
              ohne vorher in die Stammdatenverwaltung wechseln zu müssen.
            </p>
            <div className="space-y-1 mt-1">
              <Rule label="Kunde" value="Dropdown mit Autocomplete — Option ‚Neuen Kunden erstellen' fügt sofort einen neuen Eintrag in die Kunden-Tabelle ein" color="success" />
              <Rule label="Produkt" value="Freitext-Eingabe mit Vorschlägen — bei neuem Produkt wird es automatisch in der Produkttabelle gespeichert" color="success" />
              <Rule label="Häufige Kunden" value="System merkt sich häufig verwendete Kunden und zeigt sie priorisiert" color="success" />
            </div>

            <Tip>
              Auch beim CSV-Import wird die Vorgangsnummer automatisch vergeben — das Feld case_no ist nicht mehr erforderlich.
              Bei Abteilungswahl mit Unter-Abteilungen (Teams) kann auch das Team ausgewählt werden.
            </Tip>

            <SubHeading>Vorgang-Detailseite (/cases/:id)</SubHeading>
            <p>Zeigt alle Details eines Vorgangs in strukturierter Form:</p>
            <div className="space-y-1 mt-1">
              <Rule label="Details-Bereich" value="Bearbeiter, Kunde, Auftraggeber, Produkt, Bereich, Artikelnr., Stunden, Ersteller, verknüpftes Projekt" color="success" />
              <Rule label="Projektinformationen" value="SOP, Menge, Projektdauer — eigener Abschnitt für erweiterte Metadaten" color="success" />
              <Rule label="Termine" value="Auftragseingang, Gestartet, Endtermin, Abgeschlossen" color="success" />
              <Rule label="Status ändern" value="Dropdown zur Statusänderung mit allen 9 Status-Werten" color="success" />
              <Rule label="Abteilung verschieben" value="Vorgang in eine andere Abteilung verschieben — setzt Status auf ‚Nicht begonnen', entfernt Bearbeiter" color="success" />
              <Rule label="Unteraufgaben" value="Unteraufgaben mit Abteilungszuweisung, Verantwortlichem und Status (Offen/In Arbeit/Erledigt) — mit automatischem Weiterschieben" color="success" />
              <Rule label="Anhänge" value="Dokumente direkt am Vorgang anhängen, öffnen und herunterladen" color="success" />
              <Rule label="Notizen" value="Notiz-Bereich zum Hinterlegen von Anmerkungen" color="success" />
              <Rule label="Aktivitäten-Timeline" value="Chronologischer Verlauf aller Änderungen inkl. automatischer Workflow-Aktionen" color="success" />
            </div>

            <SubHeading>Kanban-Board (/cases/kanban)</SubHeading>
            <p>
              Alternative Ansicht der Vorgänge als Kanban-Board, gruppiert nach Status-Spalten. 
              Vorgänge können per Drag-and-Drop zwischen Spalten verschoben werden.
            </p>
          </Card>

          {/* ─── WORKFLOW & AUTOMATISIERUNG ─── */}
          <Card title="Workflow & Automatisierung" id="workflow">
            <p>
              Das System bietet eine <strong className="text-foreground">automatische Workflow-Steuerung</strong> über 
              Unteraufgaben (Subtasks). Jede Unteraufgabe kann einer Abteilung und einem Mitarbeiter zugewiesen werden. 
              Beim Abschließen einer Unteraufgabe wird der Vorgang automatisch an die nächste Abteilung weitergeleitet.
            </p>

            <SubHeading>Unteraufgaben mit Abteilungszuweisung</SubHeading>
            <p>Jede Unteraufgabe hat folgende Eigenschaften:</p>
            <Table
              headers={['Feld', 'Beschreibung']}
              rows={[
                ['Titel', 'Beschreibung der Teilaufgabe'],
                ['Status', 'Offen → In Arbeit → Erledigt'],
                ['Abteilung', 'Welche Abteilung ist zuständig (optional)'],
                ['Zuständig', 'Konkreter Mitarbeiter (optional)'],
                ['Reihenfolge', 'sort_order bestimmt die Abarbeitungsreihenfolge'],
              ]}
            />

            <SubHeading>Automatisches Weiterschieben (Auto-Forward)</SubHeading>
            <p>
              Wenn eine Unteraufgabe auf <Badge color="primary">Erledigt</Badge> gesetzt wird, prüft das System 
              automatisch die nächste Unteraufgabe und reagiert wie folgt:
            </p>

            <Table
              headers={['Situation', 'Aktion', 'Neuer Status']}
              rows={[
                ['Nächste Unteraufgabe hat andere Abteilung', 'Vorgang wird automatisch an die neue Abteilung verschoben, Bearbeiter wird entfernt', 'In Arbeit'],
                ['Nächste Unteraufgabe hat keine Abteilung', 'Vorgang wird blockiert, Warnung wird angezeigt', 'Blockiert'],
                ['Keine weitere Unteraufgabe vorhanden', 'Alle Aufgaben erledigt — Vorgang wird zur Prüfung bereitgestellt', 'Zur Prüfung'],
                ['Nächste Unteraufgabe hat gleiche Abteilung', 'Keine Verschiebung — Vorgang bleibt in der aktuellen Abteilung', 'Unverändert'],
              ]}
            />

            <SubHeading>Audit-Log für Workflow-Aktionen</SubHeading>
            <p>
              Jede automatische Aktion wird im Audit-Log protokolliert mit dem Event-Typ <Badge color="primary">auto_forward</Badge>:
            </p>
            <div className="space-y-1 mt-1">
              <Rule label="Abteilungswechsel" value="Alte und neue Abteilung werden dokumentiert" color="success" />
              <Rule label="Zur Prüfung" value="‚Alle Unteraufgaben erledigt' wird als Nachricht gespeichert" color="success" />
              <Rule label="Blockiert" value="Fehlende Abteilung der nächsten Unteraufgabe wird protokolliert" color="warn" />
            </div>

            <Warning>
              Wenn eine Unteraufgabe keine Abteilung zugewiesen hat und als nächste in der Reihenfolge kommt, 
              wird der Vorgang auf «Blockiert» gesetzt. Eine sichtbare Warnung erscheint im UI. Weisen Sie der 
              Unteraufgabe eine Abteilung zu, um den Workflow fortzusetzen.
            </Warning>

            <SubHeading>Workflow-Einstellungen (workflow_settings)</SubHeading>
            <p>
              Das Workflow-Verhalten ist über die Tabelle <Badge color="primary">workflow_settings</Badge> konfigurierbar. 
              Aktuell verfügbare Einstellungen:
            </p>
            <Table
              headers={['Schlüssel', 'Beschreibung', 'Standardwert']}
              rows={[
                ['auto_forward', 'Automatisches Weiterschieben aktiviert/deaktiviert + Zielstatus', '{"enabled": true, "on_all_done": "ready_for_review", "on_no_department": "blocked"}'],
                ['case_defaults', 'Standard-Werte für neue Vorgänge', '{"initial_status": "nicht_begonnen"}'],
              ]}
            />
            <Tip>
              Nur Admins können Workflow-Einstellungen ändern. Die Konfiguration wird als JSON in der Datenbank gespeichert.
            </Tip>
          </Card>

          {/* ─── AUTOFILL & LERNFUNKTION ─── */}
          <Card title="Autofill & Lernfunktion" id="autofill">
            <p>
              Das System lernt aus bisherigen Vorgängen und schlägt beim Erstellen neuer Vorgänge 
              automatisch passende Werte vor. Die Lernfunktion wird über das <strong className="text-foreground">Glühbirnen-Icon</strong> (💡) 
              im Erstellungsformular aktiviert.
            </p>

            <SubHeading>Wie funktioniert es?</SubHeading>
            <div className="space-y-1 mt-1">
              <Rule label="Ähnliche Vorgänge" value="System durchsucht die letzten 20 ähnlichen Vorgänge (LIKE-Suche auf Titel, Kunde, Produkt)" color="success" />
              <Rule label="Beschreibung" value="Vorschlag basierend auf ähnlichen Vorgängen" color="success" />
              <Rule label="Typische Unteraufgaben" value="Vorschläge für Subtasks basierend auf bisheriger Abteilungsstruktur" color="success" />
              <Rule label="Autocomplete" value="Kunden- und Produkt-Dropdown mit Vorschlägen basierend auf Häufigkeit" color="success" />
            </div>

            <SubHeading>Vorlage übernehmen</SubHeading>
            <p>
              Über den Button «Vorlage übernehmen» können die Vorschläge des Systems direkt in das 
              Erstellungsformular übernommen werden. Der Benutzer kann alle Werte anschließend noch anpassen.
            </p>

            <Tip>
              Je mehr Vorgänge im System erfasst werden, desto genauer werden die Vorschläge. 
              Die Lernfunktion funktioniert ohne KI — rein auf Basis von Datenbankabfragen und Ähnlichkeitsvergleichen.
            </Tip>
          </Card>

          {/* ─── PROJEKTE ─── */}
          <Card title="Projekte" id="projects">
            <p>
              Projekte dienen als übergeordnete Container für Vorgänge und Dateien. Sie haben eine automatische 
              Nummerierung, Sichtbarkeitsregeln und eine integrierte Ordnerstruktur.
            </p>

            <SubHeading>Projektliste (/projects)</SubHeading>
            <Table
              headers={['Spalte', 'Beschreibung']}
              rows={[
                ['Projekt-Nr.', 'Automatisch vergebene Nummer (PRJ-YYYY-nnnn)'],
                ['Name', 'Projektname + optionale Beschreibung'],
                ['Abteilung', 'Zugeordnete Abteilung'],
                ['Status', 'Aktiv / Abgeschlossen / Archiviert'],
                ['Sichtbarkeit', 'Team / Abteilung / Privat'],
                ['Erstellt', 'Erstellungsdatum'],
                ['Aktionen', 'Details und Dateien-Link'],
              ]}
            />

            <SubHeading>Projekt erstellen</SubHeading>
            <p>Über «Neues Projekt» (nur Staff/Admin). Felder:</p>
            <div className="space-y-1 mt-1">
              <Rule label="Projektname *" value="Pflichtfeld — beschreibender Name" color="warn" />
              <Rule label="Beschreibung" value="Optionale kurze Beschreibung" color="success" />
              <Rule label="Abteilung" value="Optionale Zuordnung zu einer Abteilung" color="success" />
              <Rule label="Sichtbarkeit" value="Nur Team (Standard), Abteilung, oder Privat" color="success" />
            </div>

            <p className="mt-2">Beim Anlegen passiert automatisch:</p>
            <div className="space-y-1 mt-1">
              <Rule label="Projektnummer" value="PRJ-YYYY-nnnn wird atomar vergeben" color="success" />
              <Rule label="Projektcode" value="Wird aus den ersten 6 Zeichen des Namens abgeleitet" color="success" />
              <Rule label="Team-Mitglied" value="Ersteller wird automatisch als Projektleiter hinzugefügt" color="success" />
              <Rule label="6 Standard-Ordner" value="01_Admin, 02_Briefing, 03_Kalkulation, 04_Assets, 05_Delivery, 99_Archiv" color="success" />
            </div>

            <SubHeading>Projekt-Detailseite (/projects/:id)</SubHeading>
            <p>Umfassende Projektansicht mit:</p>
            <div className="space-y-1 mt-1">
              <Rule label="KPI-Karten" value="Vorgänge gesamt, Offen, In Verzug, Abgeschlossen (mit Fortschritt in %)" color="success" />
              <Rule label="Fortschrittsbalken" value="Visueller Balken mit Farb-Segmenten pro Status" color="success" />
              <Rule label="Inline-Bearbeitung" value="Name, Beschreibung, Status, Sichtbarkeit, Abteilung — per Hover editierbar (Stift-Icon)" color="success" />
              <Rule label="Vorgangsliste" value="Alle verknüpften Vorgänge mit Status und Bearbeiter" color="success" />
              <Rule label="Team-Verwaltung" value="Projektmitglieder anzeigen und verwalten" color="success" />
              <Rule label="Aktivitäten-Timeline" value="Chronologischer Verlauf aller Projektänderungen" color="success" />
            </div>

            <SubHeading>Sichtbarkeitsregeln</SubHeading>
            <Table
              headers={['Sichtbarkeit', 'Wer sieht das Projekt?']}
              rows={[
                ['Nur Team (project_members)', 'Ersteller, Owner und eingetragene Team-Mitglieder'],
                ['Abteilung (department)', 'Alle User der gleichen Abteilung + Ersteller/Owner + Team-Mitglieder'],
                ['Privat (private)', 'Nur der Ersteller/Owner'],
              ]}
            />
            <p className="mt-1 text-[11px]">Admins sehen immer alle Projekte.</p>
          </Card>

          {/* ─── DATEIABLAGE ─── */}
          <Card title="Dateiablage" id="files">
            <p>
              Jedes Projekt hat eine integrierte Dateiablage unter <Badge color="primary">/projects/:id/files</Badge>. 
              Die Dateien werden im Storage-Bucket <Badge>project-files</Badge> gespeichert.
            </p>

            <SubHeading>Ordnerstruktur</SubHeading>
            <div className="grid grid-cols-3 gap-2 mt-2">
              {[
                ['01_Admin', 'Administrative Dokumente'],
                ['02_Briefing', 'Briefing-Unterlagen'],
                ['03_Kalkulation', 'Kalkulationen & Kostenvoranschläge'],
                ['04_Assets', 'Medien, Bilder, Design-Dateien'],
                ['05_Delivery', 'Lieferbare Ergebnisse'],
                ['99_Archiv', 'Archivierte Dateien'],
              ].map(([name, desc]) => (
                <div key={name} className="rounded border border-border px-2.5 py-2">
                  <div className="flex items-center gap-1.5">
                    <FolderOpen className="h-3 w-3 text-muted-foreground shrink-0" />
                    <span className="text-[11px] font-mono text-foreground">{name}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{desc}</p>
                </div>
              ))}
            </div>

            <SubHeading>Datei-Funktionen</SubHeading>
            <div className="space-y-1 mt-1">
              <Rule label="Upload" value="Dateien in den aktiven Ordner hochladen (per Button oder Datei-Auswahl)" color="success" />
              <Rule label="Download" value="Dateien einzeln herunterladen" color="success" />
              <Rule label="Löschen" value="Dateien entfernen (Admin/Staff)" color="warn" />
              <Rule label="Aktualisieren" value="Dateiliste manuell neu laden" color="success" />
            </div>

            <SubHeading>Ordner-Verwaltung</SubHeading>
            <p>
              Neben den automatisch erstellten Standard-Ordnern können Benutzer (Staff/Admin) eigene Ordner 
              direkt in der Sidebar erstellen, umbenennen und löschen.
            </p>
            <div className="space-y-1 mt-1">
              <Rule label="Neuer Ordner" value="Über das +-Icon in der Sidebar — Name eingeben und mit Enter bestätigen" color="success" />
              <Rule label="Umbenennen" value="Über das Kontextmenü (···) am Ordner → ‚Umbenennen'" color="success" />
              <Rule label="Löschen" value="Über das Kontextmenü (···) am Ordner → ‚Löschen' — nur leere Ordner oder nach Bestätigung" color="warn" />
            </div>
            <Tip>
              Ordner werden sowohl in der Datenbank (project_folders) als auch im Storage-Bucket (project-files) angelegt. 
              Ein .keep-Platzhalter stellt sicher, dass der Ordner im Storage existiert.
            </Tip>

            <SubHeading>Team-Verwaltung</SubHeading>
            <p>
              Über den «Team»-Button können Projektmitglieder hinzugefügt/entfernt werden. 
              Rollen: <Badge>Projektleiter</Badge> (manager) und <Badge>Mitglied</Badge> (member).
              Nur Admins und Projekt-Owner können das Team verwalten.
            </p>
          </Card>

          {/* ─── SUPPORT-TICKETS ─── */}
          <Card title="Support-Tickets" id="support">
            <p>
              Das Support-Ticket-System ermöglicht die Verwaltung von Kundenanfragen. Tickets werden entweder
              von Kunden über das <strong className="text-foreground">Kundenportal</strong> erstellt oder intern zugewiesen.
              Internes Management erfolgt über <Badge color="primary">/support</Badge>.
            </p>

            <SubHeading>Übersichtsseite (/support)</SubHeading>
            <p>Die Ticket-Liste zeigt alle eingehenden Kundenanfragen:</p>
            <Table
              headers={['Spalte', 'Beschreibung']}
              rows={[
                ['Nr.', 'Automatische Ticketnummer (SUP-YYYY-nnnn)'],
                ['Betreff', 'Titel/Beschreibung des Tickets'],
                ['Kunde', 'Name und Firma des Portal-Kunden'],
                ['Priorität', 'Niedrig / Mittel / Hoch / Kritisch'],
                ['Status', 'Offen / In Bearbeitung / Wartend / Gelöst / Geschlossen'],
                ['Bearbeiter', 'Zugewiesener interner Mitarbeiter (Kürzel)'],
                ['Erstellt', 'Zeitangabe relativ (z.B. „vor 2 Stunden")'],
              ]}
            />

            <SubHeading>KPI-Karten</SubHeading>
            <div className="space-y-1 mt-1">
              <Rule label="Offen" value="Tickets mit Status ‚Offen' oder ‚In Bearbeitung'" color="success" />
              <Rule label="Gelöst" value="Tickets mit Status ‚Gelöst' oder ‚Geschlossen'" color="success" />
              <Rule label="Gesamt" value="Gesamtzahl aller Tickets" color="success" />
              <Rule label="Wartend" value="Tickets die auf Kundenrückmeldung warten" color="success" />
            </div>

            <SubHeading>Filter</SubHeading>
            <div className="space-y-1 mt-1">
              <Rule label="Textsuche" value="Durchsucht Ticketnummer, Betreff, Kundenname, Firma" color="success" />
              <Rule label="Status-Filter" value="Alle 5 Status-Werte" color="success" />
              <Rule label="Prioritäts-Filter" value="4 Prioritätsstufen" color="success" />
              <Rule label="Bearbeiter-Filter" value="Alle Mitarbeiter + ‚Nicht zugewiesen'" color="success" />
            </div>

            <SubHeading>Ticket-Detail (/support/:id)</SubHeading>
            <div className="space-y-1 mt-1">
              <Rule label="Ticket-Informationen" value="Alle Metadaten: Priorität, Status, Kunde, Bearbeiter, Zeitstempel" color="success" />
              <Rule label="Chat/Nachrichten" value="Nachrichtenverlauf zwischen internem Team und Kunde" color="success" />
              <Rule label="Interne Notizen" value="Nachrichten mit ‚Nur intern'-Toggle — für Kunden nicht sichtbar" color="success" />
              <Rule label="Anhänge" value="Dokumente direkt im Ticket ansehen, herunterladen, hochladen und löschen. Anhänge werden im Storage-Bucket support-attachments gespeichert." color="success" />
              <Rule label="Status ändern" value="Status über Dropdown ändern (z.B. Gelöst → Geschlossen)" color="success" />
              <Rule label="Zuweisung" value="Bearbeiter zuweisen — setzt Status automatisch auf ‚In Bearbeitung'" color="success" />
            </div>

            <SubHeading>Ticket-Status-Workflow</SubHeading>
            <Table
              headers={['Status', 'Bedeutung']}
              rows={[
                ['Offen (open)', 'Neues Ticket, noch nicht bearbeitet'],
                ['In Bearbeitung (in_progress)', 'Einem Mitarbeiter zugewiesen und in Arbeit'],
                ['Wartend (waiting)', 'Wartet auf Rückmeldung vom Kunden'],
                ['Gelöst (resolved)', 'Problem wurde gelöst'],
                ['Geschlossen (closed)', 'Ticket endgültig geschlossen'],
              ]}
            />

            <SubHeading>Kunden einladen</SubHeading>
            <p>
              Über den Button «Kunden einladen» auf der Support-Seite können neue Portal-Kunden angelegt werden.
              Eingaben: E-Mail (Pflicht), Name (Pflicht), Firma (optional). Ein Passwort wird automatisch generiert
              und muss dem Kunden mitgeteilt werden.
            </p>
          </Card>

          {/* ─── KUNDENPORTAL ─── */}
          <Card title="Kundenportal" id="portal">
            <p>
              Das <strong className="text-foreground">Kundenportal</strong> ist eine eigenständige Oberfläche unter 
              <Badge color="primary">/portal</Badge>, die externen Kunden den Zugang zu ihren Support-Tickets ermöglicht.
              Es hat ein eigenes Login, eigenes Layout und eigene Berechtigungen.
            </p>

            <SubHeading>Portal-Routen</SubHeading>
            <Table
              headers={['Route', 'Beschreibung']}
              rows={[
                ['/portal/auth', 'Login-Seite für Portal-Kunden'],
                ['/portal', 'Dashboard mit Übersicht offener Tickets'],
                ['/portal/tickets', 'Liste aller eigenen Tickets'],
                ['/portal/tickets/new', 'Neues Ticket erstellen'],
                ['/portal/tickets/:id', 'Ticket-Detail mit Nachrichtenverlauf'],
              ]}
            />

            <SubHeading>Authentifizierung</SubHeading>
            <p>
              Portal-Kunden verwenden ein separates Login-System. Der Account wird von einem internen Admin
              über die «Kunden einladen»-Funktion erstellt. Nach Anmeldung wird geprüft, ob der Auth-User
              einen aktiven Eintrag in <Badge color="primary">portal_customers</Badge> hat.
            </p>

            <SubHeading>Kunden-Funktionen</SubHeading>
            <div className="space-y-1 mt-1">
              <Rule label="Dashboard" value="Übersicht: offene Tickets, letzte Aktivitäten" color="success" />
              <Rule label="Ticket erstellen" value="Neues Ticket mit Titel, Beschreibung, Priorität und optionalen Datei-Anhängen" color="success" />
              <Rule label="Ticket-Verlauf" value="Chat-Ansicht mit allen öffentlichen Nachrichten" color="success" />
              <Rule label="Anhänge" value="Kunden können Dateien an Tickets anhängen und bestehende Anhänge öffnen/herunterladen" color="success" />
              <Rule label="Antworten" value="Kunde kann auf Tickets antworten und weitere Dateien anhängen" color="success" />
            </div>

            <Warning>
              Kunden sehen nur ihre eigenen Tickets und keine als „intern" markierten Nachrichten. 
              Die Trennung wird über RLS-Policies und den <Badge>is_internal</Badge>-Flag auf Nachrichten sichergestellt.
            </Warning>

            <SubHeading>Design</SubHeading>
            <p>
              Das Portal verwendet ein eigenständiges Glassmorphism-Theme mit Portal-spezifischen CSS-Variablen
              (<Badge>--portal-bg</Badge>, <Badge>--portal-accent</Badge>, etc.) und eigenem Layout ohne Sidebar.
            </p>
          </Card>

          {/* ─── ANHÄNGE & DOKUMENTE ─── */}
          <Card title="Anhänge & Dokumente" id="attachments">
            <p>
              Das System unterstützt Datei-Anhänge an <strong className="text-foreground">Vorgängen</strong> und 
              <strong className="text-foreground"> Support-Tickets</strong>. Anhänge können direkt in der Anwendung 
              geöffnet, heruntergeladen oder gelöscht werden.
            </p>

            <SubHeading>Vorgangs-Anhänge</SubHeading>
            <div className="space-y-1 mt-1">
              <Rule label="Bucket" value="case-attachments (privat, nur authentifizierte User)" color="success" />
              <Rule label="Beim Erstellen" value="Dateien können direkt beim Anlegen eines Vorgangs angehängt werden" color="success" />
              <Rule label="Im Detail" value="Anhänge werden im Vorgang-Detail unter ‚Anhänge' aufgelistet mit Öffnen/Download/Löschen" color="success" />
              <Rule label="Öffnen" value="Klick auf Dateiname oder ↗-Icon öffnet die Datei direkt im Browser (neuer Tab)" color="success" />
              <Rule label="Upload" value="Staff und Admin können jederzeit weitere Dateien anhängen" color="success" />
              <Rule label="Löschen" value="Staff und Admin können Anhänge entfernen" color="warn" />
            </div>

            <SubHeading>Ticket-Anhänge</SubHeading>
            <div className="space-y-1 mt-1">
              <Rule label="Bucket" value="support-attachments (privat, nur authentifizierte User)" color="success" />
              <Rule label="Kunden-Upload" value="Kunden können beim Erstellen oder im Ticket-Detail Dateien anhängen" color="success" />
              <Rule label="Staff-Zugriff" value="Internes Team sieht alle Anhänge, kann hochladen und löschen" color="success" />
              <Rule label="Portal-Zugriff" value="Kunden sehen Anhänge ihrer eigenen Tickets und können neue Dateien hinzufügen" color="success" />
            </div>

            <SubHeading>Unterstützte Aktionen pro Datei</SubHeading>
            <Table
              headers={['Aktion', 'Icon', 'Beschreibung']}
              rows={[
                ['Öffnen', '↗ / Dateiname', 'Öffnet die Datei in einem neuen Browser-Tab (signierte URL, 5 Min. gültig)'],
                ['Herunterladen', '↓', 'Erzwingt den Download der Datei'],
                ['Löschen', '🗑', 'Entfernt die Datei dauerhaft (nur bei Berechtigung, Hover-sichtbar)'],
              ]}
            />

            <Tip>
              Alle Dateien werden über signierte URLs bereitgestellt, die 5 Minuten gültig sind. 
              Dies gewährleistet, dass keine Dateien ohne Authentifizierung zugänglich sind.
            </Tip>
          </Card>

          {/* ─── DARK MODE ─── */}
          <Card title="Dark Mode & Compact Tables" id="darkmode">
            <p>
              <strong className="text-foreground">Dark Mode</strong> ist der Standard bei Erstanmeldung.
              Das Theme verwendet ein Premium Glassmorphism-Design mit halbtransparenten Oberflächen,
              Backdrop-Blur-Effekten und einem Ambient-Mesh-Gradient im Hintergrund.
              Der Toggle befindet sich im Profil-Dropdown (unten links in der Sidebar).
            </p>
            <div className="space-y-1 mt-2">
              <Rule label="Theme-Preference" value="Wird pro User in user_preferences gespeichert (DB)" color="success" />
              <Rule label="Dark als Default" value="Neue User starten im Dark Mode" color="success" />
              <Rule label="Glassmorphism" value="Sidebar, Header und Karten nutzen backdrop-filter: blur(24px) saturate(1.2)" color="success" />
              <Rule label="Keine harten Farben" value="Alle Farben über CSS-Tokens (HSL-Variablen)" color="success" />
              <Rule label="Sofort wirksam" value="Umschaltung ohne Neuladen der Seite" color="success" />
            </div>

            <SubHeading>Compact Tables</SubHeading>
            <p>
              Reduziert das Zellen-Padding von <Badge>px-4 py-2.5</Badge> auf <Badge>px-3 py-1.5</Badge> — 
              ca. 25% mehr Zeilen sichtbar. Toggle ebenfalls im Profil-Dropdown.
            </p>
            <p className="text-[11px] mt-2">
              Beide Einstellungen werden in der Tabelle <Badge color="primary">user_preferences</Badge> pro User 
              gespeichert und beim nächsten Login automatisch geladen.
            </p>
          </Card>

          {/* ─── ABTEILUNGEN ─── */}
          <Card title="Abteilungen (Departments)" id="departments">
            <p>
              Abteilungen ergänzen das bestehende Rollensystem (<Badge>admin</Badge> <Badge>staff</Badge> <Badge>viewer</Badge>) 
              um eine Organisationsstruktur. Verwaltung unter: <Badge color="primary">Verwaltung → Abteilungen</Badge>
            </p>

            <SubHeading>Hierarchie</SubHeading>
            <p>
              Abteilungen unterstützen eine zweistufige Hierarchie: <strong className="text-foreground">Haupt-Abteilungen</strong> und 
              <strong className="text-foreground"> Unter-Abteilungen (Teams)</strong>. Teams werden über <Badge>parent_id</Badge> 
              der übergeordneten Abteilung zugeordnet.
            </p>

            <SubHeading>Funktionsweise</SubHeading>
            <div className="space-y-1 mt-1">
              <Rule label="Parallel zu app_role" value="user_roles-Tabelle bleibt für Zugriffssteuerung aktiv" color="success" />
              <Rule label="Abteilungs-Zuordnung" value="users_profile.department_id → departments.id" color="success" />
              <Rule label="Manager-Flag" value="users_profile.is_manager = true für Abteilungsleiter" color="success" />
              <Rule label="Direkter Vorgesetzter" value="users_profile.manager_id → users_profile.id" color="success" />
              <Rule label="Abteilungsleiter" value="departments.manager_user_id — kann in der Abteilungsverwaltung gesetzt werden" color="success" />
              <Rule label="Unter-Abteilungen" value="departments.parent_id → departments.id für Team-Zuordnung" color="success" />
            </div>

            <SubHeading>Abteilung anlegen</SubHeading>
            <p>In der Abteilungsverwaltung (nur Admin): Name, Kürzel (wird automatisch UPPERCASE) und optionaler Abteilungsleiter.</p>

            <Table
              headers={['Tabelle', 'Spalte', 'Zweck']}
              rows={[
                ['departments', 'id, name, code', 'Abteilungs-Stammdaten'],
                ['departments', 'parent_id', 'Verweis auf Haupt-Abteilung (für Teams)'],
                ['departments', 'manager_user_id', 'Abteilungsleiter (FK → users_profile)'],
                ['departments', 'sort_order', 'Reihenfolge der Anzeige'],
                ['users_profile', 'department_id', 'Zuordnung User → Abteilung'],
                ['users_profile', 'manager_id', 'Direkter Vorgesetzter'],
                ['users_profile', 'is_admin, is_manager', 'Flags für Rollenlogik'],
              ]}
            />
          </Card>

          {/* ─── AUTO-NUMMERIERUNG ─── */}
          <Card title="Auto-Nummerierung" id="numbering">
            <p>
              Alle Projekte, Vorgänge und Support-Tickets erhalten <strong className="text-foreground">vollautomatisch</strong> eine 
              menschenlesbare, fortlaufende Nummer, die atomar per Datenbank-Trigger vergeben wird.
              Bei Vorgängen muss keine Nummer manuell eingegeben werden — der Trigger setzt sowohl 
              <Badge color="primary">case_number</Badge> als auch <Badge color="primary">case_no</Badge> automatisch.
            </p>
            <Table
              headers={['Objekt', 'Format', 'Beispiel', 'Trigger']}
              rows={[
                ['Projekt', 'PRJ-YYYY-nnnn', 'PRJ-2026-0001', 'assign_project_number()'],
                ['Vorgang', 'VOR-YYYY-nnnn', 'VOR-2026-0042', 'assign_case_number()'],
                ['Ticket', 'TKT-YYYY-nnnn', 'TKT-2026-0005', 'assign_ticket_number()'],
              ]}
            />
            <Tip>
              Beim CSV-Import ist keine Vorgangsnummer erforderlich — sie wird automatisch vergeben. 
              Einziges Pflichtfeld ist <Badge color="primary">project_name</Badge>.
            </Tip>
            <p className="mt-3">
              Technisch: Jede Erstellung ruft <Badge color="primary">next_counter(key)</Badge> auf — 
              ein atomares <Badge>INSERT … ON CONFLICT DO UPDATE … RETURNING</Badge>, das Race Conditions verhindert.
            </p>
            <Code>{`-- Zähler-Funktion (atomic)
SELECT public.next_counter('case_2026');
-- Gibt nächsten Wert zurück + erhöht atomar

-- BEFORE INSERT Trigger auf cases:
NEW.case_number := 'VOR-' || year || '-' || lpad(counter, 4, '0');
NEW.case_no := NEW.case_number; -- beide Felder synchron`}</Code>
            <Warning>
              Falls ein INSERT fehlschlägt, kann eine Nummer "verbrannt" werden. Dies ist akzeptables Verhalten bei atomaren Countern und kein Bug.
            </Warning>
          </Card>

          {/* ─── ROLLEN ─── */}
          <Card title="Rollen & Zugriffsrechte" id="roles">
            <p>
              Das System kennt 3 App-Rollen (<Badge color="primary">app_role</Badge>) + optionale Flags. 
              Die Rolle wird in der Tabelle <Badge>user_roles</Badge> gespeichert.
            </p>
            <Table
              headers={['Rolle', 'Lesen', 'Erstellen', 'Bearbeiten', 'Löschen', 'Admin-Bereich']}
              rows={[
                ['admin', '✓ Alles', '✓ Alles', '✓ Alles', '✓ Alles', '✓'],
                ['staff', '✓ Alles', '✓ Vorgänge/Projekte', '○ Eigene/Zugewiesen', '✗', '✗'],
                ['viewer', '✓ Alles', '✗', '✗', '✗', '✗'],
              ]}
            />

            <SubHeading>Rollenrechte im Detail</SubHeading>
            <div className="space-y-1 mt-1">
              <Rule label="Admin" value="Vollzugriff auf alle Bereiche, Benutzerverwaltung, Stammdaten, Abteilungen, Support-Tickets" color="success" />
              <Rule label="Staff (Mitarbeiter)" value="Kann Vorgänge erstellen, abholen, bearbeiten (eigene/zugewiesene). Kann Projekte erstellen. Kann Dateien hochladen/löschen. Kann Support-Tickets bearbeiten." color="success" />
              <Rule label="Viewer" value="Nur lesender Zugriff auf alle Daten. Kann nichts erstellen, bearbeiten oder löschen." color="warn" />
            </div>

            <SubHeading>Zusätzliche Flags</SubHeading>
            <Table
              headers={['Flag', 'Auf', 'Wirkung']}
              rows={[
                ['is_admin', 'users_profile', 'Wird zusätzlich zu user_roles geprüft (Fallback)'],
                ['is_manager', 'users_profile', 'Abteilungsleiter-Rechte: sieht Abteilungs-Items und direkte Reports'],
              ]}
            />

            <Tip>
              Beim Anlegen eines neuen Users wird automatisch die Rolle «staff» vergeben. Admins können dies in der Mitarbeiterverwaltung ändern.
            </Tip>
          </Card>

          {/* ─── ADMIN-VERWALTUNG ─── */}
          <Card title="Admin-Verwaltung" id="admin">
            <p>
              Der Admin-Bereich ist nur für Benutzer mit der Rolle <Badge color="primary">admin</Badge> sichtbar 
              und zugänglich. Er umfasst 4 Bereiche:
            </p>

            <SubHeading>1. Mitarbeiterverwaltung (/admin/users)</SubHeading>
            <div className="space-y-1 mt-1">
              <Rule label="Übersicht" value="Tabelle aller Benutzer mit Name, Kürzel, Rolle, Abteilung und Aktiv-Status" color="success" />
              <Rule label="Bearbeiten" value="Name, Kürzel, Rolle, Abteilung und Aktiv-Status ändern" color="success" />
              <Rule label="Neuer Mitarbeiter" value="E-Mail, Name, Kürzel, Rolle und Abteilung — Passwort wird per Reset-Flow gesetzt" color="success" />
              <Rule label="Passwort zurücksetzen" value="Admin kann für jeden User einen Passwort-Reset auslösen" color="success" />
              <Rule label="Benutzer löschen" value="Admin kann Benutzerkonten dauerhaft entfernen" color="danger" />
            </div>

            <SubHeading>2. Abteilungen (/admin/departments)</SubHeading>
            <div className="space-y-1 mt-1">
              <Rule label="Anlegen" value="Name + Kürzel + optionaler Abteilungsleiter" color="success" />
              <Rule label="Bearbeiten" value="Alle Felder inkl. Abteilungsleiter änderbar" color="success" />
              <Rule label="Hierarchie" value="Unter-Abteilungen (Teams) können einer Haupt-Abteilung zugeordnet werden" color="success" />
            </div>

            <SubHeading>3. Stammdaten (/admin/master-data)</SubHeading>
            <p>Verwaltung von Referenzdaten in 3 Tabs:</p>
            <Table
              headers={['Tab', 'Beschreibung', 'Felder']}
              rows={[
                ['Kunden', 'Kundenstammdaten', 'Kundennr. + Name'],
                ['Produkte', 'Produktkatalog', 'Code + Name'],
                ['Bereiche', 'Interne Bereiche/Abteilungscodes', 'Code + Name'],
              ]}
            />
            <p className="mt-2">
              Zusätzlich gibt es einen <Badge color="primary">CSV-Import</Badge>-Tab für den Massenimport von Vorgängen.
            </p>

            <SubHeading>4. Admin Dashboard (/admin/dashboard)</SubHeading>
            <p>Erweitertes Dashboard — siehe Abschnitt «Dashboard» oben.</p>
          </Card>

          {/* ─── BENACHRICHTIGUNGEN ─── */}
          <Card title="Benachrichtigungen" id="notifications">
            <p>
              Das System verfügt über ein integriertes Benachrichtigungssystem. Benachrichtigungen erscheinen 
              als Badge an der Glocke (🔔) in der oberen rechten Ecke.
            </p>

            <SubHeading>Wann werden Benachrichtigungen erzeugt?</SubHeading>
            <div className="space-y-1 mt-1">
              <Rule label="Statusänderung" value="Bei jeder Statusänderung eines Vorgangs werden Ersteller und Bearbeiter benachrichtigt (sofern nicht selbst Auslöser)" color="success" />
            </div>

            <SubHeading>Benachrichtigungs-Inhalt</SubHeading>
            <Table
              headers={['Feld', 'Beschreibung']}
              rows={[
                ['Titel', 'z.B. „Status geändert: VG-001"'],
                ['Body', 'Projektname → neuer Status'],
                ['Link', 'Direkt-Link zum betroffenen Vorgang'],
                ['Gelesen-Status', 'Kann als gelesen markiert werden'],
              ]}
            />

            <p className="mt-2 text-[11px]">
              Benachrichtigungen werden in der Tabelle <Badge color="primary">notifications</Badge> gespeichert. 
              Jeder User sieht nur seine eigenen (RLS-Policy).
            </p>
          </Card>

          {/* ─── SUCHE ─── */}
          <Card title="Suche & Command Palette" id="search">
            <p>
              Die Command Palette ist eine Schnellsuche, die über <Badge>⌘K</Badge> (Mac) oder <Badge>Ctrl+K</Badge> (Windows) 
              oder den Suche-Eintrag in der Sidebar geöffnet wird.
            </p>

            <SubHeading>Funktionen</SubHeading>
            <div className="space-y-1 mt-1">
              <Rule label="Navigation" value="Schneller Sprung zu Dashboard, Vorgänge, Projekte, Support, Verwaltung etc." color="success" />
              <Rule label="Suche" value="Durchsucht Menüpunkte und Aktionen" color="success" />
              <Rule label="Tastaturnavigation" value="↑/↓ zum Navigieren, Enter zum Ausführen, Escape zum Schließen" color="success" />
            </div>

            <Tip>
              Die Command Palette ist von jeder Seite aus erreichbar — ideal für Power-User, die schnell zwischen Bereichen wechseln möchten.
            </Tip>
          </Card>

          {/* ─── API-SCHNITTSTELLE ─── */}
          <Card title="API-Schnittstelle (REST)" id="api">
            <p>
              Das System bietet eine <strong className="text-foreground">REST-API</strong> für die Anbindung 
              externer Dashboards und Drittsysteme. Die API ist über eine Backend-Funktion realisiert und 
              erfordert einen <Badge color="primary">Bearer Token</Badge> zur Authentifizierung.
            </p>

            <SubHeading>Authentifizierung</SubHeading>
            <div className="space-y-1 mt-1">
              <Rule label="Methode" value="Bearer Token im Authorization-Header" color="success" />
              <Rule label="API-Key" value="Wird als Secret (DASHBOARD_API_KEY) in der Backend-Konfiguration hinterlegt" color="success" />
              <Rule label="Format" value="Authorization: Bearer YOUR_API_KEY" color="success" />
            </div>

            <SubHeading>Verfügbare Ressourcen</SubHeading>
            <Table
              headers={['Resource', 'Parameter', 'Beschreibung']}
              rows={[
                ['stats', '—', 'Aggregierte Zähler: Vorgänge, Tickets, Projekte nach Status'],
                ['cases', 'status, limit, offset', 'Vorgangsliste mit Bearbeitern und Abteilungen'],
                ['tickets', 'status, limit, offset', 'Support-Tickets mit Kundendaten'],
                ['ticket_messages', 'ticket_id (Pflicht)', 'Nachrichtenverlauf eines Tickets'],
                ['projects', 'limit, offset', 'Projektliste mit Owner und Abteilung'],
                ['users', '—', 'Benutzerliste mit Profil, Rollen und Abteilung'],
                ['departments', '—', 'Abteilungsliste mit Hierarchie'],
              ]}
            />

            <SubHeading>Beispiel-Aufruf</SubHeading>
            <Code>{`# Statistiken abrufen
curl -H "Authorization: Bearer YOUR_KEY" \\
  "https://YOUR_URL/functions/v1/api-dashboard?resource=stats"

# Vorgänge filtern
curl -H "Authorization: Bearer YOUR_KEY" \\
  "https://YOUR_URL/functions/v1/api-dashboard?resource=cases&status=in_arbeit&limit=50"

# Antwort-Format: JSON
{
  "data": [...],
  "count": 42,
  "limit": 50,
  "offset": 0
}`}</Code>

            <Warning>
              Der API-Key hat vollen Lesezugriff auf alle Daten (Admin-Level). Teilen Sie ihn nur mit 
              vertrauenswürdigen Systemen und rotieren Sie ihn regelmäßig.
            </Warning>
          </Card>

          {/* ─── RLS ─── */}
          <Card title="RLS-Logik & Policies" id="rls">
            <p>
              Alle Tabellen haben Row-Level-Security (RLS) aktiviert. Die Logik basiert auf 
              Security-Definer-Funktionen, um rekursive Policies zu vermeiden.
            </p>

            <SubHeading>Helper-Funktionen</SubHeading>
            <Table
              headers={['Funktion', 'Zweck']}
              rows={[
                ['check_is_admin(uid)', 'Prüft user_roles + is_admin Flag'],
                ['check_is_manager(uid)', 'Prüft is_manager Flag auf users_profile'],
                ['user_department(uid)', 'Gibt department_id des Users zurück'],
                ['is_direct_report(mgr, uid)', 'Prüft ob uid unter mgr als manager_id hat'],
                ['is_project_member(project_id, uid)', 'Prüft project_members Tabelle'],
                ['has_role(uid, role)', 'Prüft user_roles Tabelle'],
                ['is_admin()', 'Shortcut: has_role(auth.uid(), admin)'],
                ['is_portal_customer(uid)', 'Prüft ob User ein aktiver Portal-Kunde ist'],
                ['next_counter(key)', 'Atomarer Counter-Increment'],
              ]}
            />

            <SubHeading>Policy-Übersicht pro Tabelle</SubHeading>
            <Table
              headers={['Tabelle', 'SELECT', 'INSERT', 'UPDATE', 'DELETE']}
              rows={[
                ['cases', 'Alle auth. User', 'Staff + Admin', 'Zugewiesener + Admin + Nicht zugewiesen', 'Nur Admin'],
                ['projects', 'Admin: alle; Andere: eigene/Member/Dept', 'Staff + Admin', 'Owner + Admin', 'Nur Admin'],
                ['project_members', 'Alle auth. User', 'Nur Admin', '–', 'Nur Admin'],
                ['project_folders', 'Admin + Member + Owner/Dept', 'Nur Admin', '–', 'Nur Admin'],
                ['departments', 'Alle auth. User', 'Nur Admin', 'Nur Admin', 'Nur Admin'],
                ['user_roles', 'Alle auth. User', 'Nur Admin', 'Nur Admin', 'Nur Admin'],
                ['users_profile', 'Alle auth. User', 'Admin + Self', 'Self + Admin', 'Nur Admin'],
                ['user_preferences', 'Nur eigene', 'Nur eigene', 'Nur eigene', 'Nur eigene'],
                ['notifications', 'Nur eigene', 'Staff/Admin/Self', 'Nur eigene', 'Nur eigene'],
                ['case_activity', 'Alle auth. User', 'Staff + Admin', '–', 'Nur Admin'],
                ['project_activity', 'Alle auth. User', 'Staff + Admin', '–', 'Nur Admin'],
                ['customers/products/areas', 'Alle auth. User', 'Nur Admin', 'Nur Admin', 'Nur Admin'],
                ['support_tickets', 'Staff/Admin + eigener Kunde', 'Portal-Kunde + Staff/Admin', 'Staff + Admin', 'Nur Admin'],
                ['ticket_messages', 'Beteiligte (intern: nicht für Kunden)', 'Beteiligte', '–', 'Nur Admin'],
                ['portal_customers', 'Staff/Admin + Self', 'Nur Admin', 'Nur Admin', 'Nur Admin'],
                ['counters', 'Niemand direkt', '–', '–', '–'],
                ['case_tasks', 'Alle auth. User', 'Staff + Admin', 'Staff + Admin', 'Staff + Admin'],
                ['workflow_settings', 'Staff + Admin', 'Nur Admin', 'Nur Admin', 'Nur Admin'],
              ]}
            />

            <SubHeading>Visibility-Regeln für Projekte (SELECT)</SubHeading>
            <Code>{`-- SELECT Policy auf projects (vereinfacht):
USING (
  check_is_admin()
  OR created_by = auth.uid()
  OR owner_id = auth.uid()
  OR is_project_member(id, auth.uid())
  OR (visibility = 'department'
      AND department_id = user_department(auth.uid()))
)`}</Code>
          </Card>

          {/* ─── DATENMODELL ─── */}
          <Card title="Datenmodell" id="schema">
            <p>Übersicht aller Tabellen im System:</p>

            <SubHeading>Kern-Tabellen</SubHeading>
            <Table
              headers={['Tabelle', 'Zweck', 'Wichtige Spalten']}
              rows={[
                ['cases', 'Vorgänge/Aufgaben', 'case_no (auto), project_name, status, assignee_id, due_at, department_id, sop, quantity, project_duration'],
                ['case_tasks', 'Unteraufgaben', 'case_id, title, status, department_id, assigned_to, sort_order, description'],
                ['projects', 'Projekte', 'project_number (auto), project_code, name, status, visibility, department_id, owner_id'],
                ['project_members', 'Team pro Projekt', 'project_id, user_id, role (manager/member)'],
                ['project_folders', 'Virtuelle Ordnerstruktur', 'project_id, name, path, sort_order, parent_id'],
                ['workflow_settings', 'Workflow-Konfiguration', 'key (unique), value (jsonb), description, updated_by'],
              ]}
            />

            <SubHeading>Support & Portal</SubHeading>
            <Table
              headers={['Tabelle', 'Zweck', 'Wichtige Spalten']}
              rows={[
                ['support_tickets', 'Kundentickets', 'ticket_number (auto), title, description, status, priority, customer_id, assigned_to'],
                ['ticket_messages', 'Nachrichten zu Tickets', 'ticket_id, sender_id, sender_type, body, is_internal'],
                ['portal_customers', 'Portal-Kunden', 'auth_user_id, email, display_name, company_name, is_active, invited_by'],
              ]}
            />

            <SubHeading>Benutzer & Organisation</SubHeading>
            <Table
              headers={['Tabelle', 'Zweck', 'Wichtige Spalten']}
              rows={[
                ['users_profile', 'Benutzerprofil', 'display_name, short_code, department_id, manager_id, is_admin, is_manager, active'],
                ['user_roles', 'Rollenverknüpfung', 'user_id, role (admin/staff/viewer)'],
                ['user_preferences', 'Einstellungen', 'user_id, theme (dark/light), compact_tables'],
                ['departments', 'Abteilungen', 'name, code, parent_id, manager_user_id, sort_order'],
              ]}
            />

            <SubHeading>Referenz- / Stammdaten</SubHeading>
            <Table
              headers={['Tabelle', 'Zweck', 'Wichtige Spalten']}
              rows={[
                ['customers', 'Kundenstamm', 'customer_no, name'],
                ['products', 'Produktkatalog', 'code, name'],
                ['internal_areas', 'Interne Bereiche', 'code, name'],
                ['counters', 'Atomare Nummerierung', 'key (unique), value (int)'],
              ]}
            />

            <SubHeading>Aktivitäten & Benachrichtigungen</SubHeading>
            <Table
              headers={['Tabelle', 'Zweck', 'Wichtige Spalten']}
              rows={[
                ['case_activity', 'Vorgang-Audit-Trail', 'case_id, actor_id, action, field, old_value, new_value, message'],
                ['project_activity', 'Projekt-Audit-Trail', 'project_id, actor_id, action, field, old_value, new_value, message'],
                ['notifications', 'User-Benachrichtigungen', 'user_id, type, title, body, href, read'],
              ]}
            />

            <SubHeading>Storage</SubHeading>
            <div className="space-y-1 mt-1">
              <Rule label="project-files" value="Privater Bucket für Projekt-Dateien. Pfadstruktur: {project_code}_{project_number}/{ordner}/" color="success" />
              <Rule label="case-attachments" value="Privater Bucket für Vorgangs-Anhänge. Pfadstruktur: cases/{case_id}/{timestamp}_{filename}" color="success" />
              <Rule label="support-attachments" value="Privater Bucket für Ticket-Anhänge. Pfadstruktur: tickets/{ticket_id}/{timestamp}_{filename}" color="success" />
            </div>

            <SubHeading>Backend-Funktionen</SubHeading>
            <Table
              headers={['Funktion', 'Typ', 'Beschreibung']}
              rows={[
                ['create-project-folders', 'Edge Function', 'Erstellt DB-Einträge + Storage-Platzhalter nach Projekt-Insert'],
                ['create-user', 'Edge Function', 'Legt neuen Auth-User an + Profil + Rolle (nur Admin)'],
                ['delete-user', 'Edge Function', 'Löscht Auth-User und zugehöriges Profil (nur Admin)'],
                ['list-user-emails', 'Edge Function', 'Listet E-Mail-Adressen der Auth-User für Admin-Übersicht'],
                ['invite-portal-customer', 'Edge Function', 'Erstellt Portal-Kunden-Account mit Auth-User + portal_customers-Eintrag'],
                ['send-password-reset', 'Edge Function', 'Sendet Passwort-Reset-E-Mail mit korrektem Redirect'],
                ['reset-user-password', 'Edge Function', 'Setzt Passwort eines Users zurück (Admin-Aktion)'],
                ['send-due-notifications', 'Edge Function', 'Verschickt Fälligkeits-Benachrichtigungen (geplant)'],
                ['api-dashboard', 'Edge Function', 'REST-API für externe Dashboards (Bearer Token Auth, Ressourcen: stats, cases, tickets, projects, users, departments)'],
                ['analyze-ticket', 'Edge Function', 'KI-gestützte Analyse von Support-Tickets'],
                ['assign_project_number()', 'DB Trigger', 'Vergibt atomare Projektnummer bei INSERT'],
                ['assign_case_number()', 'DB Trigger', 'Vergibt atomare Vorgangsnummer bei INSERT'],
                ['handle_new_user()', 'DB Trigger', 'Erstellt users_profile + user_roles bei neuem Auth-User'],
              ]}
            />
          </Card>

          {/* ─── TASTENKÜRZEL ─── */}
          <Card title="Tastenkürzel" id="shortcuts">
            <Table
              headers={['Kürzel', 'Aktion']}
              rows={[
                ['⌘K / Ctrl+K', 'Command Palette öffnen/schließen'],
                ['↑ / ↓', 'In Command Palette navigieren'],
                ['Enter', 'Ausgewählten Befehl ausführen'],
                ['Escape', 'Dialog/Palette schließen'],
              ]}
            />
          </Card>

        </div>
      </div>
    </AppLayout>
  );
}
