import type { ComponentType } from 'react';
import { BackupExportPanel } from './BackupExportPanel';
import { BackupRestorePanel } from './BackupRestorePanel';
import { BackupDataRepairPanel } from './BackupDataRepairPanel';
import { YearwiseExportPanel } from './YearwiseExportPanel';
import { SettingsSectionNav } from '../components/settings/settingsUi';

export type BackupSection = 'export' | 'restore' | 'yearwise-export' | 'data-repair';

export const BACKUP_SECTIONS: BackupSection[] = ['export', 'restore', 'yearwise-export', 'data-repair'];

export function isBackupSection(value: unknown): value is BackupSection {
  return typeof value === 'string' && (BACKUP_SECTIONS as string[]).includes(value);
}

const SECTION_GROUPS: { title: string; items: { id: BackupSection; label: string; hint: string }[] }[] = [
  {
    title: 'Backup',
    items: [
      { id: 'export', label: 'Export Backup', hint: 'Full backup: JSON, Excel, files ZIP' },
      { id: 'restore', label: 'Restore from Backup', hint: 'Restore chosen collections from a backup' },
    ],
  },
  {
    title: 'Exports',
    items: [
      { id: 'yearwise-export', label: 'Yearwise Students', hint: 'Confirmed students, multi-year Excel/PDF' },
    ],
  },
  {
    title: 'Maintenance',
    items: [
      { id: 'data-repair', label: 'Data Health', hint: 'Scan & fix data issues' },
    ],
  },
];

const SECTION_PANELS: Record<BackupSection, ComponentType> = {
  export: BackupExportPanel,
  restore: BackupRestorePanel,
  'yearwise-export': YearwiseExportPanel,
  'data-repair': BackupDataRepairPanel,
};

interface BackupPanelProps {
  section: BackupSection;
  onSectionChange: (section: BackupSection) => void;
}

/** Settings › Backup & Restore: export/import backups and data repair
 *  tools, split into sections behind a side nav. */
export function BackupPanel({ section, onSectionChange }: BackupPanelProps) {
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
