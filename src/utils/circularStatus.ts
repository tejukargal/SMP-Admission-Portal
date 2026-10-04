// Admin-side circular lifecycle: Draft → Live (★ optional Pinned) → Expired,
// plus Scheduled (a Draft with publishAt). Derived from the same three fields
// the student apps already read (archivedAt / expiredAt / pinned), so the new
// model needs no student-app change.
import type { Circular } from '../types';

export type CircularStatus = 'draft' | 'scheduled' | 'live' | 'expired';

export function circularStatus(c: Circular): CircularStatus {
  if (c.archivedAt) return c.publishAt ? 'scheduled' : 'draft';
  if (c.expiredAt) return 'expired';
  return 'live';
}

/** Order for pinned circulars — same rule as the student apps: most recently
 *  pinned / "Move to first" leads (pinnedAt), then newest date. Legacy pins
 *  without pinnedAt follow. */
export function byPinOrder(a: Circular, b: Circular): number {
  return (b.pinnedAt ?? '').localeCompare(a.pinnedAt ?? '')
    || b.date.localeCompare(a.date)
    || b.createdAt.localeCompare(a.createdAt);
}

export const STATUS_META: Record<CircularStatus, { label: string; color: string; hint: string }> = {
  draft: { label: 'Draft', color: '#8A93A3', hint: 'Hidden from students' },
  scheduled: { label: 'Scheduled', color: '#7C5CC4', hint: 'Publishes automatically at the set time' },
  live: { label: 'Live', color: '#0FA968', hint: 'Visible to all students' },
  expired: { label: 'Expired', color: '#D97706', hint: "Only in students' Expired tab" },
};

/** Today's date (YYYY-MM-DD) in India time — expiry is per IST calendar day. */
export function todayIST(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

/** YYYY-MM-DD `days` after today (IST). */
export function addDaysIST(days: number): string {
  const [y, m, d] = todayIST().split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

function daysUntil(ymd: string): number {
  const [y1, m1, d1] = todayIST().split('-').map(Number);
  const [y2, m2, d2] = ymd.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

function shortDate(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/** "Expires today" / "Expires in 3 days" / "Valid till 30 Oct" — null when no expiry is set. */
export function expiryLabel(c: Circular): { text: string; soon: boolean } | null {
  if (!c.expiresOn || c.expiredAt) return null;
  const n = daysUntil(c.expiresOn);
  if (n < 0) return { text: 'Expiring now', soon: true };
  if (n === 0) return { text: 'Last day today', soon: true };
  if (n <= 3) return { text: `Expires in ${n} day${n === 1 ? '' : 's'}`, soon: true };
  return { text: `Valid till ${shortDate(c.expiresOn)}`, soon: false };
}

/** "5 Oct, 9:00 am" for a scheduled publish time. */
export function formatPublishAt(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata',
  });
}

/** ISO → value for <input type="datetime-local"> in the browser's local time. */
export function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
