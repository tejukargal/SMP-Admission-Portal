import type { ComponentType } from 'react';
import { BackupExportPanel } from './BackupExportPanel';
import { BackupRestorePanel } from './BackupRestorePanel';
import { BackupDataRepairPanel } from './BackupDataRepairPanel';
import { SettingsSectionNav } from '../components/settings/settingsUi';

export type BackupSection = 'export' | 'restore' | 'data-repair';

export const BACKUP_SECTIONS: BackupSection[] = ['export', 'restore', 'data-repair'];

export function isBackupSection(value: unknown): value is BackupSection {
  return typeof value === 'string' && (BACKUP_SECTIONS as string[]).includes(value);
}

const SECTION_GROUPS: { title: string; items: { id: BackupSection; label: string; hint: string }[] }[] = [
  {
    title: 'Backup',
    items: [
      { id: 'export', label: 'Export Backup', hint: 'Download a full JSON backup' },
      { id: 'restore', label: 'Restore from Backup', hint: 'Restore records from a backup file' },
    ],
  },
  {
    title: 'Maintenance',
    items: [
      { id: 'data-repair', label: 'Data Repair', hint: 'Backfill missing DOB / Father Name' },
    ],
  },
];

const SECTION_PANELS: Record<BackupSection, ComponentType> = {
  export: BackupExportPanel,
  restore: BackupRestorePanel,
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
