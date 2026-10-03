import type { ComponentType } from 'react';
import { ImportStudents } from './ImportStudents';
import { ImportFeeRegister } from './ImportFeeRegister';
import { ImportAddress } from './ImportAddress';
import { ImportResults } from './ImportResults';
import { ImportFeeStructure } from './ImportFeeStructure';
import { SettingsSectionNav } from '../components/settings/settingsUi';

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
      { id: 'address', label: 'Personal Details', hint: 'Address, DOB, parents, phone, Aadhar, caste — all years' },
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
    <div className="h-full flex gap-4">
      <SettingsSectionNav groups={SECTION_GROUPS} active={section} onSelect={onSectionChange} />

      <div key={section} className="flex-1 min-w-0 overflow-auto" style={{ animation: 'page-enter 0.22s ease-out' }}>
        <Panel />
      </div>
    </div>
  );
}
