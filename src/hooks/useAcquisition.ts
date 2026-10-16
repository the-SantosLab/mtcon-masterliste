import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { AcquisitionLead, AcquisitionActivity, AcquisitionCompany, AcquisitionContact } from '@/lib/acquisition';

// Load all visible records, not just the backend's default first page.
async function paged<T>(read: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const result: T[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await read(from, from + 499);
    if (error) throw new Error(error.message);
    result.push(...(data ?? []));
    if ((data ?? []).length < 500) return result;
  }
}

export function useAcquisition() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['crm-acquisition', user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const [leads, activities, companies, contacts] = await Promise.all([
        paged<AcquisitionLead>((from, to) => supabase.from('leads').select('*').order('id').range(from, to)),
        paged<AcquisitionActivity>((from, to) => supabase.from('crm_activities').select('*').order('id').range(from, to)),
        paged<AcquisitionCompany>((from, to) => supabase.from('companies').select('*').eq('is_active', true).order('id').range(from, to)),
        paged<AcquisitionContact>((from, to) => supabase.from('contacts').select('*').order('id').range(from, to)),
      ]);
      return { leads, activities, companies, contacts };
    },
  });
}