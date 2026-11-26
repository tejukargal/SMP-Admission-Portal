/* Shared tokens & formatters for the Manage Documents area — emerald / mint accent. */
import type { DocStatus } from '../../types';

export const DOC_TONE = {
  accent: '#0FA968',
  ink: '#0B7A4C',
  hairline: '#D3EEDF',
  wash: '#EEF9F3',
  text: '#262B35',
  muted: '#8A93A3',
  faint: '#A9B0BB',
  line: '#E6EAF0',
  coral: '#E11D48',
  amber: '#D97706',
  sky: '#0284C7',
} as const;

export const STATUS_META: Record<DocStatus, { label: string; color: string; ink: string; wash: string }> = {
  pending:     { label: 'Pending',  color: '#94A3B8', ink: '#475569', wash: '#F1F5F9' },
  received:    { label: 'Received', color: '#0FA968', ink: '#0B7A4C', wash: '#E7F7EF' },
  returned:    { label: 'Returned', color: '#0284C7', ink: '#075985', wash: '#E6F3FB' },
  notRequired: { label: 'N/A',      color: '#A9B0BB', ink: '#6B7280', wash: '#F3F4F6' },
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
