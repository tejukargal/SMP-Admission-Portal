import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as https from 'https';

admin.initializeApp();
const db = admin.firestore();

interface SMSRecipient {
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

interface Fast2SMSResponse {
  return: boolean;
  message: string[];
}

const MOBILE_RE = /^[6-9]\d{9}$/;

function interpolate(template: string, r: SMSRecipient): string {
  return template
    .replace(/\{name\}/g, r.name)
    .replace(/\{father\}/g, r.fatherName)
    .replace(/\{reg\}/g, r.reg)
    .replace(/\{course\}/g, r.course)
    .replace(/\{year\}/g, r.year)
    .replace(/\{academicYear\}/g, r.academicYear)
    .replace(/\{dueAmount\}/g, r.dueAmount > 0 ? `Rs.${r.dueAmount}` : 'Nil');
}

function callFast2SMS(
  apiKey: string,
  senderId: string,
  message: string,
  numbers: string[],
): Promise<boolean> {
  return new Promise((resolve) => {
    const body = JSON.stringify({
      sender_id: senderId,
      message,
      language: 'english',
      route: 'q',
      numbers: numbers.join(','),
    });

    const options = {
      hostname: 'www.fast2sms.com',
      path: '/dev/bulkV2',
      method: 'POST',
      headers: {
        authorization: apiKey,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data) as Fast2SMSResponse;
          resolve(parsed.return === true);
        } catch {
          resolve(false);
        }
      });
    });

    req.on('error', () => resolve(false));
    req.write(body);
    req.end();
  });
}

export const sendBulkSMS = onCall(
  { region: 'asia-south1', timeoutSeconds: 300 },
  async (request) => {
    // 1. Auth check
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'You must be signed in.');
    }

    // 2. Admin role check
    const userSnap = await db.doc(`users/${request.auth.uid}`).get();
    if (!userSnap.exists || userSnap.data()?.role !== 'admin') {
      throw new HttpsError('permission-denied', 'Admin access required.');
    }

    // 3. Load Fast2SMS config
    const configSnap = await db.doc('adminConfig/messaging').get();
    if (!configSnap.exists) {
      throw new HttpsError(
        'failed-precondition',
        'Fast2SMS API key not configured. Go to Settings → Messaging.',
      );
    }
    const { fast2smsApiKey, senderId } = configSnap.data() as {
      fast2smsApiKey: string;
      senderId: string;
    };

    if (!fast2smsApiKey?.trim()) {
      throw new HttpsError('failed-precondition', 'Fast2SMS API key is empty.');
    }

    // 4. Validate input
    const { recipients } = request.data as { recipients: SMSRecipient[] };
    if (!Array.isArray(recipients) || recipients.length === 0) {
      throw new HttpsError('invalid-argument', 'No recipients provided.');
    }

    // 5. Expand templates and group by interpolated message text
    //    (same message → one API call with all numbers in that group)
    const messageGroups = new Map<string, string[]>();
    for (const r of recipients) {
      const msg = interpolate(r.messageTemplate, r);
      for (const phone of r.phones) {
        if (!MOBILE_RE.test(phone)) continue;
        const existing = messageGroups.get(msg) ?? [];
        existing.push(phone);
        messageGroups.set(msg, existing);
      }
    }

    // 6. Send each group in batches of 200
    const BATCH = 200;
    let successCount = 0;
    let failCount = 0;

    for (const [msg, phones] of messageGroups) {
      const unique = [...new Set(phones)];
      for (let i = 0; i < unique.length; i += BATCH) {
        const chunk = unique.slice(i, i + BATCH);
        const ok = await callFast2SMS(
          fast2smsApiKey.trim(),
          senderId?.trim() || 'SMPCLG',
          msg,
          chunk,
        );
        if (ok) successCount += chunk.length;
        else failCount += chunk.length;
      }
    }

    // 7. Write audit log
    await db.collection('smsLogs').add({
      sentBy: request.auth.uid,
      recipientCount: successCount + failCount,
      successCount,
      failCount,
      preview: [...messageGroups.keys()][0]?.slice(0, 120) ?? '',
      sentAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { successCount, failCount, total: successCount + failCount };
  },
);
