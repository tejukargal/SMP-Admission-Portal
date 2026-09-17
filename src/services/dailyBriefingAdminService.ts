// Admin-side control of the student portal's Daily Briefing: generate →
// preview → save for the shared quote of the day (same flow as
// tabHeaderService, except upload + Firestore write happen inside the
// saveDailyQuote Cloud Function because dailyQuote/* and the
// dailyQuoteBackgrounds/ Storage path are Admin-SDK-only), plus a read-only
// tester that renders any student's personalized briefing, and the
// admin-published scholarship summary (fetch via Gemini grounding -> edit ->
// publish; scholarshipUpdates/current is Admin-SDK-only too).
import { collection, doc, getDoc, getDocs, limit, orderBy, query, setDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db, app } from '../config/firebase';

const functions = getFunctions(app, 'asia-south1');
// Quote text + image generation can take 30-60 s on slower providers.
const CALL_TIMEOUT_MS = 120_000;

/** What's stored at dailyQuote/{date} and what students currently see. */
export interface DailyQuoteRecord {
  date: string;
  quoteEn: string;
  quoteAuthor: string;
  quoteKn?: string;
  theme?: string;
  scene?: string;
  backgroundImageUrl?: string;
  savedAt?: string;
  savedBy?: string;
}

/** A generated-but-unsaved quote: text fields (editable in the panel) plus
 *  the previewed image bytes that Save sends back up. */
export interface PendingDailyQuote {
  date: string;
  quoteEn: string;
  quoteAuthor: string;
  quoteKn: string;
  theme: string;
  scene: string;
  imageBase64: string;
  mimeType: string;
}

export interface StudentBriefingPreview {
  date: string;
  quote: DailyQuoteRecord;
  scholarships: ScholarshipUpdatesRecord | null;
  greeting: string;
  messageEn: string;
  messageKn: string;
  points: string[];
  generatedAt: string;
  /** The exact plain-text data block the model was given. */
  dataBlock: string;
}

/** The most recently saved quote (by date) — may be older than today. */
export async function getLatestDailyQuote(): Promise<DailyQuoteRecord | null> {
  const snap = await getDocs(query(collection(db, 'dailyQuote'), orderBy('date', 'desc'), limit(1)));
  const data = snap.docs[0]?.data() as DailyQuoteRecord | undefined;
  return data?.quoteEn ? data : null;
}

/** Fresh quote text + image. Pass `scene` to only redraw the image for an
 *  existing (possibly hand-edited) quote — the returned text fields are then
 *  empty and the caller keeps its own. */
export async function generateDailyQuotePreview(scene?: string): Promise<PendingDailyQuote> {
  const fn = httpsCallable<{ scene?: string }, PendingDailyQuote>(functions, 'generateDailyQuotePreview', { timeout: CALL_TIMEOUT_MS });
  const result = await fn(scene ? { scene } : {});
  return result.data;
}

export async function saveDailyQuote(pending: PendingDailyQuote): Promise<DailyQuoteRecord> {
  const fn = httpsCallable<PendingDailyQuote, DailyQuoteRecord>(functions, 'saveDailyQuote', { timeout: CALL_TIMEOUT_MS });
  const result = await fn(pending);
  return result.data;
}

export async function previewStudentBriefing(regNumber: string): Promise<StudentBriefingPreview> {
  const fn = httpsCallable<{ regNumber: string }, StudentBriefingPreview>(functions, 'previewStudentBriefing', { timeout: CALL_TIMEOUT_MS });
  const result = await fn({ regNumber });
  return result.data;
}

// ── Scholarship Updates ──────────────────────────────────────────────────────

export type ScholarshipStatus = 'open' | 'closing-soon' | 'closed' | 'upcoming' | 'unknown';

export interface ScholarshipScheme {
  name: string;
  portal: string;
  url: string;
  status: ScholarshipStatus;
  /** YYYY-MM-DD when a firm closing date is known, else null. */
  applyBy: string | null;
  applyByText: string;
  eligibility: string;
  documents: string[];
  howToApply: string;
  notes: string;
  summaryKn: string;
  sources: string[];
}

/** One dated announcement from a portal's notifications / news page. */
export interface ScholarshipNewsItem {
  /** YYYY-MM-DD when the notice carries a date, else null. */
  date: string | null;
  dateText: string;
  title: string;
  titleKn: string;
  portal: string;
  url: string;
}

/** What fetchScholarshipUpdates returns and what Publish sends back up
 *  (after the admin's edits). */
export interface PendingScholarshipUpdates {
  overviewEn: string;
  overviewKn: string;
  schemes: ScholarshipScheme[];
  news: ScholarshipNewsItem[];
  sourceUrls: string[];
  fetchedAt: string;
}

/** What's stored at scholarshipUpdates/current and what students see. */
export interface ScholarshipUpdatesRecord extends PendingScholarshipUpdates {
  publishedAt: string;
  publishedBy: string;
}

export const DEFAULT_SCHOLARSHIP_SOURCES = [
  'https://ssp.postmatric.karnataka.gov.in/',
  'https://scholarships.gov.in/',
];

const SOURCES_DOC = doc(db, 'adminConfig', 'scholarshipSources');
// Grounded fetches read several live pages before answering.
const FETCH_TIMEOUT_MS = 180_000;

export async function getScholarshipSources(): Promise<string[]> {
  const snap = await getDoc(SOURCES_DOC);
  const urls = (snap.data() as { urls?: unknown } | undefined)?.urls;
  return Array.isArray(urls) && urls.length > 0 ? urls.filter((u): u is string => typeof u === 'string') : DEFAULT_SCHOLARSHIP_SOURCES;
}

export async function saveScholarshipSources(urls: string[]): Promise<void> {
  await setDoc(SOURCES_DOC, { urls, updatedAt: new Date().toISOString() });
}

export async function getPublishedScholarshipUpdates(): Promise<ScholarshipUpdatesRecord | null> {
  const snap = await getDoc(doc(db, 'scholarshipUpdates', 'current'));
  const data = snap.data() as ScholarshipUpdatesRecord | undefined;
  return data && Array.isArray(data.schemes) && data.schemes.length > 0 ? data : null;
}

export async function fetchScholarshipUpdates(sourceUrls: string[]): Promise<PendingScholarshipUpdates> {
  const fn = httpsCallable<{ sourceUrls: string[] }, PendingScholarshipUpdates>(functions, 'fetchScholarshipUpdates', { timeout: FETCH_TIMEOUT_MS });
  const result = await fn({ sourceUrls });
  return result.data;
}

export async function publishScholarshipUpdates(pending: PendingScholarshipUpdates): Promise<ScholarshipUpdatesRecord> {
  const fn = httpsCallable<PendingScholarshipUpdates, ScholarshipUpdatesRecord>(functions, 'publishScholarshipUpdates', { timeout: CALL_TIMEOUT_MS });
  const result = await fn(pending);
  return result.data;
}
