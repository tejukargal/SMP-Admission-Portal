import type { ComponentType } from 'react';
import { GeneralAcademicYearPanel } from './GeneralAcademicYearPanel';
import { GeneralCertificateHistoryPanel } from './GeneralCertificateHistoryPanel';
import { GeneralDeleteStudentPanel } from './GeneralDeleteStudentPanel';
import { GeneralDangerZonePanel } from './GeneralDangerZonePanel';
import { SettingsSectionNav } from '../components/settings/settingsUi';

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
    <div className="h-full flex gap-4">
      <SettingsSectionNav groups={SECTION_GROUPS} active={section} onSelect={onSectionChange} />

      <div key={section} className="flex-1 min-w-0 overflow-auto" style={{ animation: 'page-enter 0.22s ease-out' }}>
        <Panel />
      </div>
    </div>
  );
}
