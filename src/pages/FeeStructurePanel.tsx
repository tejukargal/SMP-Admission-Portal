import { useState } from 'react';
import { FeeStructuresSection } from './FeeStructuresSection';
import { LateFeeScheduleSection } from './LateFeeScheduleSection';
import { FeeToolsSection } from './FeeToolsSection';
import { DISCARD_PROMPT, type FeeStructureSection } from './feeStructureShared';
import { SettingsSectionNav } from '../components/settings/settingsUi';

const SECTION_GROUPS: { title: string; items: { id: FeeStructureSection; label: string; hint: string }[] }[] = [
  {
    title: 'Configure',
    items: [
      { id: 'structures', label: 'Fee Structures', hint: 'Amounts per course, year, type & category' },
      { id: 'late-fee', label: 'Late Fee Schedule', hint: 'Date-based fines per study year' },
    ],
  },
  {
    title: 'Tools',
    items: [
      { id: 'tools', label: 'Export & Tools', hint: 'PDF / Excel export, import, delete all' },
    ],
  },
];

interface FeeStructurePanelProps {
  section: FeeStructureSection;
  onSectionChange: (section: FeeStructureSection) => void;
}

/** Settings › Fee Structure: fee structures, late fee schedule and tools,
 *  split into sections behind a side nav. */
export function FeeStructurePanel({ section, onSectionChange }: FeeStructurePanelProps) {
  // Set by the active section while it has unsaved edits
  const [dirty, setDirty] = useState(false);

  function go(next: FeeStructureSection) {
    if (next === section) return;
    if (dirty && !window.confirm(DISCARD_PROMPT)) return;
    setDirty(false);
    onSectionChange(next);
  }

  return (
    <div className="h-full flex gap-4">
      <SettingsSectionNav
        groups={SECTION_GROUPS}
        active={section}
        onSelect={go}
        renderBadge={(id) => id === section && dirty && <span className="ml-1.5 text-orange-500" title="Unsaved changes">●</span>}
      />

      <div
        key={section}
        className="flex-1 min-w-0 overflow-auto pb-2 pr-1"
        // Reserve the scrollbar's width so content doesn't shift sideways when it appears/disappears
        style={{ animation: 'page-enter 0.22s ease-out', scrollbarGutter: 'stable' }}
      >
        {section === 'structures' && (
          <FeeStructuresSection onDirtyChange={setDirty} onGoToLateFee={() => go('late-fee')} />
        )}
        {section === 'late-fee' && <LateFeeScheduleSection onDirtyChange={setDirty} />}
        {section === 'tools' && <FeeToolsSection />}
      </div>
    </div>
  );
}
