import type { ComponentType } from 'react';
import { ImportStudents } from './ImportStudents';
import { ImportFeeRegister } from './ImportFeeRegister';
import { ImportAddress } from './ImportAddress';
import { ImportResults } from './ImportResults';
import { ImportFeeStructure } from './ImportFeeStructure';

export type ImportSection = 'students' | 'fee-register' | 'address' | 'results' | 'fee-structure';

export const IMPORT_SECTIONS: ImportSection[] = ['students', 'fee-register', 'address', 'results', 'fee-structure'];

export function isImportSection(value: unknown): value is ImportSection {
  return typeof value === 'string' && (IMPORT_SECTIONS as string[]).includes(value);
}

const SECTION_GROUPS: { title: string; items: { id: ImportSection; label: string; hint: string }[] }[] = [
  {
    title: 'Enrollment Data',
    items: [
      { id: 'students', label: 'Students', hint: 'Enrollment master list (.xlsx)' },
      { id: 'address', label: 'Address', hint: 'Address, mother name, DOB update' },
    ],
  },
  {
    title: 'Financial & Academic',
    items: [
      { id: 'fee-register', label: 'Fee Register', hint: 'Per-student fee payment records' },
      { id: 'fee-structure', label: 'Fee Structure', hint: 'Course/year fee amounts' },
      { id: 'results', label: 'Results', hint: 'Result Ledger PDF' },
    ],
  },
];

const SECTION_PANELS: Record<ImportSection, ComponentType> = {
  students: ImportStudents,
  'fee-register': ImportFeeRegister,
  address: ImportAddress,
  results: ImportResults,
  'fee-structure': ImportFeeStructure,
};

interface ImportPanelProps {
  section: ImportSection;
  onSectionChange: (section: ImportSection) => void;
}

/** Settings › Import: all bulk-data import tools (enrollment, address, fee
 *  register, fee structure, results), split into sections behind a side nav.
 *  Only the active section's panel is mounted, so each one loads/parses its
 *  own file independently. */
export function ImportPanel({ section, onSectionChange }: ImportPanelProps) {
  const Panel = SECTION_PANELS[section];

  return (
    <div className="h-full flex gap-6">
      <nav className="w-56 flex-shrink-0 overflow-auto border-r border-gray-200 pr-4 space-y-5">
        {SECTION_GROUPS.map((group) => (
          <div key={group.title}>
            <p className="px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{group.title}</p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = item.id === section;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSectionChange(item.id)}
                    className={`w-full text-left px-3 py-2 rounded-md border-l-2 transition-colors cursor-pointer ${
                      active
                        ? 'bg-blue-50 border-blue-600 text-blue-700'
                        : 'border-transparent text-gray-600 hover:bg-gray-50 hover:text-gray-800'
                    }`}
                  >
                    <span className="block text-sm font-medium">{item.label}</span>
                    <span className={`block text-[11px] ${active ? 'text-blue-500' : 'text-gray-400'}`}>{item.hint}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div key={section} className="flex-1 min-w-0 overflow-auto" style={{ animation: 'page-enter 0.22s ease-out' }}>
        <Panel />
      </div>
    </div>
  );
}
