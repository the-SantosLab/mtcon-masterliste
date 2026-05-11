import { Sun, Moon, Rows3, Rows4 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { usePreferences } from '@/contexts/PreferencesContext';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export function QuickSettings() {
  const { preferences, setTheme, setCompactTables } = usePreferences();
  const isDark = preferences.theme === 'dark';

  return (
    <TooltipProvider delayDuration={300}>
      <div
        className="fixed bottom-3 left-3 z-40 flex items-center gap-3 px-3 py-2 rounded-lg border border-border/60 bg-card/80 backdrop-blur-md shadow-lg"
        role="region"
        aria-label="Schnelleinstellungen"
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <label className="flex items-center gap-1.5 cursor-pointer">
              {isDark ? <Moon className="h-3.5 w-3.5 text-foreground" /> : <Sun className="h-3.5 w-3.5 text-foreground" />}
              <Switch
                checked={isDark}
                onCheckedChange={(v) => setTheme(v ? 'dark' : 'light')}
                aria-label="Dark mode umschalten"
              />
            </label>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-[11px]">
            {isDark ? 'Dark Mode aktiv' : 'Light Mode aktiv'}
          </TooltipContent>
        </Tooltip>

        <div className="h-5 w-px bg-border/60" />

        <Tooltip>
          <TooltipTrigger asChild>
            <label className="flex items-center gap-1.5 cursor-pointer">
              {preferences.compactTables ? <Rows4 className="h-3.5 w-3.5 text-foreground" /> : <Rows3 className="h-3.5 w-3.5 text-foreground" />}
              <Switch
                checked={preferences.compactTables}
                onCheckedChange={setCompactTables}
                aria-label="Kompakte Ansicht umschalten"
              />
            </label>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-[11px]">
            {preferences.compactTables ? 'Kompakte Ansicht' : 'Standard-Ansicht'}
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
