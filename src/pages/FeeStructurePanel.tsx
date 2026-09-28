import { useState } from 'react';
import { FeeStructuresSection } from './FeeStructuresSection';
import { LateFeeScheduleSection } from './LateFeeScheduleSection';
import { FeeToolsSection } from './FeeToolsSection';
import { DISCARD_PROMPT, type FeeStructureSection } from './feeStructureShared';

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
                    onClick={() => go(item.id)}
                    className={`w-full text-left px-3 py-2 rounded-md border-l-2 transition-colors cursor-pointer ${
                      active
                        ? 'bg-blue-50 border-blue-600 text-blue-700'
                        : 'border-transparent text-gray-600 hover:bg-gray-50 hover:text-gray-800'
                    }`}
                  >
                    <span className="block text-sm font-medium">
                      {item.label}
                      {active && dirty && <span className="ml-1.5 text-orange-500" title="Unsaved changes">●</span>}
                    </span>
                    <span className={`block text-[11px] ${active ? 'text-blue-500' : 'text-gray-400'}`}>{item.hint}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

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
