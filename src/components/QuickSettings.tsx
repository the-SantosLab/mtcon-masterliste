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
      className="fixed bottom-3 left-[14.5rem] z-40 flex items-center gap-2 px-2 py-1.5 rounded-lg border border-border/40 bg-card/70 backdrop-blur-sm shadow-sm"
        role="region"
        aria-label="Schnelleinstellungen"
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setTheme(isDark ? 'light' : 'dark')}
              aria-label="Dark mode umschalten"
              className="h-10 w-10 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            >
              {isDark ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
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
                'h-10 w-10 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors',
                preferences.compactTables && 'text-foreground'
              )}
            >
              {preferences.compactTables ? <Rows4 className="h-5 w-5" /> : <Rows3 className="h-5 w-5" />}
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
