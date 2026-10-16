import { describe, it, expect } from 'vitest';
import { validateEan } from './ean';

describe('validateEan', () => {
  it('akzeptiert gültige EAN-13', () => expect(validateEan('4006381333931')).toBeNull());
  it('akzeptiert gültige EAN-8', () => expect(validateEan('96385074')).toBeNull());
  it('lehnt falsche Prüfziffer ab', () => expect(validateEan('4006381333932')).toMatch(/Prüfziffer/));
  it('lehnt falsche Länge ab', () => expect(validateEan('12345')).toMatch(/Ziffern haben/));
  it('lehnt Buchstaben ab', () => expect(validateEan('40063813339A1')).toMatch(/nur Ziffern/));
});
