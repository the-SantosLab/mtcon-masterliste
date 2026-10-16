import { describe, it, expect } from 'vitest';
import { shapeForDepartments, involvedDepartments } from './processShape';

describe('Prozessform nach Abteilungen', () => {
  it('1 Punkt, 2 Linie, 3 Dreieck, 4 Quadrat', () => {
    expect([1, 2, 3, 4].map(shapeForDepartments)).toEqual(['point', 'line', 'triangle', 'square']);
  });
  it('mehr als 4 Abteilungen und keine Abteilung', () => {
    expect(shapeForDepartments(5)).toBe('multi');
    expect(shapeForDepartments(0)).toBeNull();
  });
  it('zählt jede Abteilung nur einmal', () => {
    expect(involvedDepartments('a', ['a', 'b', null, 'b'])).toEqual(['a', 'b']);
  });
});
