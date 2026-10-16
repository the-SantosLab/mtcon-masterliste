export type ProcessShape = 'point' | 'line' | 'triangle' | 'square' | 'multi';

/** Shape of a case = number of involved departments: 1 Punkt, 2 Linie, 3 Dreieck, 4 Quadrat, more than 4 = Mehreck. */
export function shapeForDepartments(count: number): ProcessShape | null {
  if (count <= 0) return null;
  return count === 1 ? 'point' : count === 2 ? 'line' : count === 3 ? 'triangle' : count === 4 ? 'square' : 'multi';
}

export const shapeLabel: Record<ProcessShape, string> = {
  point: 'Punkt', line: 'Linie', triangle: 'Dreieck', square: 'Quadrat', multi: 'Mehr als 4',
};

/** Distinct departments of a case: its owning department plus every department with a task. */
export function involvedDepartments(caseDept: string | null, taskDepts: (string | null)[]): string[] {
  return [...new Set([caseDept, ...taskDepts].filter((d): d is string => Boolean(d)))];
}
