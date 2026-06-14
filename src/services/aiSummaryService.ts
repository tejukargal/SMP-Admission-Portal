import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../config/firebase';

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
}

export interface AISummaryResult {
  insights: string[];
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
