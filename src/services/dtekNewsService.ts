// Admin-side DTEK News: the AI reads the Department of Technical Education
// Karnataka site (above all its departmental-circulars page) and returns a
// date-wise digest, which the admin reviews and publishes to dtekNews/current
// for the Dashboard. Same fetch -> edit -> publish shape as the scholarship
// summary, and dtekNews/current is Admin-SDK-only for the same reason.
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db, app } from '../config/firebase';

const functions = getFunctions(app, 'asia-south1');
// The fetch opens the circulars listing and then each circular (often PDFs),
// so it runs a good deal longer than the scholarship one.
const FETCH_TIMEOUT_MS = 300_000;
const CALL_TIMEOUT_MS = 60_000;

export const DTEK_CATEGORIES = [
  'Circular', 'Exams', 'Admissions', 'Academics',
  'Administration', 'Recruitment', 'Finance', 'Other',
] as const;
export type DtekCategory = (typeof DTEK_CATEGORIES)[number];

/** One departmental circular as summarised by the AI. Mirrors the shape the
 *  Cloud Function normalises and stores — keep the two in step. */
export interface DtekCircular {
  /** YYYY-MM-DD, or null when the circular shows no readable date. */
  date: string | null;
  dateText: string;
  /** Government reference/order number exactly as printed. */
  referenceNo: string;
  title: string;
  titleKn: string;
  category: DtekCategory;
  summary: string;
  summaryKn: string;
  highlights: string[];
  /** Same bullets as `highlights`, same order. Absent on records published
   *  before bilingual highlights shipped, so always guard before rendering. */
  highlightsKn: string[];
  affects: string;
  actionRequired: boolean;
  actionBy: string | null;
  actionByText: string;
  url: string;
}

export interface PendingDtekNews {
  overviewEn: string;
  overviewKn: string;
  circulars: DtekCircular[];
  themeHue?: number;
  sourceUrls: string[];
  fetchedAt: string;
}

export interface DtekNewsRecord extends PendingDtekNews {
  publishedAt: string;
  publishedBy: string;
}

export const DEFAULT_DTEK_SOURCES = [
  'https://dtek.karnataka.gov.in/',
  'https://dtek.karnataka.gov.in/72/departmental-circulars/en',
];

export const EMPTY_DTEK_CIRCULAR: DtekCircular = {
  date: null, dateText: '', referenceNo: '', title: '', titleKn: '',
  category: 'Circular', summary: '', summaryKn: '', highlights: [], highlightsKn: [], affects: '',
  actionRequired: false, actionBy: null, actionByText: '', url: '',
};

const SOURCES_DOC = doc(db, 'adminConfig', 'dtekSources');

export async function getDtekSources(): Promise<string[]> {
  const snap = await getDoc(SOURCES_DOC);
  const urls = (snap.data() as { urls?: unknown } | undefined)?.urls;
  return Array.isArray(urls) && urls.length > 0
    ? urls.filter((u): u is string => typeof u === 'string')
    : DEFAULT_DTEK_SOURCES;
}

export async function saveDtekSources(urls: string[]): Promise<void> {
  await setDoc(SOURCES_DOC, { urls, updatedAt: new Date().toISOString() });
}

export async function getPublishedDtekNews(): Promise<DtekNewsRecord | null> {
  const snap = await getDoc(doc(db, 'dtekNews', 'current'));
  const data = snap.data() as DtekNewsRecord | undefined;
  return data && Array.isArray(data.circulars) && data.circulars.length > 0 ? data : null;
}

export async function fetchDtekNews(sourceUrls: string[]): Promise<PendingDtekNews> {
  const fn = httpsCallable<{ sourceUrls: string[] }, PendingDtekNews>(
    functions, 'fetchDtekNews', { timeout: FETCH_TIMEOUT_MS },
  );
  const result = await fn({ sourceUrls });
  return result.data;
}

export async function publishDtekNews(pending: PendingDtekNews): Promise<DtekNewsRecord> {
  const fn = httpsCallable<PendingDtekNews, DtekNewsRecord>(
    functions, 'publishDtekNews', { timeout: CALL_TIMEOUT_MS },
  );
  const result = await fn(pending);
  return result.data;
}
