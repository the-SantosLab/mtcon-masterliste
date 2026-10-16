import { describe, it, expect } from 'vitest';
import { missingData, groupCompanies, isSupplier, type Company } from './companyPages';

const c = (p: Partial<Company>) => ({ id: 'a', name: 'A', partner_role: 'customer', parent_company_id: null, industry: null, ...p } as Company);

describe('Kundenfirmen-Seiten', () => {
  it('suppliers include both-role partners', () => {
    expect([isSupplier(c({ partner_role: 'supplier' })), isSupplier(c({ partner_role: 'both' })), isSupplier(c({}))]).toEqual([true, true, false]);
  });
  it('customers without customer number are flagged', () => {
    expect(missingData(c({ address: 'x', email: 'e' }))).toEqual(['Kundennummer']);
  });
  it('subsidiaries group under their parent', () => {
    const g = groupCompanies([c({ id: 'p', name: 'Holding', industry: 'Bau' }), c({ id: 's', parent_company_id: 'p' })]);
    expect(g.map(x => x.name).sort()).toEqual(['Bau', 'Konzern: Holding']);
  });
});
