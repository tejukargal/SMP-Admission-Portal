import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../config/firebase';

export interface Insight {
  title: string;
  titleKn: string;
  en: string;
  kn: string;
}

export interface AISummaryPayload {
  academicYear: string;
  total: number;
  boys: number;
  girls: number;
  byCourse: Record<string, number>;
  byYear: Record<string, number>;
  byAdmType: Record<string, number>;
  pendingTotal: number;
  pendingRegular: number;
  pendingLateral: number;
  prevAcademicYear?: string;
  prevTotal?: number;
  prevBoys?: number;
  prevGirls?: number;
  prevByCourse?: Record<string, number>;
  byCourseByYear?: Record<string, Record<string, number>>;
  byCategory?: Record<string, number>;
  byGenderByCourse?: Record<string, Record<string, number>>;
  recentEnrollmentsCount?: number;
  byAdmCat?: Record<string, number>;
  // Overall all-years stats
  currentAcademicYear?: string;
  overallTotal?: number;
  overallBoys?: number;
  overallGirls?: number;
  overallByCourse?: Record<string, number>;
  overallByCategory?: Record<string, number>;
  overallByGenderByCourse?: Record<string, Record<string, number>>;
  // Current active year stats (even when a different year is filtered)
  currentYearTotal?: number;
  currentYearBoys?: number;
  currentYearGirls?: number;
  currentYearByCourse?: Record<string, number>;
}

export interface AISummaryResult {
  insights: Insight[];
  generatedAt: string;
}

const fns = getFunctions(app, 'asia-south1');

export async function callGenerateAdmissionSummary(
  payload: AISummaryPayload,
): Promise<AISummaryResult> {
  const fn = httpsCallable<AISummaryPayload, AISummaryResult>(
    fns,
    'generateAdmissionSummary',
  );
  const result = await fn(payload);
  return result.data;
}
