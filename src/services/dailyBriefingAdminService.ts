// Admin-side control of the student portal's Daily Briefing: generate →
// preview → save for the shared quote of the day (same flow as
// tabHeaderService, except upload + Firestore write happen inside the
// saveDailyQuote Cloud Function because dailyQuote/* and the
// dailyQuoteBackgrounds/ Storage path are Admin-SDK-only), plus a read-only
// tester that renders any student's personalized briefing.
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
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
