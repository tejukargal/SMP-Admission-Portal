import { matchPath } from 'react-router-dom';

// Per-page accent used by the title bar. Values mirror each page's own tokens
// (title ink + tinted page background), not the sidebar's nav accents, so the
// bar blends into whatever page sits below it.
export interface PageAccent {
  label: string;
  accent: string;
  ink: string;
  /** Pastel wash, left → right; a step deeper than the page background. */
  washFrom: string;
  washTo: string;
}

const PERI = { accent: '#6B7CF6', ink: '#3F4BB8', washFrom: '#F2F4FF', washTo: '#E9ECFD' };
const LIME = { accent: '#65A30D', ink: '#3F6212', washFrom: '#F6FBEA', washTo: '#EFF7DC' };
const TEAL = { accent: '#0F8B8D', ink: '#0B6567', washFrom: '#EFF9F9', washTo: '#E6F4F4' };
const OCEAN = { accent: '#0B7BC0', ink: '#075E93', washFrom: '#F0F7FD', washTo: '#E6F1FA' };
const OLIVE = { accent: '#5B9A2F', ink: '#426F22', washFrom: '#F5FAEE', washTo: '#EEF6E4' };
const INDIGO = { accent: '#4F46E5', ink: '#3730A3', washFrom: '#F3F3FE', washTo: '#ECEDFD' };
const PLUM = { accent: '#9333EA', ink: '#6B21A8', washFrom: '#F8F2FE', washTo: '#F2E8FC' };
const AMBER = { accent: '#E08A00', ink: '#9A5B00', washFrom: '#FFF7EA', washTo: '#FDF0DB' };
const CYAN = { accent: '#0891B2', ink: '#0E6A85', washFrom: '#EFF8FB', washTo: '#E6F4F8' };
const SLATE = { accent: '#3B5BA9', ink: '#2B437F', washFrom: '#F2F5FB', washTo: '#EAEFF8' };

export const NEUTRAL_ACCENT: PageAccent = {
  label: 'SMP Admissions', accent: '#64748B', ink: '#334155', washFrom: '#F6F8FB', washTo: '#F1F4F8',
};

const ROUTES: { path: string; accent: PageAccent }[] = [
  { path: '/dashboard',        accent: { label: 'Dashboard', ...PERI } },
  { path: '/inquiries',        accent: { label: 'Inquiries', ...LIME } },
  { path: '/enroll',           accent: { label: 'Enroll Student', ...LIME } },
  { path: '/admissions',       accent: { label: 'Admissions', ...TEAL } },
  { path: '/students',         accent: { label: 'Students', ...OCEAN } },
  { path: '/wp-students',      accent: { label: 'WP Students', ...OLIVE } },
  { path: '/student-reports',  accent: { label: 'Student Reports', ...INDIGO } },
  { path: '/results',          accent: { label: 'Results', ...PLUM } },
  { path: '/ans-letters',      accent: { label: 'ANS Letters', ...AMBER } },
  { path: '/fees',             accent: { label: 'Collect Fee', ...TEAL } },
  { path: '/fee-register',     accent: { label: 'Fee Register', ...TEAL } },
  { path: '/fee-reports',      accent: { label: 'Fee Reports', ...TEAL } },
  { path: '/cash-book',        accent: { label: 'Cash & Bank', ...TEAL } },
  { path: '/student-messages', accent: { label: 'Student Messages', ...CYAN } },
  { path: '/messaging',        accent: { label: 'Messaging', ...CYAN } },
  { path: '/settings',         accent: { label: 'Settings', ...SLATE } },
];

/** Accent families the Dashboard title bar cycles through (Dashboard's own first). */
export const ACCENT_CYCLE = [PERI, OCEAN, TEAL, PLUM, LIME, AMBER, INDIGO, CYAN, OLIVE, SLATE];

export function getPageAccent(pathname: string): PageAccent {
  return ROUTES.find((r) => matchPath({ path: r.path, end: false }, pathname))?.accent ?? NEUTRAL_ACCENT;
}
