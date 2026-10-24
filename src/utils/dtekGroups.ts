import type { DtekCircular } from '../services/dtekNewsService';
import { formatIsoDate } from './formatDates';

/** Groups circulars under their printed date, newest first. Undated ones fall
 *  into a final group rather than being dropped — a real circular may carry no
 *  readable date, and it is still worth showing. */
export function groupByDate<T extends DtekCircular>(circulars: T[]): { key: string; label: string; items: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const c of circulars) {
    const key = c.date ?? '';
    const existing = groups.get(key);
    if (existing) existing.push(c);
    else groups.set(key, [c]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : b.localeCompare(a)))
    .map(([key, items]) => ({ key, label: key ? formatIsoDate(key) : 'Undated', items }));
}

/** Client-side search over loaded archive rows: title (either language),
 *  reference number, category and who it affects. */
export function matchesDtekSearch(c: DtekCircular, term: string): boolean {
  const t = term.trim().toLowerCase();
  if (!t) return true;
  return [c.title, c.titleKn, c.referenceNo, c.category, c.affects]
    .some((v) => (v ?? '').toLowerCase().includes(t));
}
