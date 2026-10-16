import type { Tables } from '@/integrations/supabase/types';

export type Company = Tables<'companies'>;
export const companyPages = [
  { key: 'edit', title: 'Firmen bearbeiten', short: 'Bearbeiten', path: '/crm/firmen/bearbeiten' },
  { key: 'locations', title: 'Adressen & Standorte', short: 'Standorte', path: '/crm/firmen/standorte' },
  { key: 'groups', title: 'Kundengruppen', short: 'Gruppen', path: '/crm/firmen/gruppen' },
  { key: 'suppliers', title: 'Lieferanten', short: 'Lieferanten', path: '/crm/firmen/lieferanten' },
  { key: 'documents', title: 'Dokumente', short: 'Dokumente', path: '/crm/firmen/dokumente' },
  { key: 'history', title: 'Firmenhistorie', short: 'Historie', path: '/crm/firmen/historie' },
] as const;
export type CompanyPageKey = typeof companyPages[number]['key'];

export const isSupplier = (c: Company) => c.partner_role === 'supplier' || c.partner_role === 'both';
export const isCustomer = (c: Company) => c.partner_role === 'customer' || c.partner_role === 'both';
/** Missing master data that blocks invoicing or ordering. */
export function missingData(c: Company): string[] {
  const m: string[] = [];
  if (!c.billing_street && !c.address) m.push('Rechnungsadresse');
  if (!c.email && !c.phone) m.push('Kontaktdaten');
  if (isCustomer(c) && !c.customer_no) m.push('Kundennummer');
  if (isSupplier(c) && !c.supplier_code) m.push('Lieferantennummer');
  return m;
}
/** Group key: parent company name for subsidiaries, otherwise the industry. */
export function groupCompanies(companies: Company[]): { name: string; members: Company[] }[] {
  const byId = new Map(companies.map(c => [c.id, c]));
  const groups = new Map<string, Company[]>();
  for (const c of companies) {
    const parent = c.parent_company_id ? byId.get(c.parent_company_id) : undefined;
    const key = parent ? `Konzern: ${parent.name}` : (c.industry?.trim() || 'Ohne Branche');
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  return [...groups].map(([name, members]) => ({ name, members })).sort((a, b) => b.members.length - a.members.length);
}
