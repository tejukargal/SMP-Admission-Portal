/* Shared tokens & formatters for the Manage Documents area — emerald / mint accent. */
import type { DocStatus } from '../../types';

/** Ocean-blue pastel palette (matches the revamped app pages). */
export const DOC_TONE = {
  accent: '#0B7BC0',
  ink: '#075E93',
  hairline: '#D6E7F5',
  wash: '#E6F1FA',
  text: '#262B35',
  muted: '#8A93A3',
  faint: '#A9B0BB',
  line: '#E6EAF0',
  coral: '#E11D48',
  amber: '#D97706',
  sky: '#0284C7',
  emerald: '#0FA968',
} as const;

export const STATUS_META: Record<DocStatus, { label: string; color: string; ink: string; wash: string }> = {
  pending:     { label: 'Pending',  color: '#E39B4A', ink: '#9A5B12', wash: '#FDF3E7' },
  received:    { label: 'Received', color: '#0FA968', ink: '#0B7A4C', wash: '#E7F7EF' },
  returned:    { label: 'Returned', color: '#4FA3D9', ink: '#075985', wash: '#E8F3FB' },
  notRequired: { label: 'N/A',      color: '#A9B0BB', ink: '#6B7280', wash: '#F3F4F6' },
};

/** Board columns. `held` = received and still with the college. */
export type DocColumnId = 'pending' | 'held' | 'returned';

export const COLUMN_META: Record<DocColumnId, { title: string; subtitle: string; color: string; ink: string; wash: string; hairline: string }> = {
  pending:  { title: 'Pending',      subtitle: 'Not yet submitted',         color: '#E39B4A', ink: '#9A5B12', wash: '#FFF8EF', hairline: '#F6E0C4' },
  held:     { title: 'With College', subtitle: 'Received · held by college', color: '#0FA968', ink: '#0B7A4C', wash: '#F1FBF6', hairline: '#CDEEDC' },
  returned: { title: 'Returned',     subtitle: 'Handed back to student',    color: '#4FA3D9', ink: '#075985', wash: '#F1F8FD', hairline: '#CFE5F5' },
};

/** 'YYYY-MM-DD' → 'DD-MM-YYYY' */
export function fmtDay(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${d}-${m}-${y}` : iso;
}

/** ISO timestamp → '10:42 am' in local time */
export function fmtTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}

/** ISO timestamp → local 'YYYY-MM-DD' */
export function localDayOf(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 'asha.k@college.in' → 'asha.k' */
export function shortUser(email?: string): string {
  if (!email) return '';
  return email.split('@')[0];
}
