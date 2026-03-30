import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../config/firebase';

export interface SMSRecipient {
  studentId: string;
  name: string;
  fatherName: string;
  reg: string;
  course: string;
  year: string;
  academicYear: string;
  dueAmount: number;
  messageTemplate: string;
  phones: string[];
}

export interface SMSResult {
  successCount: number;
  failCount: number;
  total: number;
}

const functions = getFunctions(app, 'asia-south1');

export async function sendBulkSMS(recipients: SMSRecipient[]): Promise<SMSResult> {
  const fn = httpsCallable<{ recipients: SMSRecipient[] }, SMSResult>(
    functions,
    'sendBulkSMS',
  );
  const result = await fn({ recipients });
  return result.data;
}
