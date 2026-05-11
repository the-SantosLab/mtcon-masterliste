import { Sun, Moon, Rows3, Rows4 } from 'lucide-react';
import { usePreferences } from '@/contexts/PreferencesContext';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export function QuickSettings() {
  const { preferences, setTheme, setCompactTables } = usePreferences();
  const isDark = preferences.theme === 'dark';

  return (
    <TooltipProvider delayDuration={300}>
      <div
        className="fixed bottom-2 left-2 z-40 flex items-center gap-0.5 px-1 py-0.5 rounded-md border border-border/30 bg-card/40 backdrop-blur-sm opacity-40 hover:opacity-100 transition-opacity"
        role="region"
        aria-label="Schnelleinstellungen"
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setTheme(isDark ? 'light' : 'dark')}
              aria-label="Dark mode umschalten"
              className="h-5 w-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            >
              {isDark ? <Moon className="h-3 w-3" /> : <Sun className="h-3 w-3" />}
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-[10px]">
            {isDark ? 'Dark' : 'Light'}
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setCompactTables(!preferences.compactTables)}
              aria-label="Kompakte Ansicht umschalten"
              className={cn(
                'h-5 w-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors',
                preferences.compactTables && 'text-foreground'
              )}
            >
              {preferences.compactTables ? <Rows4 className="h-3 w-3" /> : <Rows3 className="h-3 w-3" />}
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-[10px]">
            {preferences.compactTables ? 'Kompakt' : 'Standard'}
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
