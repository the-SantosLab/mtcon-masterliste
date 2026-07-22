import { supabase } from '@/integrations/supabase/client';

const PAGE_SIZE = 1000;

export interface CompanyOption {
  id: string;
  name: string;
}

export interface OfferDealOption {
  id: string;
  deal_no: string | null;
  title: string;
  company_id: string | null;
  companies?: { name: string } | null;
}

const byName = (a: CompanyOption, b: CompanyOption) => a.name.localeCompare(b.name, 'de');

export async function fetchAllCompanies(): Promise<CompanyOption[]> {
  const rows: CompanyOption[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('companies')
      .select('id, name')
      .order('name')
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }

  return rows.sort(byName);
}

export async function fetchAllOfferDealOptions(): Promise<OfferDealOption[]> {
  const rows: OfferDealOption[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('deals')
      .select('id, deal_no, title, company_id, companies(name)')
      .order('created_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    rows.push(...((data ?? []) as OfferDealOption[]));
    if (!data || data.length < PAGE_SIZE) break;
  }

  return rows;
}