import * as admin from 'firebase-admin';
import { onCall, HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import * as https from 'https';
import * as crypto from 'crypto';
import sharp from 'sharp';

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
// One combined feature, generated via Gemini: a shared "quote of the day"
// that the admin generates and saves from Settings › Daily Briefing (see
// generateDailyQuotePreview / saveDailyQuote further below — there is no
// scheduled or lazy auto-generation; students see the most recently saved
// quote until the admin saves a new one) plus a personalized mentor note +
// highlights digest built from the student's own fees, results, notices,
// circulars, certificates, notifications and attendance letters. The types
// and helpers below (student/fee/circular/notice shapes, the due-calculation
// helpers) are shared by the student callable and the admin preview tester.
// Deliberately excludes sensitive PII (Aadhaar, APAAR ID, DOB, parent names,
// mobiles, address, income, caste category) from what's sent to Gemini —
// only what's needed for a useful digest.

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

// Mirrors AnsLetterRecord (attendance-shortage intimation letters appended to
// a student doc's ansHistory) from src/types/index.ts — only the fields the
// digest cites.
interface AnsLetterEntry {
  academicYear?: string;
  issuedAt?: string;
  status?: string; // 'sent' | 'visited' | 'resolved'
}

interface StudentDoc {
  id?: string;
  regNumber?: string;
  studentNameSSLC?: string;
  course?: string;
  year?: string;
  academicYear?: string;
  admissionStatus?: string;
  notAdmittedStatusTag?: string;
  admType?: string;
  admCat?: string;
  enrollmentDate?: string;
  tcHistory?: TcHistoryEntry[];
  pcHistory?: PcHistoryEntry[];
  ansHistory?: AnsLetterEntry[];
}

// Mirrors ExamResult / ExamResultSubject / ExamResultSemesterSummary from
// src/types/index.ts (collection `examResults`, one doc per reg number per
// exam session) — only what the digest cites.
interface ExamResultDoc {
  examSession?: string;
  subjects?: { sem?: string | number; code?: string; subject?: string; result?: string; grade?: string }[];
  semesterSummary?: { semester?: string | number; sgpa?: number | null }[];
  cgpa?: number | null;
  cgpaStatus?: string;
  overallResult?: string;
  updatedAt?: string;
  importedAt?: string;
}

// Mirrors StudentNotification (collection `studentNotifications`) — the
// "your record changed" toasts the app shows once at login.
interface StudentNotificationDoc {
  type?: string;
  title?: string;
  message?: string;
  createdAt?: string;
  seen?: boolean;
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
  date?: string;
  receiptNumber?: string;
  paymentMode?: string;
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
  id?: string;
  title?: string;
  subject?: string;
  department?: string;
  date?: string;
  pinned?: boolean;
  archivedAt?: string;
  expiredAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface NoticeDoc {
  id?: string;
  title?: string;
  body?: string;
  category?: string;
  pinned?: boolean;
  createdAt?: string;
  archivedAt?: string;
  inactiveAt?: string;
  scope?: string;
  scopeValue?: string;
  targetRegNumbers?: string[];
}

// Mirrors src/utils/htmlContent.ts's `circularSeenKey` from the student app:
// a circular counts as unread again whenever it's edited, so the seen key
// carries the edit timestamp.
function circularSeenKey(c: CircularDoc): string {
  return `${c.id ?? ''}:${c.updatedAt ?? c.createdAt ?? ''}`;
}

// Notice/circular bodies are stored as HTML; the digest only needs a short
// plain-text excerpt so the model knows what a notice actually asks for.
function htmlExcerpt(html: string | undefined, maxChars: number): string {
  if (!html) return '';
  const text = html
    .replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > maxChars ? `${text.slice(0, maxChars - 1).trimEnd()}…` : text;
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

function buildDailyQuoteImagePrompt(scene: string, provider: AiImageSettings['imageProvider']): string {
  return [
    'Flat vector illustration for a mobile app header banner, wide 16:9 landscape composition.',
    `Depict ${scene}.`,
    imageStyleDirective(provider, 'warm and inspiring color palette'),
  ].join(' ');
}

/** Uploads a daily-quote background image via the Admin SDK (storage.rules
 *  allows no client write on this path; public read is fine since it's
 *  generic daily-inspiration art, nothing sensitive) and returns a public
 *  download URL. The object name is timestamped, not just date-keyed: the
 *  upload carries `immutable` cache-control, so re-saving the same day under
 *  the same name would leave devices/CDN serving the old bytes (the same
 *  stale-cache trap fixed for tab headers and category icons). */
async function uploadDailyQuoteImage(date: string, imageBase64: string, mimeType: string): Promise<string> {
  const path = `dailyQuoteBackgrounds/${date}-${Date.now()}.${imageExtensionFor(mimeType)}`;
  const bucket = admin.storage().bucket();
  await bucket.file(path).save(Buffer.from(imageBase64, 'base64'), {
    metadata: { contentType: mimeType, cacheControl: OPTIMIZED_CACHE_CONTROL },
    resumable: false,
  });
  return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media`;
}

function imageExtensionFor(mimeType: string): string {
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/jpeg') return 'jpg';
  return 'png';
}

// Stored at dailyQuote/{date}. `date` is the IST day the admin saved it for;
// the student app receives whichever doc has the latest date (see
// getLatestDailyQuote), so it may be older than "today".
interface DailyQuoteDoc {
  date?: string;
  quoteEn?: string;
  quoteAuthor?: string;
  quoteKn?: string;
  theme?: string;
  scene?: string;
  backgroundImageUrl?: string;
  savedAt?: string;
  savedBy?: string;
}

// Shown only until the admin saves the very first quote — keeps the student
// app's briefing screen (which requires a `quote`) working out of the box.
const FALLBACK_QUOTE: DailyQuoteDoc = {
  date: '1970-01-01',
  quoteEn: 'Arise, awake, and stop not till the goal is reached.',
  quoteAuthor: 'Swami Vivekananda',
  quoteKn: 'ಎದ್ದೇಳಿ, ಎಚ್ಚರಗೊಳ್ಳಿ, ಗುರಿ ತಲುಪುವವರೆಗೆ ನಿಲ್ಲಬೇಡಿ.',
  theme: 'perseverance',
};

/** The most recently admin-saved quote of the day. There is deliberately no
 *  auto-generation fallback: if nothing has been saved for today, students
 *  keep seeing the last saved one — generation only ever happens from the
 *  admin's Settings › Daily Briefing panel, so there are no surprise
 *  provider calls or costs. */
async function getLatestDailyQuote(): Promise<DailyQuoteDoc> {
  const snap = await db.collection('dailyQuote').orderBy('date', 'desc').limit(1).get();
  const latest = snap.docs[0]?.data() as DailyQuoteDoc | undefined;
  return latest?.quoteEn ? latest : FALLBACK_QUOTE;
}

// Misattribution is the main risk with an AI-written quote, so the prompt
// makes "original line, attributed to Daily Briefing" the default and allows
// a named author only when the model is sure of the exact wording — and the
// admin can still edit the author/text in the panel before saving.
const QUOTE_SYSTEM = `You write the "quote of the day" for the student portal app of Sanjay Memorial Polytechnic (SMP), Sagar, Karnataka. Every student sees the same quote on their Daily Briefing screen first thing in the morning.

## THE QUOTE
- quoteEn: one short, genuinely motivating line in English — at most 25 words — that suits a diploma/polytechnic student starting their day: effort, learning, persistence, curiosity, courage, kindness, focus, hope. Plain, warm, concrete language; no clichés like "believe in yourself", no hashtags, no emojis.
- quoteAuthor: attribution rules, strictly:
  - Prefer a real, well-known quote from a notable Indian personality (freedom fighters, scientists, writers, sportspeople, spiritual leaders, public servants) ONLY if you are highly confident of BOTH the exact wording AND who said it.
  - Otherwise write an original line yourself and set quoteAuthor to exactly "Daily Briefing". Never attach a real person's name to words you are not certain they said, and never invent a person.
- quoteKn: a natural, fluent Kannada rendering of quoteEn in proper Kannada script — the way a Kannada speaker would actually say it, not a stiff word-for-word translation. Same length and tone.
- theme: one or two lowercase English words naming the theme (e.g. "perseverance", "curiosity", "fresh start").
- scene: a concrete, visual, text-free scene for a flat-vector background illustration that matches the quote's mood — one sentence, e.g. "a lone cyclist climbing a hill road at sunrise with a small town below". Describe objects, place and light; no people's faces, no words or signs in the scene.

## VARIETY
The user message lists quotes already used recently. Do not repeat or lightly rephrase any of them, and pick a different theme and a different kind of scene from the most recent few.

## OUTPUT FORMAT — STRICT
Return ONLY a raw JSON object: {"quoteEn": string, "quoteAuthor": string, "quoteKn": string, "theme": string, "scene": string}. No markdown fences, no explanation, no trailing text.`;

interface QuoteResult {
  quoteEn: string;
  quoteAuthor: string;
  quoteKn: string;
  theme: string;
  scene: string;
}

function isQuoteResult(value: unknown): value is QuoteResult {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.quoteEn === 'string' && v.quoteEn.trim().length > 0 &&
    typeof v.quoteAuthor === 'string' && v.quoteAuthor.trim().length > 0 &&
    typeof v.quoteKn === 'string' &&
    typeof v.theme === 'string' &&
    typeof v.scene === 'string' && v.scene.trim().length > 0
  );
}

/** Asks the admin's chosen provider for a fresh quote of the day, steering it
 *  away from the last 30 saved quotes so consecutive days don't repeat. */
async function generateQuoteText(apiKeys: TextApiKeys, choice: TextChoice): Promise<QuoteResult> {
  const recentSnap = await db.collection('dailyQuote').orderBy('date', 'desc').limit(30).get();
  const recent = recentSnap.docs
    .map((d) => d.data() as DailyQuoteDoc)
    .filter((q) => q.quoteEn)
    .map((q) => `- "${q.quoteEn}" — ${q.quoteAuthor ?? ''} (theme: ${q.theme ?? ''}; scene: ${q.scene ?? 'n/a'})`);
  const { dayLabel, dateLabel } = todayLabelsIST();
  const userMessage = [
    `TODAY: ${dayLabel}, ${dateLabel}`,
    '',
    'RECENTLY USED QUOTES (most recent first) — do not repeat these:',
    ...(recent.length > 0 ? recent : ['(none yet)']),
  ].join('\n');

  const { text: rawText } = await callText({
    provider: choice.provider, apiKeys, model: choice.model,
    systemPrompt: QUOTE_SYSTEM, userMessage, maxTokens: 800, json: true,
  });
  const parsed: unknown = JSON.parse(extractJsonObject(rawText));
  if (!isQuoteResult(parsed)) {
    throw new Error('The AI response was missing required quote fields.');
  }
  return {
    quoteEn: parsed.quoteEn.trim(),
    quoteAuthor: parsed.quoteAuthor.trim(),
    quoteKn: parsed.quoteKn.trim(),
    theme: parsed.theme.trim(),
    scene: parsed.scene.trim(),
  };
}

const BRIEFING_SYSTEM = `You are a warm, thoughtful mentor inside the student portal app of Sanjay Memorial Polytechnic (SMP), Sagar, Karnataka — like a favorite teacher and a close friend rolled into one. You write a short personal note and a short highlights digest for one student, based only on the data given to you.

## PERSONAL NOTE
- greeting: a short warm opening addressing the student by first name, e.g. "Dear Aditi," — vary the phrasing day to day rather than always using "Dear".
- messageEn: exactly 1-2 short sentences in English, no more than ~25 words total, mentor/friend voice — grounded, genuinely encouraging, naturally acknowledging today is a fresh day. Address the student by first name at least once, woven naturally into a sentence. Be concise — every word should earn its place.
- messageKn: an accurate, natural Kannada translation of messageEn, phrased the way a fluent Kannada speaker would naturally write it — not a stiff literal translation. Proper Kannada script. Just as concise as messageEn.

If the data contains one clearly most important item for this student today (an unpaid fee, a subject to clear, an UNREAD pinned circular or notice), messageEn may gently nod to it in a supportive way — but keep it to the one item, never a list.

## HIGHLIGHTS
Produce up to 12 short bullet points total (each one sentence, using the exact amounts, titles, dates, codes and names from the data — never invent one, never mention data you were not given, never round or estimate a figure). Order them by what matters most to the student today, in these groups:

1. ACTION NEEDED — things the student should do something about:
   - Fee dues: if any academic year shows a due amount, state the exact due amount for that year (and the fine, if the year's fine is non-zero). If more than one year has dues, one point per year plus, if useful, the exact total. Mention the last payment (date, receipt) only if it helps the student place the figure.
   - Notices addressed to this student marked UNREAD: one point each, naming the notice and saying plainly what it asks them to do (use the excerpt; if the excerpt has a deadline or an amount, quote it).
   - Circulars marked UNREAD or pinned: one point each for the most time-sensitive ones (pinned first), naming the title and telling them to read it soon. Skip circulars marked "read" unless they are pinned.
   - Scholarship deadlines listed in the data: one point each, naming the scheme, the portal and the exact closing date, telling the student to apply or renew on that portal before the date if they are eligible — never claim that this particular student is eligible, and never mention scholarships at all when the data says "(none)".
2. ACADEMICS — from RESULTS: state the exam session, the overall result and CGPA / latest SGPA exactly as given; if any subject shows F or AB, list those subjects by name (and code) as things to clear, phrased supportively and without judgement. If all subjects passed, say so as good news. Skip entirely if there are no results on record — do not mention the absence.
3. RECORDS — attendance-shortage letters (say the status and what it means: 'sent' = the college has written to them and they should meet their HOD/class teacher; 'visited' = acknowledged; 'resolved' = closed), unseen notifications (one point each, in plain words), and any recently issued TC/PC/refund with its date or amount.
4. GOOD NEWS — genuinely positive facts worth a line: fully paid fees, all subjects cleared, a refund received, a new certificate issued.

Rules across all groups: every point must trace to a specific line in the data; never state the same fact twice; never pad, repeat or write filler to reach 12 — a shorter, fully honest list is always better; skip any group that has nothing real to say; prefer UNREAD items over read ones; don't mention counts or the total number of circulars unless there's genuinely nothing more specific to say. Address the student as "you", never in the third person.

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

type TextFeature = 'quote' | 'scholarship' | 'briefing' | 'dtek';

interface TextChoice {
  provider: TextProvider;
  model: string;
}

const TEXT_PROVIDERS: TextProvider[] = ['gemini', 'claude', 'openai'];

/** Reads adminConfig/aiSettings: the API keys, each feature's chosen text
 *  provider/model, and the image settings.
 *
 *  Key validation is deliberately lazy. Each feature may run on a different
 *  provider now, so requiring one provider's key up front would lock out a
 *  perfectly valid Claude-only or OpenAI-only setup; callText() raises the
 *  same failed-precondition for whichever key is actually missing. The image
 *  provider's key is still checked here, because the quote flow always draws a
 *  background image whichever provider writes the text. */
async function loadBriefingAiSettings(): Promise<{
  apiKeys: TextApiKeys;
  choice: (feature: TextFeature) => TextChoice;
  imageSettings: AiImageSettings;
}> {
  const configSnap = await db.doc('adminConfig/aiSettings').get();
  if (!configSnap.exists) {
    throw new HttpsError(
      'failed-precondition',
      'AI not configured. Add a geminiApiKey, anthropicApiKey or openaiApiKey to adminConfig/aiSettings in Firestore.',
    );
  }
  const data = configSnap.data() as Record<string, string | undefined>;
  const {
    geminiApiKey, anthropicApiKey, geminiImageModel, openaiApiKey, openaiImageModel,
    openaiImageQuality, replicateApiKey, replicateImageModel, budgetpixelApiKey, budgetpixelImageModel,
  } = data;
  const imageProvider = data.imageProvider as AiImageSettings['imageProvider'];

  // Gemini is the default image provider, so its key is required unless the
  // admin has explicitly switched image generation elsewhere.
  if ((imageProvider ?? 'gemini') === 'gemini' && !geminiApiKey?.trim()) {
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

  return {
    apiKeys: {
      gemini: geminiApiKey?.trim(),
      anthropic: anthropicApiKey?.trim(),
      openai: openaiApiKey?.trim(),
    },
    choice: (feature) => {
      const saved = data[`${feature}Provider`];
      const provider = TEXT_PROVIDERS.includes(saved as TextProvider) ? (saved as TextProvider) : 'gemini';
      return { provider, model: data[`${feature}Model`]?.trim() || DEFAULT_TEXT_MODEL[provider] };
    },
    imageSettings: {
      imageProvider,
      geminiApiKey: geminiApiKey?.trim(),
      geminiImageModel: geminiImageModel?.trim() || 'gemini-3.1-flash-lite-image',
      openaiApiKey: openaiApiKey?.trim(),
      openaiImageModel: openaiImageModel?.trim(),
      openaiImageQuality: openaiImageQuality?.trim(),
      replicateApiKey: replicateApiKey?.trim(),
      replicateImageModel: replicateImageModel?.trim(),
      budgetpixelApiKey: budgetpixelApiKey?.trim(),
      budgetpixelImageModel: budgetpixelImageModel?.trim(),
    },
  };
}

function requireAdmin(request: CallableRequest): void {
  if (request.auth?.token?.admin !== true) {
    throw new HttpsError('permission-denied', 'Admin sign-in required.');
  }
}

/** Settings › Daily Briefing › "Generate": writes a fresh quote (Gemini
 *  text) and draws its background image, returning both for preview —
 *  nothing is stored until the admin clicks Save (saveDailyQuote). Passing
 *  `scene` skips the text step and only redraws the image, so the admin can
 *  keep (or hand-edit) the quote and just try another picture. Same
 *  stateless generate → preview → save flow as generateTabHeaderBackground. */
export const generateDailyQuotePreview = onCall(
  { region: 'asia-south1', timeoutSeconds: 120 },
  async (request) => {
    requireAdmin(request);
    const { scene: sceneOnly } = (request.data ?? {}) as { scene?: string };

    const { apiKeys, choice, imageSettings } = await loadBriefingAiSettings();

    try {
      const quote = sceneOnly?.trim()
        ? { quoteEn: '', quoteAuthor: '', quoteKn: '', theme: '', scene: sceneOnly.trim() }
        : await generateQuoteText(apiKeys, choice('quote'));
      const image = await generateAiImage(
        imageSettings,
        buildDailyQuoteImagePrompt(quote.scene, imageSettings.imageProvider),
        '16:9',
      );
      return { date: todayIST(), ...quote, imageBase64: image.imageBase64, mimeType: image.mimeType };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new HttpsError('internal', `AI generation failed: ${msg}`);
    }
  },
);

/** Settings › Daily Briefing › "Save": uploads the previewed image and writes
 *  dailyQuote/{date}. Done server-side (not client upload + setDoc like the
 *  tab-header flow) because storage.rules allows no client write on
 *  dailyQuoteBackgrounds/ and dailyQuote/* is Admin-SDK-only. */
export const saveDailyQuote = onCall(
  { region: 'asia-south1', timeoutSeconds: 120 },
  async (request) => {
    requireAdmin(request);
    const data = (request.data ?? {}) as {
      date?: string; quoteEn?: string; quoteAuthor?: string; quoteKn?: string;
      theme?: string; scene?: string; imageBase64?: string; mimeType?: string;
    };

    const date = data.date?.trim() ?? '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new HttpsError('invalid-argument', 'date must be YYYY-MM-DD.');
    }
    const quoteEn = data.quoteEn?.trim() ?? '';
    const quoteAuthor = data.quoteAuthor?.trim() ?? '';
    if (!quoteEn || !quoteAuthor) {
      throw new HttpsError('invalid-argument', 'quoteEn and quoteAuthor are required.');
    }
    if (!data.imageBase64 || !data.mimeType?.startsWith('image/')) {
      throw new HttpsError('invalid-argument', 'A generated image is required.');
    }

    try {
      const backgroundImageUrl = await uploadDailyQuoteImage(date, data.imageBase64, data.mimeType);
      const toStore: DailyQuoteDoc = {
        date,
        quoteEn,
        quoteAuthor,
        quoteKn: data.quoteKn?.trim() ?? '',
        theme: data.theme?.trim() ?? '',
        scene: data.scene?.trim() ?? '',
        backgroundImageUrl,
        savedAt: new Date().toISOString(),
        savedBy: request.auth?.uid ?? '',
      };
      await db.collection('dailyQuote').doc(date).set(toStore);
      return toStore;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new HttpsError('internal', `Could not save the quote: ${msg}`);
    }
  },
);

/** Gathers everything the highlights digest may cite for one student into a
 *  plain-text data block. Shared by the student callable
 *  (generateDailyBriefing) and the admin tester (previewStudentBriefing) so
 *  what the admin previews is exactly what students get. Mirrors the
 *  client-side computations in the student app (fetchMyTotalDue,
 *  noticeAppliesToMe, circularSeenKey, …) rather than trusting a client
 *  payload. */
// ── Scholarship Updates ──────────────────────────────────────────────────────
// Settings › Student App › Daily Briefing › "Scholarship Updates": the admin
// asks Gemini (with its Google Search + URL-context tools, so it can read the
// JS-rendered SSP / NSP portals and their latest notices) for a structured
// summary of the schemes open to the college's students — closing dates,
// eligibility, documents, how to apply — reviews/edits it, and publishes it to
// scholarshipUpdates/current. Students get it inside their Daily Briefing
// response (same ride-along as the quote) and a nudge point when a closing
// date is near. Never generated automatically.

type ScholarshipStatus = 'open' | 'closing-soon' | 'closed' | 'upcoming' | 'unknown';
const SCHOLARSHIP_STATUSES: ScholarshipStatus[] = ['open', 'closing-soon', 'closed', 'upcoming', 'unknown'];

interface ScholarshipScheme {
  name: string;
  portal: string;
  url: string;
  status: ScholarshipStatus;
  applyBy: string | null; // YYYY-MM-DD when a firm closing date is known
  applyByText: string;
  eligibility: string;
  documents: string[];
  howToApply: string;
  notes: string;
  summaryKn: string;
  sources: string[];
}

/** One dated announcement from a portal's notifications / news page. */
interface ScholarshipNewsItem {
  date: string | null; // YYYY-MM-DD when the notice carries a date
  dateText: string;
  title: string;
  titleKn: string;
  portal: string;
  url: string;
}

interface ScholarshipUpdatesDoc {
  overviewEn: string;
  overviewKn: string;
  schemes: ScholarshipScheme[];
  news: ScholarshipNewsItem[];
  // Hue (0-359) of the pastel the app paints the Scholarships page and its
  // CTA card in — drawn at random with each fresh fetch so every published
  // summary gets its own colour.
  themeHue: number;
  sourceUrls: string[];
  fetchedAt: string;
  publishedAt: string;
  publishedBy: string;
}

const DEFAULT_SCHOLARSHIP_SOURCES = [
  'https://ssp.postmatric.karnataka.gov.in/',
  'https://scholarships.gov.in/',
];

const MAX_SCHOLARSHIP_SCHEMES = 8;
const MAX_SCHOLARSHIP_NEWS = 6;
// Closing dates this many days out (or fewer) earn an ACTION NEEDED point in
// the student's own briefing.
const SCHOLARSHIP_NUDGE_DAYS = 14;

const SCHOLARSHIP_SYSTEM = `You are the scholarship help desk of Sanjay Memorial Polytechnic (SMP), Sagar, Karnataka — a government-aided polytechnic whose students are post-matric DIPLOMA students (3-year engineering diploma after 10th standard) from Karnataka, across all categories: SC, ST, OBC (Category-1, 2A, 2B, 3A, 3B), minorities, EWS/general, and students with disabilities.

Your job: read the scholarship portals and official notices listed in the message (use your web tools to open each source URL and its latest notifications / news / circular / important-dates pages, and search for this academic year's official announcements), then write a structured, practical summary for the students of what matters right now.

## WHAT TO INCLUDE
Up to ${MAX_SCHOLARSHIP_SCHEMES} schemes, most urgent first (nearest closing date first, then open ones, then upcoming, then closed). Prefer:
- Karnataka SSP post-matric scholarships (SC/ST, OBC, minority, and other department schemes run through the SSP portal) for the current academic year.
- NSP central schemes a diploma student can apply for (post-matric scholarships for minorities, SC, ST, OBC/EBC/DNT, Top Class, disability schemes, etc.).
- Any other genuinely relevant scheme you find on the given sources.
Skip schemes that only cover pre-matric, degree-only, PhD-only, or non-Karnataka students.

## PER SCHEME — FIELDS
- name: scheme name with the academic year, e.g. "SSP Post-Matric Scholarship 2026-27 (SC/ST)".
- portal: short portal name — "SSP", "NSP", or the site's name.
- url: the best link to apply or read the official details.
- status: one of "open", "closing-soon" (closing within 14 days of TODAY), "closed", "upcoming", "unknown".
- applyBy: the closing date as YYYY-MM-DD ONLY if an official notice states a firm date for this academic year; otherwise null.
- applyByText: the closing date in words with its basis, e.g. "30 September 2026 for fresh and renewal (SSP notice dated 12 August 2026)"; if no date is announced, say "Not announced yet — check the portal" (never guess).
- eligibility: who can apply in plain words — categories, income ceiling (with the exact amount if stated), course level, minimum attendance/marks conditions.
- documents: the documents needed, one per array entry (Aadhaar, caste certificate, income certificate, bank passbook, previous marks card, fee receipt, college ID, photo, etc. — only what the source actually asks for).
- howToApply: 2-3 short steps (portal registration, filling the form, college verification, etc.).
- notes: renewal vs fresh, Aadhaar-bank seeding, verification at the college office, helpline numbers — brief, only if useful.
- summaryKn: ONE natural Kannada sentence (proper Kannada script) giving the closing date and who can apply.
- sources: the URLs you actually used for this scheme.

## LATEST NEWS
Also list up to ${MAX_SCHOLARSHIP_NEWS} dated announcements from the portals' notifications / news / circular pages for this academic year, newest first — last-date extensions, portal opening or closing, document-verification windows, new schemes, helpline changes. Each with:
- date: YYYY-MM-DD only if the notice states a date; otherwise null.
- dateText: the date in words (e.g. "28 September 2026"), or "Undated" when none.
- title: one plain English sentence saying what was announced, with the key date or fact in it.
- titleKn: a natural Kannada rendering of title (proper Kannada script).
- portal: "SSP", "NSP" or the site's name.
- url: the notice or page you read it on.
Only announcements you actually found; an empty list is fine.

## RULES
- Every date, amount, document and condition must come from an official page or notice you read. Never invent, estimate or carry over last year's date as this year's; if unsure, say it is not announced.
- Be specific and useful to a student who has to act: dates, amounts, document names, where to go.
- Keep each field short and plain; English fields in English (Kannada only in summaryKn and overviewKn).
- overviewEn: 1-2 sentences summarising the current situation (what is open, what is closing soon). overviewKn: a natural Kannada rendering of overviewEn.

## OUTPUT FORMAT — STRICT
Return ONLY a raw JSON object: {"overviewEn": string, "overviewKn": string, "schemes": [ { "name", "portal", "url", "status", "applyBy", "applyByText", "eligibility", "documents": string[], "howToApply", "notes", "summaryKn", "sources": string[] } ], "news": [ { "date", "dateText", "title", "titleKn", "portal", "url" } ]}. No markdown fences, no explanation, no trailing text.`;

interface GeminiGroundedResponse {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    finishReason?: string;
    groundingMetadata?: { groundingChunks?: { web?: { uri?: string } }[] };
    urlContextMetadata?: { urlMetadata?: { retrievedUrl?: string }[] };
  }[];
  // thoughtsTokenCount is the tell when a grounded call comes back empty: if it
  // is close to maxOutputTokens, the model spent the whole budget reasoning and
  // never got to the answer.
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
    totalTokenCount?: number;
  };
  promptFeedback?: { blockReason?: string };
}

/** Like callGeminiTextForCircular, but with Gemini's built-in Google Search
 *  and URL-context tools switched on so the model can read live web pages.
 *  JSON response mode is not allowed alongside these tools, so the caller
 *  parses the text with extractJsonObject. Also returns the URLs the model
 *  grounded on, for attribution. */
function callGeminiGrounded(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userMessage: string,
  maxTokens: number,
): Promise<{ text: string; sources: string[] }> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      contents: [{ parts: [{ text: userMessage }] }],
      systemInstruction: { parts: [{ text: systemPrompt }] },
      tools: [{ google_search: {} }, { url_context: {} }],
      generationConfig: { maxOutputTokens: maxTokens },
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
            const parsed = JSON.parse(raw) as GeminiGroundedResponse;
            const candidate = parsed.candidates?.[0];
            const text = (candidate?.content?.parts?.map((p) => p.text ?? '').join('') ?? '').trim();
            const sources = new Set<string>();
            for (const chunk of candidate?.groundingMetadata?.groundingChunks ?? []) {
              if (chunk.web?.uri) sources.add(chunk.web.uri);
            }
            for (const meta of candidate?.urlContextMetadata?.urlMetadata ?? []) {
              if (meta.retrievedUrl) sources.add(meta.retrievedUrl);
            }
            // Empty text used to resolve silently, so the caller reported an
            // unhelpful "response was not valid JSON. It began:" with nothing
            // after it. Say what actually went wrong instead.
            if (!text) {
              const u = parsed.usageMetadata ?? {};
              const detail = [
                `finishReason: ${candidate?.finishReason ?? 'none'}`,
                parsed.promptFeedback?.blockReason ? `blockReason: ${parsed.promptFeedback.blockReason}` : '',
                `thinking tokens: ${u.thoughtsTokenCount ?? 0} of ${maxTokens} budget`,
                `answer tokens: ${u.candidatesTokenCount ?? 0}`,
                `pages read: ${sources.size}`,
              ].filter(Boolean).join(', ');
              reject(new Error(
                `${model} returned no text (${detail}). If the thinking tokens are near the budget, the model `
                + 'spent it all reasoning — pick a stronger model, or reduce the number of source pages.',
              ));
              return;
            }
            resolve({ text, sources: [...sources] });
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

function cleanString(value: unknown, maxLen = 2000): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLen) : '';
}

function cleanStringList(value: unknown, maxItems: number, maxLen = 500): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => cleanString(v, maxLen)).filter(Boolean).slice(0, maxItems);
}

/** Accepts only http(s) URLs, so a stray value can never become a javascript:
 *  link in the app. */
function cleanUrl(value: unknown): string {
  const s = cleanString(value, 1000);
  return /^https?:\/\//i.test(s) ? s : '';
}

/** Normalises one scheme from the model (or the admin's edited form) into the
 *  stored shape; returns null if it has no usable name. */
function normalizeScheme(value: unknown, today: string): ScholarshipScheme | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const name = cleanString(v.name, 200);
  if (!name) return null;
  const applyByRaw = cleanString(v.applyBy, 20);
  const applyBy = /^\d{4}-\d{2}-\d{2}$/.test(applyByRaw) ? applyByRaw : null;
  let status = SCHOLARSHIP_STATUSES.includes(v.status as ScholarshipStatus) ? (v.status as ScholarshipStatus) : 'unknown';
  // A firm date decides the status regardless of what the model said.
  if (applyBy) {
    const days = daysBetweenIsoDates(today, applyBy);
    status = days < 0 ? 'closed' : days <= SCHOLARSHIP_NUDGE_DAYS ? 'closing-soon' : 'open';
  }
  return {
    name,
    portal: cleanString(v.portal, 60) || 'Portal',
    url: cleanUrl(v.url),
    status,
    applyBy,
    applyByText: cleanString(v.applyByText, 300) || (applyBy ?? 'Not announced yet — check the portal'),
    eligibility: cleanString(v.eligibility, 1000),
    documents: cleanStringList(v.documents, 20, 200),
    howToApply: cleanString(v.howToApply, 1000),
    notes: cleanString(v.notes, 1000),
    summaryKn: cleanString(v.summaryKn, 500),
    sources: cleanStringList(v.sources, 10, 1000).map((s) => cleanUrl(s)).filter(Boolean),
  };
}

function normalizeNewsItem(value: unknown): ScholarshipNewsItem | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const title = cleanString(v.title, 300);
  if (!title) return null;
  const dateRaw = cleanString(v.date, 20);
  return {
    date: /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? dateRaw : null,
    dateText: cleanString(v.dateText, 60) || 'Undated',
    title,
    titleKn: cleanString(v.titleKn, 400),
    portal: cleanString(v.portal, 60) || 'Portal',
    url: cleanUrl(v.url),
  };
}

function normalizeScholarshipUpdates(value: unknown, today: string): Pick<ScholarshipUpdatesDoc, 'overviewEn' | 'overviewKn' | 'schemes' | 'news'> | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const schemes = Array.isArray(v.schemes)
    ? v.schemes.map((s) => normalizeScheme(s, today)).filter((s): s is ScholarshipScheme => s !== null).slice(0, MAX_SCHOLARSHIP_SCHEMES)
    : [];
  if (schemes.length === 0) return null;
  // News is optional — a summary with schemes and no announcements is valid.
  const news = Array.isArray(v.news)
    ? v.news.map(normalizeNewsItem).filter((n): n is ScholarshipNewsItem => n !== null).slice(0, MAX_SCHOLARSHIP_NEWS)
    : [];
  return { overviewEn: cleanString(v.overviewEn, 600), overviewKn: cleanString(v.overviewKn, 600), schemes, news };
}

/** Whole days from `from` to `to` (both YYYY-MM-DD); negative when `to` is past. */
function daysBetweenIsoDates(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

function randomHue(): number {
  return Math.floor(Math.random() * 360);
}

async function getScholarshipUpdates(): Promise<ScholarshipUpdatesDoc | null> {
  const snap = await db.doc('scholarshipUpdates/current').get();
  const data = snap.data() as ScholarshipUpdatesDoc | undefined;
  return data && Array.isArray(data.schemes) && data.schemes.length > 0 ? data : null;
}

/** The lines the student's briefing model sees: only schemes closing within
 *  SCHOLARSHIP_NUDGE_DAYS, and only their public facts. */
function scholarshipDeadlineLines(updates: ScholarshipUpdatesDoc | null, today: string): string[] {
  if (!updates) return ['(none)'];
  const lines = updates.schemes
    .filter((s) => s.applyBy && daysBetweenIsoDates(today, s.applyBy) >= 0 && daysBetweenIsoDates(today, s.applyBy) <= SCHOLARSHIP_NUDGE_DAYS)
    .map((s) => `- ${s.name} | ${s.portal} | closes ${s.applyBy} (${daysBetweenIsoDates(today, s.applyBy as string)} day(s) left) | ${s.eligibility || 'see portal'}`);
  return lines.length > 0 ? lines : ['(none)'];
}

/** Settings › Daily Briefing › Scholarship Updates › "Fetch latest": asks
 *  Gemini (grounded) for the current summary. Stateless — nothing is written
 *  until the admin publishes. */
export const fetchScholarshipUpdates = onCall(
  { region: 'asia-south1', timeoutSeconds: 180 },
  async (request) => {
    requireAdmin(request);
    const requested = cleanStringList(((request.data ?? {}) as { sourceUrls?: unknown }).sourceUrls, 10, 1000).map(cleanUrl).filter(Boolean);
    const sourceUrls = requested.length > 0 ? requested : DEFAULT_SCHOLARSHIP_SOURCES;

    const { apiKeys, choice } = await loadBriefingAiSettings();
    const scholarshipChoice = choice('scholarship');
    const today = todayIST();
    const { dayLabel, dateLabel } = todayLabelsIST();

    const userMessage = [
      `TODAY: ${dayLabel}, ${dateLabel} (${today}). Academic year in Karnataka runs June to May.`,
      '',
      'SOURCES (open each one, and also its latest notifications / news / circulars / important-dates pages):',
      ...sourceUrls.map((u) => `- ${u}`),
      '',
      'Also search the web for this academic year\'s official closing-date announcements for these portals (Karnataka SSP post-matric scholarship last date, NSP last date) and prefer official government pages and notices over news sites.',
    ].join('\n');

    let rawText = '';
    let groundedSources: string[] = [];
    try {
      ({ text: rawText, sources: groundedSources } = await callText({
        provider: scholarshipChoice.provider, apiKeys, model: scholarshipChoice.model,
        // See the note in fetchDtekNews: grounded calls need headroom for the
        // model's thinking phase on top of the answer.
        systemPrompt: SCHOLARSHIP_SYSTEM, userMessage, maxTokens: 24000, grounded: true,
      }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new HttpsError('internal', `AI fetch failed: ${msg}`);
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(extractJsonObject(rawText));
    } catch {
      throw new HttpsError('internal', `The AI response was not valid JSON. It began: ${rawText.slice(0, 200)}`);
    }
    const normalized = normalizeScholarshipUpdates(parsedJson, today);
    if (!normalized) {
      throw new HttpsError('internal', 'The AI response contained no usable schemes. Try again, or pick a different provider/model above.');
    }
    // Schemes the model left unattributed fall back to the grounding URLs.
    const schemes = normalized.schemes.map((s) => (s.sources.length > 0 ? s : { ...s, sources: groundedSources.slice(0, 5) }));
    return { ...normalized, schemes, themeHue: randomHue(), sourceUrls, fetchedAt: new Date().toISOString() };
  },
);

/** Settings › Daily Briefing › Scholarship Updates › "Publish": stores the
 *  reviewed summary at scholarshipUpdates/current (Admin SDK — clients can't
 *  write it). */
export const publishScholarshipUpdates = onCall(
  { region: 'asia-south1', timeoutSeconds: 30 },
  async (request) => {
    requireAdmin(request);
    const data = (request.data ?? {}) as Record<string, unknown>;
    const today = todayIST();
    const normalized = normalizeScholarshipUpdates(data, today);
    if (!normalized) {
      throw new HttpsError('invalid-argument', 'At least one scheme with a name is required.');
    }
    const doc: ScholarshipUpdatesDoc = {
      ...normalized,
      sourceUrls: cleanStringList(data.sourceUrls, 10, 1000).map(cleanUrl).filter(Boolean),
      themeHue: Number.isInteger(data.themeHue) && (data.themeHue as number) >= 0 && (data.themeHue as number) < 360 ? (data.themeHue as number) : randomHue(),
      fetchedAt: cleanString(data.fetchedAt, 40) || new Date().toISOString(),
      publishedAt: new Date().toISOString(),
      publishedBy: request.auth?.uid ?? '',
    };
    await db.doc('scholarshipUpdates/current').set(doc);
    return doc;
  },
);

// ── DTEK News ─────────────────────────────────────────────────────────────
// Structurally the Scholarship Updates feature pointed at the Department of
// Technical Education Karnataka site: an admin fetches a grounded summary of
// the latest departmental circulars, reviews and edits it, then publishes to
// dtekNews/current for the admin Dashboard. Admin-only — students never see it.

const DTEK_DEFAULT_SOURCES = [
  'https://dtek.karnataka.gov.in/',
  'https://dtek.karnataka.gov.in/72/departmental-circulars/en',
];

// Pins the web tools to the department's own hosts, so a search can't wander
// off to a news aggregator and report second-hand dates as official ones.
const DTEK_ALLOWED_DOMAINS = ['dtek.karnataka.gov.in', 'karnataka.gov.in'];

/** Exactly the top of the listing page, and deliberately no minimum: an earlier
 *  version asked for "at least 10, going back further if recent weeks are thin"
 *  and the model dutifully dragged the set into last year. With a fixed small
 *  target there is nothing to pad toward. */
const MAX_DTEK_CIRCULARS = 5;
const MAX_DTEK_HIGHLIGHTS = 8;
/** Sorts unranked items last instead of letting them jump to the front. */
const DTEK_UNRANKED = 9999;

const DTEK_CATEGORIES = [
  'Circular', 'Exams', 'Admissions', 'Academics',
  'Administration', 'Recruitment', 'Finance', 'Other',
] as const;
type DtekCategory = (typeof DTEK_CATEGORIES)[number];

interface DtekCircular {
  /** Position on the listing page, 1 = topmost. This is what decides which five
   *  are kept. It rides along into the stored doc and back through publish so
   *  the chosen order survives an admin edit; the UI never displays it. */
  listingRank: number;
  date: string | null;
  dateText: string;
  referenceNo: string;
  title: string;
  titleKn: string;
  category: DtekCategory;
  summary: string;
  summaryKn: string;
  highlights: string[];
  highlightsKn: string[];
  affects: string;
  actionRequired: boolean;
  actionBy: string | null;
  actionByText: string;
  url: string;
}

interface DtekNewsDoc {
  overviewEn: string;
  overviewKn: string;
  circulars: DtekCircular[];
  sourceUrls: string[];
  themeHue: number;
  fetchedAt: string;
  publishedAt: string;
  publishedBy: string;
}

const DTEK_SYSTEM = `You are a technical-education desk officer in Karnataka, writing a digest of what the Department of Technical Education (DTE) has circulated recently for the polytechnic sector as a whole. Your readers are principals and office staff at government and aided polytechnics across the state.

Your job: use your web tools to open the source URLs in the message — above all the departmental circulars listing page — then open the individual circulars themselves (they are often PDFs; read them), and write a structured, practical digest of what matters right now.

## WHAT YOU ARE GIVEN
The message lists the newest circulars already taken from the top of the department's listing page, each with its listingRank, its date, its order number and a link to its PDF. **That set is fixed.** Your job is to open each PDF and write it up in depth — not to choose, filter or look for other circulars.

Write up **every** one you are given, in the order given, including any that look routine. Return exactly one object per listingRank, echoing that same listingRank back. If a PDF genuinely will not open, still return its object with whatever the listed subject tells you, and say plainly in the summary that the document could not be read.

Never substitute a different circular, and never add one that is not in the list.

## PER CIRCULAR — FIELDS
- listingRank: copy back the listingRank given for this circular in the message, unchanged. It is how your write-up is matched to the right document.
- title: one plain English sentence saying what the circular directs, with the key fact in it.
- titleKn: a natural Kannada rendering of title (proper Kannada script).
- category: exactly one of ${DTEK_CATEGORIES.join(', ')}.
- summary: 4-6 sentences of genuinely useful detail in English — what the circular directs, who must act, what changes compared to before, and the numbers, forms and process steps a principal would otherwise have to open the PDF to find. This is a proper briefing, not a one-line skim: someone who reads it should not need the original.
- summaryKn: the same summary in natural Kannada (proper Kannada script), the way a Kannada-speaking officer would write it — a real rendering of the meaning, not a stiff word-for-word translation. Keep technical terms, portal names, form numbers and dates readable rather than forcing them into Kannada.
- highlights: up to ${MAX_DTEK_HIGHLIGHTS} short bullet points carrying the concrete specifics — dates, amounts, form names, portal names, percentages, who must sign. Each a fragment, not a sentence. This is the most useful field; make every bullet carry a fact.
- highlightsKn: the same bullets in natural Kannada, in the same order and the same number, so the two lists line up one-for-one. Leave numbers, portal names and form numbers readable rather than forcing them into Kannada.
- affects: who must act, in a few words — e.g. "All polytechnic principals", "Exam branch", "Students (final year)", "Teaching staff".
- actionRequired: true only when the circular asks the college to DO something by a date or in a form.
- actionBy: the deadline as YYYY-MM-DD if the circular states one; otherwise null.
- actionByText: the deadline in words with its basis, e.g. "Returns due 30 September 2026"; "No deadline stated" when there is none.

## RULES
- Every amount, deadline and condition must come from the PDF you actually opened. Never invent or estimate one, and never carry over a figure from a previous year. If you could not read something, leave it empty or null rather than guessing.
- The circular's own date, order number and link are supplied to you and are already correct — do not repeat, second-guess or re-derive them.
- actionBy is the one date you do supply: take it only from a deadline stated inside the document.
- English fields in English, Kannada script only in titleKn, summaryKn, highlightsKn and overviewKn.
- overviewEn: 1-2 sentences summarising what is new and what needs action. overviewKn: a natural Kannada rendering of overviewEn.

## OUTPUT FORMAT — STRICT
Return ONLY a raw JSON object: {"overviewEn": string, "overviewKn": string, "circulars": [ { "listingRank": number, "title", "titleKn", "category", "summary", "summaryKn", "highlights": string[], "highlightsKn": string[], "affects", "actionRequired": boolean, "actionBy", "actionByText" } ]}. No markdown fences, no explanation, no trailing text.`;

/** Normalises one circular from the model (or the admin's edited form) into the
 *  stored shape; returns null if it has no usable title. */
function normalizeDtekCircular(value: unknown): DtekCircular | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const title = cleanString(v.title, 300);
  if (!title) return null;
  const dateRaw = cleanString(v.date, 20);
  const actionByRaw = cleanString(v.actionBy, 20);
  const actionBy = /^\d{4}-\d{2}-\d{2}$/.test(actionByRaw) ? actionByRaw : null;
  const rank = typeof v.listingRank === 'number' && Number.isFinite(v.listingRank) && v.listingRank > 0
    ? v.listingRank
    : DTEK_UNRANKED;
  return {
    listingRank: rank,
    date: /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? dateRaw : null,
    dateText: cleanString(v.dateText, 60) || 'Undated',
    referenceNo: cleanString(v.referenceNo, 120),
    title,
    titleKn: cleanString(v.titleKn, 400),
    category: DTEK_CATEGORIES.includes(v.category as DtekCategory) ? (v.category as DtekCategory) : 'Circular',
    summary: cleanString(v.summary, 3000),
    summaryKn: cleanString(v.summaryKn, 3000),
    highlights: cleanStringList(v.highlights, MAX_DTEK_HIGHLIGHTS, 300),
    highlightsKn: cleanStringList(v.highlightsKn, MAX_DTEK_HIGHLIGHTS, 300),
    affects: cleanString(v.affects, 200),
    // A stated deadline is what makes something actionable, whatever the model claimed.
    actionRequired: v.actionRequired === true || actionBy !== null,
    actionBy,
    actionByText: cleanString(v.actionByText, 300) || (actionBy ?? 'No deadline stated'),
    url: cleanUrl(v.url),
  };
}

/** There is deliberately no "too old" filter here. An earlier version dropped
 *  anything past a date window, which could — and did — discard every entry and
 *  leave the admin with a bare "no usable circulars". Listing rank is the
 *  selector now, so the page's top entries are the answer whatever their dates;
 *  a stale-looking one is for the admin to spot in the review step. */
function normalizeDtekNews(value: unknown): Pick<DtekNewsDoc, 'overviewEn' | 'overviewKn' | 'circulars'> | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v.circulars)) return null;
  const circulars = v.circulars
    .map(normalizeDtekCircular)
    .filter((c): c is DtekCircular => c !== null)
    // Listing order picks the set: the page's top entries are what "latest"
    // means here, and printed dates are too inconsistent between circulars to
    // select on. Sorting on date instead is what let stale items through.
    .sort((a, b) => a.listingRank - b.listingRank)
    .slice(0, MAX_DTEK_CIRCULARS)
    // Only now, within the chosen five, order by date for the dashboard's
    // date grouping; undated ones fall to the end.
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  if (circulars.length === 0) return null;
  return {
    overviewEn: cleanString(v.overviewEn, 600),
    overviewKn: cleanString(v.overviewKn, 600),
    circulars,
  };
}

/** Says why normalizeDtekNews rejected a payload. "No usable circulars" on its
 *  own sends the admin round in circles — they need to know whether the model
 *  returned nothing, returned a different shape, or returned entries that were
 *  all unusable. */
function describeDtekRejection(parsed: unknown, rawText: string): string {
  if (!parsed || typeof parsed !== 'object') {
    return 'the response was not a JSON object';
  }
  const v = parsed as Record<string, unknown>;
  if (!Array.isArray(v.circulars)) {
    const keys = Object.keys(v).slice(0, 8).join(', ') || 'none';
    return `the response had no "circulars" array (top-level keys: ${keys})`;
  }
  if (v.circulars.length === 0) {
    const why = cleanString(v.overviewEn, 300);
    return why
      ? `the model returned an empty list and said: "${why}"`
      : 'the model returned an empty list of circulars — it may not have been able to read the listing page';
  }
  return `all ${v.circulars.length} entries were unusable (each needs a non-empty "title"). `
    + `First 200 characters of the response: ${rawText.slice(0, 200)}`;
}

async function getDtekSources(): Promise<string[]> {
  const snap = await db.doc('adminConfig/dtekSources').get();
  const urls = cleanStringList((snap.data() as { urls?: unknown } | undefined)?.urls, 10, 1000)
    .map(cleanUrl)
    .filter(Boolean);
  return urls.length > 0 ? urls : DTEK_DEFAULT_SOURCES;
}

/** One row of the department's circulars table, straight from the HTML. */
interface DtekListingRow {
  listingRank: number;
  date: string | null;
  dateText: string;
  referenceNo: string;
  subject: string;
  url: string;
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&ndash;/gi, '–')
    .replace(/&mdash;/gi, '—')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    // Ampersand last, so "&amp;lt;" can't decode twice into a tag.
    .replace(/&amp;/gi, '&');
}

function htmlCellText(cell: string): string {
  return decodeHtmlEntities(cell.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/** The table prints "22.9.2026" and "22.09.2026" interchangeably. */
function dtekDateToIso(raw: string): string | null {
  const m = /^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/.exec(raw.trim());
  if (!m) return null;
  const [, d, mo, y] = m;
  const day = Number(d);
  const month = Number(mo);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** GET with a couple of redirect hops. The listing page is ~2 MB of HTML. */
function httpsGetText(url: string, redirectsLeft = 3): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      { headers: { 'user-agent': 'Mozilla/5.0 (compatible; SMP-Admissions/1.0)', accept: 'text/html' } },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          if (redirectsLeft <= 0) { reject(new Error('too many redirects')); return; }
          resolve(httpsGetText(new URL(res.headers.location, url).toString(), redirectsLeft - 1));
          return;
        }
        if (status !== 200) { res.resume(); reject(new Error(`HTTP ${status}`)); return; }
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => { raw += chunk; });
        res.on('end', () => resolve(raw));
      },
    );
    req.on('error', reject);
    req.setTimeout(60_000, () => { req.destroy(new Error('timed out fetching the listing page')); });
  });
}

/** Pulls the newest `limit` circulars out of the department's listing table.
 *
 *  Done in code rather than by asking the model to browse, because that page is
 *  one ~2 MB table holding the entire archive (2,800+ rows) already sorted
 *  newest-first. Every browsing model we tried either truncated it or gave up
 *  ("the specific live portal links could not be accessed"), and the ones that
 *  did answer picked circulars from years back. Taking the top rows here is
 *  deterministic, and it also means the date, order number and PDF link are
 *  read from the page rather than retyped by an LLM — those are the fields that
 *  matter most and the ones a model is most likely to get subtly wrong. */
function parseDtekListing(html: string, limit: number): DtekListingRow[] {
  const rows: DtekListingRow[] = [];
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let match: RegExpExecArray | null;
  while ((match = rowRe.exec(html)) !== null && rows.length < limit) {
    const cells = match[1].match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/gi);
    if (!cells || cells.length < 4) continue;
    const dateText = htmlCellText(cells[0]);
    const date = dtekDateToIso(dateText);
    // Skips the header row and any layout rows: a real entry always leads with
    // a parseable date.
    if (!date) continue;
    const href = /href\s*=\s*["']([^"']+)["']/i.exec(cells[3]) ?? /href\s*=\s*["']([^"']+)["']/i.exec(match[1]);
    const url = href ? decodeHtmlEntities(href[1]).trim() : '';
    if (!/^https?:\/\//i.test(url)) continue;
    rows.push({
      listingRank: rows.length + 1,
      date,
      dateText,
      referenceNo: htmlCellText(cells[1]),
      subject: htmlCellText(cells[2]),
      url,
    });
  }
  return rows;
}

/** Settings › DTEK News › "Fetch latest": reads the newest circulars straight
 *  out of the department's listing table, then asks the admin's chosen provider
 *  to open those specific PDFs and write them up.
 *  Stateless — nothing is written until the admin publishes. */
export const fetchDtekNews = onCall(
  { region: 'asia-south1', timeoutSeconds: 300 },
  async (request) => {
    requireAdmin(request);
    const requested = cleanStringList(((request.data ?? {}) as { sourceUrls?: unknown }).sourceUrls, 10, 1000)
      .map(cleanUrl)
      .filter(Boolean);
    const sourceUrls = requested.length > 0 ? requested : await getDtekSources();

    const { apiKeys, choice } = await loadBriefingAiSettings();
    const dtekChoice = choice('dtek');
    const today = todayIST();
    const { dayLabel, dateLabel } = todayLabelsIST();

    // Read the listing ourselves. Whichever configured source actually carries
    // the circulars table wins; the others are typically the site's home page.
    let listing: DtekListingRow[] = [];
    let listingError = '';
    for (const url of sourceUrls) {
      try {
        const rows = parseDtekListing(await httpsGetText(url), MAX_DTEK_CIRCULARS);
        if (rows.length > 0) { listing = rows; break; }
      } catch (err) {
        listingError = err instanceof Error ? err.message : String(err);
      }
    }
    if (listing.length === 0) {
      throw new HttpsError(
        'internal',
        'Could not read the circulars table from any source page'
        + `${listingError ? ` (${listingError})` : ''}. Check that a source points at the departmental-circulars `
        + 'listing page, and that the page still shows circulars in a table of Date / Order Number / Subject / Link.',
      );
    }

    const userMessage = [
      `TODAY: ${dayLabel}, ${dateLabel} (${today}). Academic year in Karnataka runs June to May.`,
      '',
      `These are the ${listing.length} newest circulars, taken in order from the top of the department's`
      + ' circulars listing page. Open each PDF link and write that circular up. Do not look for any other'
      + ' circulars, and do not change the dates or order numbers given here — they are read from the page.',
      '',
      ...listing.map((r) => [
        `listingRank ${r.listingRank}:`,
        `  date: ${r.date} (${r.dateText})`,
        `  orderNumber: ${r.referenceNo || '(none printed)'}`,
        `  subject as listed: ${r.subject}`,
        `  pdf: ${r.url}`,
      ].join('\n')),
      '',
      `Return exactly ${listing.length} objects, one per listingRank above, in that order.`,
    ].join('\n');

    let rawText = '';
    let groundedSources: string[] = [];
    try {
      ({ text: rawText, sources: groundedSources } = await callText({
        provider: dtekChoice.provider, apiKeys, model: dtekChoice.model,
        // Generous budget on purpose: a grounded call spends most of it on an
        // internal thinking phase before writing a word, and a cap that only
        // fits the answer comes back empty. Billing is on tokens actually
        // produced, so a high ceiling costs nothing extra.
        systemPrompt: DTEK_SYSTEM, userMessage, maxTokens: 32000,
        grounded: true, allowedDomains: DTEK_ALLOWED_DOMAINS,
      }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new HttpsError('internal', `AI fetch failed: ${msg}`);
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(extractJsonObject(rawText));
    } catch {
      throw new HttpsError('internal', `The AI response was not valid JSON. It began: ${rawText.slice(0, 200)}`);
    }
    const normalized = normalizeDtekNews(parsedJson);
    if (!normalized) {
      throw new HttpsError(
        'internal',
        `No usable circulars — ${describeDtekRejection(parsedJson, rawText)}. `
        + `The listing gave ${listing.length} circulars and the model read ${groundedSources.length} pages. `
        + 'If that read count is zero the provider could not open the PDFs — try Gemini or a stronger model.',
      );
    }

    // The table is authoritative for date, order number and link; the model only
    // supplies the prose. Merging this way means a misread date can't reach the
    // admin — which is the single thing most worth getting right here.
    const byRank = new Map(normalized.circulars.map((c) => [c.listingRank, c]));
    const circulars: DtekCircular[] = listing.map((row) => {
      const written = byRank.get(row.listingRank);
      return {
        listingRank: row.listingRank,
        date: row.date,
        dateText: row.dateText,
        referenceNo: row.referenceNo,
        url: row.url,
        title: written?.title || row.subject,
        titleKn: written?.titleKn ?? '',
        category: written?.category ?? 'Circular',
        summary: written?.summary ?? '',
        summaryKn: written?.summaryKn ?? '',
        highlights: written?.highlights ?? [],
        highlightsKn: written?.highlightsKn ?? [],
        affects: written?.affects ?? '',
        actionRequired: written?.actionRequired ?? false,
        actionBy: written?.actionBy ?? null,
        actionByText: written?.actionByText || 'No deadline stated',
      };
    });

    return {
      ...normalized, circulars,
      themeHue: randomHue(), sourceUrls, fetchedAt: new Date().toISOString(),
    };
  },
);

/** Settings › DTEK News › "Publish": stores the reviewed digest at
 *  dtekNews/current (Admin SDK — clients can't write it). Re-runs the same
 *  normaliser, so a hand-edited payload can't smuggle in unvalidated data. */
export const publishDtekNews = onCall(
  { region: 'asia-south1', timeoutSeconds: 30 },
  async (request) => {
    requireAdmin(request);
    const data = (request.data ?? {}) as Record<string, unknown>;
    const normalized = normalizeDtekNews(data);
    if (!normalized) {
      throw new HttpsError('invalid-argument', 'At least one circular with a title is required.');
    }
    const doc: DtekNewsDoc = {
      ...normalized,
      sourceUrls: cleanStringList(data.sourceUrls, 10, 1000).map(cleanUrl).filter(Boolean),
      themeHue: Number.isInteger(data.themeHue) && (data.themeHue as number) >= 0 && (data.themeHue as number) < 360
        ? (data.themeHue as number)
        : randomHue(),
      fetchedAt: cleanString(data.fetchedAt, 40) || new Date().toISOString(),
      publishedAt: new Date().toISOString(),
      publishedBy: request.auth?.uid ?? '',
    };
    await db.doc('dtekNews/current').set(doc);
    return doc;
  },
);

async function collectStudentBriefingData(regNumber: string): Promise<{ primary: StudentDoc; dataBlock: string }> {
  const [
    studentsSnap, feeSnap, refundsSnap, circularsSnap, noticesSnap, circularsCountSnap, pinnedSnap,
    resultsSnap, notificationsSnap, noticeStateSnap, circularStateSnap, scholarshipUpdates,
  ] = await Promise.all([
    db.collection('students').where('regNumber', '==', regNumber).get(),
    db.collection('feeRecords').where('regNumber', '==', regNumber).get(),
    db.collection('refunds').where('regNumber', '==', regNumber).get(),
    db.collection('circulars').orderBy('createdAt', 'desc').limit(15).get(),
    db.collection('notices').orderBy('createdAt', 'desc').limit(40).get(),
    db.collection('circulars').count().get(),
    db.collection('circulars').where('pinned', '==', true).get(),
    db.collection('examResults').where('regNumber', '==', regNumber).get(),
    // Filtered to unseen in memory (rather than a composite where) so no new
    // Firestore index is needed; a student has at most a handful of these.
    db.collection('studentNotifications').where('regNumber', '==', regNumber).get(),
    db.collection('studentNoticeState').doc(regNumber).get(),
    db.collection('studentCircularState').doc(regNumber).get(),
    getScholarshipUpdates(),
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
  const ansLetters = studentDocs
    .flatMap((d) => d.ansHistory ?? [])
    .sort((a, b) => (b.issuedAt ?? '').localeCompare(a.issuedAt ?? ''));
  const refundRecords = refundsSnap.docs.map((d) => d.data() as RefundRecord);

  // One combined, most-recent-first, capped line list — real per-record facts
  // (not just counts) so the model can cite specifics instead of a bare aggregate.
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
  const lastPayment = [...feeRecords]
    .filter((r) => r.date)
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))[0];

  // Precise due (allotted − paid) per academic year, mirroring fetchMyTotalDue in
  // src/services/studentPortalService.ts on the client — reported per year (with
  // the year's fine) so the digest can quote the exact figure a student will see
  // on their Fee History tab, not just an overall total.
  const recordsByYear = new Map<string, FeeRecordDoc[]>();
  for (const r of feeRecords) {
    if (!r.academicYear) continue;
    const list = recordsByYear.get(r.academicYear) ?? [];
    list.push(r);
    recordsByYear.set(r.academicYear, list);
  }
  const feeYears = await Promise.all(
    [...recordsByYear.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(async ([ay, yearRecords]) => {
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
        const paid = yearRecords.reduce((s, r) => s + sumFeeRecord(r), 0);
        if (!effective) return { ay, allotted: null as number | null, paid, due: 0, fine: 0 };

        const allotted = calcAllottedForYear(effective.smp ?? {}, effective.svk ?? 0, effective.additionalHeads ?? [], yearRecords);
        const finePaid = yearRecords.reduce((s, r) => s + (r.smp?.fine ?? 0), 0);
        const fine = Math.max(effective.smp?.fine ?? 0, finePaid);
        return { ay, allotted, paid, due: Math.max(0, allotted - paid), fine };
      }),
  );
  const totalDue = feeYears.reduce((s, y) => s + y.due, 0);

  const totalCircularsCount = circularsCountSnap.data().count;

  const seenCircularKeys = new Set<string>(
    ((circularStateSnap.data() as { seenCircularIds?: string[] } | undefined)?.seenCircularIds) ?? [],
  );
  const seenNoticeIds = new Set<string>(
    ((noticeStateSnap.data() as { seenNoticeIds?: string[] } | undefined)?.seenNoticeIds) ?? [],
  );
  const circularLine = (c: CircularDoc) =>
    `- ${c.title ?? ''} | ${c.department ?? ''} | ${c.date ?? ''} | ${c.subject ?? ''} | ${seenCircularKeys.has(circularSeenKey(c)) ? 'read' : 'UNREAD'}`;

  const circulars = circularsSnap.docs
    .map((d) => ({ id: d.id, ...(d.data() as CircularDoc) }))
    .filter((c) => !c.archivedAt && !c.expiredAt);
  const pinnedCirculars = pinnedSnap.docs
    .map((d) => ({ id: d.id, ...(d.data() as CircularDoc) }))
    .filter((c) => !c.archivedAt && !c.expiredAt);

  const notices = noticesSnap.docs
    .map((d) => ({ id: d.id, ...(d.data() as NoticeDoc) }))
    .filter((n) => !n.inactiveAt && noticeAppliesToStudent(n, primary))
    .slice(0, 8);

  // Latest exam session only — the ledger import keeps one doc per session,
  // and "what should I clear / how am I doing" is about the most recent one.
  const latestResult = resultsSnap.docs
    .map((d) => d.data() as ExamResultDoc)
    .sort((a, b) => (b.updatedAt ?? b.importedAt ?? '').localeCompare(a.updatedAt ?? a.importedAt ?? ''))[0];
  const resultLines: string[] = [];
  if (latestResult) {
    const cgpa = typeof latestResult.cgpa === 'number' ? String(latestResult.cgpa) : (latestResult.cgpaStatus || 'n/a');
    resultLines.push(`- Session: ${latestResult.examSession ?? 'unknown'} | Overall result: ${latestResult.overallResult ?? 'n/a'} | CGPA: ${cgpa}`);
    const sgpas = (latestResult.semesterSummary ?? [])
      .filter((s) => typeof s.sgpa === 'number')
      .slice(-2)
      .map((s) => `Sem ${s.semester ?? '?'} SGPA ${s.sgpa}`);
    if (sgpas.length > 0) resultLines.push(`- Latest SGPA: ${sgpas.join(', ')}`);
    const toClear = (latestResult.subjects ?? []).filter((s) => s.result === 'F' || s.result === 'AB');
    resultLines.push(
      toClear.length > 0
        ? `- Subjects to clear (${toClear.length}): ${toClear.map((s) => `${s.subject ?? ''} (${s.code ?? ''}, ${s.result === 'AB' ? 'absent' : 'fail'})`).join('; ')}`
        : `- All ${(latestResult.subjects ?? []).length} subjects passed`,
    );
  }

  const unseenNotifications = notificationsSnap.docs
    .map((d) => d.data() as StudentNotificationDoc)
    .filter((n) => !n.seen)
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
    .slice(0, 5);

  const fullName = primary.studentNameSSLC?.trim();
  const firstName = fullName ? fullName.split(/\s+/)[0] : 'Student';
  const { dayLabel, dateLabel } = todayLabelsIST();

  const dataBlock = [
    `STUDENT FIRST NAME: ${firstName}`,
    `TODAY: ${dayLabel}, ${dateLabel}`,
    `STUDENT: ${fullName ?? 'Student'}, ${primary.course ?? ''} ${primary.year ?? ''} (${primary.academicYear ?? ''})`,
    `Admission: ${primary.admissionStatus ?? 'unknown'}${primary.notAdmittedStatusTag ? ` (${primary.notAdmittedStatusTag})` : ''} | ${primary.admType ?? ''} ${primary.admCat ?? ''} | enrolled ${primary.enrollmentDate ?? 'unknown'}`,
    '',
    `FEES BY ACADEMIC YEAR (year | allotted | paid | due | fine):`,
    ...(feeYears.length > 0
      ? feeYears.map((y) => `- ${y.ay} | ${y.allotted === null ? 'allotted unknown' : `Rs.${y.allotted}`} | Rs.${y.paid} | ${y.due > 0 ? `Rs.${y.due} DUE` : 'no dues'} | ${y.fine > 0 ? `Rs.${y.fine}` : 'none'}`)
      : ['(no fee records)']),
    totalDue > 0
      ? `Fee summary: Rs.${totalDue} pending in total (Rs.${totalPaid} paid so far)`
      : `Fee summary: no dues — fully paid (Rs.${totalPaid} paid so far)`,
    lastPayment
      ? `Last payment: ${lastPayment.date} | receipt ${lastPayment.receiptNumber ?? 'n/a'} | ${lastPayment.paymentMode ?? ''} | Rs.${sumFeeRecord(lastPayment)}`
      : 'Last payment: none on record',
    '',
    `RESULTS (latest exam session):`,
    ...(resultLines.length > 0 ? resultLines : ['(no results on record)']),
    '',
    `PINNED CIRCULARS (title | department | date | subject | read status):`,
    ...(pinnedCirculars.length > 0 ? pinnedCirculars.map(circularLine) : ['(none)']),
    '',
    `RECENT CIRCULARS (title | department | date | subject | read status):`,
    ...circulars.slice(0, 10).map(circularLine),
    `Total circulars ever published: ${totalCircularsCount}`,
    '',
    `NOTICES ADDRESSED TO THIS STUDENT (title | category | date | read status | pinned | what it says):`,
    ...(notices.length > 0
      ? notices.map((n) => `- ${n.title ?? ''} | ${n.category ?? ''} | ${n.createdAt ?? ''} | ${seenNoticeIds.has(n.id ?? '') ? 'read' : 'UNREAD'} | ${n.pinned ? 'pinned' : 'not pinned'} | ${htmlExcerpt(n.body, 160) || '(no text)'}`)
      : ['(none)']),
    '',
    `CERTIFICATES & REFUNDS (most recent first):`,
    ...(certificateAndRefundLines.length > 0 ? certificateAndRefundLines.map((l) => `- ${l}`) : ['(none)']),
    `Certificate totals: ${tcRecords.length} Transfer Certificate(s), ${pcRecords.length} Provisional Certificate(s), ${refundRecords.length} Refund(s)`,
    '',
    `ATTENDANCE SHORTAGE LETTERS (academic year | issued | status):`,
    ...(ansLetters.length > 0
      ? ansLetters.slice(0, 3).map((l) => `- ${l.academicYear ?? ''} | ${l.issuedAt ?? 'unknown date'} | ${l.status ?? 'sent'}`)
      : ['(none)']),
    '',
    `UNSEEN NOTIFICATIONS (type | title | message | date):`,
    ...(unseenNotifications.length > 0
      ? unseenNotifications.map((n) => `- ${n.type ?? ''} | ${n.title ?? ''} | ${n.message ?? ''} | ${n.createdAt ?? ''}`)
      : ['(none)']),
    '',
    `SCHOLARSHIP DEADLINES within ${SCHOLARSHIP_NUDGE_DAYS} days, from the admin-published scholarship summary (scheme | portal | closes on | who can apply):`,
    ...scholarshipDeadlineLines(scholarshipUpdates, todayIST()),
  ].join('\n');

  return { primary, dataBlock };
}

async function generateBriefingText(apiKeys: TextApiKeys, choice: TextChoice, dataBlock: string): Promise<BriefingResult> {
  const { text: rawText } = await callText({
    provider: choice.provider, apiKeys, model: choice.model,
    systemPrompt: BRIEFING_SYSTEM, userMessage: dataBlock, maxTokens: 2400, json: true,
  });
  const parsedJson: unknown = JSON.parse(extractJsonObject(rawText));
  if (!isBriefingResult(parsedJson)) {
    throw new Error('The AI response was missing required fields.');
  }
  const { greeting, messageEn, messageKn, points } = parsedJson;
  return { greeting, messageEn, messageKn, points };
}

/** Student app: the Daily Briefing screen. Returns the latest admin-saved
 *  quote, the admin-published scholarship summary (or null), plus this student's note + highlights, generated once per IST day
 *  and cached at dailyBriefing/{regNumber}. `date` is the day the cached
 *  digest belongs to — the client keys its own cache on it (the quote's own
 *  `date` may be older, since the admin may not have saved one today). */
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

    const { apiKeys, choice } = await loadBriefingAiSettings();

    const today = todayIST();

    const [quote, scholarships, cachedBriefingSnap] = await Promise.all([
      getLatestDailyQuote(),
      getScholarshipUpdates(),
      db.collection('dailyBriefing').doc(regNumber).get(),
    ]);

    const cachedBriefing = cachedBriefingSnap.data() as (Partial<BriefingResult> & { date?: string; generatedAt?: string }) | undefined;
    const cachedGeneratedAt = cachedBriefing?.generatedAt;
    if (cachedBriefing?.date === today && isBriefingResult(cachedBriefing)) {
      const { greeting, messageEn, messageKn, points } = cachedBriefing;
      return { date: today, quote, scholarships, greeting, messageEn, messageKn, points, generatedAt: cachedGeneratedAt ?? new Date().toISOString() };
    }

    const { dataBlock } = await collectStudentBriefingData(regNumber);

    try {
      const result = await generateBriefingText(apiKeys, choice('briefing'), dataBlock);
      const generatedAt = new Date().toISOString();
      await db.collection('dailyBriefing').doc(regNumber).set({ date: today, ...result, generatedAt });
      return { date: today, quote, scholarships, ...result, generatedAt };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new HttpsError('internal', `AI generation failed: ${msg}`);
    }
  },
);

/** Settings › Daily Briefing › "Preview a student's briefing": runs the exact
 *  same data collection + generation as generateDailyBriefing for any reg
 *  number, WITHOUT touching that student's cached digest, and also returns
 *  the data block the model was given so the admin can check every
 *  highlight against its source line. */
export const previewStudentBriefing = onCall(
  { region: 'asia-south1', timeoutSeconds: 120 },
  async (request) => {
    requireAdmin(request);
    const regNumber = ((request.data ?? {}) as { regNumber?: string }).regNumber?.trim();
    if (!regNumber) {
      throw new HttpsError('invalid-argument', 'regNumber is required.');
    }

    const { apiKeys, choice } = await loadBriefingAiSettings();

    const [quote, scholarships, { dataBlock }] = await Promise.all([
      getLatestDailyQuote(),
      getScholarshipUpdates(),
      collectStudentBriefingData(regNumber),
    ]);

    try {
      const result = await generateBriefingText(apiKeys, choice('briefing'), dataBlock);
      return { date: todayIST(), quote, scholarships, ...result, generatedAt: new Date().toISOString(), dataBlock };
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
// conflate "Kannada" with a generic "Indian regional language" request. The
// Unicode block is named as well since a model that is unsure of the script
// still knows its code points; and the whole thing is paired with a
// post-generation script check (see checkDraftScript) because prompting alone
// has been seen to fail.
const KANNADA_ANCHOR =
  'KANNADA (ಕನ್ನಡ) — the official language of Karnataka state, written ONLY in the Kannada script (Unicode block U+0C80–U+0CFF: ಅ ಆ ಇ ಕ ಖ ಗ ನ ಮ ವ). ' +
  'Hindi and the Devanagari script (U+0900–U+097F: अ आ इ क ख ग) are WRONG and must not appear anywhere in the output, nor any other Indian language. ' +
  'For reference, a natural Kannada notice opening reads like "ಎಲ್ಲಾ ವಿದ್ಯಾರ್ಥಿಗಳಿಗೆ ಈ ಮೂಲಕ ತಿಳಿಸಲಾಗಿದೆ..." — match that script and register.';

// Short, unmissable statement of the language requirement, placed FIRST in the
// system prompt and repeated at the end of the user message, so it isn't buried
// among the formatting rules (which is where it was when Claude drifted to Hindi).
function draftLanguageHeadline(language: CircularAiLanguage): string {
  if (language === 'kannada') return 'LANGUAGE: Kannada only, in Kannada script (ಕನ್ನಡ). Not Hindi, not Devanagari.';
  if (language === 'both') return 'LANGUAGE: English AND Kannada. The Kannada part must be in Kannada script (ಕನ್ನಡ) — not Hindi, not Devanagari.';
  return 'LANGUAGE: English only.';
}

function circularLanguageInstruction(language: CircularAiLanguage): string {
  if (language === 'kannada') {
    return `Write entirely in fluent, natural, grammatically correct ${KANNADA_ANCHOR} Compose it the way a native Kannada speaker drafting an official college notice would, with correct sentence structure and natural phrasing. Do NOT produce a literal or word-by-word translation from English. Numbers, dates, and proper nouns may stay in their normal form.`;
  }
  if (language === 'both') {
    return `Produce the content in BOTH languages, clearly separated (never interleaved sentence-by-sentence): for "title" and "subject", a single line formatted as "<English> — <Kannada>"; for "bodyHtml", the complete English version first, followed by the complete Kannada version below it as its own block (e.g. a second <p> or list after the English one). The Kannada portion must be written in ${KANNADA_ANCHOR} It must be genuinely composed in fluent, natural Kannada by understanding the context — not a literal or word-by-word translation of the English text.`;
  }
  return 'Write entirely in formal, clear English.';
}

// Devanagari letters/signs/digits only — the block's two punctuation marks,
// the danda "।" (U+0964) and double danda "॥" (U+0965), are shared across
// Indic scripts and models routinely end Kannada sentences with them, so they
// must not count as "Hindi". (They're normalised to full stops below anyway.)
const DEVANAGARI_LETTER_RE = /[ऀ-ॣ०-ॿ]/g;
const DANDA_RE = /[।॥]/g;
const KANNADA_RE = /[ಀ-೿]/;

/** The model's answer is JSON, and a model may escape non-ASCII as \uXXXX —
 *  decode it so the script check sees real characters; falls back to the raw
 *  text when it isn't parseable JSON. */
function draftTextForScriptCheck(rawText: string): string {
  try {
    const parsed = JSON.parse(extractJsonObject(rawText)) as unknown;
    if (parsed && typeof parsed === 'object') {
      return Object.values(parsed as Record<string, unknown>)
        .filter((v): v is string => typeof v === 'string')
        .join('\n');
    }
  } catch { /* not JSON — check the raw text */ }
  return rawText;
}

/** Returns a correction to feed back to the model when a Kannada/both draft
 *  came out in the wrong script (Devanagari present, or no Kannada at all), or
 *  null when the script is right. English drafts are never checked. */
function checkDraftScript(rawText: string, language: CircularAiLanguage): string | null {
  if (language === 'english') return null;
  const text = draftTextForScriptCheck(rawText);
  const devanagari = text.match(DEVANAGARI_LETTER_RE);
  if (devanagari) {
    console.warn(`Draft script check: Devanagari found — ${JSON.stringify([...new Set(devanagari)].slice(0, 20).join(''))}`);
    return 'Your previous attempt used Hindi / Devanagari script, which is WRONG. Rewrite it with the Kannada portion in the Kannada script (ಕನ್ನಡ, U+0C80–U+0CFF) only — no Devanagari characters anywhere.';
  }
  if (!KANNADA_RE.test(text)) {
    console.warn(`Draft script check: no Kannada found — ${JSON.stringify(text.slice(0, 200))}`);
    return 'Your previous attempt contained no Kannada text at all, which is WRONG. Rewrite it so the Kannada portion is genuinely written in Kannada script (ಕನ್ನಡ).';
  }
  return null;
}

function buildCircularDraftSystemPrompt(language: CircularAiLanguage): string {
  const deptList = CIRCULAR_DEPARTMENTS.map((d) => `${d.code} (${d.name})`).join(', ');
  return [
    draftLanguageHeadline(language),
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

function buildCircularDraftUserMessage(brief: string, keyDates: string | undefined, language: CircularAiLanguage): string {
  const lines = [`BRIEF: ${brief}`];
  if (keyDates?.trim()) lines.push(`KEY DATES/DEADLINES: ${keyDates.trim()}`);
  lines.push(draftLanguageHeadline(language));
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

// Sonnet rather than Haiku for drafting: Haiku kept slipping into Hindi/
// Devanagari on Kannada requests, and a draft is a few hundred output tokens
// at most, so the stronger model costs next to nothing per call.
const CLAUDE_DRAFT_MODEL = 'claude-sonnet-5';

function callClaudeForCircular(
  apiKey: string,
  systemPrompt: string,
  userMessage: string,
  maxTokens: number,
  model: string = CLAUDE_DRAFT_MODEL,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model,
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
            const parsed = JSON.parse(raw) as AnthropicResponse & { stop_reason?: string };
            // Newer models can put a non-text block first (seen with Sonnet 5:
            // reading content[0] alone came back empty), so join every text
            // block rather than trusting the first one.
            const text = (parsed.content ?? [])
              .filter((c) => c.type === 'text' && typeof c.text === 'string')
              .map((c) => c.text)
              .join('')
              .trim();
            if (!text) {
              reject(new Error(`empty response from Claude (stop_reason: ${parsed.stop_reason ?? 'unknown'}, blocks: ${(parsed.content ?? []).map((c) => c.type).join(',') || 'none'})`));
              return;
            }
            resolve(text);
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

// ── Multi-provider text generation ────────────────────────────────────────
// The Daily Briefing features and DTEK News each pick their own provider and
// model (Settings). Everything below funnels into callText(), so the callables
// stay provider-agnostic. Keys still live in adminConfig/aiSettings and every
// request is hand-rolled node:https — this project ships no provider SDKs.

type TextProvider = 'gemini' | 'claude' | 'openai';

interface TextCallResult {
  text: string;
  /** URLs the model actually read. Empty for non-grounded calls. */
  sources: string[];
}

interface TextApiKeys {
  gemini?: string;
  anthropic?: string;
  openai?: string;
}

const DEFAULT_TEXT_MODEL: Record<TextProvider, string> = {
  gemini: 'gemini-3.5-flash-lite',
  claude: 'claude-sonnet-5',
  openai: 'gpt-5.6-luna',
};

// Claude models whose thinking is adaptive-on by default, and which accept
// output_config.effort. Haiku 4.5 accepts neither and 400s on effort.
const CLAUDE_THINKING_MODELS = new Set(['claude-sonnet-5', 'claude-opus-5']);

/** Adaptive thinking is drawn from max_tokens on Sonnet 5 / Opus 5, so a budget
 *  sized for the visible answer alone gets the real output truncated partway
 *  through the JSON. Haiku 4.5 does not think unless asked, so it keeps the
 *  caller's number. */
function claudeTokenBudget(model: string, maxTokens: number): number {
  return CLAUDE_THINKING_MODELS.has(model) ? Math.max(maxTokens * 4, 8000) : maxTokens;
}

function claudeEffort(model: string, effort: 'low' | 'high'): Record<string, unknown> {
  return CLAUDE_THINKING_MODELS.has(model) ? { output_config: { effort } } : {};
}

interface AnthropicContentBlock {
  type: string;
  text?: string;
  // web_search_tool_result / web_fetch_tool_result: an array on success, a bare
  // error object on failure — these server tools never raise, they return 200.
  content?: unknown;
}

/** Claude with its server-side web_search + web_fetch tools switched on, the
 *  Anthropic counterpart of callGeminiGrounded. Returns the same
 *  { text, sources } shape so callers don't care which provider ran.
 *
 *  Three things a plain message call never has to handle:
 *  1. server-tool failures arrive as HTTP 200 with an error object inside a
 *     result block, so a "successful" call can silently have read nothing;
 *  2. stop_reason 'pause_turn' means the model paused mid-research and the turn
 *     must be handed back to it to continue;
 *  3. sources have to be harvested out of the tool-result blocks. */
async function callClaudeGrounded(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userMessage: string,
  maxTokens: number,
  allowedDomains?: string[],
): Promise<TextCallResult> {
  const domainFilter = allowedDomains && allowedDomains.length > 0 ? { allowed_domains: allowedDomains } : {};
  const tools = [
    { type: 'web_search_20260209', name: 'web_search', max_uses: 10, ...domainFilter },
    { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 16, ...domainFilter },
  ];

  const messages: { role: string; content: unknown }[] = [{ role: 'user', content: userMessage }];
  const sources = new Set<string>();
  const textParts: string[] = [];
  const toolErrors: string[] = [];

  // A research turn can pause more than once; cap the continuations so a
  // pathological loop can't burn the whole function timeout.
  for (let attempt = 0; attempt < 4; attempt++) {
    const parsed = await anthropicRequest(apiKey, {
      model,
      max_tokens: claudeTokenBudget(model, maxTokens),
      ...claudeEffort(model, 'high'),
      system: systemPrompt,
      tools,
      messages,
    });

    const blocks = (parsed.content ?? []) as AnthropicContentBlock[];
    for (const block of blocks) {
      if (block.type === 'text' && typeof block.text === 'string') {
        textParts.push(block.text);
        continue;
      }
      if (block.type !== 'web_search_tool_result' && block.type !== 'web_fetch_tool_result') continue;
      const content = block.content;
      if (Array.isArray(content)) {
        for (const entry of content as Record<string, unknown>[]) {
          const url = typeof entry.url === 'string' ? entry.url : undefined;
          if (url) sources.add(url);
          // web_fetch wraps the page in a document block carrying the URL it got.
          const doc = entry.document as { source?: { url?: string } } | undefined;
          if (typeof doc?.source?.url === 'string') sources.add(doc.source.url);
        }
      } else if (content && typeof content === 'object') {
        const code = (content as { error_code?: string }).error_code;
        if (code) toolErrors.push(`${block.type}: ${code}`);
      }
    }

    if (parsed.stop_reason !== 'pause_turn') break;
    // Hand the partial turn back verbatim so the model resumes where it paused.
    messages.push({ role: 'assistant', content: parsed.content });
  }

  const text = textParts.join('').trim();
  if (!text) {
    const why = toolErrors.length > 0 ? ` (web tools failed — ${toolErrors.join('; ')})` : '';
    throw new Error(`empty response from Claude${why}`);
  }
  return { text, sources: [...sources] };
}

/** Shared POST to the Anthropic messages endpoint. Resolves the parsed body on
 *  200 and rejects with the API's own message otherwise. */
function anthropicRequest(
  apiKey: string,
  payload: Record<string, unknown>,
): Promise<{ content?: unknown[]; stop_reason?: string }> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
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
            resolve(JSON.parse(raw) as { content?: unknown[]; stop_reason?: string });
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

interface OpenAiResponsesBody {
  output?: {
    type: string;
    content?: { type: string; text?: string; annotations?: { type?: string; url?: string }[] }[];
  }[];
  output_text?: string;
}

/** OpenAI via the Responses API (/v1/responses), optionally with its hosted
 *  web_search tool. Instructions go in the top-level `instructions` field and
 *  the prompt in `input`; cited URLs come back as url_citation annotations on
 *  the assistant message's output_text blocks. */
function callOpenAiText(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userMessage: string,
  maxTokens: number,
  grounded: boolean,
): Promise<TextCallResult> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model,
      instructions: systemPrompt,
      input: userMessage,
      max_output_tokens: maxTokens,
      ...(grounded ? { tools: [{ type: 'web_search' }] } : {}),
    });
    const req = https.request(
      {
        hostname: 'api.openai.com',
        path: '/v1/responses',
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
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
            const parsed = JSON.parse(raw) as OpenAiResponsesBody;
            const sources = new Set<string>();
            const textParts: string[] = [];
            for (const item of parsed.output ?? []) {
              if (item.type !== 'message') continue;
              for (const block of item.content ?? []) {
                if (block.type !== 'output_text') continue;
                if (typeof block.text === 'string') textParts.push(block.text);
                for (const ann of block.annotations ?? []) {
                  if (ann.type === 'url_citation' && typeof ann.url === 'string') sources.add(ann.url);
                }
              }
            }
            // output_text is the SDK's convenience roll-up; fall back to it when
            // the output array shape is not what we expect.
            const text = (textParts.join('') || parsed.output_text || '').trim();
            if (!text) {
              reject(new Error('empty response from OpenAI'));
              return;
            }
            resolve({ text, sources: [...sources] });
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

/** The one entry point every provider-agnostic text feature calls. `json` asks
 *  for strict JSON where the provider allows it; note Gemini forbids JSON mode
 *  alongside its web tools, which is why every caller parses the result with
 *  extractJsonObject regardless. */
async function callText(opts: {
  provider: TextProvider;
  apiKeys: TextApiKeys;
  model: string;
  systemPrompt: string;
  userMessage: string;
  maxTokens: number;
  json?: boolean;
  grounded?: boolean;
  allowedDomains?: string[];
}): Promise<TextCallResult> {
  const { provider, apiKeys, systemPrompt, userMessage, maxTokens, json, grounded, allowedDomains } = opts;
  const model = opts.model?.trim() || DEFAULT_TEXT_MODEL[provider];

  if (provider === 'claude') {
    const key = apiKeys.anthropic?.trim();
    if (!key) throw new HttpsError('failed-precondition', 'Anthropic API key is empty.');
    if (grounded) {
      return callClaudeGrounded(key, model, systemPrompt, userMessage, maxTokens, allowedDomains);
    }
    const text = await callClaudeForCircular(
      key, systemPrompt, userMessage, claudeTokenBudget(model, maxTokens), model,
    );
    return { text, sources: [] };
  }

  if (provider === 'openai') {
    const key = apiKeys.openai?.trim();
    if (!key) throw new HttpsError('failed-precondition', 'OpenAI API key is empty.');
    return callOpenAiText(key, model, systemPrompt, userMessage, maxTokens, grounded === true);
  }

  const key = apiKeys.gemini?.trim();
  if (!key) throw new HttpsError('failed-precondition', 'Gemini API key is empty.');
  if (grounded) {
    return callGeminiGrounded(key, model, systemPrompt, userMessage, maxTokens);
  }
  const text = await callGeminiTextForCircular(
    key, model, systemPrompt, userMessage, maxTokens, json ? 'application/json' : undefined,
  );
  return { text, sources: [] };
}

// Shared by the circular and notice drafting callables: reads the admin's AI
// keys/model from Firestore, checks the chosen provider is actually configured,
// runs the prompt and maps every failure to an HttpsError the client can show.
// For Kannada/both drafts the output's script is verified; a wrong-script draft
// is sent back once with a correction, and a second failure is reported rather
// than handed to the admin as if it were Kannada.
async function runDraftModel(
  provider: 'claude' | 'gemini' | undefined,
  systemPrompt: string,
  userMessage: string,
  maxTokens: number,
  language: CircularAiLanguage,
): Promise<string> {
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

  const generate = (message: string): Promise<string> =>
    useGemini
      ? callGeminiTextForCircular(geminiApiKey!.trim(), geminiTextModel?.trim() || 'gemini-3.5-flash-lite', systemPrompt, message, maxTokens)
      : callClaudeForCircular(anthropicApiKey!.trim(), systemPrompt, message, maxTokens);

  // Kannada is written with ordinary full stops; models still tend to close
  // Kannada sentences with the Hindi-style danda, so swap those out.
  const normalise = (text: string) => text.replace(DANDA_RE, '.');

  let rawText: string;
  try {
    rawText = normalise(await generate(userMessage));
    const correction = checkDraftScript(rawText, language);
    if (correction) {
      console.warn(`Draft came back in the wrong script (${useGemini ? 'gemini' : 'claude'}, ${language}) — retrying once with a correction.`);
      rawText = normalise(await generate(`${userMessage}\n\n${correction}`));
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new HttpsError('internal', `Draft generation failed: ${msg}`);
  }

  if (checkDraftScript(rawText, language)) {
    throw new HttpsError('internal', 'The AI wrote the Kannada part in the wrong script (Hindi/Devanagari) twice. Please retry, or try the other provider.');
  }
  return rawText;
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

    const lang: CircularAiLanguage = language ?? 'english';
    const systemPrompt = buildCircularDraftSystemPrompt(lang);
    const userMessage = buildCircularDraftUserMessage(brief.trim(), keyDates, lang);
    // "both" roughly doubles output length (full English + full Kannada blocks).
    const maxTokens = lang === 'both' ? 2500 : 1500;

    const rawText = await runDraftModel(provider, systemPrompt, userMessage, maxTokens, lang);

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

// ── Notice AI drafting ("Compose with AI" on Student Messages › Compose) ────
// Same shape as generateCircularDraft, but for the targeted notices an admin
// sends to a hand-picked/filtered set of students (fee reminders, document
// requests, …): the draft is a short direct message with a suggested category
// instead of a college-wide circular with a department. Stateless — the admin
// reviews/edits it in the compose modal and nothing is written until Send.

const NOTICE_CATEGORIES = ['fee', 'document', 'general'] as const;
type NoticeDraftCategory = (typeof NOTICE_CATEGORIES)[number];

function buildNoticeDraftSystemPrompt(language: CircularAiLanguage): string {
  return [
    draftLanguageHeadline(language),
    'You are an assistant that drafts short notices/messages from the office of Sanjay Memorial Polytechnic, a college, sent directly to a specific group of its students through the student portal app.',
    'Produce ONLY a JSON object (no prose, no markdown fences) with this exact shape: { "title": string, "category": string, "bodyHtml": string }',
    '"category" must be exactly one of: "fee" (fee dues, payments, fines, receipts), "document" (documents/certificates to submit or collect), "general" (anything else).',
    '"title" is a short headline (max ~10 words) naming the matter and, where relevant, the action or date.',
    '"bodyHtml" must use ONLY these HTML tags: <p> <strong> <em> <u> <ul> <ol> <li> <br>. No other tags, no attributes, no inline styles, no links, no scripts, no images.',
    'This is a direct message to the students who receive it, not a public circular: it may open with a brief salutation such as "Dear Student," and should speak to them directly (e.g. "your fee", "please submit").',
    'Keep it short: 1-2 short paragraphs, or a 2-4 item list when there are multiple points — roughly 40-110 words in total.',
    'The students first see this as a phone push notification that shows only the first ~150 characters of the text, so the first sentence must state the key point (what is due / what to do / by when) on its own.',
    'Tone: formal, courteous, direct and clear, as written by the college office.',
    'Wrap the key date(s)/deadline(s) — and any other single most critical detail, like an amount or a fine — in <strong> tags so they stand out. Use this sparingly: only the 1-2 truly essential details, not every sentence.',
    circularLanguageInstruction(language),
    'Never invent specific facts (dates, amounts, fees, fines, document names) that are not present in the brief or the optional key-dates hint — if a specific detail is needed but not given, use a bracket placeholder like [DATE] or [AMOUNT] instead of guessing.',
    'The AUDIENCE line in the message describes who is receiving this (e.g. course, year, fee status, count) so you can pitch the wording correctly — use it only as context; never repeat the audience description or the student count in the notice itself.',
    'Stay strictly on the topic given in the brief and key-dates hint — never add unrelated facts, filler, generic boilerplate, or off-topic content of any kind.',
    'The final output must read as clean, neat, refined, and straight to the point — meaningful and genuinely appealing to read, not padded, robotic, or generic.',
    'Output valid JSON only.',
  ].join(' ');
}

function buildNoticeDraftUserMessage(
  brief: string,
  keyDates: string | undefined,
  audience: { count: number; label: string } | undefined,
  language: CircularAiLanguage,
): string {
  const lines = [`BRIEF: ${brief}`];
  if (keyDates?.trim()) lines.push(`KEY DATES/DEADLINES: ${keyDates.trim()}`);
  if (audience) {
    const label = audience.label.trim() || 'Selected students';
    lines.push(`AUDIENCE: ${label} (${audience.count} student${audience.count === 1 ? '' : 's'})`);
  }
  lines.push(draftLanguageHeadline(language));
  return lines.join('\n');
}

interface NoticeDraft {
  title: string;
  category?: string;
  bodyHtml: string;
}

function isNoticeDraft(value: unknown): value is NoticeDraft {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.title === 'string' && v.title.trim() !== '' &&
    typeof v.bodyHtml === 'string' && v.bodyHtml.trim() !== '' &&
    (v.category === undefined || typeof v.category === 'string')
  );
}

export const generateNoticeDraft = onCall(
  { region: 'asia-south1', timeoutSeconds: 60 },
  async (request) => {
    if (request.auth?.token?.admin !== true) {
      throw new HttpsError('permission-denied', 'Admin sign-in required.');
    }

    const { brief, keyDates, provider, language, audience } = (request.data ?? {}) as {
      brief?: string;
      keyDates?: string;
      provider?: 'claude' | 'gemini';
      language?: CircularAiLanguage;
      audience?: { count?: number; label?: string };
    };
    if (!brief?.trim()) {
      throw new HttpsError('invalid-argument', 'brief is required.');
    }

    const lang: CircularAiLanguage = language ?? 'english';
    const systemPrompt = buildNoticeDraftSystemPrompt(lang);
    const userMessage = buildNoticeDraftUserMessage(
      brief.trim(),
      keyDates,
      audience && typeof audience.count === 'number'
        ? { count: audience.count, label: typeof audience.label === 'string' ? audience.label : '' }
        : undefined,
      lang,
    );
    // Notices are shorter than circulars; "both" still needs room for the
    // full English + full Kannada blocks.
    const maxTokens = lang === 'both' ? 2200 : 1200;

    const rawText = await runDraftModel(provider, systemPrompt, userMessage, maxTokens, lang);

    let parsed: unknown;
    try {
      parsed = JSON.parse(extractJsonObject(rawText));
    } catch {
      throw new HttpsError('internal', 'The AI returned malformed JSON. Please retry.');
    }
    if (!isNoticeDraft(parsed)) {
      throw new HttpsError('internal', 'The AI response was missing required fields. Please retry.');
    }
    const draft: NoticeDraft = parsed;

    const category = (NOTICE_CATEGORIES as readonly string[]).includes(draft.category?.trim().toLowerCase() ?? '')
      ? (draft.category!.trim().toLowerCase() as NoticeDraftCategory)
      : undefined;

    return {
      title: draft.title.trim(),
      category,
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
const OPENAI_IMAGE_QUALITIES = ['low', 'medium', 'high'] as const;

function callOpenAiImage(
  apiKey: string,
  model: string,
  prompt: string,
  aspectRatio: ImageAspectRatio,
  quality?: string,
): Promise<{ imageBase64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    // gpt-image-1 models only accept these exact size strings (no arbitrary aspect ratio).
    const size = aspectRatio === '1:1' ? '1024x1024' : '1536x1024';
    const body = JSON.stringify({
      model,
      prompt,
      size,
      // Admin-selectable (AI Settings) — it's the biggest cost lever on OpenAI,
      // `high` running roughly 5–25× the price of `low`. `high` was the only
      // value before this was exposed, so it stays the fallback.
      quality: (OPENAI_IMAGE_QUALITIES as readonly string[]).includes(quality ?? '') ? quality : 'high',
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
  /** `low` | `medium` | `high` — anything else falls back to `high`. */
  openaiImageQuality?: string;
  replicateApiKey?: string;
  replicateImageModel?: string;
  budgetpixelApiKey?: string;
  budgetpixelImageModel?: string;
}

// ── Generated-image optimisation ────────────────────────────────────────────
// Every provider hands back a raw ~1-1.5 MP PNG (1-4 MB). The student app
// downloads up to a dozen of these on its very first login and every one of
// them is only ever displayed as a card/header backdrop at phone width, so
// the full-resolution PNG is pure cost: it was the single biggest reason the
// portal showed blank backdrops for 5-10 s after login. Downscaling to a
// phone-appropriate width and re-encoding as WebP shrinks each image
// 10-30x (typically 50-150 KB) with no visible difference at display size.
// Applied inside generateAiImage() so all four call sites (circular, tab
// header, category icon, daily quote) — and the one-off optimizeStoredImages
// migration below — share exactly one pipeline.
const OPTIMIZED_IMAGE_MIME = 'image/webp';
const OPTIMIZED_IMAGE_WIDTH: Record<ImageAspectRatio, number> = { '16:9': 1280, '1:1': 800 };
const OPTIMIZED_IMAGE_QUALITY = 82;
const OPTIMIZED_CACHE_CONTROL = 'public, max-age=31536000, immutable';

async function optimizeImageBuffer(input: Buffer, aspectRatio: ImageAspectRatio): Promise<Buffer> {
  return sharp(input)
    .resize({ width: OPTIMIZED_IMAGE_WIDTH[aspectRatio], withoutEnlargement: true })
    .webp({ quality: OPTIMIZED_IMAGE_QUALITY })
    .toBuffer();
}

async function optimizeGeneratedImage(
  image: { imageBase64: string; mimeType: string },
  aspectRatio: ImageAspectRatio,
): Promise<{ imageBase64: string; mimeType: string }> {
  try {
    const out = await optimizeImageBuffer(Buffer.from(image.imageBase64, 'base64'), aspectRatio);
    return { imageBase64: out.toString('base64'), mimeType: OPTIMIZED_IMAGE_MIME };
  } catch (err) {
    // Never fail a generation over the optimisation step — the raw provider
    // output is still a perfectly valid (just larger) image.
    console.warn('optimizeGeneratedImage: falling back to raw provider output', err);
    return image;
  }
}

async function generateAiImage(
  settings: AiImageSettings,
  prompt: string,
  aspectRatio: ImageAspectRatio = '16:9',
): Promise<{ imageBase64: string; mimeType: string }> {
  const raw = await generateRawAiImage(settings, prompt, aspectRatio);
  return optimizeGeneratedImage(raw, aspectRatio);
}

function generateRawAiImage(
  settings: AiImageSettings,
  prompt: string,
  aspectRatio: ImageAspectRatio,
): Promise<{ imageBase64: string; mimeType: string }> {
  if (settings.imageProvider === 'openai') {
    return callOpenAiImage(
      (settings.openaiApiKey ?? '').trim(),
      settings.openaiImageModel?.trim() || 'gpt-image-1-mini',
      prompt,
      aspectRatio,
      settings.openaiImageQuality?.trim(),
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
function imageStyleDirective(
  provider: AiImageSettings['imageProvider'],
  palette: string,
  aspectRatio: ImageAspectRatio = '16:9',
  // The one piece of text the image may contain (e.g. the college's short
  // name on a building). Omitted = the default blanket ban on any text,
  // which is what every prompt except the Home header wants.
  allowedText?: string,
): string {
  const noText = allowedText
    ? `The only text allowed anywhere in the image is exactly "${allowedText}" — no other letters, numbers, words, captions, signage, or logos.`
    : 'Absolutely no text, letters, numbers, words, captions, signage, or logos anywhere in the image — illustrate the scene only, nothing written.';
  if (provider === 'openai') {
    return [
      'Style: 2D flat vector illustration, in the style of modern flat-design app/brochure graphics.',
      'Solid flat colors with soft cel-shading only — no gradients, no realistic lighting, no shadows, no depth of field, no textures, no 3D rendering, no photorealism, not a photograph.',
      `Color palette: ${palette}.`,
      `The illustration fills the entire ${aspectRatio} frame edge-to-edge with no white margins, borders, or empty background space.`,
      noText,
    ].join(' ');
  }
  return `Style: modern flat-design vector illustration, simple clean shapes, soft flat shading, ${palette}, no photorealism. ${noText}`;
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
  // Only the building prop lives here; the student's pose is drawn at random
  // per generation by buildHomeHeaderPrompt (HOME_HEADER_POSES).
  home: 'a small, simple flat college building drawn as a prop just behind the student, carrying the short name "SMP" as clean, bold, correctly spelled signage above its entrance',
  // These four match CATEGORY_ICON_SCENES below exactly, so the header and
  // the Overview tile agree on what circulars/fees/certificates/notices
  // "look like". They used to be bare prop scenes with no one in them (a
  // stack of papers, a ledger, a scroll, a bell) — that read as flat, and on
  // repeat Regenerate the model had nothing to vary but a static object, so
  // it kept collapsing onto the same notice-board illustration. Now every
  // header draws {student} (see buildTabHeaderPrompt), the same randomly
  // drawn look used everywhere else, doing the tab's signature action.
  circulars: '{student} pinning a paper flyer onto a small bulletin board, holding a few extra flyers in the other hand',
  profile: '{student} in college uniform, standing, holding a notebook',
  fees: '{student} happily holding up a paid receipt in one hand and a payment card in the other',
  certificates: '{student} proudly holding up a rolled certificate scroll tied with a ribbon',
  notices: '{student} looking up brightly at a small ringing bell overhead, one hand raised beside their ear',
};

// Every tab header (Home and the rest) picks a fresh background at random
// from this shared pool on each Generate, so regenerating gives real variety
// and no two tabs look alike.
//
// `bg` is the pastel the prompt asks for (by name and hex) and `ink` is a
// deep same-hue tone for the tab's title/greeting over it, at least 7:1
// contrast (WCAG AAA). The first 33 are the student app's hero-panel swatches
// (smp-student-portal src/theme/palette.ts HERO_PANEL_SWATCHES), copied
// verbatim so headers and the hero card share one colour language; the rest
// fill the gaps that set leaves (peach, coral, sand, sage, mauve, …). Image
// models only approximate a requested hex, so the ink that actually gets
// saved is re-checked against the generated image (see inkForBackground).
type HeaderSwatch = { name: string; bg: string; ink: string };

const HEADER_BACKGROUND_SWATCHES: readonly HeaderSwatch[] = [
  // Greens (hero)
  { name: 'spearmint', bg: '#C6F2CF', ink: '#14432A' },
  { name: 'pastel mint', bg: '#C1F4CD', ink: '#16432A' },
  { name: 'pistachio', bg: '#D8F5C0', ink: '#23421A' },
  { name: 'honeydew', bg: '#E4F8D2', ink: '#274A1C' },
  { name: 'spring meadow', bg: '#CAFFA6', ink: '#204654' },
  { name: 'tea green', bg: '#E2F0CB', ink: '#2E4418' },
  { name: 'celadon', bg: '#D6EFE0', ink: '#1A4630' },
  { name: 'seafoam', bg: '#B5EAD7', ink: '#0F4034' },
  { name: 'mint frost', bg: '#C8F4E3', ink: '#0F4C3A' },
  { name: 'aqua mist', bg: '#D2F7EC', ink: '#0E4A3E' },
  // Yellows (hero)
  { name: 'lemon chiffon', bg: '#FFF5BA', ink: '#3D3505' },
  { name: 'butter cream', bg: '#FFF1B8', ink: '#3F3408' },
  { name: 'vanilla', bg: '#FFF7CC', ink: '#403606' },
  { name: 'cream', bg: '#FBF3D5', ink: '#43360A' },
  { name: 'lime sorbet', bg: '#F1F5C4', ink: '#383F08' },
  // Blues / cyans (hero)
  { name: 'baby blue', bg: '#BDE0FE', ink: '#1B3A5C' },
  { name: 'sky wash', bg: '#CDEEFF', ink: '#123A52' },
  { name: 'powder cyan', bg: '#BFEFFF', ink: '#0B3D4F' },
  { name: 'ice blue', bg: '#DDF6FF', ink: '#0D3E55' },
  { name: 'lagoon', bg: '#C9F1F5', ink: '#0C4450' },
  { name: 'glacial sky', bg: '#A9E0F1', ink: '#204654' },
  { name: 'cloud blue', bg: '#DDEBFF', ink: '#1A3563' },
  // Violets (hero)
  { name: 'periwinkle', bg: '#C7CEEA', ink: '#232B5C' },
  { name: 'lavender mist', bg: '#E3E0FF', ink: '#2C2468' },
  { name: 'lavender haze', bg: '#D9CCF5', ink: '#2E2352' },
  { name: 'lilac', bg: '#E0C3FC', ink: '#3A1C5C' },
  { name: 'wisteria', bg: '#EDDDFB', ink: '#44205E' },
  { name: 'orchid tint', bg: '#F3E8FF', ink: '#3D1F66' },
  // Pinks (hero)
  { name: 'blush petal', bg: '#FFD6E0', ink: '#5A1E33' },
  { name: 'rose water', bg: '#FFE0E6', ink: '#5E1B2E' },
  { name: 'cotton candy', bg: '#FFC8DD', ink: '#5C1A36' },
  { name: 'pink orchid', bg: '#F9DAF2', ink: '#5A1A4D' },
  { name: 'fairy floss', bg: '#FDE2F3', ink: '#5B1646' },
  // Warm pastels (header-only)
  { name: 'peach', bg: '#FFDAB9', ink: '#5A2E0E' },
  { name: 'apricot', bg: '#FFE0C2', ink: '#5C300C' },
  { name: 'coral blush', bg: '#FFD3C9', ink: '#5E2218' },
  { name: 'salmon cream', bg: '#FFDCD2', ink: '#5A2418' },
  { name: 'melon', bg: '#FFE5D0', ink: '#583012' },
  { name: 'sorbet orange', bg: '#FFE4C4', ink: '#5A300A' },
  { name: 'sand', bg: '#F5E6CC', ink: '#4A3612' },
  { name: 'champagne', bg: '#F7E7D4', ink: '#4A3418' },
  // Soft greens / teals / blue-greys (header-only)
  { name: 'sage', bg: '#D5E8D4', ink: '#1F4221' },
  { name: 'eucalyptus', bg: '#CFE8DE', ink: '#15432F' },
  { name: 'pistachio sage', bg: '#DDEBC9', ink: '#2B4318' },
  { name: 'teal wash', bg: '#C6EBE8', ink: '#0C4441' },
  { name: 'steel mist', bg: '#D4E2F0', ink: '#1C3651' },
  // Rosy violets (header-only)
  { name: 'mauve', bg: '#EBD4E4', ink: '#4E2244' },
  { name: 'dusty rose', bg: '#F2D5DA', ink: '#56202E' },
  { name: 'heather', bg: '#E2D6EC', ink: '#3A2553' },
  { name: 'apple blossom', bg: '#FCE4EC', ink: '#5B1A34' },
  { name: 'lilac frost', bg: '#E8E0F7', ink: '#33235F' },
];

/** The prompt's wording for a swatch's background colour — a name plus its
 *  hex, since providers follow a named colour more loosely than a hex and
 *  some ignore the hex entirely. */
function describeSwatch(swatch: HeaderSwatch): string {
  return `soft pastel ${swatch.name} (hex ${swatch.bg})`;
}

function hexToRgb(hex: string): [number, number, number] {
  const m = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(m.substring(i, i + 2), 16)) as [number, number, number];
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

function relativeLuminance(hex: string): number {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function hexToHsl(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s * 100, l * 100];
}

function hslToHex(h: number, s: number, l: number): string {
  const hue = ((h % 360) + 360) % 360;
  const sat = Math.min(100, Math.max(0, s)) / 100;
  const light = Math.min(100, Math.max(0, l)) / 100;
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = light - c / 2;
  let [r, g, b] = [0, 0, 0];
  if (hue < 60) [r, g, b] = [c, x, 0];
  else if (hue < 120) [r, g, b] = [x, c, 0];
  else if (hue < 180) [r, g, b] = [0, c, x];
  else if (hue < 240) [r, g, b] = [0, x, c];
  else if (hue < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

function hueDistance(a: number, b: number): number {
  return Math.abs(((a - b + 540) % 360) - 180);
}

/** The background colour the generated header actually came out in, read
 *  from its left strip — the zone every header prompt keeps as plain
 *  background for the title text. Median per channel, so the odd accent dot
 *  or a stray edge of the scene doesn't skew it. */
async function sampleHeaderBackground(imageBase64: string): Promise<string> {
  const input = Buffer.from(imageBase64, 'base64');
  const { width = 0, height = 0 } = await sharp(input).metadata();
  if (width < 10 || height < 10) throw new Error('Image too small to sample');
  const { data, info } = await sharp(input)
    .extract({
      left: Math.round(width * 0.02),
      top: Math.round(height * 0.1),
      width: Math.max(1, Math.round(width * 0.23)),
      height: Math.max(1, Math.round(height * 0.8)),
    })
    .resize(48, 48, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const channels: number[][] = [[], [], []];
  for (let i = 0; i < data.length; i += info.channels) {
    channels[0].push(data[i]);
    channels[1].push(data[i + 1]);
    channels[2].push(data[i + 2]);
  }
  const median = (vs: number[]) => vs.sort((a, b) => a - b)[Math.floor(vs.length / 2)];
  return rgbToHex(median(channels[0]), median(channels[1]), median(channels[2]));
}

const MIN_HEADER_INK_CONTRAST = 7;

/** Title/greeting ink for the background the image really has. Keeps the
 *  requested swatch's ink when the model got close enough; otherwise takes
 *  the ink of whichever swatch the sampled colour is nearest to; failing
 *  that, derives a deep same-hue tone dark enough to clear 7:1. */
function inkForBackground(sampled: string, requested: HeaderSwatch): string {
  const [sampledHue, sampledSat] = hexToHsl(sampled);
  // Hue is meaningless for a near-grey sample, so only contrast counts there.
  const nearlyGrey = sampledSat < 12;
  if (
    contrastRatio(sampled, requested.ink) >= MIN_HEADER_INK_CONTRAST &&
    (nearlyGrey || hueDistance(sampledHue, hexToHsl(requested.bg)[0]) <= 30)
  ) {
    return requested.ink;
  }

  const [sr, sg, sb] = hexToRgb(sampled);
  const distance = (s: HeaderSwatch) => {
    const [r, g, b] = hexToRgb(s.bg);
    return (r - sr) ** 2 + (g - sg) ** 2 + (b - sb) ** 2;
  };
  const nearest = HEADER_BACKGROUND_SWATCHES.reduce((best, s) => (distance(s) < distance(best) ? s : best));
  if (contrastRatio(sampled, nearest.ink) >= MIN_HEADER_INK_CONTRAST) return nearest.ink;

  const sat = Math.min(sampledSat, 60);
  for (let l = 22; l >= 6; l -= 2) {
    const ink = hslToHex(sampledHue, sat, l);
    if (contrastRatio(sampled, ink) >= MIN_HEADER_INK_CONTRAST) return ink;
  }
  return '#1A1A1A';
}


const HOME_HEADER_POSES = [
  'standing and waving a friendly hello with one raised hand',
  'walking briskly towards the college with a relaxed smile, mid-stride',
  'standing in a relaxed, confident pose with one hand resting on the strap of their bag',
  'standing with both hands casually in their pockets, chin up and smiling',
  'standing and giving a cheerful thumbs-up',
  'standing side-on and looking back over their shoulder with a smile',
  'holding a couple of books against their chest with one arm and smiling',
  'standing with arms folded loosely, smiling warmly',
  'walking while glancing at a phone in one hand, smiling',
  'standing and adjusting the strap of their bag with one hand, smiling',
];

function pickRandom<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

// Character variety. The "cheerful college student" every character prompt
// asks for (Home header, Overview tiles, the two Home banners) used to leave
// the actual look to the model with only "for example a bright top,
// contrasting trousers or skirt" as guidance. Gemini and BudgetPixel happen
// to sample a different person each run, but GPT-Image is close to
// deterministic for a fixed prompt and settled on one archetype — the same
// girl in a yellow tee, blue jeans and a backpack, generation after
// generation — so Regenerate under OpenAI produced near-duplicates. Each
// generation now draws a concrete look at random and spells it out, which
// every provider follows. Hair and bottoms are per figure so the pairing
// reads naturally (no skirts on the young man); tops and shoes are shared.
// Everything is mid-to-vivid colour so the outfit keeps standing out
// against the pastel backgrounds.
const CHARACTER_FIGURES: readonly { who: string; pronoun: string; hair: readonly string[]; bottoms: readonly string[] }[] = [
  {
    who: 'a young woman (a female college student)',
    pronoun: 'She',
    hair: [
      'long straight black hair tied back in a ponytail',
      'shoulder-length wavy dark brown hair',
      'a short black bob haircut',
      'long black hair in a single plait over one shoulder',
      'curly dark hair tied up in a high bun',
      'chin-length dark hair with a side fringe',
    ],
    bottoms: [
      'dark navy jeans',
      'a maroon pleated skirt',
      'black leggings',
      'a denim skirt',
      'white palazzo pants',
      'a teal midi skirt',
      'olive chinos',
    ],
  },
  {
    who: 'a young man (a male college student)',
    pronoun: 'He',
    hair: [
      'short neatly combed black hair',
      'a short spiky dark haircut',
      'short curly black hair',
      'a side-parted dark brown haircut',
      'a neat crew cut',
      'medium-length wavy black hair swept back',
    ],
    bottoms: [
      'dark navy jeans',
      'olive chinos',
      'grey trousers',
      'tan cargo trousers',
      'brown corduroy trousers',
      'black jeans',
      'beige linen trousers',
    ],
  },
];

const CHARACTER_TOPS = [
  'a teal polo shirt',
  'a coral hoodie',
  'a mustard cardigan over a white t-shirt',
  'a navy sweater vest over a light shirt',
  'a red checked shirt',
  'a bright green t-shirt',
  'a purple long-sleeved top',
  'a sky-blue denim jacket over a white tee',
  'a pink kurta',
  'an orange sweatshirt',
  'a white shirt with a maroon tie',
  'a striped blue-and-white t-shirt',
];

const CHARACTER_SHOES = [
  'white sneakers',
  'brown loafers',
  'red canvas shoes',
  'black ankle boots',
  'blue sandals',
  'yellow sneakers',
  'grey running shoes',
];

const CHARACTER_BACKPACK_COLOURS = ['red', 'teal', 'mustard yellow', 'purple', 'orange', 'navy blue', 'forest green'];

// Optional student props for the Overview tiles and Home banners (the Home
// header always wears a backpack, drawn in buildHomeHeaderPrompt). Every
// scene already occupies the character's hands (receipt + card, scroll,
// graduation cap + money bag…), so these are all worn or tucked — nothing
// that needs a free hand. Two empty entries make "no extra prop" a real
// outcome, so the props read as a sometimes-detail rather than a uniform.
const CHARACTER_PROPS: readonly ((colour: string) => string)[] = [
  (c) => `a ${c} college backpack on their back, its straps visible over the shoulders`,
  (c) => `a ${c} college backpack on their back, its straps visible over the shoulders`,
  (c) => `a ${c} sling bag worn across the chest`,
  (c) => `a ${c} tote bag hanging from one shoulder`,
  () => 'two or three textbooks tucked under one arm',
  (c) => `a ${c} backpack on their back and a thin notebook tucked under one arm`,
  () => '',
  () => '',
];

/** One concrete, randomly drawn look for the illustrated student.
 *
 *  `subject` is the noun phrase the prompt's opening "Depict …" sentence
 *  uses in place of a bare "college student", and `outfit` is the follow-up
 *  sentence with hair and clothes. The figure has to be named in that very
 *  first sentence: an earlier version only said "The student is a young man"
 *  a couple of sentences later, and the models had already committed to a
 *  girl by then (every OpenAI regenerate came back female regardless). */
function drawRandomCharacter(options: { withProps?: boolean } = {}): { subject: string; outfit: string } {
  const figure = pickRandom(CHARACTER_FIGURES);
  const prop = options.withProps ? pickRandom(CHARACTER_PROPS)(pickRandom(CHARACTER_BACKPACK_COLOURS)) : '';
  return {
    subject: `a cheerful college student who is ${figure.who}`,
    outfit:
      `${figure.pronoun} has ${pickRandom(figure.hair)} and wears ${pickRandom(CHARACTER_TOPS)}, ${pickRandom(figure.bottoms)} and ${pickRandom(CHARACTER_SHOES)}` +
      (prop ? `, with ${prop}` : '') +
      ' — exactly this person and this outfit.',
  };
}

// Scene strings below carry this token where the student goes, so the
// drawn figure lands in the opening sentence (see drawRandomCharacter).
const STUDENT_TOKEN = '{student}';
function withStudent(scene: string, subject: string): string {
  return scene.replace(STUDENT_TOKEN, subject);
}

// The caller picks `background` (generateTabHeaderBackground) so it can
// report the matching text colour alongside the image.
function buildHomeHeaderPrompt(
  provider: AiImageSettings['imageProvider'],
  background: HeaderSwatch,
): string {
  const pose = pickRandom(HOME_HEADER_POSES);
  const backpack = pickRandom(CHARACTER_BACKPACK_COLOURS);
  const character = drawRandomCharacter();
  // The student app shows this image at close to its natural width, anchored
  // bottom-left (the right ~1/6 is cropped), fills the room above it by
  // stretching the image's topmost strip, and draws the greeting and name over
  // its left, lower part. Hence: a plain top edge, a calm left side, and the
  // character kept inside 55–75% of the width.
  return [
    `Flat vector illustration for a mobile app header banner, wide 16:9 landscape composition, one continuous scene filling the frame edge-to-edge.`,
    `The background is a gentle college campus spread across the full width, left edge included: open sky in ${describeSwatch(background)} with a few soft rounded clouds and three to five tiny simple birds; in the middle distance a row of simple campus buildings (a main block with a small clock tower or dome, classroom wings with rows of windows) among rounded trees and shrubs; at the bottom a soft ground with a pathway and three to five tiny distant student figures walking or chatting.`,
    `Every background element — sky, clouds, birds, buildings, trees, ground and the distant students — is drawn only in light, low-contrast tints and slightly deeper shades of that same ${background.name} pastel: a washed-out, monochrome-pastel backdrop with flat shapes, no outlines, no saturated colour and no dark shapes, so it reads as a faint, airy background.`,
    'Keep the top eighth of the frame plain sky colour only — no cloud, bird, tree or building touches the top edge.',
    'The left 40% of the frame is the palest, calmest part of the scene: only faint distant buildings and trees there, no figures and no busy detail, so dark text placed over it stays easy to read.',
    `In front, depict ${character.subject}, ${pose}, wearing a ${backpack} college backpack on their back (its straps visible over the shoulders), with ${TAB_HEADER_SCENES.home}. Centre the student at about 55–75% of the frame width, standing on the ground near the bottom edge, full body and much larger than the background figures.`,
    `${character.outfit} Draw the character in a colourful, modern flat-vector app-illustration style: full body, a friendly expressive face with simple eyes and a smile, the outfit in vivid medium-saturation colours, clean rounded shapes, soft flat cel-shading. The character, their props and the SMP building are the only saturated elements in the picture and must stand out clearly against the pale pastel campus. Not abstract, not geometric, not faceless.`,
    'The building prop is compact and simple — a few flat rounded shapes, smaller than the character is tall — and its "SMP" signage must be the exact three capital letters S, M, P in a clean bold sans-serif, legible but modest in size, part of the building facade. The background campus buildings carry no signage or lettering at all.',
    imageStyleDirective(
      provider,
      `a soft monochrome-pastel campus backdrop in tints of ${background.name}, with one colourful flat-vector student in front — bright and cheerful, not dull, dark, muddy, or photorealistic`,
      '16:9',
      'SMP',
    ),
  ].join(' ');
}

// Non-Home tabs only — Home is built by buildHomeHeaderPrompt directly from
// generateTabHeaderBackground's handler. Both take the same randomly-picked
// background so every tab header shares the one "regenerate for a fresh
// colour" behaviour.
function buildTabHeaderPrompt(
  tabKey: Exclude<TabHeaderKey, 'home'>,
  provider: AiImageSettings['imageProvider'],
  background: HeaderSwatch,
): string {
  // Every non-Home tab now draws a character too, the same randomly drawn
  // look used everywhere else, named in the "Depict …" sentence itself.
  const character = drawRandomCharacter({ withProps: true });
  const scene = withStudent(TAB_HEADER_SCENES[tabKey], character.subject);
  return [
    'Flat vector illustration for a mobile app header banner, wide 16:9 landscape composition, filling the entire frame edge-to-edge as one continuous illustration — no hard vertical seam, no two separate color blocks pasted together.',
    `The entire background is one single, solid, flat ${describeSwatch(background)} across the whole frame — completely plain: no gradient, no sky, no ground line, no shadows or texture on the background, and never a dull grey pastel. No glow, no luminous or light-emitting effects, no bloom, no halos, no lens flares — just clean flat color.`,
    `Depict ${scene}, occupying roughly the right two-thirds of the frame and extending comfortably past the center, rendered in bright, medium-saturation flat colours so the scene stays cheerful and readable — never dark or heavy — and stands out clearly against the pale background. Only the leftmost quarter of the frame should stay free of strong shapes, lines, or objects — a calm zone for text — but keep it the same flat background colour, with just a few subtle flat background elements such as soft simple shapes fading in from the scene; do not make it a different or lighter wash.`,
    `${character.outfit} Give them a friendly expressive face.`,
    imageStyleDirective(provider, 'a soft pastel solid background with a colourful, medium-saturation flat-vector scene — bright and cheerful, not dull, dark, muddy, or photorealistic; no glow or luminous effects'),
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

    // Exclude whichever pastels are already saved on the OTHER 5 tab headers, so
    // regenerating never lands a tab on the same background another tab is
    // currently showing — falls back to the full pool if that ever leaves
    // nothing to pick from (pool exhausted is never allowed to block
    // generation), and gracefully ignores any sibling tab whose header
    // predates this tracking (no `{key}Color` saved yet).
    const tabHeadersSnap = await db.doc('appConfig/tabHeaders').get();
    const tabHeadersData = (tabHeadersSnap.exists ? tabHeadersSnap.data() : {}) as Record<string, unknown>;
    const inUse = new Set(
      TAB_HEADER_KEYS.filter((k) => k !== tabKey).map((k) => tabHeadersData[`${k}Color`]).filter(Boolean),
    );
    const availableSwatches = HEADER_BACKGROUND_SWATCHES.filter((s) => !inUse.has(s.bg));
    const background = pickRandom(availableSwatches.length > 0 ? availableSwatches : HEADER_BACKGROUND_SWATCHES);

    const prompt =
      tabKey === 'home'
        ? buildHomeHeaderPrompt(settings.imageProvider, background)
        : buildTabHeaderPrompt(tabKey as Exclude<TabHeaderKey, 'home'>, settings.imageProvider, background);

    try {
      const image = await generateAiImage(settings, prompt);
      // Image models only approximate the requested pastel, so the title ink
      // is matched to the colour the image actually came out in. A failed
      // sample never blocks generation — the swatch's own ink is used then.
      let textColor = background.ink;
      try {
        textColor = inkForBackground(await sampleHeaderBackground(image.imageBase64), background);
      } catch (sampleErr) {
        console.warn('Header background sampling failed; using the swatch ink', sampleErr);
      }
      // Every tab reports back `color` (an identity for whichever pool entry got
      // picked) so a sibling tab's next regenerate can exclude it, per above,
      // and `textColor` for its title (Home: the greeting and name).
      return { ...image, color: background.bg, textColor };
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

const CATEGORY_ICON_KEYS = ['circulars', 'notices', 'fees', 'certificates', 'dailyBriefing', 'scholarships'] as const;
type CategoryIconKey = (typeof CATEGORY_ICON_KEYS)[number];

// The last two aren't Overview tiles but the two full-width Home banners
// (Daily Briefing, Scholarship Info & News). Same look, but generated wide
// and composed for the short strip the banner crops out of the middle.
const CATEGORY_ICON_BANNER_KEYS: ReadonlySet<CategoryIconKey> = new Set(['dailyBriefing', 'scholarships']);
function categoryIconAspect(key: CategoryIconKey): ImageAspectRatio {
  return CATEGORY_ICON_BANNER_KEYS.has(key) ? '16:9' : '1:1';
}

// Each category keeps a recognisable prop/action so the four tiles stay
// distinguishable at a glance; the character itself is styled once, below, in
// buildCategoryIconPrompt (same colourful flat-vector look as the Home tab
// header's waving student from buildTabHeaderPrompt).
const CATEGORY_ICON_SCENES: Record<CategoryIconKey, string> = {
  circulars:
    '{student} pinning a paper flyer onto a small bulletin board, holding a few extra flyers in the other hand',
  notices:
    '{student} looking up brightly at a small ringing bell overhead, one hand raised beside their ear',
  fees:
    '{student} happily holding up a paid receipt in one hand and a payment card in the other',
  certificates:
    '{student} proudly holding up a rolled certificate scroll tied with a ribbon',
  dailyBriefing:
    '{student} stretching happily at sunrise with one arm raised, a small steaming mug on a ledge beside them, and a simple rising sun with a few short rays behind',
  scholarships:
    '{student} holding up a graduation cap in one hand and a small coin-marked money bag in the other, with a rolled award ribbon at their feet',
};

// Reference look: a course-catalogue style app card — one plain, solid soft
// pastel background per card with a single colourful illustration sitting on
// it. The background is the *only* pastel element; the character is
// deliberately vivid so it pops against it.
//
// Pool for the 4 Overview-tile categories (circulars/notices/fees/certificates) —
// one is picked at random per generation (same `pickRandom` pattern as
// CATEGORY_ICON_BANNER_PALETTES below), excluding whichever colours are
// already saved on the *other* 3 tiles (see generateCategoryIcon below), so
// regenerating gives real variety while the 4 tiles stay visually distinct
// from each other. Each entry pairs the pastel background description with
// its matching deep, saturated label-text hex (always the dark member of the
// pair — the background is always light, so the label never needs to flip
// to light text, unlike the banner pool below). The student app reads the
// chosen `label` back via appConfig/categoryIcons.{key}LabelColor (threaded
// through categoryIconService.ts's setCategoryIcon) to colour that tile's
// text to match whichever pastel got picked.
const CATEGORY_ICON_TILE_PALETTES: readonly { color: string; label: string }[] = [
  { color: 'soft pastel blush pink (a light, warm rose pink)', label: '#C2517B' },
  { color: 'soft pastel periwinkle blue (a light, lavender-tinted sky blue)', label: '#3E7CB1' },
  { color: 'soft pastel mint (a light, minty aqua-green)', label: '#3F9463' },
  { color: 'soft pastel lilac (a light lavender-purple)', label: '#8B5FBF' },
  { color: 'soft pastel peach (a light, warm apricot)', label: '#C97E2E' },
  { color: 'soft pastel butter yellow (a light, warm sunrise yellow)', label: '#A88A2E' },
  { color: 'soft pastel sage (a light, gentle sage green)', label: '#4C7A4F' },
  { color: 'soft pastel coral (a light, warm salmon-coral)', label: '#C15B41' },
];

const TILE_ICON_KEYS: readonly ('circulars' | 'notices' | 'fees' | 'certificates')[] = [
  'circulars',
  'notices',
  'fees',
  'certificates',
];

// Composition is pinned to what the student app's Overview tile needs: the
// image is rendered full-bleed behind the tile, with the label/value text
// overlaid on the LEFT third, so the character must stay in the right
// two-thirds and the left third must be plain background. A flat solid colour
// is legible under text on its own — no blur/gradient band is needed.
//
// The character direction intentionally mirrors the Home header illustration
// (full-body, expressive face, saturated outfit) rather than the earlier
// "rounded geometric shapes, minimal facial detail" wording, which produced
// muted, faceless mannequin-like figures.
// Square-tile variant only — banner keys (dailyBriefing/scholarships) are
// built by buildBannerIconPrompt directly from generateCategoryIcon's
// handler below, since that one needs the randomly-picked palette back out
// to report `textIsLight` alongside the image.
function buildCategoryIconPrompt(key: CategoryIconKey, provider: AiImageSettings['imageProvider'], color: string): string {
  const character = drawRandomCharacter({ withProps: true });
  return [
    `Flat vector illustration for a mobile app stat card, square 1:1 composition. The entire background is one single, solid, flat ${color} filling the frame edge-to-edge — completely plain: no gradient, no scene, no sky, no ground line, no shadows or texture on the background.`,
    `Depict ${withStudent(CATEGORY_ICON_SCENES[key], character.subject)}, positioned in the right two-thirds of the frame.`,
    `${character.outfit} Draw the character in a colourful, modern flat-vector app-illustration style: full body, a friendly expressive face with simple eyes and a smile, the outfit in vivid medium-saturation colours, clean rounded shapes, soft flat cel-shading. The character and their props are the only saturated elements in the picture and must stand out clearly against the pale background. Not abstract, not geometric, not faceless.`,
    'Leave the left third of the frame completely empty, plain background colour only, so text can sit on it. Optionally add two or three tiny simple accent marks (small circles or dots) near the character in a slightly darker tint of the background colour — nothing else.',
    imageStyleDirective(
      provider,
      'a soft pastel solid background with a colourful flat-vector character — bright and cheerful, not dull, dark, muddy, or photorealistic',
      '1:1',
    ),
  ].join(' ');
}

// Daily Briefing / Scholarship Info's banner backgrounds use a richer,
// more elegant palette than the Overview tiles' fixed single flat pastel —
// modelled on a reference swatch pairing a deep, muted tone with a very pale
// tint of the same family (e.g. "Blue Surf" #3B5B8A / "Saltwater Sky"
// #D0E2F2), each usable on its own as a plain solid card colour with its own
// matching text colour, not blended together. A two-tone *gradient* version
// of this was tried first, but image models reliably collapsed it back to a
// single flat colour anyway (gradients from a text prompt aren't something
// this style of flat-vector illustration reliably renders) — so this pool
// is entirely solid colours instead, each tagged with whether it's dark
// enough to need light text.
//
// One is picked at random per generation (same `pickRandom` pattern as
// HEADER_BACKGROUND_SWATCHES above), independently per banner, so Regenerate
// gives real variety instead of the same fixed colour every time. The
// student app reads back `textIsLight` (see generateCategoryIcon below,
// threaded through categoryIconService.ts's setCategoryIcon into
// appConfig/categoryIcons.{key}TextIsLight) to switch its title/subtitle
// between dark and light text to match whichever was picked.
const CATEGORY_ICON_BANNER_PALETTES: readonly { color: string; textIsLight: boolean }[] = [
  { color: 'a soft pastel powder blue (#D0E2F2)', textIsLight: false },
  { color: 'a rich, deep slate blue (#3B5B8A)', textIsLight: true },
  { color: 'a soft pastel mint (#D7ECE6)', textIsLight: false },
  { color: 'a rich, deep teal-emerald (#2F6B5E)', textIsLight: true },
  { color: 'a soft pastel dusty rose (#F3DDE2)', textIsLight: false },
  { color: 'a rich, deep mauve-plum (#7A4A63)', textIsLight: true },
  { color: 'a soft pastel warm sand (#F3E4D2)', textIsLight: false },
  { color: 'a rich, deep terracotta (#8A4B36)', textIsLight: true },
  { color: 'a soft pastel cool lilac (#E4DEF2)', textIsLight: false },
  { color: 'a rich, deep indigo-violet (#544B8A)', textIsLight: true },
  { color: 'a soft pastel sage (#DEEADB)', textIsLight: false },
  { color: 'a rich, deep forest green (#3F6B45)', textIsLight: true },
  { color: 'a soft pastel warm butter (#F5EAC9)', textIsLight: false },
  { color: 'a rich, deep amber-bronze (#8A6A2E)', textIsLight: true },
];

// Banner variant: the student app crops the 16:9 result to a short, very
// wide compact row (roughly 9:1 — considerably tighter than a standard
// banner). So the scene must sit compactly against one edge AND within a
// narrow vertical band right through the middle, or the crop takes the
// character's head or feet off.
//
// The two banners stack directly on top of each other on Home and mirror
// each other: Daily Briefing keeps its text on the left and the character
// hugging the right edge; Scholarship Info flips that (character hugging the
// left edge, text on the right — see the student app's HomeBanner `mirrored`
// prop). "Hugging the edge" is spelled out because "in the right half" left
// the character floating a quarter of the way in from the edge.
const CATEGORY_ICON_BANNER_ART_SIDE: Record<'dailyBriefing' | 'scholarships', 'left' | 'right'> = {
  dailyBriefing: 'right',
  scholarships: 'left',
};

function buildBannerIconPrompt(
  key: CategoryIconKey,
  provider: AiImageSettings['imageProvider'],
  palette: { color: string; textIsLight: boolean },
): string {
  const artSide = CATEGORY_ICON_BANNER_ART_SIDE[key as 'dailyBriefing' | 'scholarships'];
  const textSide = artSide === 'right' ? 'left' : 'right';
  const character = drawRandomCharacter({ withProps: true });
  return [
    `Flat vector illustration for a mobile app banner, wide 16:9 landscape composition. The entire background is one single, solid, flat ${palette.color} filling the frame edge-to-edge — completely plain: no gradient, no scene, no sky, no ground line, no shadows or texture on the background.`,
    `Depict ${withStudent(CATEGORY_ICON_SCENES[key], character.subject)}, placed hard against the ${artSide} edge of the frame — the character's outer side no more than about 5% of the frame's width in from the ${artSide} edge, the whole character and props contained within the ${artSide}-most 35% of the frame — and drawn small and zoomed out: the whole character and their props, from the top of their head to the bottom of their feet, must fit inside a narrow horizontal band no taller than roughly 25% of the frame's total height, centred vertically in the frame — leaving generous plain background above and below, at least a third of the frame's height clear on each side. The final banner keeps only a narrow strip through the exact vertical middle, so anything drawn above or below that central band will be cut off.`,
    `${character.outfit} Draw the character in a colourful, modern flat-vector app-illustration style: full body, a friendly expressive face with simple eyes and a smile, the outfit in vivid medium-saturation colours, clean rounded shapes, soft flat cel-shading. The character and their props are the only saturated elements in the picture and must stand out clearly against the plain background. Not abstract, not geometric, not faceless.`,
    `Leave the ${textSide} 60% of the frame completely empty, plain background colour only, so text can sit on it — nothing from the scene may cross into it. Optionally add two or three tiny simple accent marks (small circles or dots) near the character in a slightly lighter or darker tint of the background colour — nothing else.`,
    imageStyleDirective(
      provider,
      `a solid ${palette.color} background with a colourful flat-vector character — bright and cheerful, not dull, dark, muddy, or photorealistic`,
      '16:9',
    ),
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

    const isBanner = CATEGORY_ICON_BANNER_KEYS.has(key as CategoryIconKey);
    const bannerPalette = isBanner ? pickRandom(CATEGORY_ICON_BANNER_PALETTES) : null;

    // Tile keys (not banners): exclude whichever pastels are already saved on the
    // OTHER 3 tiles, so the 4 Overview tiles never end up sharing a background at
    // the same time — falls back to the full pool if that ever leaves nothing to
    // pick from (pool exhausted is never allowed to block generation).
    let tilePalette: { color: string; label: string } | null = null;
    if (!isBanner) {
      const iconsSnap = await db.doc('appConfig/categoryIcons').get();
      const iconsData = (iconsSnap.exists ? iconsSnap.data() : {}) as Record<string, unknown>;
      const inUse = new Set(
        TILE_ICON_KEYS.filter((k) => k !== key).map((k) => iconsData[`${k}LabelColor`]).filter(Boolean),
      );
      const available = CATEGORY_ICON_TILE_PALETTES.filter((p) => !inUse.has(p.label));
      tilePalette = pickRandom(available.length > 0 ? available : CATEGORY_ICON_TILE_PALETTES);
    }

    const prompt = bannerPalette
      ? buildBannerIconPrompt(key as CategoryIconKey, settings.imageProvider, bannerPalette)
      : buildCategoryIconPrompt(key as CategoryIconKey, settings.imageProvider, tilePalette!.color);

    try {
      const image = await generateAiImage(settings, prompt, categoryIconAspect(key as CategoryIconKey));
      return {
        ...image,
        textIsLight: bannerPalette?.textIsLight ?? false,
        labelColor: tilePalette?.label,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new HttpsError('internal', `Image generation failed: ${msg}`);
    }
  },
);

// ── One-off: optimise already-stored background images ──────────────────────
// Everything uploaded before the WebP pipeline above existed is a raw
// multi-megabyte PNG. This admin-triggered callable (Settings → AI Settings →
// "Optimise stored images") walks every image URL the student app consumes —
// appConfig/tabHeaders, appConfig/categoryIcons and circulars/*.backgroundImageUrl —
// re-encodes each through the same sharp pipeline, uploads the .webp sibling
// with long-lived cache headers, points the Firestore field at it, and only
// then deletes the old object. Idempotent: anything already ending in .webp
// is skipped, so it's safe to re-run after a partial failure.
interface StoredImageTarget {
  /** Human-readable label for the result report. */
  label: string;
  url: string;
  aspectRatio: ImageAspectRatio;
  /** Writes the new URL back to wherever the old one lived. */
  update: (newUrl: string) => Promise<unknown>;
}

interface OptimizeStoredImagesResult {
  converted: { label: string; from: string; to: string; bytesBefore: number; bytesAfter: number }[];
  skipped: { label: string; reason: string }[];
  failed: { label: string; error: string }[];
}

/** Extracts the bucket object path from a Firebase Storage download URL
 *  (`.../o/{encodedPath}?alt=media...`), or null if it isn't one. */
function storagePathFromDownloadUrl(url: string): string | null {
  const m = /\/o\/([^?]+)/.exec(url);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return null;
  }
}

async function optimizeOneStoredImage(target: StoredImageTarget): Promise<
  { status: 'converted'; from: string; to: string; bytesBefore: number; bytesAfter: number } |
  { status: 'skipped'; reason: string }
> {
  const oldPath = storagePathFromDownloadUrl(target.url);
  if (!oldPath) return { status: 'skipped', reason: 'not a Firebase Storage download URL' };
  if (/\.webp$/i.test(oldPath)) return { status: 'skipped', reason: 'already WebP' };

  const bucket = admin.storage().bucket();
  const oldFile = bucket.file(oldPath);
  const [exists] = await oldFile.exists();
  if (!exists) return { status: 'skipped', reason: `object not found: ${oldPath}` };

  const [original] = await oldFile.download();
  const optimized = await optimizeImageBuffer(original, target.aspectRatio);

  const newPath = oldPath.replace(/\.[a-z0-9]+$/i, '') + '.webp';
  // Client-side getDownloadURL() mints this token automatically; the Admin
  // SDK doesn't, so set it explicitly to produce the same tokenised URL shape
  // the rest of the app (and storage.rules) already relies on.
  const token = crypto.randomUUID();
  await bucket.file(newPath).save(optimized, {
    metadata: {
      contentType: OPTIMIZED_IMAGE_MIME,
      cacheControl: OPTIMIZED_CACHE_CONTROL,
      metadata: { firebaseStorageDownloadTokens: token },
    },
    resumable: false,
  });
  const newUrl =
    `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(newPath)}` +
    `?alt=media&token=${token}`;

  await target.update(newUrl);

  // Firestore now points at the WebP; the old PNG is unreferenced and can go.
  // Best-effort — an orphaned file is harmless, a failed migration isn't.
  try {
    await oldFile.delete();
  } catch (err) {
    console.warn(`optimizeStoredImages: could not delete old object ${oldPath}`, err);
  }

  return { status: 'converted', from: oldPath, to: newPath, bytesBefore: original.length, bytesAfter: optimized.length };
}

export const optimizeStoredImages = onCall(
  { region: 'asia-south1', timeoutSeconds: 540, memory: '1GiB' },
  async (request): Promise<OptimizeStoredImagesResult> => {
    if (request.auth?.token?.admin !== true) {
      throw new HttpsError('permission-denied', 'Admin sign-in required.');
    }

    const targets: StoredImageTarget[] = [];

    const tabHeadersRef = db.doc('appConfig/tabHeaders');
    const tabHeaders = (await tabHeadersRef.get()).data() ?? {};
    for (const key of TAB_HEADER_KEYS) {
      const url = tabHeaders[key];
      if (typeof url === 'string' && url) {
        targets.push({
          label: `tabHeaders/${key}`,
          url,
          aspectRatio: '16:9',
          update: (newUrl) => tabHeadersRef.set({ [key]: newUrl }, { merge: true }),
        });
      }
    }

    const categoryIconsRef = db.doc('appConfig/categoryIcons');
    const categoryIcons = (await categoryIconsRef.get()).data() ?? {};
    for (const key of CATEGORY_ICON_KEYS) {
      const url = categoryIcons[key];
      if (typeof url === 'string' && url) {
        targets.push({
          label: `categoryIcons/${key}`,
          url,
          aspectRatio: categoryIconAspect(key),
          update: (newUrl) => categoryIconsRef.set({ [key]: newUrl }, { merge: true }),
        });
      }
    }

    const circularsSnap = await db.collection('circulars').get();
    for (const snap of circularsSnap.docs) {
      const url = snap.get('backgroundImageUrl');
      if (typeof url === 'string' && url) {
        targets.push({
          label: `circulars/${snap.id}`,
          url,
          aspectRatio: '16:9',
          update: (newUrl) => snap.ref.update({ backgroundImageUrl: newUrl }),
        });
      }
    }

    const result: OptimizeStoredImagesResult = { converted: [], skipped: [], failed: [] };
    // Sequential on purpose: each conversion holds a multi-MB decode in
    // memory, and there are at most a few dozen images — well inside the
    // 540 s ceiling without needing to parallelise.
    for (const target of targets) {
      try {
        const outcome = await optimizeOneStoredImage(target);
        if (outcome.status === 'converted') {
          const { status: _status, ...rest } = outcome;
          result.converted.push({ label: target.label, ...rest });
        } else {
          result.skipped.push({ label: target.label, reason: outcome.reason });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`optimizeStoredImages: ${target.label} failed`, err);
        result.failed.push({ label: target.label, error: msg });
      }
    }
    return result;
  },
);
