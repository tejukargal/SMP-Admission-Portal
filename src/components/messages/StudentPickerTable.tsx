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

// Thin-outline pastel pills (Student Messages cyan revamp).
const PILL = 'inline-flex items-center gap-1 px-2 py-[2px] rounded-full border bg-white text-[10px] font-medium';
const FEE_STATUS_BADGE: Record<FeeStatusValue, string> = {
  paid: 'border-[#0FA968]/40 text-[#0A7A4B]',
  'not-paid': 'border-[#E11D48]/35 text-[#A5173A]',
  'has-dues': 'border-[#D97706]/40 text-[#9A5B00]',
  'no-dues': 'border-[#0FA968]/40 text-[#0A7A4B]',
};
const CARD = 'rounded-2xl border border-[#CBE8F0] bg-white';
const TH = 'px-2.5 py-2 text-left text-[10.5px] font-medium uppercase tracking-[0.6px] text-[#0E6A85] whitespace-nowrap';

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
        className={`flex-1 min-h-0 flex items-center justify-center text-[12.5px] text-[#8A93A3] ${CARD}`}
      >
        No students match the current filters.
      </div>
    );
  }

  return (
    <div
      className={`flex-1 min-h-0 overflow-auto scroll-fee ${CARD}`}
    >
      {/* Mobile card list — tap a card to toggle selection, avoids the 14-column table below */}
      <div className="sm:hidden divide-y divide-[#ECF7FA]">
        <label className="flex items-center gap-2 px-3 py-2 bg-[#ECF7FA] sticky top-0 z-10 cursor-pointer">
          <input
            type="checkbox"
            checked={allChecked}
            ref={(el) => { if (el) el.indeterminate = someChecked; }}
            onChange={onToggleAll}
            className="cursor-pointer shrink-0 accent-[#0891B2]"
          />
          <span className="text-[11px] font-medium text-[#0E6A85]">Select all ({rows.length})</span>
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
              className={`w-full text-left flex items-start gap-2.5 px-3 py-2.5 cursor-pointer transition-colors ${isSelected ? 'bg-[#0891B2]/[0.07]' : 'active:bg-[#0891B2]/[0.04]'}`}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => onToggle(s.id)}
                onClick={(e) => e.stopPropagation()}
                className="mt-0.5 cursor-pointer shrink-0 accent-[#0891B2]"
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="text-[13px] font-medium text-[#262B35] truncate">{s.studentNameSSLC}</span>
                  {feeStatus && (
                    <span className={`shrink-0 ${PILL} ${FEE_STATUS_BADGE[feeStatus]}`}>
                      {FEE_STATUS_LABEL[feeStatus]}
                    </span>
                  )}
                </span>
                <span className="block text-[11px] text-[#8A93A3] mt-0.5">
                  {s.regNumber || '—'} · {s.course} · {s.year} · {s.gender}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Desktop/tablet table */}
      <table className="hidden sm:table min-w-full text-[12px]">
        <thead className="sticky top-0 z-10 bg-[#ECF7FA] shadow-[inset_0_-1px_0_#CBE8F0]">
          <tr>
            <th className="px-2.5 py-2 w-8">
              <input
                type="checkbox"
                checked={allChecked}
                ref={(el) => { if (el) el.indeterminate = someChecked; }}
                onChange={onToggleAll}
                className="cursor-pointer accent-[#0891B2]"
              />
            </th>
            <th className={`${TH} w-8`}>#</th>
            <th className={TH}>Name (SSLC)</th>
            <th className={TH}>Reg No</th>
            <th className={TH}>Course</th>
            <th className={TH}>Year</th>
            <th className={TH}>Gender</th>
            <th className={TH}>Category</th>
            <th className={TH}>Adm Type</th>
            <th className={TH}>Adm Cat</th>
            <th className={TH}>Allotted Cat</th>
            <th className={TH}>Mobile</th>
            <th className={TH}>Status</th>
            <th className={TH}>Fee Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#ECF7FA]">
          {rows.map((row, idx) => {
            const s = row.student;
            const isSelected = selected.has(s.id);
            const feeStatus = feeStatusOf(row);
            return (
              <tr key={s.id} className={`transition-colors ${isSelected ? 'bg-[#0891B2]/[0.07]' : 'hover:bg-[#F3FAFC]'}`}>
                <td className="px-2.5 py-1.5">
                  <input type="checkbox" checked={isSelected} onChange={() => onToggle(s.id)} className="cursor-pointer accent-[#0891B2]" />
                </td>
                <td className="px-2.5 py-1.5 text-[#8A93A3] tabular-nums whitespace-nowrap">{idx + 1}</td>
                <td className="px-2.5 py-1.5 font-medium text-[#262B35] whitespace-nowrap">{s.studentNameSSLC}</td>
                <td className="px-2.5 py-1.5 text-[#5B6371] tabular-nums whitespace-nowrap">{s.regNumber || '—'}</td>
                <td className="px-2.5 py-1.5 text-[#3F4654] whitespace-nowrap">{s.course}</td>
                <td className="px-2.5 py-1.5 text-[#3F4654] whitespace-nowrap">{s.year}</td>
                <td className="px-2.5 py-1.5 text-[#3F4654] whitespace-nowrap">{s.gender}</td>
                <td className="px-2.5 py-1.5 text-[#3F4654] whitespace-nowrap">{s.category || '—'}</td>
                <td className="px-2.5 py-1.5 text-[#3F4654] whitespace-nowrap">{s.admType || '—'}</td>
                <td className="px-2.5 py-1.5 text-[#3F4654] whitespace-nowrap">{s.admCat || '—'}</td>
                <td className="px-2.5 py-1.5 text-[#3F4654] whitespace-nowrap">{s.allottedCategory || '—'}</td>
                <td className="px-2.5 py-1.5 text-[#5B6371] tabular-nums whitespace-nowrap">{s.studentMobile}</td>
                <td className="px-2.5 py-1.5 whitespace-nowrap">
                  <span
                    className={`${PILL} ${
                      s.admissionStatus === 'CONFIRMED'
                        ? 'border-[#0FA968]/40 text-[#0A7A4B]'
                        : s.admissionStatus === 'CANCELLED'
                        ? 'border-[#E11D48]/35 text-[#A5173A]'
                        : 'border-[#D97706]/40 text-[#9A5B00]'
                    }`}
                  >
                    {s.admissionStatus || '—'}
                  </span>
                </td>
                <td className="px-2.5 py-1.5 whitespace-nowrap">
                  {feeStatus ? (
                    <span className={`${PILL} ${FEE_STATUS_BADGE[feeStatus]}`}>
                      {FEE_STATUS_LABEL[feeStatus]}
                    </span>
                  ) : (
                    <span className="text-[#C7CDD5]">—</span>
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
