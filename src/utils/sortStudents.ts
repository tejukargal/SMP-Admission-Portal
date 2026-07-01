import type { Student } from '../types';

// Canonical (non-alphabetical) orderings for fields where alphabetical sort
// wouldn't match the domain's natural order.
const COURSE_ORDER: Record<string, number> = { CE: 1, ME: 2, EC: 3, CS: 4, EE: 5 };
const YEAR_ORDER: Record<string, number> = { '1ST YEAR': 1, '2ND YEAR': 2, '3RD YEAR': 3 };

export type SortableField = 'studentNameSSLC' | 'course' | 'year';

export interface SortLevel {
  field: SortableField | '';
  direction: 'asc' | 'desc';
}

export const SORT_FIELD_OPTIONS: { value: SortableField; label: string }[] = [
  { value: 'studentNameSSLC', label: 'Name'   },
  { value: 'course',          label: 'Course' },
  { value: 'year',            label: 'Year'   },
];

function compareField(a: Student, b: Student, field: SortableField): number {
  if (field === 'course') return (COURSE_ORDER[a.course] ?? 99) - (COURSE_ORDER[b.course] ?? 99);
  if (field === 'year')   return (YEAR_ORDER[a.year] ?? 99) - (YEAR_ORDER[b.year] ?? 99);
  return a.studentNameSSLC.localeCompare(b.studentNameSSLC);
}

/** Excel-style multi-level sort: earlier levels take priority, later levels break ties. */
export function sortByLevels(rows: Student[], levels: SortLevel[]): Student[] {
  const active = levels.filter((l): l is { field: SortableField; direction: 'asc' | 'desc' } => !!l.field);
  if (active.length === 0) return rows;
  return [...rows].sort((a, b) => {
    for (const level of active) {
      const dir = level.direction === 'asc' ? 1 : -1;
      const cmp = compareField(a, b, level.field) * dir;
      if (cmp !== 0) return cmp;
    }
    return 0;
  });
}
