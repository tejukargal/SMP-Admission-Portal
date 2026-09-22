/** Display formatters shared by the AI content panels (Daily Briefing, DTEK
 *  News) and the Dashboard cards that render what they publish. */

/** Today in IST as YYYY-MM-DD — the same day boundary the Cloud Functions use,
 *  so an admin in India never sees "yesterday" because the server is on UTC. */
export function todayIST(): string {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** A YYYY-MM-DD date as "18 Sep 2026". Parsed as UTC so the day never shifts. */
export function formatIsoDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  });
}

/** A full ISO timestamp as "18 Sep 2026, 4:30 pm". */
export function formatIsoDateTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
    });
}

/** Whole days since an ISO timestamp. */
export function daysAgo(iso: string): number {
  return Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
}
