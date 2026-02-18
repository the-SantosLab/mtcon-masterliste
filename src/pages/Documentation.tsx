import { AppLayout } from '@/components/AppLayout';
import { cn } from '@/lib/utils';
import {
  Moon, AlignJustify, Building2, FolderOpen,
  Hash, Shield, Users, Eye, ChevronRight,
  Layers, GitBranch, Lock,
} from 'lucide-react';

interface Section {
  id: string;
  label: string;
  icon: React.ElementType;
}

const SECTIONS: Section[] = [
  { id: 'overview', label: 'Übersicht v1.5', icon: Layers },
  { id: 'darkmode', label: 'Dark Mode & Tabellen', icon: Moon },
  { id: 'departments', label: 'Abteilungen', icon: Building2 },
  { id: 'projects', label: 'Projekte & Ordner', icon: FolderOpen },
  { id: 'numbering', label: 'Auto-Nummerierung', icon: Hash },
  { id: 'roles', label: 'Rollen & Zugriffsrechte', icon: Shield },
  { id: 'rls', label: 'RLS-Logik & Policies', icon: Lock },
  { id: 'schema', label: 'Datenmodell', icon: GitBranch },
];

function Badge({ children, color = 'muted' }: { children: React.ReactNode; color?: 'primary' | 'muted' | 'success' | 'warn' | 'danger' }) {
  const cls = {
    primary: 'bg-primary/10 text-primary border-primary/20',
    muted: 'bg-muted text-muted-foreground border-border',
    success: 'bg-[hsl(var(--status-done)/0.15)] text-[hsl(var(--status-done))] border-[hsl(var(--status-done)/0.3)]',
    warn: 'bg-[hsl(var(--status-overdue)/0.15)] text-[hsl(var(--status-overdue))] border-[hsl(var(--status-overdue)/0.3)]',
    danger: 'bg-[hsl(var(--status-rejected)/0.15)] text-[hsl(var(--status-rejected))] border-[hsl(var(--status-rejected)/0.3)]',
  }[color];
  return <span className={cn('inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-mono border', cls)}>{children}</span>;
}

function Rule({ label, value, color }: { label: string; value: string; color?: 'success' | 'danger' | 'warn' }) {
  const icon = color === 'success' ? '✓' : color === 'danger' ? '✗' : '○';
  const cls = color === 'success' ? 'text-[hsl(var(--status-done))]' : color === 'danger' ? 'text-[hsl(var(--status-rejected))]' : 'text-muted-foreground';
  return (
    <div className="flex items-start gap-2 py-1">
      <span className={cn('text-xs font-mono shrink-0', cls)}>{icon}</span>
      <div>
        <span className="text-xs font-medium text-foreground">{label}</span>
        <span className="text-xs text-muted-foreground ml-2">{value}</span>
      </div>
    </div>
  );
}

function Card({ title, children, id }: { title: string; children: React.ReactNode; id: string }) {
  return (
    <div id={id} className="rounded-md border border-border bg-card overflow-hidden">
      <div className="px-5 py-3.5 border-b border-border">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      </div>
      <div className="px-5 py-4 space-y-3 text-xs text-muted-foreground leading-relaxed">
        {children}
      </div>
    </div>
  );
}

function Table({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="rounded border border-border overflow-hidden mt-2">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            {headers.map(h => <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground">{h}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row, i) => (
            <tr key={i} className="hover:bg-muted/30">
              {row.map((cell, j) => <td key={j} className="px-3 py-2 text-foreground font-mono">{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <pre className="bg-muted rounded px-3 py-2.5 text-[11px] font-mono text-foreground overflow-x-auto border border-border mt-2">
      {children}
    </pre>
  );
}

export default function Documentation() {
  return (
    <AppLayout>
      <div className="flex gap-6 max-w-6xl">
        {/* Sidebar TOC */}
        <div className="hidden lg:block w-48 shrink-0">
          <div className="sticky top-0 space-y-0.5 pt-1">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-2 pb-2">Inhalt</p>
            {SECTIONS.map(s => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="flex items-center gap-2 px-2 py-1.5 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              >
                <s.icon className="h-3 w-3 shrink-0" />
                {s.label}
              </a>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 space-y-5 min-w-0">
          <div id="overview">
            <div className="flex items-center gap-3 mb-4">
              <div>
                <h1 className="text-lg font-semibold text-foreground">KS Command Light</h1>
                <div className="flex items-center gap-2 mt-1">
                  <Badge color="primary">v1.5</Badge>
                  <span className="text-[11px] text-muted-foreground">— Changes & Rules</span>
                </div>
              </div>
            </div>

            <Card title="Übersicht — Was ist neu in v1.5?" id="overview-card">
              <p>Dieses Update führt 6 neue Kernfunktionen ein, die das System in ein vollständiges Projekt-Management-Backoffice verwandeln.</p>
              <div className="grid grid-cols-2 gap-2 mt-3">
                {[
                  ['🌙', 'Dark Mode', 'Standard aktiv, toggle pro User'],
                  ['📐', 'Compact Tables', 'Toggle für dichtere Tabellen-UI'],
                  ['🏢', 'Abteilungen', 'Departments ersetzen/ergänzen Rollen'],
                  ['📁', 'Projektverwaltung', 'Projekte mit Ordnerstruktur'],
                  ['#', 'Auto-Nummerierung', 'PRJ-2026-xxxx / VOR-2026-xxxx'],
                  ['🔐', 'RLS erweitert', 'Visibility-Regeln für Items'],
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

          <Card title="Dark Mode & Compact Tables" id="darkmode">
            <p><strong className="text-foreground">Dark Mode</strong> ist der Standard bei Erstanmeldung. Der Toggle befindet sich im Profil-Dropdown (unten links in der Sidebar).</p>
            <Rule label="Theme-Preference" value="Wird pro User in user_preferences gespeichert (DB)" color="success" />
            <Rule label="Dark als Default" value="HTML-Root-Klasse .dark ist im index.html gesetzt" color="success" />
            <Rule label="Keine harten Farben" value="Alle Farben über CSS-Tokens (HSL-Variablen)" color="success" />
            <p className="mt-2"><strong className="text-foreground">Compact Tables</strong> reduziert Zellenpaddding von <Badge>px-4 py-2.5</Badge> auf <Badge>px-3 py-1.5</Badge> — ~25% mehr Zeilen sichtbar. Toggle ebenfalls im Profil-Dropdown.</p>
            <p className="text-[11px] mt-2">Beide Einstellungen werden in der Tabelle <Badge color="primary">user_preferences</Badge> pro User gespeichert und beim nächsten Login automatisch geladen.</p>
          </Card>

          <Card title="Abteilungen (Departments)" id="departments">
            <p>Abteilungen ergänzen das bestehende Rollensystem (<Badge>admin</Badge> <Badge>staff</Badge> <Badge>viewer</Badge>) um eine Organisationsstruktur.</p>
            <div className="mt-2 space-y-1">
              <Rule label="Parallel zu app_role" value="user_roles-Tabelle bleibt für Zugriffssteuerung aktiv" color="success" />
              <Rule label="Abteilungs-Zuordnung" value="users_profile.department_id → departments.id" color="success" />
              <Rule label="Manager-Flag" value="users_profile.is_manager = true für Abteilungsleiter" color="success" />
              <Rule label="Direkte Vorgesetzte" value="users_profile.manager_id → users_profile.id" color="success" />
            </div>
            <p className="mt-2">Verwaltung unter: <Badge color="primary">Verwaltung → Abteilungen</Badge></p>
            <Table
              headers={['Tabelle', 'Spalte', 'Zweck']}
              rows={[
                ['departments', 'id, name, code', 'Abteilungs-Stammdaten'],
                ['departments', 'manager_user_id', 'Abteilungsleiter (FK → users_profile)'],
                ['users_profile', 'department_id', 'Zuordnung User → Abteilung'],
                ['users_profile', 'manager_id', 'Direkter Vorgesetzter'],
                ['users_profile', 'is_admin, is_manager', 'Flags für Rollenlogik'],
              ]}
            />
          </Card>

          <Card title="Projekte & automatische Ordnerstruktur" id="projects">
            <p>Beim Anlegen eines Projekts wird automatisch eine Standard-Ordnerstruktur in Storage + Datenbank erstellt.</p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {['01_Admin', '02_Briefing', '03_Kalkulation', '04_Assets', '05_Delivery', '99_Archiv'].map(f => (
                <div key={f} className="flex items-center gap-1.5 rounded border border-border px-2 py-1.5">
                  <FolderOpen className="h-3 w-3 text-muted-foreground shrink-0" />
                  <span className="text-[11px] font-mono text-foreground">{f}</span>
                </div>
              ))}
            </div>
            <p className="mt-3">Die Erstellung erfolgt über die Edge Function <Badge color="primary">create-project-folders</Badge>, die:</p>
            <div className="space-y-1 mt-1">
              <Rule label="DB-Einträge" value="Legt Einträge in project_folders an (virtuell)" color="success" />
              <Rule label="Storage-Objekte" value="Erstellt .keep-Platzhalter im Bucket project-files" color="success" />
              <Rule label="Pfadstruktur" value="{project_code}_{project_number}/{ordner}/" color="success" />
            </div>
            <p className="mt-3">Datei-Upload erfolgt direkt in den jeweiligen Ordner via Supabase Storage.</p>
          </Card>

          <Card title="Auto-Nummerierung" id="numbering">
            <p>Alle neuen Objekte erhalten eine menschenlesbare, fortlaufende Nummer, die atomar per DB-Funktion vergeben wird.</p>
            <Table
              headers={['Objekt', 'Format', 'Beispiel']}
              rows={[
                ['Projekt', 'PRJ-YYYY-nnnn', 'PRJ-2026-0001'],
                ['Vorgang', 'VOR-YYYY-nnnn', 'VOR-2026-0042'],
              ]}
            />
            <p className="mt-3">Technisch: Jede Erstellung ruft <Badge color="primary">next_counter(key)</Badge> auf — ein atomares <Badge>UPDATE … RETURNING</Badge>, das Race Conditions verhindert.</p>
            <Code>{`-- Zähler-Funktion (atomic)
SELECT public.next_counter('project_2026');
-- Gibt nächsten Wert zurück + erhöht atomar

-- Trigger auf projects:
NEW.project_number := 'PRJ-' || year || '-' || lpad(counter, 4, '0');`}</Code>
            <p className="mt-2 text-[11px]">Hinweis: Falls ein INSERT fehlschlägt, kann eine Nummer "verbrannt" werden. Dies ist akzeptables Verhalten bei atomaren Countern.</p>
          </Card>

          <Card title="Rollen & Zugriffsrechte" id="roles">
            <p>Das System kennt 3 App-Rollen (<Badge color="primary">app_role</Badge>) + optionale Flags.</p>
            <Table
              headers={['Rolle', 'Lesen', 'Erstellen', 'Bearbeiten', 'Löschen', 'Admin-Bereich']}
              rows={[
                ['admin', '✓ Alles', '✓ Alles', '✓ Alles', '✓ Alles', '✓'],
                ['staff', '✓ Alles', '✓ Vorgänge/Projekte', '○ Eigene/Zugewiesen', '✗', '✗'],
                ['viewer', '✓ Alles', '✗', '✗', '✗', '✗'],
                ['is_manager', '+ Abteilung + Reports', '✓', '○ Abteilung', '✗', '✗'],
              ]}
            />
            <div className="mt-3 space-y-1">
              <Rule label="Admin" value="Sieht und verwaltet alles im System" color="success" />
              <Rule label="Staff" value="Kann Vorgänge abholen, erstellen, bearbeiten — eigene zugewiesene" color="success" />
              <Rule label="Viewer" value="Nur lesender Zugriff auf alle Daten" color="warn" />
              <Rule label="Manager" value="Sieht Abteilungs-Items + alle direkten Reports" color="success" />
            </div>
          </Card>

          <Card title="RLS-Logik & Policies" id="rls">
            <p>Alle Tabellen haben Row-Level-Security (RLS) aktiviert. Die Logik basiert auf Security-Definer-Funktionen, um rekursive Policies zu vermeiden.</p>
            <div className="space-y-2 mt-2">
              <p className="text-xs font-medium text-foreground">Helper-Funktionen:</p>
              <Table
                headers={['Funktion', 'Zweck']}
                rows={[
                  ['check_is_admin(uid)', 'Prüft user_roles + is_admin Flag'],
                  ['check_is_manager(uid)', 'Prüft is_manager Flag auf users_profile'],
                  ['user_department(uid)', 'Gibt department_id des Users zurück'],
                  ['is_direct_report(mgr, uid)', 'Prüft ob uid unter mgr als manager_id hat'],
                  ['is_project_member(project_id, uid)', 'Prüft project_members Tabelle'],
                  ['has_role(uid, role)', 'Prüft user_roles Tabelle (original)'],
                  ['next_counter(key)', 'Atomarer Counter-Increment'],
                ]}
              />
            </div>
            <p className="text-xs font-medium text-foreground mt-3">Visibility-Regeln für Projekte:</p>
            <div className="space-y-1 mt-1">
              <Rule label="private" value="Nur Ersteller/Owner sieht das Projekt" color="warn" />
              <Rule label="department" value="Alle User der selben Abteilung sehen es" color="success" />
              <Rule label="project_members" value="Nur in project_members eingetragene User" color="success" />
            </div>
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

          <Card title="Datenmodell — neue Tabellen v1.5" id="schema">
            <Table
              headers={['Tabelle', 'Zweck', 'Wichtige Spalten']}
              rows={[
                ['departments', 'Abteilungen', 'id, name, code, manager_user_id'],
                ['user_preferences', 'Theme & Compact pro User', 'user_id (PK), theme, compact_tables'],
                ['counters', 'Atomare Nummerierung', 'key (unique), value (int)'],
                ['projects', 'Projekte', 'project_number, name, visibility, department_id'],
                ['project_members', 'Team pro Projekt', 'project_id, user_id, role'],
                ['project_folders', 'Virtuelle Ordnerstruktur', 'project_id, name, path, sort_order'],
                ['cases (erweitert)', 'Vorgänge + neue Felder', '+ project_id, department_id, visibility, case_number'],
                ['users_profile (erweitert)', 'Profil + neue Felder', '+ department_id, manager_id, is_admin, is_manager'],
              ]}
            />
            <p className="mt-3 text-[11px]">Storage-Bucket: <Badge color="primary">project-files</Badge> (privat, auth required für alle Operationen)</p>
            <p className="text-[11px] mt-1">Edge Function: <Badge color="primary">create-project-folders</Badge> — wird nach Projekt-Insert vom Client aufgerufen</p>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
