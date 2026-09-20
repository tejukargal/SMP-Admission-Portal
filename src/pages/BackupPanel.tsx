import type { ComponentType } from 'react';
import { BackupExportPanel } from './BackupExportPanel';
import { BackupRestorePanel } from './BackupRestorePanel';
import { BackupDataRepairPanel } from './BackupDataRepairPanel';

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
