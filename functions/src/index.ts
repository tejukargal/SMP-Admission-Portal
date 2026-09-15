import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import * as https from 'https';
import { INDIAN_QUOTES } from './indianQuotes';

admin.initializeApp();
const db = admin.firestore();

export { notifyOnNewNotice, notifyOnNoticeUpdated, notifyOnNewCircular, notifyOnCircularUpdated, notifyOnStudentNotification } from './pushNotifications';
export { checkPlayStoreRelease } from './playStoreVersionCheck';

// ── Sync Firestore role/active onto the Auth custom claim `admin` ──────────
// Storage Security Rules can't read Firestore documents, so admin-only Storage
// writes (e.g. remittance challan uploads) are gated on this claim instead.
export const syncAdminClaim = onDocumentWritten('users/{uid}', async (event) => {
  const { uid } = event.params;
  const after = event.data?.after.exists ? event.data.after.data() : null;
  const isAdmin = !!after && after.role === 'admin' && after.active !== false;
  try {
    await admin.auth().setCustomUserClaims(uid, { admin: isAdmin });
  } catch (err) {
    console.error(`syncAdminClaim: failed to set claims for ${uid}`, err);
  }
});

// Self-service: lets the signed-in caller re-sync their own admin claim from
// their own Firestore users/{uid} doc, without needing another doc write to
// fire syncAdminClaim (useful right after the very first deploy, or if a
// user's token is stale). Only ever touches the caller's own uid.
export const syncMyAdminClaim = onCall({ region: 'asia-south1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Must be signed in');
  const uid = request.auth.uid;
  const snap = await db.collection('users').doc(uid).get();
  const data = snap.exists ? snap.data() : null;
  const isAdmin = !!data && data.role === 'admin' && data.active !== false;
  await admin.auth().setCustomUserClaims(uid, { admin: isAdmin });
  return { admin: isAdmin };
});

// ── Student self-service login ──────────────────────────────────────────────
// Verifies (Register Number | Mobile Number) + Date of Birth against the
// students collection using the Admin SDK (bypasses Firestore rules), then
// mints a custom-token Firebase Auth identity carrying a `student` claim so
// the client can sign in on a *separate* secondary Firebase app instance
// (never touching the admin/staff `auth`/AuthContext — see
// src/config/studentFirebase.ts and src/contexts/StudentAuthContext.tsx).
//
// Rate limiting: a `loginAttempts/{key}` doc (client-unwritable, see
// firestore.rules) tracks failed attempts per identifier and locks out after
// 8 failures within a 15-minute window. Error messages are intentionally
// generic (never reveal which factor was wrong) to avoid regNumber/mobile
// enumeration.

const MAX_LOGIN_ATTEMPTS = 8;
const LOGIN_LOCKOUT_WINDOW_MS = 15 * 60 * 1000;

function sanitizeDocId(s: string): string {
  return s.replace(/[/\s]/g, '_').slice(0, 200);
}

async function checkAndRecordAttempt(key: string): Promise<{ blocked: boolean }> {
  const ref = db.collection('loginAttempts').doc(sanitizeDocId(key));
  const snap = await ref.get();
  const now = Date.now();
  const data = snap.exists ? (snap.data() as { count: number; firstAttemptAt: number }) : null;

  if (data && now - data.firstAttemptAt < LOGIN_LOCKOUT_WINDOW_MS) {
    if (data.count >= MAX_LOGIN_ATTEMPTS) {
      return { blocked: true };
    }
    await ref.set({ count: data.count + 1, firstAttemptAt: data.firstAttemptAt });
  } else {
    await ref.set({ count: 1, firstAttemptAt: now });
  }
  return { blocked: false };
}

async function clearAttempts(key: string): Promise<void> {
  await db.collection('loginAttempts').doc(sanitizeDocId(key)).delete().catch(() => {});
}

// The client sends DOB as "YYYY-MM-DD" (native <input type="date"> value), but
// students are stored with dateOfBirth as "DD/MM/YYYY" (see EnrollStudent.tsx —
// a free-text field with slash formatting, not a date input). Convert before
// comparing so logins actually match.
function isoToDDMMYYYY(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) return iso.trim();
  const [, y, m, d] = match;
  return `${d}/${m}/${y}`;
}

export const studentLogin = onCall(
  { region: 'asia-south1' },
  async (request) => {
    const { identifier, mode, dob } = request.data as {
      identifier?: string;
      mode?: 'reg' | 'mobile';
      dob?: string;
    };

    if (!identifier?.trim() || !dob?.trim() || (mode !== 'reg' && mode !== 'mobile')) {
      throw new HttpsError('invalid-argument', 'Register/Mobile number and Date of Birth are required.');
    }

    const cleanIdentifier = identifier.trim().toUpperCase();
    const attemptKey = `${mode}:${cleanIdentifier}`;

    const { blocked } = await checkAndRecordAttempt(attemptKey);
    if (blocked) {
      throw new HttpsError('resource-exhausted', 'Too many attempts. Please try again in 15 minutes.');
    }

    // 1. Find candidate student docs
    let docs: FirebaseFirestore.QueryDocumentSnapshot[];
    if (mode === 'reg') {
      const snap = await db.collection('students').where('regNumber', '==', cleanIdentifier).get();
      docs = snap.docs;
    } else {
      const [byStudent, byFather] = await Promise.all([
        db.collection('students').where('studentMobile', '==', identifier.trim()).get(),
        db.collection('students').where('fatherMobile', '==', identifier.trim()).get(),
      ]);
      const map = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
      for (const d of [...byStudent.docs, ...byFather.docs]) map.set(d.id, d);
      docs = [...map.values()];
    }

    // 2. Filter by exact DOB match (stored as DD/MM/YYYY)
    const dobDDMMYYYY = isoToDDMMYYYY(dob);
    const matches = docs.filter((d) => (d.data() as { dateOfBirth?: string }).dateOfBirth === dobDDMMYYYY);

    if (matches.length === 0) {
      throw new HttpsError('not-found', 'No matching record found. Please check your details.');
    }

    // 3. Determine the claim identity — prefer regNumber (stable across all of a
    //    student's enrollment-year docs); fall back to a single-doc claim for
    //    pre-confirmation records that don't have one yet.
    const withRegNumber = matches.find((d) => !!(d.data() as { regNumber?: string }).regNumber?.trim());

    let uid: string;
    let claims: Record<string, unknown>;
    if (withRegNumber) {
      const regNumber = (withRegNumber.data() as { regNumber: string }).regNumber.trim();
      uid = `student_${sanitizeDocId(regNumber)}`;
      claims = { student: true, regNumber };
    } else {
      const doc = matches[0];
      uid = `student_doc_${doc.id}`;
      claims = { student: true, studentDocId: doc.id };
    }

    await clearAttempts(attemptKey);
    const token = await admin.auth().createCustomToken(uid, claims);

    // Record portal login activity (Admin SDK bypasses rules — students can't
    // write this themselves) so the admin side can show "active users".
    const activityDoc = withRegNumber ?? matches[0];
    const activityData = activityDoc.data() as {
      regNumber?: string; studentNameSSLC?: string; course?: string; year?: string;
    };
    const now = new Date().toISOString();
    await db.collection('studentLoginActivity').doc(uid).set(
      {
        regNumber: activityData.regNumber ?? '',
        studentName: activityData.studentNameSSLC ?? '',
        course: activityData.course ?? '',
        year: activityData.year ?? '',
        lastLoginAt: now,
        loginCount: admin.firestore.FieldValue.increment(1),
        online: true,
      },
      { merge: true },
    );

    return { token };
  },
);

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
    const COURSES = ['CE', 'ME', 'EC', 'CS', 'EE'] as const;
    const MAX_SEATS = 63;

    // ── Resolve current-year data ────────────────────────────────────────
    // When the active Dashboard filter IS the current year, the main stats
    // already represent it. Otherwise pull from the dedicated currentYear* fields.
    const activeIsCurrent = !!p.currentAcademicYear && p.academicYear === p.currentAcademicYear;
    const cyTotal  = activeIsCurrent ? p.total  : (p.currentYearTotal  ?? 0);
    const cyBoys   = activeIsCurrent ? p.boys   : (p.currentYearBoys   ?? 0);
    const cyGirls  = activeIsCurrent ? p.girls  : (p.currentYearGirls  ?? 0);
    const cyCourse = activeIsCurrent ? p.byCourse : (p.currentYearByCourse ?? {});
    const cyLabel  = p.currentAcademicYear || p.academicYear || 'Current Year';

    const cyBoysMap  = activeIsCurrent ? (p.byGenderByCourse?.['BOY']  ?? {}) : {};
    const cyGirlsMap = activeIsCurrent ? (p.byGenderByCourse?.['GIRL'] ?? {}) : {};

    // ── Pre-compute richer analytics ─────────────────────────────────────
    const courseTotal  = (c: string) => cyCourse[c] ?? 0;
    const courseBoys   = (c: string) => cyBoysMap[c]  ?? 0;
    const courseGirls  = (c: string) => cyGirlsMap[c] ?? 0;
    const fillPct      = (c: string) => Math.round(courseTotal(c) / MAX_SEATS * 100);
    const girlPct      = (c: string) => {
      const t = courseTotal(c);
      return t > 0 ? Math.round(courseGirls(c) / t * 100) : 0;
    };

    const coursesByTotal = [...COURSES].sort((a, b) => courseTotal(b) - courseTotal(a));
    const coursesByGirlPct = [...COURSES].filter(c => courseTotal(c) > 0)
                                         .sort((a, b) => girlPct(b) - girlPct(a));

    const topCourse    = coursesByTotal[0];
    const bottomCourse = coursesByTotal[coursesByTotal.length - 1];
    const mostGirlsCourse  = coursesByGirlPct[0];
    const leastGirlsCourse = coursesByGirlPct[coursesByGirlPct.length - 1];

    // Category analytics
    const catMap     = activeIsCurrent ? (p.byCategory ?? {}) : {};
    const catTotal   = Object.values(catMap).reduce((s, v) => s + v, 0);
    const gmCount    = catMap['GM'] ?? 0;
    const scCount    = catMap['SC'] ?? 0;
    const stCount    = catMap['ST'] ?? 0;
    const obcCount   = (catMap['2A']??0) + (catMap['2B']??0) + (catMap['3A']??0) + (catMap['3B']??0);
    const reservedCount  = catTotal - gmCount;
    const reservedPct    = catTotal > 0 ? Math.round(reservedCount / catTotal * 100) : 0;
    const gmPct          = catTotal > 0 ? Math.round(gmCount / catTotal * 100) : 0;

    // Study-year data
    const y1 = activeIsCurrent ? (p.byYear['1ST YEAR'] ?? 0) : 0;
    const y2 = activeIsCurrent ? (p.byYear['2ND YEAR'] ?? 0) : 0;
    const y3 = activeIsCurrent ? (p.byYear['3RD YEAR'] ?? 0) : 0;
    const y1FillPct = Math.round(y1 / MAX_SEATS * 100);

    // Year-over-year analytics
    const cyYoYBase = activeIsCurrent ? p.total : cyTotal;
    const yoyDiff   = hasPrev ? cyYoYBase - (p.prevTotal ?? 0) : 0;
    const yoySign   = yoyDiff >= 0 ? '+' : '';
    const yoyPct    = hasPrev && p.prevTotal ? Math.round(yoyDiff / p.prevTotal * 100) : 0;
    const courseYoY = hasPrev
      ? COURSES.map(c => {
          const d = courseTotal(c) - (p.prevByCourse?.[c] ?? 0);
          return `${c}: ${d >= 0 ? '+' : ''}${d}`;
        }).join(', ')
      : '';

    // Overall all-years analytics
    const hasOverall = p.overallTotal !== undefined && p.overallTotal !== cyTotal;
    const ovGirlPct  = hasOverall && p.overallTotal
      ? Math.round((p.overallGirls ?? 0) / p.overallTotal * 100) : 0;

    // ── Variety — rotate emphasis angle each invocation ──────────────────
    const EMPHASIS_POOL = [
      `Lean into GENDER DIVERSITY this run: dig into which courses have high/low girl ratios, frame findings with the exact percentages, and make the patterns vivid.`,
      `Lean into COURSE FILL RATES this run: highlight which courses are near capacity vs. have open seats, use the ${MAX_SEATS}-seat maximum, and make comparisons between courses compelling.`,
      `Lean into RESERVATION & CATEGORY MIX this run: show what the SC/ST/OBC/GM split reveals about who is being served, use percentages, and highlight any notable category patterns.`,
      `Lean into YEAR-WISE DISTRIBUTION this run: explore how students are spread across 1ST, 2ND, and 3RD YEAR, what the 1ST YEAR intake says about this batch's potential, and how each course's year mix looks.`,
      `Lean into ADMISSION PIPELINE HEALTH this run: focus on pending vs. confirmed ratios, what recent enrollments signal, and whether the pipeline looks healthy or needs attention.`,
      `Lean into COURSE COMPARISON this run: rank the five courses, call out the largest and smallest, look for surprising gaps or close races, and frame it as a story of which disciplines students prefer.`,
    ];
    const emphasisAngle = EMPHASIS_POOL[Math.floor(Math.random() * EMPHASIS_POOL.length)];

    // ── Analytics summary block (pre-digested for Claude) ────────────────
    const analyticsBlock = [
      `PRE-COMPUTED ANALYTICS — ${cyLabel} (use these exact numbers in your insights):`,
      `  Overall: ${cyTotal} confirmed (${cyBoys} boys ${cyGirls} girls; ${cyTotal > 0 ? Math.round(cyGirls/cyTotal*100) : 0}% girls overall)`,
      `  Course totals ranked: ${coursesByTotal.map(c => `${c}:${courseTotal(c)} (${fillPct(c)}% full)`).join(', ')}`,
      `  Boys per course: ${COURSES.map(c => `${c}:${courseBoys(c)}`).join(', ')}`,
      `  Girls per course: ${COURSES.map(c => `${c}:${courseGirls(c)} (${girlPct(c)}%)`).join(', ')}`,
      `  Most girls (% of course): ${mostGirlsCourse} at ${girlPct(mostGirlsCourse)}%`,
      `  Least girls (% of course): ${leastGirlsCourse} at ${girlPct(leastGirlsCourse)}%`,
      `  Top enrollment course: ${topCourse} (${courseTotal(topCourse)} students, ${fillPct(topCourse)}% of ${MAX_SEATS} seats)`,
      `  Lowest enrollment course: ${bottomCourse} (${courseTotal(bottomCourse)} students, ${fillPct(bottomCourse)}% of ${MAX_SEATS} seats)`,
      ...(activeIsCurrent && catTotal > 0 ? [
        `  Category: GM ${gmCount} (${gmPct}%), Reserved ${reservedCount} (${reservedPct}%) — SC ${scCount}, ST ${stCount}, OBC (2A+2B+3A+3B) ${obcCount}`,
      ] : []),
      ...(activeIsCurrent ? [
        `  Admission type: Regular ${p.byAdmType['REGULAR']??0}, Lateral ${p.byAdmType['LATERAL']??0}, Repeater ${p.byAdmType['REPEATER']??0}, SNQ ${p.byAdmType['SNQ']??0}`,
        `  Study year: 1ST YEAR ${y1} (${y1FillPct}% of ${MAX_SEATS} seats), 2ND YEAR ${y2}, 3RD YEAR ${y3}`,
        `  Pending: ${p.pendingTotal} not yet confirmed (${p.pendingRegular} regular, ${p.pendingLateral} lateral)`,
        ...(p.recentEnrollmentsCount !== undefined ? [`  Last 7 days: ${p.recentEnrollmentsCount} new confirmations`] : []),
      ] : []),
      ...(hasPrev ? [
        `  YoY vs ${p.prevAcademicYear}: ${yoySign}${yoyDiff} students (${yoySign}${yoyPct}%) — by course: ${courseYoY}`,
      ] : []),
      ...(hasOverall ? [
        `  All-years cumulative: ${p.overallTotal} students ever (${p.overallBoys??0} boys, ${p.overallGirls??0} girls, ${ovGirlPct}% girls)`,
        `  All-years by course: ${COURSES.map(c => `${c}:${p.overallByCourse?.[c]??0}`).join(', ')}`,
      ] : []),
      ...(activeIsCurrent && p.byCourseByYear ? [
        `  Course × Year matrix: ${COURSES.map(c => {
          const row = p.byCourseByYear![c] ?? {};
          return `${c}[1Y:${row['1ST YEAR']??0} 2Y:${row['2ND YEAR']??0} 3Y:${row['3RD YEAR']??0}]`;
        }).join(' ')}`,
      ] : []),
    ].join('\n');

    // ── STATIC SYSTEM PROMPT (cached for 1 h) ────────────────────────────
    const SYSTEM = `You are the AI insights engine for "SMP Admissions" — the official student management system of Sanjay Memorial Polytechnic (SMP), Sagar, Karnataka.

You generate fresh, bilingual (English + Kannada) insights shown on the principal's dashboard. Each refresh must produce a genuinely different set — explore different angles, emphasise different patterns, use different comparisons.

## WRITING STYLE
- Lead with the most striking or specific number first. Example: "CE tops the charts with 45 students — filling 71% of its 63 available seats."
- Use ratios and comparisons to make numbers vivid: "3 in 4 EE students are boys." or "CS has gained 8 more students than last year — the biggest jump among all courses."
- For app tips: be concrete and action-oriented. Mention the exact feature name and what it achieves.
- Avoid vague words ("good", "strong", "impressive"). State the fact and let the number speak.
- English sentence length: 12–28 words. Kannada: natural equivalent.
- Vary sentence structures across the 15 insights — don't start every one with the same pattern.

## LANGUAGE RULES — MANDATORY
Keep these terms in English even inside Kannada sentences (exact form, no translation):
  Course codes: CE, ME, EC, CS, EE
  Study years: 1ST YEAR, 2ND YEAR, 3RD YEAR
  App feature names: Dashboard, Search, Filter, Enroll, Settings, Fee Register, TC, Study Certificate, Provisional Certificate, Fee Collection, Students Page
  Academic year strings (e.g. 2024-25)
All other Kannada must be natural Karnataka Kannada — not a literal word-for-word translation of the English sentence. A fluent Kannada speaker should find it natural.

## OUTPUT FORMAT — STRICT
Return ONLY a raw JSON array of exactly 12 objects. No markdown fences, no explanation, no trailing text.
Each object must have exactly these 4 string keys:
  "title"   — short English title, 2–4 words
  "titleKn" — same title in Kannada, 2–4 words
  "en"      — one vivid English sentence using exact numbers from the data
  "kn"      — same idea in natural Kannada (keep English terms listed above)

Valid example object:
{"title":"CE Leads Enrollment","titleKn":"CE ಅಗ್ರ ದಾಖಲಾತಿ","en":"CE tops all five courses with 45 confirmed students, filling 71% of its 63 available seats.","kn":"ಐದು ಕೋರ್ಸ್‌ಗಳಲ್ಲಿ CE ಮುಂದಿದ್ದು, 63 ಸೀಟಿನಲ್ಲಿ 45 ವಿದ್ಯಾರ್ಥಿಗಳು ಅಂದರೆ 71% ತುಂಬಿದೆ."}

## APP FEATURES REFERENCE (use 4–5 of these for tip insights, interleaved with statistics)

Dashboard Search — Type any student name, registration number, or mobile number in the search bar to find students instantly. Right-click (or long-press on mobile) any result to get quick actions: issue a TC, Study Certificate, Provisional Certificate, or Course Completion Certificate directly.

Dashboard Filters — Use the Course, Study Year, Gender, Category, Admission Type, and Status filter chips to slice and view exactly the student segment you need.

Year Chips — Click any academic year badge on the Dashboard (e.g. 2024-25) to see enrollment stats for just that batch. Click again to return to the all-years view.

Enroll Student — Go to the Enroll page to add a new student or edit an existing one. To edit, search the student on the Dashboard and select them — the app opens their record in edit mode automatically.

Students Page — Browse the full student directory with search and multi-filter support. Double-click any row to open the student's complete profile. Use the PDF export button to generate filtered reports.

Fee Collection (Admin only) — Collect fees directly from the Dashboard: search a student, then click the Collect Fee button on their result card. The app generates an itemised fee receipt.

Fee Register — View the complete payment history across all students and all years. Filter by course, year, or date range to audit collections.

Settings (Admin only) — Configure the current academic year, set fee structures per course and year, manage staff accounts, set up SMS notification templates, and use the Backup & Restore tool.

About Section — Click the "About" link at the bottom of the sidebar for information about this application and its developer.

## ABOUT THIS APP
Name: SMP Admissions
College: Sanjay Memorial Polytechnic, Sagar, Karnataka
Purpose: A purpose-built web application for the complete administrative workflow — student enrollment, fee collection with itemised receipts, document management, and certificate issuance (TC, Study Cert, Provisional Cert, Course Completion Cert) — all in one interface.
Developer: Thejaraj R, FDA (First Division Assistant) at Sanjay Memorial Polytechnic, Sagar.
Technology: React 19, TypeScript, Tailwind CSS 4, Google Firebase (Firestore + Authentication). Role-based access — admins have full access, staff are restricted to permitted operations. Data is cloud-hosted with offline caching for reliability.
Special thanks to the college Principal and staff for their support.`;

    // ── DYNAMIC USER MESSAGE (changes per call — NOT cached) ─────────────
    const USER_MSG = [
      `== THIS RUN'S EMPHASIS ==`,
      emphasisAngle,
      `Generate 12 insights now. Apply the emphasis above across your statistics choices while still covering all required topics listed below.`,
      `Interleave 3–4 app tips naturally — do NOT group them all at the start or end.`,
      '',
      `== REQUIRED STATISTICS TOPICS — all from ${cyLabel} ==`,
      `1. Total confirmed students with boys/girls count and overall girl percentage`,
      `2. Top enrollment course — name it, give count and fill-rate percentage`,
      `3. Lowest enrollment course — name it, highlight the gap vs the top`,
      `4. Girls distribution — which course has the highest girl percentage and which the lowest`,
      `5. Boys-per-course comparison — where do most boys enroll`,
      ...(activeIsCurrent && catTotal > 0 ? [
        `6. Category/reservation breakdown — GM vs reserved (SC/ST/OBC) percentages`,
        `7. Admission type mix — regular vs lateral vs SNQ numbers`,
        `8. Study-year fill rate — how much of the 1ST YEAR intake (of ${MAX_SEATS} seats) is filled`,
        `9. Pending admissions — how many students are still not confirmed`,
        ...(p.recentEnrollmentsCount !== undefined ? [`10. Recent activity — new confirmations in the last 7 days`] : []),
      ] : [`6. All-years cumulative context — total ever enrolled across all batches`]),
      ...(hasPrev ? [`Extra: Year-over-year change — highlight the course that changed most vs ${p.prevAcademicYear}`] : []),
      '',
      `== ADMISSION DATA ==`,
      analyticsBlock,
    ].join('\n');

    const body = JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 5000,
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral', ttl: '1h' } }],
      messages: [{ role: 'user', content: USER_MSG }],
    });

    const req = https.request(
      {
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'prompt-caching-2024-07-31',
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
  { region: 'asia-south1', timeoutSeconds: 300 },
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

// ── Daily Briefing (merged AI Summary + Daily Motivation) ───────────────────
// One combined feature, generated via Gemini instead of Claude: a shared
// "quote of the day" from a curated bank of great Indian personalities (see
// generateDailyBriefing further below) plus a personalized mentor note +
// highlights digest built from the student's own circulars/fees/
// certificates. The types and helpers below (student/fee/circular/notice
// shapes, the due-calculation helpers) are shared by that function.
// Deliberately excludes sensitive PII (Aadhaar, APAAR ID, DOB, parent names)
// from what's sent to Gemini — only what's needed for a useful digest.

// Mirrors the TCRecord/PCRecord shapes embedded on a student doc's tcHistory/
// pcHistory arrays in src/types/index.ts on the student app — duplicated here
// (only the fields the daily briefing digest actually cites) for the same
// reason as SMP_FEE_HEAD_KEYS below: Cloud Functions can't import from that repo.
interface TcHistoryEntry {
  tcNumber?: string;
  course?: string;
  semester?: string;
  issuedAt?: string;
}

interface PcHistoryEntry {
  examPeriod?: string;
  resultClass?: string;
  issuedAt?: string;
}

// Mirrors the Refund shape (collection `refunds`) from src/types/index.ts on
// the student app, same reason as above.
interface RefundRecord {
  refundAmount?: number;
  refundCategory?: string;
  paymentDate?: string;
}

interface StudentDoc {
  id?: string;
  regNumber?: string;
  studentNameSSLC?: string;
  course?: string;
  year?: string;
  academicYear?: string;
  admissionStatus?: string;
  tcHistory?: TcHistoryEntry[];
  pcHistory?: PcHistoryEntry[];
}

type SMPHeadsDoc = Record<string, number | undefined>;

// Mirrors src/types/index.ts's SMP_FEE_HEADS keys (14 fee heads) from the student app —
// duplicated here since Cloud Functions can't import from that repo.
const SMP_FEE_HEAD_KEYS = [
  'adm', 'tuition', 'lib', 'rr', 'sports', 'lab', 'dvp', 'mag', 'idCard', 'ass', 'swf', 'twf', 'nss', 'fine',
] as const;

interface FeeRecordDoc {
  academicYear?: string;
  course?: string;
  year?: string;
  admType?: string;
  admCat?: string;
  smp?: SMPHeadsDoc;
  svk?: number;
  additionalPaid?: { amount?: number }[];
}

interface FeeStructureDoc {
  smp?: SMPHeadsDoc;
  svk?: number;
  additionalHeads?: { amount?: number }[];
}

interface FeeOverrideDoc {
  smp?: SMPHeadsDoc;
  svk?: number;
  additionalHeads?: { amount?: number }[];
}

interface CircularDoc {
  title?: string;
  subject?: string;
  department?: string;
  date?: string;
  pinned?: boolean;
  archivedAt?: string;
}

interface NoticeDoc {
  title?: string;
  category?: string;
  createdAt?: string;
  archivedAt?: string;
  scope?: string;
  scopeValue?: string;
  targetRegNumbers?: string[];
}

// Mirrors src/utils/noticeUtils.ts's `noticeAppliesToMe` from the student app —
// duplicated here (8 lines) since Cloud Functions can't import from that repo.
function noticeAppliesToStudent(n: NoticeDoc, student: StudentDoc): boolean {
  if (n.archivedAt) return false;
  if (n.scope === 'all') return true;
  if (n.scope === 'academicYear') return n.scopeValue === student.academicYear;
  if (n.scope === 'course') return n.scopeValue === student.course;
  if (n.scope === 'regNumber') return n.scopeValue === student.regNumber;
  if (n.scope === 'selected') return (n.targetRegNumbers ?? []).includes(student.regNumber ?? '');
  return false;
}

function sumFeeRecord(r: FeeRecordDoc): number {
  const smpTotal = Object.values(r.smp ?? {}).reduce((s: number, v) => s + (typeof v === 'number' ? v : 0), 0);
  const additionalTotal = (r.additionalPaid ?? []).reduce((s, h) => s + (h.amount ?? 0), 0);
  return smpTotal + (r.svk ?? 0) + additionalTotal;
}

// Mirrors src/utils/feeCalc.ts's calcAllotted (+ its calcEffectiveFine helper) from the
// student app — duplicated here since Cloud Functions can't import from that repo. The
// "fine" head is special-cased to the larger of the structure's allotted fine and whatever
// fine has actually been paid this year, same as the client.
function calcAllottedForYear(
  effSmp: SMPHeadsDoc,
  effSvk: number,
  effAdditional: { amount?: number }[],
  yearRecords: FeeRecordDoc[],
): number {
  const structureFine = effSmp.fine ?? 0;
  const finePaid = yearRecords.reduce((s, r) => s + (r.smp?.fine ?? 0), 0);
  const effectiveFine = Math.max(structureFine, finePaid);
  const smpTotal = SMP_FEE_HEAD_KEYS.reduce(
    (t, key) => t + (key === 'fine' ? effectiveFine : (effSmp[key] ?? 0)),
    0,
  );
  const additionalTotal = effAdditional.reduce((s, h) => s + (h.amount ?? 0), 0);
  return smpTotal + effSvk + additionalTotal;
}

function dayOfYearIST(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  const start = Date.UTC(y, 0, 1);
  const current = Date.UTC(y, m - 1, d);
  return Math.floor((current - start) / (24 * 60 * 60 * 1000));
}

function buildDailyQuoteImagePrompt(scene: string, provider: AiImageSettings['imageProvider']): string {
  return [
    'Flat vector illustration for a mobile app header banner, wide 16:9 landscape composition.',
    `Depict ${scene}.`,
    imageStyleDirective(provider, 'warm and inspiring color palette'),
  ].join(' ');
}

/** Uploads a generated daily-quote background image via the Admin SDK (this
 *  flow is triggered by a student's device, not the admin web client, so
 *  there's no admin Storage session to upload with client-side) and returns
 *  a public download URL — storage.rules allows public read on this path
 *  since it's generic daily-inspiration art, nothing sensitive. */
async function uploadDailyQuoteImage(date: string, imageBase64: string, mimeType: string): Promise<string> {
  const ext = mimeType === 'image/jpeg' ? 'jpg' : 'png';
  const path = `dailyQuoteBackgrounds/${date}.${ext}`;
  const bucket = admin.storage().bucket();
  await bucket.file(path).save(Buffer.from(imageBase64, 'base64'), {
    metadata: { contentType: mimeType },
    resumable: false,
  });
  return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media`;
}

interface DailyQuoteDoc {
  date?: string;
  quoteEn?: string;
  quoteAuthor?: string;
  theme?: string;
  backgroundImageUrl?: string;
}

/** Reads (or, on the first request of the day across all students, generates)
 *  the shared "quote of the day" — one curated Indian-personality quote,
 *  paired with a matching AI-generated background image. Shared across every
 *  student that day, not regenerated per student; a small chance of two
 *  near-simultaneous first-requests both generating once is accepted as
 *  harmless (last write wins), same as every other day-cache in this file. */
async function getOrCreateDailyQuote(
  today: string,
  aiSettings: AiImageSettings,
): Promise<DailyQuoteDoc> {
  const ref = db.collection('dailyQuote').doc(today);
  const snap = await ref.get();
  const cached = snap.data() as DailyQuoteDoc | undefined;
  if (cached?.date === today && cached.quoteEn && cached.backgroundImageUrl) {
    return cached;
  }

  const quote = INDIAN_QUOTES[dayOfYearIST(today) % INDIAN_QUOTES.length];
  const image = await generateAiImage(aiSettings, buildDailyQuoteImagePrompt(quote.scene, aiSettings.imageProvider));
  const backgroundImageUrl = await uploadDailyQuoteImage(today, image.imageBase64, image.mimeType);

  const toStore: DailyQuoteDoc = {
    date: today,
    quoteEn: quote.textEn,
    quoteAuthor: quote.author,
    theme: quote.theme,
    backgroundImageUrl,
  };
  await ref.set(toStore);
  return toStore;
}

const BRIEFING_SYSTEM = `You are a warm, thoughtful mentor inside the student portal app of Sanjay Memorial Polytechnic (SMP), Sagar, Karnataka — like a favorite teacher and a close friend rolled into one. You write a short personal note and a short highlights digest for one student, based only on the data given to you.

## PERSONAL NOTE
- greeting: a short warm opening addressing the student by first name, e.g. "Dear Aditi," — vary the phrasing day to day rather than always using "Dear".
- messageEn: exactly 1-2 short sentences in English, no more than ~25 words total, mentor/friend voice — grounded, genuinely encouraging, naturally acknowledging today is a fresh day. Address the student by first name at least once, woven naturally into a sentence. Be concise — every word should earn its place.
- messageKn: an accurate, natural Kannada translation of messageEn, phrased the way a fluent Kannada speaker would naturally write it — not a stiff literal translation. Proper Kannada script. Just as concise as messageEn.

## HIGHLIGHTS
Produce up to 10 short bullet points total (each one sentence, using exact numbers/titles/dates from the data — never invent one, never mention data you were not given), in two groups, in this order:

1. PINNED CIRCULARS (up to 3 points): one point per circular listed under PINNED CIRCULARS, naming it and telling the student plainly that it's important and they should read it / act on it soon. If there are more than 3, pick the 3 most time-sensitive or recent. If there are fewer than 3 (including none), write only that many points — never invent a pinned circular to fill the group, and skip the group entirely if there are none.
2. FEE DUES, REFUNDS & CERTIFICATES (up to 7 points): one point per genuinely distinct, real fact drawn only from the fee-due figure and the individual entries under CERTIFICATES & REFUNDS — e.g. the pending due amount, one specific refund with its amount, one specific TC or PC with its date. Never state the same fact twice across two points. If there are fewer than 7 real, distinct facts available, write only that many — do not pad, repeat, or invent to reach 7.

Across both groups: accuracy always wins over hitting the count of 10 — a shorter, fully honest list beats a padded or repetitive one. Don't force in generic filler (like a bare circular count) unless there's genuinely nothing more specific worth saying.

## OUTPUT FORMAT — STRICT
Return ONLY a raw JSON object: {"greeting": string, "messageEn": string, "messageKn": string, "points": string[]}. No markdown fences, no explanation, no trailing text.`;

interface BriefingResult {
  greeting: string;
  messageEn: string;
  messageKn: string;
  points: string[];
}

function isBriefingResult(value: unknown): value is BriefingResult {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.greeting === 'string' &&
    typeof v.messageEn === 'string' &&
    typeof v.messageKn === 'string' &&
    Array.isArray(v.points) && v.points.length > 0 && v.points.every((p) => typeof p === 'string')
  );
}

export const generateDailyBriefing = onCall(
  { region: 'asia-south1', timeoutSeconds: 120 },
  async (request) => {
    const claims = request.auth?.token as { student?: boolean; regNumber?: string; studentDocId?: string } | undefined;
    if (!claims?.student) {
      throw new HttpsError('unauthenticated', 'Student sign-in required.');
    }

    let regNumber = claims.regNumber;
    if (!regNumber && claims.studentDocId) {
      const doc = await db.collection('students').doc(claims.studentDocId).get();
      regNumber = (doc.data() as StudentDoc | undefined)?.regNumber;
    }
    if (!regNumber) {
      throw new HttpsError('failed-precondition', 'No registration number on this account yet.');
    }

    const configSnap = await db.doc('adminConfig/aiSettings').get();
    if (!configSnap.exists) {
      throw new HttpsError(
        'failed-precondition',
        'AI not configured. Add a geminiApiKey or openaiApiKey to adminConfig/aiSettings in Firestore.',
      );
    }
    const { geminiApiKey, geminiTextModel, geminiImageModel, imageProvider, openaiApiKey, openaiImageModel, replicateApiKey, replicateImageModel, budgetpixelApiKey, budgetpixelImageModel } = configSnap.data() as {
      geminiApiKey?: string;
      geminiTextModel?: string;
      geminiImageModel?: string;
      imageProvider?: 'gemini' | 'openai' | 'replicate' | 'budgetpixel';
      openaiApiKey?: string;
      openaiImageModel?: string;
      replicateApiKey?: string;
      replicateImageModel?: string;
      budgetpixelApiKey?: string;
      budgetpixelImageModel?: string;
    };
    // geminiApiKey is required unconditionally — it's also used for the text
    // briefing below regardless of which provider generates the image.
    if (!geminiApiKey?.trim()) {
      throw new HttpsError('failed-precondition', 'Gemini API key is empty.');
    }
    if (imageProvider === 'openai' && !openaiApiKey?.trim()) {
      throw new HttpsError('failed-precondition', 'OpenAI API key is empty.');
    }
    if (imageProvider === 'replicate' && !replicateApiKey?.trim()) {
      throw new HttpsError('failed-precondition', 'Replicate API key is empty.');
    }
    if (imageProvider === 'budgetpixel' && !budgetpixelApiKey?.trim()) {
      throw new HttpsError('failed-precondition', 'BudgetPixel API key is empty.');
    }
    const textModel = geminiTextModel?.trim() || 'gemini-3.5-flash-lite';
    const imageModel = geminiImageModel?.trim() || 'gemini-3.1-flash-lite-image';

    const today = todayIST();

    const [quote, cachedBriefingSnap] = await Promise.all([
      getOrCreateDailyQuote(today, {
        imageProvider,
        geminiApiKey: geminiApiKey.trim(),
        geminiImageModel: imageModel,
        openaiApiKey: openaiApiKey?.trim(),
        openaiImageModel: openaiImageModel?.trim(),
        replicateApiKey: replicateApiKey?.trim(),
        replicateImageModel: replicateImageModel?.trim(),
        budgetpixelApiKey: budgetpixelApiKey?.trim(),
        budgetpixelImageModel: budgetpixelImageModel?.trim(),
      }),
      db.collection('dailyBriefing').doc(regNumber).get(),
    ]);

    const cachedBriefing = cachedBriefingSnap.data() as (Partial<BriefingResult> & { date?: string; generatedAt?: string }) | undefined;
    const cachedGeneratedAt = cachedBriefing?.generatedAt;
    if (cachedBriefing?.date === today && isBriefingResult(cachedBriefing)) {
      const { greeting, messageEn, messageKn, points } = cachedBriefing;
      return { quote, greeting, messageEn, messageKn, points, generatedAt: cachedGeneratedAt ?? new Date().toISOString() };
    }

    const [studentsSnap, feeSnap, refundsSnap, circularsSnap, noticesSnap, circularsCountSnap, pinnedSnap] = await Promise.all([
      db.collection('students').where('regNumber', '==', regNumber).get(),
      db.collection('feeRecords').where('regNumber', '==', regNumber).get(),
      db.collection('refunds').where('regNumber', '==', regNumber).get(),
      db.collection('circulars').orderBy('createdAt', 'desc').limit(15).get(),
      db.collection('notices').orderBy('createdAt', 'desc').limit(30).get(),
      db.collection('circulars').count().get(),
      db.collection('circulars').where('pinned', '==', true).get(),
    ]);

    const studentDocs = studentsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as StudentDoc) }));
    if (studentDocs.length === 0) {
      throw new HttpsError('not-found', 'Student record not found.');
    }
    // Prefer the doc for the current-looking enrollment (has admissionStatus/course); fall
    // back to the first match — mirrors how fetchMyTcRecords/fetchMyPcRecords aggregate
    // across all of a student's year-by-year docs on the client.
    const primary = studentDocs.find((s) => !!s.course) ?? studentDocs[0];
    const tcRecords = studentDocs.flatMap((d) => d.tcHistory ?? []);
    const pcRecords = studentDocs.flatMap((d) => d.pcHistory ?? []);
    const refundRecords = refundsSnap.docs.map((d) => d.data() as RefundRecord);
    const tcCount = tcRecords.length;
    const pcCount = pcRecords.length;
    const refundCount = refundRecords.length;

    // One combined, most-recent-first, capped line list for the HIGHLIGHTS prompt's
    // "FEE DUES, REFUNDS & CERTIFICATES" group — real per-record facts (not just
    // counts) so the model can cite specifics instead of a bare aggregate.
    const certificateAndRefundLines = [
      ...tcRecords.map((r) => ({ date: r.issuedAt ?? '', line: `TC #${r.tcNumber ?? '?'} | ${r.course ?? ''} ${r.semester ?? ''} | issued ${r.issuedAt ?? 'unknown date'}` })),
      ...pcRecords.map((r) => ({ date: r.issuedAt ?? '', line: `PC | ${r.examPeriod ?? ''}, ${r.resultClass ?? ''} | issued ${r.issuedAt ?? 'unknown date'}` })),
      ...refundRecords.map((r) => ({ date: r.paymentDate ?? '', line: `Refund | Rs.${r.refundAmount ?? '?'} (${r.refundCategory ?? 'GENERAL'}) | ${r.paymentDate ?? 'unknown date'}` })),
    ]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 8)
      .map((e) => e.line);

    const feeRecords = feeSnap.docs.map((d) => d.data() as FeeRecordDoc);
    const totalPaid = feeRecords.reduce((s, r) => s + sumFeeRecord(r), 0);

    // Precise due (allotted − paid) per academic year, mirroring fetchMyTotalDue in
    // src/services/studentPortalService.ts on the client — not just a "paid so far" total.
    const recordsByYear = new Map<string, FeeRecordDoc[]>();
    for (const r of feeRecords) {
      if (!r.academicYear) continue;
      const list = recordsByYear.get(r.academicYear) ?? [];
      list.push(r);
      recordsByYear.set(r.academicYear, list);
    }
    const dueByYear = await Promise.all(
      [...recordsByYear.entries()].map(async ([ay, yearRecords]) => {
        const first = yearRecords[0];
        const structureId = `${ay}__${first.course ?? ''}__${first.year ?? ''}__${first.admType ?? ''}__${first.admCat ?? ''}`;
        const structureDoc = await db.collection('feeStructure').doc(structureId).get();
        const structure = structureDoc.exists ? (structureDoc.data() as FeeStructureDoc) : null;

        const ownDocForYear = studentDocs.find((s) => s.academicYear === ay);
        const overrideDoc = ownDocForYear
          ? await db.collection('feeOverrides').doc(`${ownDocForYear.id}__${ay}`).get()
          : null;
        const override = overrideDoc?.exists ? (overrideDoc.data() as FeeOverrideDoc) : null;

        const effective = override ?? structure;
        if (!effective) return 0;

        const paid = yearRecords.reduce((s, r) => s + sumFeeRecord(r), 0);
        const allotted = calcAllottedForYear(effective.smp ?? {}, effective.svk ?? 0, effective.additionalHeads ?? [], yearRecords);
        return Math.max(0, allotted - paid);
      }),
    );
    const totalDue = dueByYear.reduce((s, d) => s + d, 0);

    const totalCircularsCount = circularsCountSnap.data().count;

    const circulars = circularsSnap.docs
      .map((d) => d.data() as CircularDoc)
      .filter((c) => !c.archivedAt);

    const pinnedCirculars = pinnedSnap.docs
      .map((d) => d.data() as CircularDoc)
      .filter((c) => !c.archivedAt);

    const notices = noticesSnap.docs
      .map((d) => d.data() as NoticeDoc)
      .filter((n) => noticeAppliesToStudent(n, primary))
      .slice(0, 8);

    const fullName = primary.studentNameSSLC?.trim();
    const firstName = fullName ? fullName.split(/\s+/)[0] : 'Student';
    const { dayLabel, dateLabel } = todayLabelsIST();

    const dataBlock = [
      `STUDENT FIRST NAME: ${firstName}`,
      `TODAY: ${dayLabel}, ${dateLabel}`,
      `STUDENT: ${fullName ?? 'Student'}, ${primary.course ?? ''} ${primary.year ?? ''} (${primary.academicYear ?? ''})`,
      `Admission status: ${primary.admissionStatus ?? 'unknown'}`,
      totalDue > 0
        ? `Fee dues: Rs.${totalDue} pending across academic years (Rs.${totalPaid} paid so far)`
        : `Fee dues: none — fully paid (Rs.${totalPaid} paid so far)`,
      `Certificates: ${tcCount} Transfer Certificate(s), ${pcCount} Provisional Certificate(s), ${refundCount} Refund(s) issued`,
      `Total circulars ever published: ${totalCircularsCount}`,
      '',
      `PINNED CIRCULARS (title | department | date | subject):`,
      ...(pinnedCirculars.length > 0
        ? pinnedCirculars.map((c) => `- ${c.title ?? ''} | ${c.department ?? ''} | ${c.date ?? ''} | ${c.subject ?? ''}`)
        : ['(none)']),
      '',
      // Per-record detail (not just the aggregate line above) so the HIGHLIGHTS
      // prompt's fee/refund/certificate group can cite specific, real facts.
      `CERTIFICATES & REFUNDS (most recent first):`,
      ...(certificateAndRefundLines.length > 0 ? certificateAndRefundLines.map((l) => `- ${l}`) : ['(none)']),
      '',
      `RECENT CIRCULARS (title | department | date):`,
      ...circulars.slice(0, 10).map((c) => `- ${c.title ?? ''} | ${c.department ?? ''} | ${c.date ?? ''}`),
      '',
      `NOTICES RELEVANT TO THIS STUDENT (title | category | date):`,
      ...(notices.length > 0
        ? notices.map((n) => `- ${n.title ?? ''} | ${n.category ?? ''} | ${n.createdAt ?? ''}`)
        : ['(none)']),
    ].join('\n');

    try {
      const rawText = await callGeminiTextForCircular(geminiApiKey.trim(), textModel, BRIEFING_SYSTEM, dataBlock, 1600, 'application/json');
      const parsedJson: unknown = JSON.parse(extractJsonObject(rawText));
      if (!isBriefingResult(parsedJson)) {
        throw new Error('The AI response was missing required fields.');
      }
      const generatedAt = new Date().toISOString();
      await db.collection('dailyBriefing').doc(regNumber).set({ date: today, ...parsedJson, generatedAt });
      return { quote, ...parsedJson, generatedAt };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new HttpsError('internal', `AI generation failed: ${msg}`);
    }
  },
);

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

// Shifts the current instant by IST's fixed +5:30 offset, then reads calendar
// fields off that shifted instant using UTC getters — a small,
// dependency-free way to get "today" in Asia/Kolkata without a timezone
// library (no DST in India, so a fixed offset is safe).
function todayIST(): string {
  return new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

function todayLabelsIST(): { dayLabel: string; dateLabel: string } {
  const shifted = new Date(Date.now() + IST_OFFSET_MS);
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return {
    dayLabel: days[shifted.getUTCDay()],
    dateLabel: shifted.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }),
  };
}


// ── Circular AI drafting ("Compose with AI") ────────────────────────────────
// Lets an admin turn a short brief into a drafted Title/Subject/Body (+ a
// suggested Department) for a circular, using either Claude or Gemini
// (admin's choice). Deliberately stateless, same as
// generateCircularBackground — it only returns the draft; nothing is saved
// until the admin reviews/edits it and clicks Save on the circular form.

// Mirrors the client's utils/departments.ts DEPARTMENT_ORDER — kept as a
// literal copy here since it only backs the prompt + a soft validation check
// (an unrecognized suggestion just means Department is left for the admin to
// pick, never a hard failure).
const CIRCULAR_DEPARTMENTS: { code: string; name: string }[] = [
  { code: 'All', name: 'All Departments' },
  { code: 'CE', name: 'Civil Engineering' },
  { code: 'ME', name: 'Mechanical Engineering' },
  { code: 'CS', name: 'Computer Science' },
  { code: 'EC', name: 'Electronics & Communication' },
  { code: 'EE', name: 'Electrical & Electronics' },
  { code: 'Office', name: 'Office' },
  { code: 'Results', name: 'Results' },
  { code: 'Fee Dues', name: 'Fee Dues' },
  { code: 'Exams', name: 'Exams' },
  { code: 'Scholarships', name: 'Scholarships' },
  { code: 'Internship', name: 'Internship' },
  { code: 'Annual Day', name: 'Annual Day' },
  { code: 'Functions', name: 'Functions' },
  { code: 'Admission Ticket', name: 'Admission Ticket' },
  { code: 'Admissions', name: 'Admissions' },
  { code: 'Red Cross', name: 'Red Cross' },
  { code: 'NSS', name: 'NSS' },
];

type CircularAiLanguage = 'english' | 'kannada' | 'both';

// Explicit script name + a concrete anchor phrase, because some models (Claude
// in particular, observed generating Hindi/Devanagari instead) will otherwise
// conflate "Kannada" with a generic "Indian regional language" request.
const KANNADA_ANCHOR =
  'KANNADA (ಕನ್ನಡ) — the official language of Karnataka state, written ONLY in the Kannada script. ' +
  'Do NOT use Hindi, Devanagari script, or any other Indian language under any circumstances. ' +
  'For reference, a natural Kannada notice opening reads like "ಎಲ್ಲಾ ವಿದ್ಯಾರ್ಥಿಗಳಿಗೆ ಈ ಮೂಲಕ ತಿಳಿಸಲಾಗಿದೆ..." — match that script and register.';

function circularLanguageInstruction(language: CircularAiLanguage): string {
  if (language === 'kannada') {
    return `Write entirely in fluent, natural, grammatically correct ${KANNADA_ANCHOR} Compose it the way a native Kannada speaker drafting an official college notice would, with correct sentence structure and natural phrasing. Do NOT produce a literal or word-by-word translation from English. Numbers, dates, and proper nouns may stay in their normal form.`;
  }
  if (language === 'both') {
    return `Produce the content in BOTH languages, clearly separated (never interleaved sentence-by-sentence): for "title" and "subject", a single line formatted as "<English> — <Kannada>"; for "bodyHtml", the complete English version first, followed by the complete Kannada version below it as its own block (e.g. a second <p> or list after the English one). The Kannada portion must be written in ${KANNADA_ANCHOR} It must be genuinely composed in fluent, natural Kannada by understanding the context — not a literal or word-by-word translation of the English text.`;
  }
  return 'Write entirely in formal, clear English.';
}

function buildCircularDraftSystemPrompt(language: CircularAiLanguage): string {
  const deptList = CIRCULAR_DEPARTMENTS.map((d) => `${d.code} (${d.name})`).join(', ');
  return [
    'You are an assistant that drafts short official circulars/notices for Sanjay Memorial Polytechnic, a college, to be posted on its student portal.',
    'Produce ONLY a JSON object (no prose, no markdown fences) with this exact shape: { "title": string, "subject": string, "department": string, "bodyHtml": string }',
    `"department" must be exactly one of these codes (pick the single best match, or "All" if it applies to everyone or none fit well): ${deptList}.`,
    '"title" is a short headline (max ~12 words). "subject" is a one-line subject (max ~15 words), distinct from the title, summarizing the specific action or date.',
    '"bodyHtml" must use ONLY these HTML tags: <p> <strong> <em> <u> <ul> <ol> <li> <br>. No other tags, no attributes, no inline styles, no links, no scripts, no images.',
    'Keep it concise: 1-3 short paragraphs, and/or a short bullet or numbered list for multiple points — this is a notice, not a formal letter.',
    'Tone: formal, direct, and clear, as if written by the college office to students.',
    'Wrap the key date(s)/deadline(s) — and any other single most critical detail, like a fine amount — in <strong> tags so they stand out visually. Use this sparingly: only the 1-2 truly essential details per notice, not every sentence.',
    circularLanguageInstruction(language),
    'Never invent specific facts (dates, amounts, fees, order numbers) that are not present in the brief or the optional key-dates hint — if a specific detail is needed but not given, use a bracket placeholder like [DATE] instead of guessing.',
    'Stay strictly on the topic given in the brief and key-dates hint — never add unrelated facts, filler, generic boilerplate, or off-topic content of any kind.',
    'The final output must read as clean, neat, refined, and straight to the point — meaningful and genuinely appealing to read, not padded, robotic, or generic.',
    'Output valid JSON only.',
  ].join(' ');
}

function buildCircularDraftUserMessage(brief: string, keyDates: string | undefined): string {
  const lines = [`BRIEF: ${brief}`];
  if (keyDates?.trim()) lines.push(`KEY DATES/DEADLINES: ${keyDates.trim()}`);
  return lines.join('\n');
}

interface CircularDraft {
  title: string;
  subject: string;
  department?: string;
  bodyHtml: string;
}

function extractJsonObject(text: string): string {
  const trimmed = text.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)\s*```/.exec(trimmed);
  if (fenced) return fenced[1];
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) return trimmed.slice(start, end + 1);
  return trimmed;
}

function isCircularDraft(value: unknown): value is CircularDraft {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.title === 'string' && v.title.trim() !== '' &&
    typeof v.subject === 'string' && v.subject.trim() !== '' &&
    typeof v.bodyHtml === 'string' && v.bodyHtml.trim() !== '' &&
    (v.department === undefined || typeof v.department === 'string')
  );
}

// Allowlist-strip anything outside the small tag set the prompt asks for, and
// drop all attributes even on allowed tags. RichTextEditor seeds its
// contentEditable innerHTML directly and unsanitized (sanitizeHtmlContent on
// the client only runs at render time, not at editor-seed time), so AI output
// must already be safe before it reaches the client.
const ALLOWED_BODY_TAGS = new Set(['p', 'strong', 'em', 'u', 'ul', 'ol', 'li', 'br']);
function sanitizeCircularBodyHtml(html: string): string {
  return html.replace(/<\/?([a-zA-Z0-9]+)[^>]*>/g, (match, tag: string) => {
    const lower = tag.toLowerCase();
    if (!ALLOWED_BODY_TAGS.has(lower)) return '';
    return match.startsWith('</') ? `</${lower}>` : `<${lower}>`;
  });
}

function callClaudeForCircular(
  apiKey: string,
  systemPrompt: string,
  userMessage: string,
  maxTokens: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
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
            resolve(parsed.content?.[0]?.text?.trim() ?? '');
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

function callGeminiTextForCircular(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userMessage: string,
  maxTokens: number,
  responseMimeType?: string,
  // Some Gemini models spend part of maxOutputTokens on an internal "thinking"
  // phase before writing the visible answer — if that phase eats the whole
  // budget, the real output gets cut off almost immediately (seen as JSON
  // truncated a few hundred characters in). Passing 0 here disables thinking
  // so the full token budget goes to the actual answer; omit to leave the
  // model's default thinking behavior untouched (existing callers unaffected).
  thinkingBudget?: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      contents: [{ parts: [{ text: userMessage }] }],
      systemInstruction: { parts: [{ text: systemPrompt }] },
      generationConfig: {
        maxOutputTokens: maxTokens,
        ...(responseMimeType ? { responseMimeType } : {}),
        ...(thinkingBudget !== undefined ? { thinkingConfig: { thinkingBudget } } : {}),
      },
    });
    const req = https.request(
      {
        hostname: 'generativelanguage.googleapis.com',
        path: `/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${apiKey}`,
        method: 'POST',
        headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) },
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk: Buffer) => { raw += chunk.toString(); });
        res.on('end', () => {
          try {
            if (res.statusCode !== 200) {
              let apiMsg = `HTTP ${res.statusCode}`;
              try {
                const errBody = JSON.parse(raw) as { error?: { message?: string } };
                if (errBody.error?.message) apiMsg += `: ${errBody.error.message}`;
              } catch { /* raw may not be JSON */ }
              reject(new Error(apiMsg));
              return;
            }
            const parsed = JSON.parse(raw) as {
              candidates?: { content?: { parts?: { text?: string }[] } }[];
            };
            const text = parsed.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
            resolve(text.trim());
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

export const generateCircularDraft = onCall(
  { region: 'asia-south1', timeoutSeconds: 60 },
  async (request) => {
    if (request.auth?.token?.admin !== true) {
      throw new HttpsError('permission-denied', 'Admin sign-in required.');
    }

    const { brief, keyDates, provider, language } = (request.data ?? {}) as {
      brief?: string;
      keyDates?: string;
      provider?: 'claude' | 'gemini';
      language?: CircularAiLanguage;
    };
    if (!brief?.trim()) {
      throw new HttpsError('invalid-argument', 'brief is required.');
    }

    const configSnap = await db.doc('adminConfig/aiSettings').get();
    if (!configSnap.exists) {
      throw new HttpsError(
        'failed-precondition',
        'AI not configured. Add anthropicApiKey/geminiApiKey to adminConfig/aiSettings in Firestore.',
      );
    }
    const { anthropicApiKey, geminiApiKey, geminiTextModel } = configSnap.data() as {
      anthropicApiKey?: string;
      geminiApiKey?: string;
      geminiTextModel?: string;
    };

    const useGemini = provider === 'gemini';
    if (useGemini && !geminiApiKey?.trim()) {
      throw new HttpsError('failed-precondition', 'Gemini API key is empty.');
    }
    if (!useGemini && !anthropicApiKey?.trim()) {
      throw new HttpsError('failed-precondition', 'Anthropic API key is empty.');
    }

    const systemPrompt = buildCircularDraftSystemPrompt(language ?? 'english');
    const userMessage = buildCircularDraftUserMessage(brief.trim(), keyDates);
    // "both" roughly doubles output length (full English + full Kannada blocks).
    const maxTokens = language === 'both' ? 2500 : 1500;

    let rawText: string;
    try {
      rawText = useGemini
        ? await callGeminiTextForCircular(geminiApiKey!.trim(), geminiTextModel?.trim() || 'gemini-3.5-flash-lite', systemPrompt, userMessage, maxTokens)
        : await callClaudeForCircular(anthropicApiKey!.trim(), systemPrompt, userMessage, maxTokens);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new HttpsError('internal', `Draft generation failed: ${msg}`);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(extractJsonObject(rawText));
    } catch {
      throw new HttpsError('internal', 'The AI returned malformed JSON. Please retry.');
    }
    if (!isCircularDraft(parsed)) {
      throw new HttpsError('internal', 'The AI response was missing required fields. Please retry.');
    }
    const draft: CircularDraft = parsed;

    const validDepartment = CIRCULAR_DEPARTMENTS.some((d) => d.code === draft.department)
      ? draft.department
      : undefined;

    return {
      title: draft.title.trim(),
      subject: draft.subject.trim(),
      department: validDepartment,
      bodyHtml: sanitizeCircularBodyHtml(draft.bodyHtml.trim()),
    };
  },
);

// ── Circular AI background generation ───────────────────────────────────────
// Lets an admin generate a flat-vector illustrated background image for a
// circular via Gemini's Imagen model, previewed before anything is saved.
// Deliberately stateless — it never touches Storage or Firestore — so the
// admin can regenerate freely from the create/edit form (before a circular
// document even exists) or from the existing-circulars list; the client
// uploads the accepted image to Storage itself once the admin commits to it
// (see uploadCircularBackground in the Admissions web app's circularService).

// Response shape for generateContent with responseModalities: ['IMAGE'] —
// confirmed live against this project's Gemini API key: the "Nano Banana"
// image-generation models (gemini-3.1-flash-image and friends) return the
// image as an inlineData part alongside the usual candidates/content/parts
// structure, not via the separate Imagen :predict endpoint (Imagen isn't
// available on this Developer API key/project).
interface GeminiImageResponse {
  candidates?: {
    content?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] };
  }[];
}

/** '16:9' for the wide banner use cases (circular backgrounds, tab headers); '1:1'
 *  for category icons, which render inside a near-square Overview tile — asking
 *  for the wrong aspect here doesn't just look off, it's what caused a landscape
 *  image to get aggressively cover-cropped down to a near-square tile client-side,
 *  cutting off most of the composition. */
type ImageAspectRatio = '16:9' | '1:1';

function callGeminiImage(
  apiKey: string,
  model: string,
  prompt: string,
  aspectRatio: ImageAspectRatio,
): Promise<{ imageBase64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ['IMAGE'],
        imageConfig: { aspectRatio },
      },
    });

    const req = https.request(
      {
        hostname: 'generativelanguage.googleapis.com',
        path: `/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${apiKey}`,
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk: Buffer) => { raw += chunk.toString(); });
        res.on('end', () => {
          try {
            if (res.statusCode !== 200) {
              let apiMsg = `HTTP ${res.statusCode}`;
              try {
                const errBody = JSON.parse(raw) as { error?: { message?: string } };
                if (errBody.error?.message) apiMsg += `: ${errBody.error.message}`;
              } catch { /* raw may not be JSON */ }
              reject(new Error(apiMsg));
              return;
            }

            const parsed = JSON.parse(raw) as GeminiImageResponse;
            const inlineData = parsed.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData;
            if (!inlineData?.data) {
              reject(new Error(`No image returned. Got: ${raw.slice(0, 200)}`));
              return;
            }
            resolve({ imageBase64: inlineData.data, mimeType: inlineData.mimeType ?? 'image/png' });
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

interface OpenAiImageResponse {
  data?: { b64_json?: string }[];
}

/** OpenAI's gpt-image-1 family always returns base64 PNG data (no url/response_format
 *  option like the older dall-e models), so mimeType is always 'image/png' here. */
function callOpenAiImage(
  apiKey: string,
  model: string,
  prompt: string,
  aspectRatio: ImageAspectRatio,
): Promise<{ imageBase64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    // gpt-image-1 models only accept these exact size strings (no arbitrary aspect ratio).
    const size = aspectRatio === '1:1' ? '1024x1024' : '1536x1024';
    const body = JSON.stringify({
      model,
      prompt,
      size,
      quality: 'high',
      n: 1,
    });

    const req = https.request(
      {
        hostname: 'api.openai.com',
        path: '/v1/images/generations',
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(body),
          authorization: `Bearer ${apiKey}`,
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk: Buffer) => { raw += chunk.toString(); });
        res.on('end', () => {
          try {
            if (res.statusCode !== 200) {
              let apiMsg = `HTTP ${res.statusCode}`;
              try {
                const errBody = JSON.parse(raw) as { error?: { message?: string } };
                if (errBody.error?.message) apiMsg += `: ${errBody.error.message}`;
              } catch { /* raw may not be JSON */ }
              reject(new Error(apiMsg));
              return;
            }

            const parsed = JSON.parse(raw) as OpenAiImageResponse;
            const b64 = parsed.data?.[0]?.b64_json;
            if (!b64) {
              reject(new Error(`No image returned. Got: ${raw.slice(0, 200)}`));
              return;
            }
            resolve({ imageBase64: b64, mimeType: 'image/png' });
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

function downloadAsBase64(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Failed to download generated image: HTTP ${res.statusCode}`));
        return;
      }
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

interface ReplicatePrediction {
  id?: string;
  status?: string;
  output?: string | string[];
  error?: string;
  urls?: { get?: string };
}

function replicateRequest(method: 'GET' | 'POST', url: string, apiKey: string, body?: unknown): Promise<ReplicatePrediction> {
  return new Promise((resolve, reject) => {
    const payload = body !== undefined ? JSON.stringify(body) : undefined;
    const parsed = new URL(url);
    const req = https.request(
      {
        hostname: parsed.hostname,
        path: `${parsed.pathname}${parsed.search}`,
        method,
        headers: {
          authorization: `Bearer ${apiKey}`,
          ...(method === 'POST' ? { 'content-type': 'application/json', prefer: 'wait=60' } : {}),
          ...(payload ? { 'content-length': Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk: Buffer) => { raw += chunk.toString(); });
        res.on('end', () => {
          try {
            if (res.statusCode !== 200 && res.statusCode !== 201) {
              let apiMsg = `HTTP ${res.statusCode}`;
              try {
                const errBody = JSON.parse(raw) as { detail?: string };
                if (errBody.detail) apiMsg += `: ${errBody.detail}`;
                else if (raw) apiMsg += `: ${raw.slice(0, 300)}`;
              } catch {
                if (raw) apiMsg += `: ${raw.slice(0, 300)}`;
              }
              reject(new Error(apiMsg));
              return;
            }
            resolve(JSON.parse(raw) as ReplicatePrediction);
          } catch (err) {
            reject(err);
          }
        });
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/** Replicate's `Prefer: wait=60` header makes the create-prediction call block until
 *  done (or 60s elapses), which comfortably covers flux-2-klein-4b's ~4-step, few-second
 *  generation time — so a poll loop is only needed as a fallback for the rare case the
 *  model is still 'starting'/'processing' when the initial response returns. Output is
 *  a hosted image URL (string or array), downloaded and re-encoded to match the other
 *  providers' { imageBase64, mimeType } shape. */
async function callReplicateImage(
  apiKey: string,
  model: string,
  prompt: string,
  aspectRatio: ImageAspectRatio,
): Promise<{ imageBase64: string; mimeType: string }> {
  let prediction = await replicateRequest(
    'POST',
    `https://api.replicate.com/v1/models/${model}/predictions`,
    apiKey,
    { input: { prompt, aspect_ratio: aspectRatio, output_format: 'png' } },
  );

  const maxAttempts = 20;
  const pollIntervalMs = 2000;
  for (let attempt = 0; attempt < maxAttempts && prediction.status !== 'succeeded' && prediction.status !== 'failed' && prediction.status !== 'canceled'; attempt++) {
    if (!prediction.urls?.get) break;
    await new Promise((r) => setTimeout(r, pollIntervalMs));
    prediction = await replicateRequest('GET', prediction.urls.get, apiKey);
  }

  if (prediction.status !== 'succeeded') {
    throw new Error(prediction.error || `Replicate prediction ended with status: ${prediction.status}`);
  }
  const outputUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
  if (!outputUrl) {
    throw new Error('Replicate reported success but returned no output URL.');
  }
  const bytes = await downloadAsBase64(outputUrl);
  return { imageBase64: bytes.toString('base64'), mimeType: 'image/png' };
}

interface BudgetPixelJob {
  id?: string;
  status?: string;
  message?: string;
  images?: { url?: string; position?: number }[];
}

function budgetPixelRequest(method: 'GET' | 'POST', path: string, apiKey: string, body?: unknown): Promise<BudgetPixelJob> {
  return new Promise((resolve, reject) => {
    const payload = body !== undefined ? JSON.stringify(body) : undefined;
    const req = https.request(
      {
        hostname: 'api.budgetpixel.com',
        path,
        method,
        headers: {
          authorization: `Bearer ${apiKey}`,
          ...(payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk: Buffer) => { raw += chunk.toString(); });
        res.on('end', () => {
          try {
            if (res.statusCode !== 200 && res.statusCode !== 201) {
              let apiMsg = `HTTP ${res.statusCode}`;
              try {
                const errBody = JSON.parse(raw) as { message?: unknown; error?: unknown };
                const detail = errBody.message ?? errBody.error;
                const detailMsg = typeof detail === 'string' ? detail : undefined;
                apiMsg += `: ${detailMsg || raw.slice(0, 300)}`;
              } catch {
                if (raw) apiMsg += `: ${raw.slice(0, 300)}`;
              }
              reject(new Error(apiMsg));
              return;
            }
            resolve(JSON.parse(raw) as BudgetPixelJob);
          } catch (err) {
            reject(err);
          }
        });
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/** BudgetPixel is a multi-model aggregator (Flux, Seedream, GPT-Image, etc. behind one
 *  key) — image generation is an async job: POST creates it (path keyed by model slug),
 *  GET polls it (path keyed by job id) until status is 'succeeded'/'failed'/'timeout'. */
async function callBudgetPixelImage(
  apiKey: string,
  model: string,
  prompt: string,
  aspectRatio: ImageAspectRatio,
): Promise<{ imageBase64: string; mimeType: string }> {
  let job = await budgetPixelRequest('POST', `/v1/images/${model}`, apiKey, { prompt, aspect_ratio: aspectRatio });
  if (!job.id) {
    throw new Error('BudgetPixel did not return a job id.');
  }

  const maxAttempts = 30;
  const pollIntervalMs = 2000;
  for (let attempt = 0; attempt < maxAttempts && job.status !== 'succeeded' && job.status !== 'failed' && job.status !== 'timeout'; attempt++) {
    await new Promise((r) => setTimeout(r, pollIntervalMs));
    job = await budgetPixelRequest('GET', `/v1/images/${job.id}`, apiKey);
  }

  if (job.status !== 'succeeded') {
    throw new Error(job.message || `BudgetPixel job ended with status: ${job.status}`);
  }
  const outputUrl = job.images?.[0]?.url;
  if (!outputUrl) {
    throw new Error('BudgetPixel reported success but returned no image URL.');
  }
  const bytes = await downloadAsBase64(outputUrl);
  return { imageBase64: bytes.toString('base64'), mimeType: 'image/png' };
}

/** Shared settings shape for the three call sites below (circular backgrounds, tab
 *  headers, daily quote) — callers are responsible for validating the relevant API
 *  key is present *before* calling this, so a missing-key error surfaces as
 *  failed-precondition rather than being swallowed into a generic internal error. */
interface AiImageSettings {
  imageProvider?: 'gemini' | 'openai' | 'replicate' | 'budgetpixel';
  geminiApiKey?: string;
  geminiImageModel?: string;
  openaiApiKey?: string;
  openaiImageModel?: string;
  replicateApiKey?: string;
  replicateImageModel?: string;
  budgetpixelApiKey?: string;
  budgetpixelImageModel?: string;
}

function generateAiImage(
  settings: AiImageSettings,
  prompt: string,
  aspectRatio: ImageAspectRatio = '16:9',
): Promise<{ imageBase64: string; mimeType: string }> {
  if (settings.imageProvider === 'openai') {
    return callOpenAiImage(
      (settings.openaiApiKey ?? '').trim(),
      settings.openaiImageModel?.trim() || 'gpt-image-1-mini',
      prompt,
      aspectRatio,
    );
  }
  if (settings.imageProvider === 'replicate') {
    return callReplicateImage(
      (settings.replicateApiKey ?? '').trim(),
      settings.replicateImageModel?.trim() || 'black-forest-labs/flux-2-klein-4b',
      prompt,
      aspectRatio,
    );
  }
  if (settings.imageProvider === 'budgetpixel') {
    return callBudgetPixelImage(
      (settings.budgetpixelApiKey ?? '').trim(),
      settings.budgetpixelImageModel?.trim() || 'nano-banana-2-lite',
      prompt,
      aspectRatio,
    );
  }
  return callGeminiImage(
    (settings.geminiApiKey ?? '').trim(),
    settings.geminiImageModel?.trim() || 'gemini-3.1-flash-lite-image',
    prompt,
    aspectRatio,
  );
}

/** Gemini's Nano Banana models already follow "flat vector illustration" prompts
 *  reliably, but GPT-Image models (gpt-image-1 family) tend to default toward busier,
 *  more photoreal/painterly renders and are prone to adding unwanted text/labels (text
 *  rendering is one of their strengths, so it needs to be explicitly, firmly refused)
 *  unless the negative-space and flatness constraints are spelled out more forcefully.
 *  Kept provider-aware here so switching providers doesn't require retuning prompts. */
function imageStyleDirective(provider: AiImageSettings['imageProvider'], palette: string): string {
  if (provider === 'openai') {
    return [
      'Style: 2D flat vector illustration, in the style of modern flat-design app/brochure graphics.',
      'Solid flat colors with soft cel-shading only — no gradients, no realistic lighting, no shadows, no depth of field, no textures, no 3D rendering, no photorealism, not a photograph.',
      `Color palette: ${palette}.`,
      'The illustration fills the entire 16:9 frame edge-to-edge with no white margins, borders, or empty background space.',
      'Absolutely no text, letters, numbers, words, captions, signage, or logos anywhere in the image — illustrate the scene only, nothing written.',
    ].join(' ');
  }
  return `Style: modern flat-design vector illustration, simple clean shapes, soft flat shading, ${palette}, no photorealism, no text, no letters, no numbers, no logos anywhere in the image.`;
}

function buildCircularImagePrompt(
  title: string,
  subject: string,
  department: string,
  bodySnippet: string,
  provider: AiImageSettings['imageProvider'],
): string {
  return [
    'Flat vector illustration for a college notice-board banner card, wide 16:9 landscape composition.',
    `Context: a "${department}" circular titled "${title}"${subject ? `, subject: "${subject}"` : ''}.`,
    bodySnippet ? `Additional context: ${bodySnippet}` : '',
    'Depict a friendly, relevant scene for this context — for example, a Scholarships circular should show students in school/college uniform with books or documents; an Exams circular should show an exam hall or desk with papers; a Fee Dues circular should show a receipt or an office counter; a Sports/Annual Day/Functions circular should show students on a playground or a celebratory stage.',
    imageStyleDirective(provider, 'warm and friendly college-brochure color palette'),
  ].filter(Boolean).join(' ');
}

export const generateCircularBackground = onCall(
  { region: 'asia-south1', timeoutSeconds: 120 },
  async (request) => {
    if (request.auth?.token?.admin !== true) {
      throw new HttpsError('permission-denied', 'Admin sign-in required.');
    }

    const { title, subject, department, bodySnippet } = (request.data ?? {}) as {
      title?: string;
      subject?: string;
      department?: string;
      bodySnippet?: string;
    };
    if (!title?.trim() || !department?.trim()) {
      throw new HttpsError('invalid-argument', 'title and department are required.');
    }

    const configSnap = await db.doc('adminConfig/aiSettings').get();
    if (!configSnap.exists) {
      throw new HttpsError(
        'failed-precondition',
        'AI not configured. Add a geminiApiKey or openaiApiKey to adminConfig/aiSettings in Firestore.',
      );
    }
    const settings = configSnap.data() as AiImageSettings;
    if (settings.imageProvider === 'openai') {
      if (!settings.openaiApiKey?.trim()) {
        throw new HttpsError('failed-precondition', 'OpenAI API key is empty.');
      }
    } else if (settings.imageProvider === 'replicate') {
      if (!settings.replicateApiKey?.trim()) {
        throw new HttpsError('failed-precondition', 'Replicate API key is empty.');
      }
    } else if (settings.imageProvider === 'budgetpixel') {
      if (!settings.budgetpixelApiKey?.trim()) {
        throw new HttpsError('failed-precondition', 'BudgetPixel API key is empty.');
      }
    } else if (!settings.geminiApiKey?.trim()) {
      throw new HttpsError('failed-precondition', 'Gemini API key is empty.');
    }

    const prompt = buildCircularImagePrompt(
      title.trim(),
      subject?.trim() ?? '',
      department.trim(),
      (bodySnippet ?? '').trim().slice(0, 400),
      settings.imageProvider,
    );

    try {
      return await generateAiImage(settings, prompt);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new HttpsError('internal', `Image generation failed: ${msg}`);
    }
  },
);

// ── Tab header AI background generation ─────────────────────────────────────
// Generates one fixed illustrated background per student-portal tab (Home,
// Circulars, Profile, Fee History, Certificates, Notices), shown behind the
// portal header instead of the old static hex-pattern watermark. Same
// stateless generate → preview → client-side upload flow as
// generateCircularBackground above, just keyed by a fixed tab identity
// instead of a per-circular one.

const TAB_HEADER_KEYS = ['home', 'circulars', 'profile', 'fees', 'certificates', 'notices'] as const;
type TabHeaderKey = (typeof TAB_HEADER_KEYS)[number];

const TAB_HEADER_SCENES: Record<TabHeaderKey, string> = {
  home: 'a welcoming student standing and waving cheerfully at the college entrance steps',
  circulars: 'a campus notice board with a neat stack of papers and documents pinned to it',
  profile: 'a friendly student in college uniform, standing, holding a notebook',
  fees: 'a receipt or a payment counter scene with a ledger and a coin or card motif',
  certificates: 'an award ribbon and a rolled-up certificate scroll, celebratory and proud',
  notices: 'a bell or megaphone announcing news, with a few paper notes fluttering nearby',
};

function buildTabHeaderPrompt(tabKey: TabHeaderKey, provider: AiImageSettings['imageProvider']): string {
  return [
    'Flat vector illustration for a mobile app header banner, wide 16:9 landscape composition, filling the entire frame edge-to-edge as one continuous illustration — no hard vertical seam, no two separate color blocks pasted together.',
    `Depict ${TAB_HEADER_SCENES[tabKey]}, centered mainly in the right half of the frame. Let the scene extend slightly past the center and gently fade — through a soft gradient, never a hard edge — into a lighter, pastel-toned version of the same background color as it reaches the left side, so the left portion ends up a plain, softly pastel wash with no strong shapes, lines, or objects, calm enough for text to sit clearly on top.`,
    imageStyleDirective(provider, 'warm and friendly college-brochure color palette'),
  ].join(' ');
}

export const generateTabHeaderBackground = onCall(
  { region: 'asia-south1', timeoutSeconds: 120 },
  async (request) => {
    if (request.auth?.token?.admin !== true) {
      throw new HttpsError('permission-denied', 'Admin sign-in required.');
    }

    const { tabKey } = (request.data ?? {}) as { tabKey?: string };
    if (!tabKey || !(TAB_HEADER_KEYS as readonly string[]).includes(tabKey)) {
      throw new HttpsError('invalid-argument', `tabKey must be one of: ${TAB_HEADER_KEYS.join(', ')}`);
    }

    const configSnap = await db.doc('adminConfig/aiSettings').get();
    if (!configSnap.exists) {
      throw new HttpsError(
        'failed-precondition',
        'AI not configured. Add a geminiApiKey or openaiApiKey to adminConfig/aiSettings in Firestore.',
      );
    }
    const settings = configSnap.data() as AiImageSettings;
    if (settings.imageProvider === 'openai') {
      if (!settings.openaiApiKey?.trim()) {
        throw new HttpsError('failed-precondition', 'OpenAI API key is empty.');
      }
    } else if (settings.imageProvider === 'replicate') {
      if (!settings.replicateApiKey?.trim()) {
        throw new HttpsError('failed-precondition', 'Replicate API key is empty.');
      }
    } else if (settings.imageProvider === 'budgetpixel') {
      if (!settings.budgetpixelApiKey?.trim()) {
        throw new HttpsError('failed-precondition', 'BudgetPixel API key is empty.');
      }
    } else if (!settings.geminiApiKey?.trim()) {
      throw new HttpsError('failed-precondition', 'Gemini API key is empty.');
    }

    const prompt = buildTabHeaderPrompt(tabKey as TabHeaderKey, settings.imageProvider);

    try {
      return await generateAiImage(settings, prompt);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new HttpsError('internal', `Image generation failed: ${msg}`);
    }
  },
);

// ── Category icon AI generation ─────────────────────────────────────────────
// Generates one full-bleed illustrated stat-card background per student-portal
// Overview category (Circulars, Notices, Fees, Certificates) — the whole tile
// becomes this image (character scene + colored background filling the frame),
// not a small icon inset over the app's own gradient. Same stateless generate →
// preview → client-side upload flow as generateCircularBackground/
// generateTabHeaderBackground above, just keyed by a fixed category identity.

const CATEGORY_ICON_KEYS = ['circulars', 'notices', 'fees', 'certificates'] as const;
type CategoryIconKey = (typeof CATEGORY_ICON_KEYS)[number];

const CATEGORY_ICON_SCENES: Record<CategoryIconKey, string> = {
  circulars: 'a student pinning a paper notice or flyer onto a campus bulletin board',
  notices: 'a student looking up, alert and attentive, at a large ringing bell or megaphone above a notice board',
  fees: 'a student happily paying with a card at a counter, holding a receipt',
  certificates: 'a student proudly holding up a rolled certificate scroll with a ribbon seal',
};

// Flat-vector "app illustration" style image models default toward blue/purple
// without an explicit hue — an explicit, distinct color family per category is
// what actually produces visual variety across the 4 tiles instead of every one
// landing on the same default palette.
const CATEGORY_ICON_COLORS: Record<CategoryIconKey, string> = {
  circulars: 'soft coral-orange',
  notices: 'warm butter-yellow',
  fees: 'fresh mint-green',
  certificates: 'soft blush-pink',
};

function buildCategoryIconPrompt(key: CategoryIconKey, provider: AiImageSettings['imageProvider']): string {
  return [
    'Flat vector illustration for a colorful mobile app stat-card background, square 1:1 composition, filling the entire frame edge-to-edge with a single solid, light and airy, softly saturated flat color background — no soft gradients, no dark or deeply saturated tones, no gray, dull, or washed-out colors anywhere in the frame.',
    `Depict ${CATEGORY_ICON_SCENES[key]}, positioned toward the right half of the frame. The left half must stay the exact same solid color as the rest of the background (no gradient or separate shade) and simply free of characters or objects, so text can be legibly overlaid there.`,
    imageStyleDirective(provider, `a single solid, light and softly saturated ${CATEGORY_ICON_COLORS[key]} as the dominant background color — bright and cheerful but light, not dark, not blue, not purple, not gray/dull/muted`),
  ].join(' ');
}

export const generateCategoryIcon = onCall(
  { region: 'asia-south1', timeoutSeconds: 120 },
  async (request) => {
    if (request.auth?.token?.admin !== true) {
      throw new HttpsError('permission-denied', 'Admin sign-in required.');
    }

    const { key } = (request.data ?? {}) as { key?: string };
    if (!key || !(CATEGORY_ICON_KEYS as readonly string[]).includes(key)) {
      throw new HttpsError('invalid-argument', `key must be one of: ${CATEGORY_ICON_KEYS.join(', ')}`);
    }

    const configSnap = await db.doc('adminConfig/aiSettings').get();
    if (!configSnap.exists) {
      throw new HttpsError(
        'failed-precondition',
        'AI not configured. Add a geminiApiKey or openaiApiKey to adminConfig/aiSettings in Firestore.',
      );
    }
    const settings = configSnap.data() as AiImageSettings;
    if (settings.imageProvider === 'openai') {
      if (!settings.openaiApiKey?.trim()) {
        throw new HttpsError('failed-precondition', 'OpenAI API key is empty.');
      }
    } else if (settings.imageProvider === 'replicate') {
      if (!settings.replicateApiKey?.trim()) {
        throw new HttpsError('failed-precondition', 'Replicate API key is empty.');
      }
    } else if (settings.imageProvider === 'budgetpixel') {
      if (!settings.budgetpixelApiKey?.trim()) {
        throw new HttpsError('failed-precondition', 'BudgetPixel API key is empty.');
      }
    } else if (!settings.geminiApiKey?.trim()) {
      throw new HttpsError('failed-precondition', 'Gemini API key is empty.');
    }

    const prompt = buildCategoryIconPrompt(key as CategoryIconKey, settings.imageProvider);

    try {
      return await generateAiImage(settings, prompt, '1:1');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new HttpsError('internal', `Image generation failed: ${msg}`);
    }
  },
);
