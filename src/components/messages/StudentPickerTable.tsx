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
    return <div className="text-sm text-gray-400 text-center py-10">No students match the current filters.</div>;
  }

  return (
    <div
      className="overflow-auto rounded-2xl border border-emerald-100 bg-white/80"
      style={{ maxHeight: '15rem', boxShadow: '0 1px 4px 0 rgba(16,185,129,0.06)' }}
    >
      <table className="min-w-full divide-y divide-emerald-50 text-xs">
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
