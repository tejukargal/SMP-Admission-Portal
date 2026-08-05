import type { Student } from '../../types';

export type FeeStatusValue = 'paid' | 'not-paid' | 'has-dues' | 'no-dues';

export interface PickerRow {
  student: Student;
  balance: number | null;
  paid: number;
}

export function feeStatusOf(row: PickerRow): FeeStatusValue | null {
  if (row.balance === null) return null;
  if (row.paid === 0) return 'not-paid';
  if (row.balance <= 0) return 'paid';
  return 'has-dues';
}

const FEE_STATUS_BADGE: Record<FeeStatusValue, string> = {
  paid: 'bg-emerald-100 text-emerald-700',
  'not-paid': 'bg-red-100 text-red-700',
  'has-dues': 'bg-amber-100 text-amber-700',
  'no-dues': 'bg-emerald-100 text-emerald-700',
};

const FEE_STATUS_LABEL: Record<FeeStatusValue, string> = {
  paid: 'Paid',
  'not-paid': 'Not Paid',
  'has-dues': 'Has Dues',
  'no-dues': 'No Dues',
};

interface StudentPickerTableProps {
  rows: PickerRow[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
}

export function StudentPickerTable({ rows, selected, onToggle, onToggleAll }: StudentPickerTableProps) {
  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.student.id));
  const someChecked = rows.some((r) => selected.has(r.student.id)) && !allChecked;

  if (rows.length === 0) {
    return (
      <div
        className="flex-1 min-h-0 flex items-center justify-center text-sm text-gray-400 rounded-2xl border border-emerald-100 bg-white/80"
        style={{ boxShadow: '0 1px 4px 0 rgba(16,185,129,0.06)' }}
      >
        No students match the current filters.
      </div>
    );
  }

  return (
    <div
      className="flex-1 min-h-0 overflow-auto rounded-2xl border border-emerald-100 bg-white/80"
      style={{ boxShadow: '0 1px 4px 0 rgba(16,185,129,0.06)' }}
    >
      {/* Mobile card list — tap a card to toggle selection, avoids the 14-column table below */}
      <div className="sm:hidden divide-y divide-emerald-50/60">
        <label className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-emerald-50 to-sky-50 sticky top-0 z-10 cursor-pointer">
          <input
            type="checkbox"
            checked={allChecked}
            ref={(el) => { if (el) el.indeterminate = someChecked; }}
            onChange={onToggleAll}
            className="cursor-pointer shrink-0"
          />
          <span className="text-[11px] font-semibold text-gray-600">Select all ({rows.length})</span>
        </label>
        {rows.map((row) => {
          const s = row.student;
          const isSelected = selected.has(s.id);
          const feeStatus = feeStatusOf(row);
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onToggle(s.id)}
              className={`w-full text-left flex items-start gap-2.5 px-3 py-2.5 cursor-pointer transition-colors ${isSelected ? 'bg-emerald-50/60' : 'active:bg-emerald-50/40'}`}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => onToggle(s.id)}
                onClick={(e) => e.stopPropagation()}
                className="mt-0.5 cursor-pointer shrink-0"
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-gray-900 truncate">{s.studentNameSSLC}</span>
                  {feeStatus && (
                    <span className={`shrink-0 inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${FEE_STATUS_BADGE[feeStatus]}`}>
                      {FEE_STATUS_LABEL[feeStatus]}
                    </span>
                  )}
                </span>
                <span className="block text-[11px] text-gray-500 mt-0.5">
                  {s.regNumber || '—'} · {s.course} · {s.year} · {s.gender}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Desktop/tablet table */}
      <table className="hidden sm:table min-w-full divide-y divide-emerald-50 text-xs">
        <thead className="sticky top-0 z-10" style={{ background: 'linear-gradient(90deg, #ecfdf5, #f0f9ff)' }}>
          <tr>
            <th className="px-2 py-1.5 w-8">
              <input
                type="checkbox"
                checked={allChecked}
                ref={(el) => { if (el) el.indeterminate = someChecked; }}
                onChange={onToggleAll}
                className="cursor-pointer"
              />
            </th>
            <th className="px-2 py-1.5 text-left font-semibold text-gray-500 whitespace-nowrap w-8">#</th>
            <th className="px-2 py-1.5 text-left font-semibold text-gray-500 whitespace-nowrap">Name (SSLC)</th>
            <th className="px-2 py-1.5 text-left font-semibold text-gray-500 whitespace-nowrap">Reg No</th>
            <th className="px-2 py-1.5 text-left font-semibold text-gray-500 whitespace-nowrap">Course</th>
            <th className="px-2 py-1.5 text-left font-semibold text-gray-500 whitespace-nowrap">Year</th>
            <th className="px-2 py-1.5 text-left font-semibold text-gray-500 whitespace-nowrap">Gender</th>
            <th className="px-2 py-1.5 text-left font-semibold text-gray-500 whitespace-nowrap">Category</th>
            <th className="px-2 py-1.5 text-left font-semibold text-gray-500 whitespace-nowrap">Adm Type</th>
            <th className="px-2 py-1.5 text-left font-semibold text-gray-500 whitespace-nowrap">Adm Cat</th>
            <th className="px-2 py-1.5 text-left font-semibold text-gray-500 whitespace-nowrap">Allotted Cat</th>
            <th className="px-2 py-1.5 text-left font-semibold text-gray-500 whitespace-nowrap">Mobile</th>
            <th className="px-2 py-1.5 text-left font-semibold text-gray-500 whitespace-nowrap">Status</th>
            <th className="px-2 py-1.5 text-left font-semibold text-gray-500 whitespace-nowrap">Fee Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-emerald-50/60">
          {rows.map((row, idx) => {
            const s = row.student;
            const isSelected = selected.has(s.id);
            const feeStatus = feeStatusOf(row);
            return (
              <tr key={s.id} className={isSelected ? 'bg-emerald-50/60' : 'hover:bg-emerald-50/40'}>
                <td className="px-2 py-1">
                  <input type="checkbox" checked={isSelected} onChange={() => onToggle(s.id)} className="cursor-pointer" />
                </td>
                <td className="px-2 py-1 text-gray-400 whitespace-nowrap">{idx + 1}</td>
                <td className="px-2 py-1 font-medium text-gray-900 whitespace-nowrap">{s.studentNameSSLC}</td>
                <td className="px-2 py-1 text-gray-600 whitespace-nowrap">{s.regNumber || '—'}</td>
                <td className="px-2 py-1 text-gray-700 whitespace-nowrap">{s.course}</td>
                <td className="px-2 py-1 text-gray-700 whitespace-nowrap">{s.year}</td>
                <td className="px-2 py-1 text-gray-700 whitespace-nowrap">{s.gender}</td>
                <td className="px-2 py-1 text-gray-700 whitespace-nowrap">{s.category || '—'}</td>
                <td className="px-2 py-1 text-gray-700 whitespace-nowrap">{s.admType || '—'}</td>
                <td className="px-2 py-1 text-gray-700 whitespace-nowrap">{s.admCat || '—'}</td>
                <td className="px-2 py-1 text-gray-700 whitespace-nowrap">{s.allottedCategory || '—'}</td>
                <td className="px-2 py-1 text-gray-600 whitespace-nowrap">{s.studentMobile}</td>
                <td className="px-2 py-1 whitespace-nowrap">
                  <span
                    className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${
                      s.admissionStatus === 'CONFIRMED'
                        ? 'bg-green-100 text-green-700'
                        : s.admissionStatus === 'CANCELLED'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-yellow-100 text-yellow-700'
                    }`}
                  >
                    {s.admissionStatus || '—'}
                  </span>
                </td>
                <td className="px-2 py-1 whitespace-nowrap">
                  {feeStatus ? (
                    <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${FEE_STATUS_BADGE[feeStatus]}`}>
                      {FEE_STATUS_LABEL[feeStatus]}
                    </span>
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
