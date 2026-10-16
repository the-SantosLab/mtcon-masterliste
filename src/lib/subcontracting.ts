export function parseMaterialQuantity(value: string): number {
  return Number(value.trim().replace(',', '.'));
}

export function validReturn(quantity: number, issued: number, returned: number): boolean {
  return Number.isFinite(quantity) && quantity > 0 && quantity <= issued - returned;
}

export function canIssue(status: string): boolean { return status === 'draft'; }
export function canReceive(status: string): boolean { return status === 'issued' || status === 'partial'; }

export function hasOpenSubcontractSteps(statuses: string[]): boolean {
  return statuses.some(status => status !== 'completed' && status !== 'cancelled');
}