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
  currentAcademicYear?: string;
  overallTotal?: number;
  overallBoys?: number;
  overallGirls?: number;
  overallByCourse?: Record<string, number>;
  overallByCategory?: Record<string, number>;
  overallByGenderByCourse?: Record<string, Record<string, number>>;
  currentYearTotal?: number;
  currentYearBoys?: number;
  currentYearGirls?: number;
  currentYearByCourse?: Record<string, number>;
}

interface Insight {
  title: string;
  titleKn: string;
  en: string;
  kn: string;
}

interface AnthropicMessage {
  type: string;
  text: string;
}

interface AnthropicResponse {
  content: AnthropicMessage[];
}

function callClaude(apiKey: string, p: SummaryPayload): Promise<Insight[]> {
  return new Promise((resolve, reject) => {
    const hasPrev = !!p.prevAcademicYear && p.prevTotal !== undefined;

    // ── helper: course row for Boys/Girls ────────────────────────────────
    const genderCourseRow = (gender: string, src?: Record<string, Record<string, number>>) =>
      ['CE','ME','EC','CS','EE'].map((c) => `${c}:${src?.[gender]?.[c] ?? 0}`).join(', ');

    // ── Active-view data block ────────────────────────────────────────────
    const YEAR_INTAKE = 63;
    const y1 = p.byYear['1ST YEAR'] ?? 0;
    const y2 = p.byYear['2ND YEAR'] ?? 0;
    const y3 = p.byYear['3RD YEAR'] ?? 0;

    const activeBlock = [
      `Active view (${p.academicYear || 'All years'}): ${p.total} confirmed students — ${p.boys} boys, ${p.girls} girls`,
      `  Courses — CE:${p.byCourse['CE']??0}, ME:${p.byCourse['ME']??0}, EC:${p.byCourse['EC']??0}, CS:${p.byCourse['CS']??0}, EE:${p.byCourse['EE']??0}`,
      `  Study year — 1st:${y1} (${Math.round(y1/YEAR_INTAKE*100)}% of ${YEAR_INTAKE} seats), 2nd:${y2}, 3rd:${y3}`,
      `  Boys per course  — ${genderCourseRow('BOY',  p.byGenderByCourse)}`,
      `  Girls per course — ${genderCourseRow('GIRL', p.byGenderByCourse)}`,
      p.byCategory
        ? `  Category — GM:${p.byCategory['GM']??0}, SC:${p.byCategory['SC']??0}, ST:${p.byCategory['ST']??0}, C1:${p.byCategory['C1']??0}, 2A:${p.byCategory['2A']??0}, 2B:${p.byCategory['2B']??0}, 3A:${p.byCategory['3A']??0}, 3B:${p.byCategory['3B']??0}`
        : null,
      `  Admission type — Regular:${p.byAdmType['REGULAR']??0}, Lateral:${p.byAdmType['LATERAL']??0}, Repeater:${p.byAdmType['REPEATER']??0}, SNQ:${p.byAdmType['SNQ']??0}`,
      p.byAdmCat
        ? `  Adm category — GM seats:${p.byAdmCat['GM']??0}, SNQ seats:${p.byAdmCat['SNQ']??0}`
        : null,
      `  Pending (not yet confirmed): ${p.pendingTotal} (${p.pendingRegular} regular, ${p.pendingLateral} lateral)`,
      p.recentEnrollmentsCount !== undefined
        ? `  New in last 7 days: ${p.recentEnrollmentsCount} students`
        : null,
    ].filter(Boolean).join('\n');

    // ── Course × Year matrix ──────────────────────────────────────────────
    const matrixBlock = p.byCourseByYear
      ? ['Course-year breakdown:', ...['CE','ME','EC','CS','EE'].map((c) => {
          const row = p.byCourseByYear![c] ?? {};
          return `  ${c}: 1st=${row['1ST YEAR']??0}, 2nd=${row['2ND YEAR']??0}, 3rd=${row['3RD YEAR']??0}`;
        })].join('\n')
      : '';

    // ── Overall all-years block ───────────────────────────────────────────
    const overallBlock = p.overallTotal !== undefined ? [
      `All-years totals (every batch combined): ${p.overallTotal} confirmed — ${p.overallBoys??0} boys, ${p.overallGirls??0} girls`,
      `  Courses — CE:${p.overallByCourse?.['CE']??0}, ME:${p.overallByCourse?.['ME']??0}, EC:${p.overallByCourse?.['EC']??0}, CS:${p.overallByCourse?.['CS']??0}, EE:${p.overallByCourse?.['EE']??0}`,
      `  Boys  — ${genderCourseRow('BOY',  p.overallByGenderByCourse)}`,
      `  Girls — ${genderCourseRow('GIRL', p.overallByGenderByCourse)}`,
      p.overallByCategory
        ? `  Category — GM:${p.overallByCategory['GM']??0}, SC:${p.overallByCategory['SC']??0}, ST:${p.overallByCategory['ST']??0}, C1:${p.overallByCategory['C1']??0}, 2A:${p.overallByCategory['2A']??0}, 2B:${p.overallByCategory['2B']??0}, 3A:${p.overallByCategory['3A']??0}, 3B:${p.overallByCategory['3B']??0}`
        : null,
    ].filter(Boolean).join('\n') : '';

    // ── Current academic year block (if different from active view) ───────
    const showCurrentYr = p.currentYearTotal !== undefined && p.currentAcademicYear && p.currentAcademicYear !== p.academicYear;
    const currentYrBlock = showCurrentYr ? [
      `Current academic year (${p.currentAcademicYear}): ${p.currentYearTotal} confirmed — ${p.currentYearBoys??0} boys, ${p.currentYearGirls??0} girls`,
      `  Courses — CE:${p.currentYearByCourse?.['CE']??0}, ME:${p.currentYearByCourse?.['ME']??0}, EC:${p.currentYearByCourse?.['EC']??0}, CS:${p.currentYearByCourse?.['CS']??0}, EE:${p.currentYearByCourse?.['EE']??0}`,
    ].join('\n') : '';

    // ── Year-over-year block ──────────────────────────────────────────────
    const prevBlock = hasPrev ? (() => {
      const diff = p.total - (p.prevTotal ?? 0);
      const sign = diff >= 0 ? '+' : '';
      const pct = p.prevTotal ? Math.round((diff / p.prevTotal) * 100) : 0;
      return [
        `Previous year (${p.prevAcademicYear}): ${p.prevTotal} students — ${p.prevBoys??0} boys, ${p.prevGirls??0} girls`,
        `  Prev courses — CE:${p.prevByCourse?.['CE']??0}, ME:${p.prevByCourse?.['ME']??0}, EC:${p.prevByCourse?.['EC']??0}, CS:${p.prevByCourse?.['CS']??0}, EE:${p.prevByCourse?.['EE']??0}`,
        `  Change vs this year: ${sign}${diff} students (${sign}${pct}%)`,
      ].join('\n');
    })() : '';

    const APP_FEATURES = [
      'APP FEATURES (use these to generate 3–4 tip insights mixed with the statistics):',
      '  Dashboard Search: Type any student name, mobile number, or registration number in the search bar on the Dashboard to find students instantly. Right-click (or long-press) on any search result to issue a Transfer Certificate (TC), Study Certificate, Provisional Certificate, or Course Completion Certificate.',
      '  Dashboard Filters: Use the Course, Study Year, Gender, Category, Admission Type, and Status filters on the Dashboard to slice the data any way you need.',
      '  Year Chips: Click a year chip (e.g. 2024-25) on the Dashboard to see stats for just that batch.',
      '  Enroll Student: Go to the Enroll page to add a new student or edit an existing one. Edit mode is triggered by searching and selecting a student from the Dashboard.',
      '  Students Page: Browse the full student list with search and filters; double-click a student row to open their full profile; export filtered lists as PDF reports.',
      '  Fee Collection (Admin): Admins can collect fees directly from the Dashboard search results — click the "Collect Fee" button next to any student.',
      '  Fee Register: View all fee records and payment history across all students and years.',
      '  Settings (Admin): Manage the current academic year, configure fee structures per course and year, create and manage staff accounts, set up SMS messaging, and backup or restore data.',
      '  About Section: Click the "About" button at the bottom of the sidebar to learn about this application and its developer.',
      '',
      'ABOUT THIS APP:',
      '  Name: SMP Admissions',
      '  College: Sanjay Memorial Polytechnic, Sagar, Karnataka',
      '  Description: A purpose-built web app for the complete administrative workflow — student enrollment, fee collection with itemised receipts, document management, and certificate issuance (TC, Study Cert, Provisional Cert, Course Completion Cert) — all from one interface.',
      '  Developer: Thejaraj R, FDA (First Division Assistant) at Sanjay Memorial Polytechnic, Sagar.',
      '  Tech: React 19, TypeScript, Tailwind CSS 4, Google Firebase (Firestore + Auth). Role-based access: admins have full access; staff are restricted to permitted operations. Data is cloud-hosted with offline caching.',
      '  Special thanks to the college Principal and staff for their support in developing this software.',
    ].join('\n');

    const prompt = [
      'You are a friendly assistant for SMP Admissions — the student management app of Sanjay Memorial Polytechnic, Sagar, Karnataka.',
      'Generate exactly 10 insights: roughly 6–7 about the admission statistics and 3–4 tips about app features (mixed together, not grouped).',
      '',
      'LANGUAGE RULES:',
      '  • Each insight must have a short title in English AND Kannada.',
      '  • Each insight must have one simple sentence in English AND one natural sentence in Kannada.',
      '  • Use plain, everyday language. Avoid jargon.',
      '  • In the Kannada sentence, keep ALL of the following in English exactly as shown:',
      '      – Course codes: CE, ME, EC, CS, EE',
      '      – Study years: 1ST YEAR, 2ND YEAR, 3RD YEAR',
      '      – App feature names: Dashboard, Search, Filter, Enroll, Settings, Fee Register, TC, Study Certificate, Provisional Certificate',
      '      – Any registration numbers or academic year strings (e.g. 2024-25)',
      '  • Kannada text must otherwise be natural Karnataka Kannada — not a word-for-word translation.',
      '',
      'STATISTICS TOPICS (pick the most interesting 6–7 from the data):',
      '  • Total confirmed students this year and overall all-years total',
      '  • Boy vs girl count overall and per course (which course has most / least girls)',
      '  • Course comparison — top course and the one needing attention',
      '  • Category breakdown — SC, ST, OBC (2A/2B/3A/3B), GM counts',
      '  • Year-over-year change — only if previous year data is present',
      '  • Pending students — how many still need to confirm admission',
      '  • Recent activity — new confirmed students in the last 7 days',
      '',
      'APP TIP TOPICS (pick 3–4 of these):',
      '  • How to search a student and issue a TC or certificate from the Dashboard',
      '  • How to use the year chips or filters to view specific data',
      '  • How to enroll a new student or edit an existing one',
      '  • How to collect a fee or view payment history',
      '  • What is in the About section and who built this app',
      '',
      'OUTPUT FORMAT — return ONLY a valid JSON array of exactly 10 objects. No markdown, no explanation.',
      'Each object must have exactly these 4 keys:',
      '  title    — short English title (2–4 words)',
      '  titleKn  — same title in Kannada (2–4 words)',
      '  en       — one clear English sentence (use exact numbers for statistics; describe the feature clearly for tips)',
      '  kn       — same sentence in natural Kannada (keep course codes, year labels, and feature names in English)',
      '',
      APP_FEATURES,
      '',
      '=== ADMISSION DATA ===',
      activeBlock,
      ...(matrixBlock ? ['', matrixBlock] : []),
      ...(overallBlock ? ['', overallBlock] : []),
      ...(currentYrBlock ? ['', currentYrBlock] : []),
      ...(prevBlock ? ['', prevBlock] : []),
    ].join('\n');

    const body = JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 3500,
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
            // Surface HTTP-level errors from Anthropic (4xx / 5xx)
            if (res.statusCode !== 200) {
              let apiMsg = `HTTP ${res.statusCode}`;
              try {
                const errBody = JSON.parse(raw) as { error?: { message?: string } };
                if (errBody.error?.message) apiMsg += `: ${errBody.error.message}`;
              } catch { /* raw may not be JSON */ }
              reject(new Error(apiMsg));
              return;
            }

            const parsed = JSON.parse(raw) as AnthropicResponse;
            const rawText = parsed.content?.[0]?.text?.trim() ?? '';

            // Strip optional markdown fences Claude sometimes adds
            const stripped = rawText
              .replace(/^```(?:json)?\s*/i, '')
              .replace(/\s*```\s*$/i, '')
              .trim();

            const match = stripped.match(/\[[\s\S]*\]/);
            if (!match) {
              reject(new Error(`No JSON array in response. Got: ${stripped.slice(0, 200)}`));
              return;
            }
            const insights = JSON.parse(match[0]) as Insight[];
            if (!Array.isArray(insights) || insights.length === 0) {
              reject(new Error('Empty insights array'));
              return;
            }
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
  { region: 'asia-south1', timeoutSeconds: 90 },
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new HttpsError('internal', `AI generation failed: ${msg}`);
    }
  },
);
