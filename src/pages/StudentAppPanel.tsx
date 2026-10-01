import type { ComponentType } from 'react';
import { AiSettingsPanel } from './AiSettingsPanel';
import { AppVersionPanel } from './AppVersionPanel';
import { TabHeaderBackgroundsPanel } from './TabHeaderBackgroundsPanel';
import { CategoryIconsPanel } from './CategoryIconsPanel';
import { DailyBriefingPanel } from './DailyBriefingPanel';
import { SettingsSectionNav } from '../components/settings/settingsUi';

export type StudentAppSection = 'ai-settings' | 'app-version' | 'tab-headers' | 'category-icons' | 'daily-briefing';

export const STUDENT_APP_SECTIONS: StudentAppSection[] = ['ai-settings', 'app-version', 'tab-headers', 'category-icons', 'daily-briefing'];

export function isStudentAppSection(value: unknown): value is StudentAppSection {
  return typeof value === 'string' && (STUDENT_APP_SECTIONS as string[]).includes(value);
}

const SECTION_GROUPS: { title: string; items: { id: StudentAppSection; label: string; hint: string }[] }[] = [
  {
    title: 'Configuration',
    items: [
      { id: 'ai-settings', label: 'AI Settings', hint: 'Providers, API keys, text model' },
      { id: 'app-version', label: 'App Version', hint: 'Play Store release gating' },
    ],
  },
  {
    title: 'Content',
    items: [
      { id: 'tab-headers', label: 'Tab Header Backgrounds', hint: 'Header illustration per tab' },
      { id: 'category-icons', label: 'Category Icons', hint: 'Home Overview tiles' },
      { id: 'daily-briefing', label: 'Daily Briefing', hint: 'Quote of the day + preview' },
    ],
  },
];

const SECTION_PANELS: Record<StudentAppSection, ComponentType> = {
  'ai-settings': AiSettingsPanel,
  'app-version': AppVersionPanel,
  'tab-headers': TabHeaderBackgroundsPanel,
  'category-icons': CategoryIconsPanel,
  'daily-briefing': DailyBriefingPanel,
};

interface StudentAppPanelProps {
  section: StudentAppSection;
  onSectionChange: (section: StudentAppSection) => void;
}

/** Settings › Student App: everything that shapes the student portal app,
 *  split into sections behind a side nav. Only the active section's panel is
 *  mounted, so each one loads its own data when opened, as the separate tabs
 *  used to. */
export function StudentAppPanel({ section, onSectionChange }: StudentAppPanelProps) {
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
