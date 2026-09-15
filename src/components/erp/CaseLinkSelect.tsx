import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

type CaseRow = { id: string; case_number: string | null; project_name: string | null; status: string };

interface Props {
  value: string | null | undefined;
  onChange: (caseId: string | null) => void;
  label?: string;
  className?: string;
}

/** Auswahl eines internen Vorgangs für ein Angebot oder einen Auftrag. */
export function CaseLinkSelect({ value, onChange, label = 'Vorgang', className }: Props) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<CaseRow[]>([]);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase
        .from('cases')
        .select('id, case_number, project_name, status')
        .eq('deleted', false)
        .order('created_at', { ascending: false })
        .limit(500);
      if (active) setRows((data as any[]) ?? []);
    })();
    return () => { active = false; };
  }, []);

  const current = rows.find((r) => r.id === value);
  const labelOf = (r: CaseRow) => [r.case_number, r.project_name].filter(Boolean).join(' · ') || r.id.slice(0, 8);

  return (
    <div className={cn('space-y-1.5', className)}>
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" className="w-full h-8 text-xs justify-between font-normal">
            <span className="truncate">{current ? labelOf(current) : 'Kein Vorgang'}</span>
            <ChevronsUpDown className="h-3.5 w-3.5 opacity-50 shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
          <Command filter={(v, s) => (v.toLowerCase().includes(s.toLowerCase()) ? 1 : 0)}>
            <CommandInput placeholder="Vorgang suchen…" className="h-8 text-xs" />
            <CommandList className="max-h-72">
              <CommandEmpty className="py-4 text-center text-xs text-muted-foreground">Kein Vorgang gefunden.</CommandEmpty>
              <CommandGroup>
                <CommandItem value="kein vorgang" onSelect={() => { onChange(null); setOpen(false); }} className="text-xs">
                  <Check className={cn('mr-2 h-3.5 w-3.5', !value ? 'opacity-100' : 'opacity-0')} />
                  Kein Vorgang
                </CommandItem>
                {rows.map((r) => (
                  <CommandItem key={r.id} value={labelOf(r)} onSelect={() => { onChange(r.id); setOpen(false); }} className="text-xs">
                    <Check className={cn('mr-2 h-3.5 w-3.5', value === r.id ? 'opacity-100' : 'opacity-0')} />
                    <span className="truncate">{labelOf(r)}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export default CaseLinkSelect;
