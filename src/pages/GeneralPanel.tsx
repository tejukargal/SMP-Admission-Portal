import type { ComponentType } from 'react';
import { GeneralAcademicYearPanel } from './GeneralAcademicYearPanel';
import { GeneralCertificateHistoryPanel } from './GeneralCertificateHistoryPanel';
import { GeneralDeleteStudentPanel } from './GeneralDeleteStudentPanel';
import { GeneralDangerZonePanel } from './GeneralDangerZonePanel';

export type GeneralSection = 'academic-year' | 'certificate-history' | 'delete-student' | 'danger-zone';

export const GENERAL_SECTIONS: GeneralSection[] = ['academic-year', 'certificate-history', 'delete-student', 'danger-zone'];

export function isGeneralSection(value: unknown): value is GeneralSection {
  return typeof value === 'string' && (GENERAL_SECTIONS as string[]).includes(value);
}

const SECTION_GROUPS: { title: string; items: { id: GeneralSection; label: string; hint: string }[] }[] = [
  {
    title: 'Configuration',
    items: [
      { id: 'academic-year', label: 'Academic Year', hint: 'Active year for all operations' },
    ],
  },
  {
    title: 'Data Management',
    items: [
      { id: 'certificate-history', label: 'Certificate History', hint: 'Clear TC/PC issuance records' },
      { id: 'delete-student', label: 'Delete Student', hint: 'Permanently remove one student' },
      { id: 'danger-zone', label: 'Danger Zone', hint: 'Bulk resets — irreversible' },
    ],
  },
];

const SECTION_PANELS: Record<GeneralSection, ComponentType> = {
  'academic-year': GeneralAcademicYearPanel,
  'certificate-history': GeneralCertificateHistoryPanel,
  'delete-student': GeneralDeleteStudentPanel,
  'danger-zone': GeneralDangerZonePanel,
};

interface GeneralPanelProps {
  section: GeneralSection;
  onSectionChange: (section: GeneralSection) => void;
}

/** Settings › General: academic year, certificate history, individual student
 *  deletion, and bulk data resets, split into sections behind a side nav. */
export function GeneralPanel({ section, onSectionChange }: GeneralPanelProps) {
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
