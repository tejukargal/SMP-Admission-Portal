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

// ── AI Admission Summary ───────────────────────────────────────────────────

interface SummaryPayload {
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
}

interface AnthropicMessage {
  type: string;
  text: string;
}

interface AnthropicResponse {
  content: AnthropicMessage[];
}

function callClaude(apiKey: string, p: SummaryPayload): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const hasPrev = !!p.prevAcademicYear && p.prevTotal !== undefined;
    const growthLine = hasPrev
      ? (() => {
          const diff = p.total - (p.prevTotal ?? 0);
          const sign = diff >= 0 ? '+' : '';
          const pct = p.prevTotal ? Math.round((diff / p.prevTotal) * 100) : 0;
          return `Year-over-year: ${sign}${diff} students (${sign}${pct}%) vs ${p.prevAcademicYear} (${p.prevTotal} confirmed)`;
        })()
      : '';

    const courseYearLines = p.byCourseByYear
      ? ['Course × Year matrix:',
          ...['CE','ME','EC','CS','EE'].map((c) => {
            const row = p.byCourseByYear![c] ?? {};
            return `  ${c}: 1st=${row['1ST YEAR'] ?? 0}, 2nd=${row['2ND YEAR'] ?? 0}, 3rd=${row['3RD YEAR'] ?? 0}`;
          }),
        ]
      : [];

    const categoryLine = p.byCategory
      ? `Category breakdown — GM: ${p.byCategory['GM'] ?? 0}, C1: ${p.byCategory['C1'] ?? 0}, 2A: ${p.byCategory['2A'] ?? 0}, 2B: ${p.byCategory['2B'] ?? 0}, 3A: ${p.byCategory['3A'] ?? 0}, 3B: ${p.byCategory['3B'] ?? 0}, SC: ${p.byCategory['SC'] ?? 0}, ST: ${p.byCategory['ST'] ?? 0}`
      : '';

    const genderCourseLines = p.byGenderByCourse
      ? ['Gender per course (Boys / Girls):',
          ...['CE','ME','EC','CS','EE'].map((c) => {
            const boys = p.byGenderByCourse!['BOY']?.[c] ?? 0;
            const girls = p.byGenderByCourse!['GIRL']?.[c] ?? 0;
            return `  ${c}: ${boys}B / ${girls}G`;
          }),
        ]
      : [];

    const recentLine = p.recentEnrollmentsCount !== undefined
      ? `Recent enrollments (last 7 days): ${p.recentEnrollmentsCount} new confirmed students`
      : '';

    const admCatLine = p.byAdmCat
      ? `Admission category — GM seats: ${p.byAdmCat['GM'] ?? 0}, SNQ seats: ${p.byAdmCat['SNQ'] ?? 0}, Others: ${p.byAdmCat['OTHERS'] ?? 0}`
      : '';

    const YEAR_INTAKE = 63;
    const y1 = p.byYear['1ST YEAR'] ?? 0;
    const y2 = p.byYear['2ND YEAR'] ?? 0;
    const y3 = p.byYear['3RD YEAR'] ?? 0;
    const fillLine = `Year-wise fill (intake ${YEAR_INTAKE}/year) — 1st: ${y1} (${Math.round(y1/YEAR_INTAKE*100)}%), 2nd: ${y2} (${Math.round(y2/YEAR_INTAKE*100)}%), 3rd: ${y3} (${Math.round(y3/YEAR_INTAKE*100)}%)`;

    const prompt = [
      'You are an admissions intelligence analyst for Sanjay Memorial Polytechnic, Sagar.',
      'Generate between 10 and 15 sharp, engaging one-sentence insights from the data below.',
      'Cover as many DIFFERENT angles as the data supports — pick from this pool:',
      '  • Overall enrollment strength and gender ratio',
      '  • Year-over-year growth or decline (only if prior year data is present)',
      '  • Course rankings — top performer and one needing attention',
      '  • Course × Year matrix — which cell is highest or lowest',
      '  • Year-wise fill rate vs 63-seat-per-year intake',
      '  • Pending conversions — regular vs lateral urgency',
      '  • Recent activity — last 7 days enrollment momentum',
      '  • Category diversity — SC/ST/OBC share vs GM',
      '  • Gender representation per course — most and least female-friendly',
      '  • Admission type mix — regular / lateral / SNQ / repeater ratios',
      '  • GM vs SNQ seat allocation',
      '  • A standout or surprising specific number from the data',
      '  • Actionable opportunity (e.g. converting pending students or boosting a weak course)',
      '  • One positive or celebratory highlight',
      'Style rules: cite exact numbers, one sentence each, active voice, no filler phrases, no preamble.',
      'Return ONLY a valid JSON array of 10–15 strings. No markdown, no labels, no explanation.',
      '',
      `Current Academic Year: ${p.academicYear || 'All years (aggregated)'}`,
      `Confirmed: ${p.total} students (${p.boys} boys, ${p.girls} girls)`,
      `By course — CE: ${p.byCourse['CE'] ?? 0}, ME: ${p.byCourse['ME'] ?? 0}, EC: ${p.byCourse['EC'] ?? 0}, CS: ${p.byCourse['CS'] ?? 0}, EE: ${p.byCourse['EE'] ?? 0}`,
      `By study year — 1st: ${y1}, 2nd: ${y2}, 3rd: ${y3}`,
      fillLine,
      `Admission type — Regular: ${p.byAdmType['REGULAR'] ?? 0}, Lateral: ${p.byAdmType['LATERAL'] ?? 0}, Repeater: ${p.byAdmType['REPEATER'] ?? 0}, SNQ: ${p.byAdmType['SNQ'] ?? 0}, External: ${p.byAdmType['EXTERNAL'] ?? 0}`,
      `Pending (unconfirmed): ${p.pendingTotal} (${p.pendingRegular} regular, ${p.pendingLateral} lateral)`,
      ...(recentLine ? [recentLine] : []),
      ...(categoryLine ? [categoryLine] : []),
      ...(admCatLine ? [admCatLine] : []),
      ...courseYearLines,
      ...genderCourseLines,
      ...(hasPrev ? [
        '',
        `Previous Year (${p.prevAcademicYear}): ${p.prevTotal} students (${p.prevBoys} boys, ${p.prevGirls} girls)`,
        `Prev by course — CE: ${p.prevByCourse?.['CE'] ?? 0}, ME: ${p.prevByCourse?.['ME'] ?? 0}, EC: ${p.prevByCourse?.['EC'] ?? 0}, CS: ${p.prevByCourse?.['CS'] ?? 0}, EE: ${p.prevByCourse?.['EE'] ?? 0}`,
        growthLine,
      ] : []),
    ].join('\n');

    const body = JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1100,
      messages: [{ role: 'user', content: prompt }],
    });

    const req = https.request(
      {
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk: Buffer) => { raw += chunk.toString(); });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(raw) as AnthropicResponse;
            const rawText = parsed.content?.[0]?.text?.trim() ?? '';
            const match = rawText.match(/\[[\s\S]*\]/);
            if (!match) { reject(new Error('Invalid AI response format')); return; }
            const insights = JSON.parse(match[0]) as string[];
            if (!Array.isArray(insights) || insights.length === 0) { reject(new Error('Empty AI response')); return; }
            resolve(insights);
          } catch (err) {
            reject(err);
          }
        });
      },
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

export const generateAdmissionSummary = onCall(
  { region: 'asia-south1', timeoutSeconds: 30 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in required.');
    }

    const configSnap = await db.doc('adminConfig/aiSettings').get();
    if (!configSnap.exists) {
      throw new HttpsError(
        'failed-precondition',
        'AI not configured. Add anthropicApiKey to adminConfig/aiSettings in Firestore.',
      );
    }

    const { anthropicApiKey } = configSnap.data() as { anthropicApiKey: string };
    if (!anthropicApiKey?.trim()) {
      throw new HttpsError('failed-precondition', 'Anthropic API key is empty.');
    }

    const payload = request.data as SummaryPayload;
    if (typeof payload.total !== 'number') {
      throw new HttpsError('invalid-argument', 'Invalid stats payload.');
    }

    try {
      const insights = await callClaude(anthropicApiKey.trim(), payload);
      return { insights, generatedAt: new Date().toISOString() };
    } catch {
      throw new HttpsError('internal', 'AI generation failed. Check the API key and try again.');
    }
  },
);
