import type { Department } from '../../types';
import { DEPARTMENTS, DEPARTMENT_ORDER } from '../../utils/departments';

interface DepartmentFilterChipsProps {
  /** Circular count per department (including the 'All' pseudo-total). */
  counts: Partial<Record<Department, number>>;
  active: Department;
  onChange: (dept: Department) => void;
}

/** Horizontally scrollable department filter chip row with per-department
 *  counts — SMP Connect style. Only departments that have circulars are shown
 *  (plus the "All" chip, always first). */
export function DepartmentFilterChips({ counts, active, onChange }: DepartmentFilterChipsProps) {
  const visible = DEPARTMENT_ORDER.filter((d) => d === 'All' || (counts[d] ?? 0) > 0);

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1 pb-1">
      {visible.map((dept) => {
        const meta = DEPARTMENTS[dept];
        const isActive = active === dept;
        const count = counts[dept] ?? 0;
        return (
          <button
            key={dept}
            onClick={() => onChange(dept)}
            className={`shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-bold transition-colors cursor-pointer ${isActive ? meta.chipActive : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
          >
            {dept}
            <span className={`rounded-full px-1.5 py-px text-[9px] font-bold ${isActive ? 'bg-white/25 text-white' : 'bg-gray-100 text-gray-500'}`}>
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
