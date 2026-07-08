"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateAdmissionSummary = exports.sendBulkSMS = exports.syncMyAdminClaim = exports.syncAdminClaim = void 0;
const admin = __importStar(require("firebase-admin"));
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-functions/v2/firestore");
const https = __importStar(require("https"));
admin.initializeApp();
const db = admin.firestore();
// ── Sync Firestore role/active onto the Auth custom claim `admin` ──────────
// Storage Security Rules can't read Firestore documents, so admin-only Storage
// writes (e.g. remittance challan uploads) are gated on this claim instead.
exports.syncAdminClaim = (0, firestore_1.onDocumentWritten)('users/{uid}', async (event) => {
    var _a;
    const { uid } = event.params;
    const after = ((_a = event.data) === null || _a === void 0 ? void 0 : _a.after.exists) ? event.data.after.data() : null;
    const isAdmin = !!after && after.role === 'admin' && after.active !== false;
    try {
        await admin.auth().setCustomUserClaims(uid, { admin: isAdmin });
    }
    catch (err) {
        console.error(`syncAdminClaim: failed to set claims for ${uid}`, err);
    }
});
// Self-service: lets the signed-in caller re-sync their own admin claim from
// their own Firestore users/{uid} doc, without needing another doc write to
// fire syncAdminClaim (useful right after the very first deploy, or if a
// user's token is stale). Only ever touches the caller's own uid.
exports.syncMyAdminClaim = (0, https_1.onCall)({ region: 'asia-south1' }, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Must be signed in');
    const uid = request.auth.uid;
    const snap = await db.collection('users').doc(uid).get();
    const data = snap.exists ? snap.data() : null;
    const isAdmin = !!data && data.role === 'admin' && data.active !== false;
    await admin.auth().setCustomUserClaims(uid, { admin: isAdmin });
    return { admin: isAdmin };
});
const MOBILE_RE = /^[6-9]\d{9}$/;
function interpolate(template, r) {
    return template
        .replace(/\{name\}/g, r.name)
        .replace(/\{father\}/g, r.fatherName)
        .replace(/\{reg\}/g, r.reg)
        .replace(/\{course\}/g, r.course)
        .replace(/\{year\}/g, r.year)
        .replace(/\{academicYear\}/g, r.academicYear)
        .replace(/\{dueAmount\}/g, r.dueAmount > 0 ? `Rs.${r.dueAmount}` : 'Nil');
}
function callFast2SMS(apiKey, senderId, message, numbers) {
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
            res.on('data', (chunk) => { data += chunk.toString(); });
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve(parsed.return === true);
                }
                catch (_a) {
                    resolve(false);
                }
            });
        });
        req.on('error', () => resolve(false));
        req.write(body);
        req.end();
    });
}
exports.sendBulkSMS = (0, https_1.onCall)({ region: 'asia-south1', timeoutSeconds: 300 }, async (request) => {
    var _a, _b, _c, _d;
    // 1. Auth check
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'You must be signed in.');
    }
    // 2. Admin role check
    const userSnap = await db.doc(`users/${request.auth.uid}`).get();
    if (!userSnap.exists || ((_a = userSnap.data()) === null || _a === void 0 ? void 0 : _a.role) !== 'admin') {
        throw new https_1.HttpsError('permission-denied', 'Admin access required.');
    }
    // 3. Load Fast2SMS config
    const configSnap = await db.doc('adminConfig/messaging').get();
    if (!configSnap.exists) {
        throw new https_1.HttpsError('failed-precondition', 'Fast2SMS API key not configured. Go to Settings → Messaging.');
    }
    const { fast2smsApiKey, senderId } = configSnap.data();
    if (!(fast2smsApiKey === null || fast2smsApiKey === void 0 ? void 0 : fast2smsApiKey.trim())) {
        throw new https_1.HttpsError('failed-precondition', 'Fast2SMS API key is empty.');
    }
    // 4. Validate input
    const { recipients } = request.data;
    if (!Array.isArray(recipients) || recipients.length === 0) {
        throw new https_1.HttpsError('invalid-argument', 'No recipients provided.');
    }
    // 5. Expand templates and group by interpolated message text
    //    (same message → one API call with all numbers in that group)
    const messageGroups = new Map();
    for (const r of recipients) {
        const msg = interpolate(r.messageTemplate, r);
        for (const phone of r.phones) {
            if (!MOBILE_RE.test(phone))
                continue;
            const existing = (_b = messageGroups.get(msg)) !== null && _b !== void 0 ? _b : [];
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
            const ok = await callFast2SMS(fast2smsApiKey.trim(), (senderId === null || senderId === void 0 ? void 0 : senderId.trim()) || 'SMPCLG', msg, chunk);
            if (ok)
                successCount += chunk.length;
            else
                failCount += chunk.length;
        }
    }
    // 7. Write audit log
    await db.collection('smsLogs').add({
        sentBy: request.auth.uid,
        recipientCount: successCount + failCount,
        successCount,
        failCount,
        preview: (_d = (_c = [...messageGroups.keys()][0]) === null || _c === void 0 ? void 0 : _c.slice(0, 120)) !== null && _d !== void 0 ? _d : '',
        sentAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { successCount, failCount, total: successCount + failCount };
});
function callClaude(apiKey, p) {
    return new Promise((resolve, reject) => {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2;
        const hasPrev = !!p.prevAcademicYear && p.prevTotal !== undefined;
        const COURSES = ['CE', 'ME', 'EC', 'CS', 'EE'];
        const MAX_SEATS = 63;
        // ── Resolve current-year data ────────────────────────────────────────
        // When the active Dashboard filter IS the current year, the main stats
        // already represent it. Otherwise pull from the dedicated currentYear* fields.
        const activeIsCurrent = !!p.currentAcademicYear && p.academicYear === p.currentAcademicYear;
        const cyTotal = activeIsCurrent ? p.total : ((_a = p.currentYearTotal) !== null && _a !== void 0 ? _a : 0);
        const cyBoys = activeIsCurrent ? p.boys : ((_b = p.currentYearBoys) !== null && _b !== void 0 ? _b : 0);
        const cyGirls = activeIsCurrent ? p.girls : ((_c = p.currentYearGirls) !== null && _c !== void 0 ? _c : 0);
        const cyCourse = activeIsCurrent ? p.byCourse : ((_d = p.currentYearByCourse) !== null && _d !== void 0 ? _d : {});
        const cyLabel = p.currentAcademicYear || p.academicYear || 'Current Year';
        const cyBoysMap = activeIsCurrent ? ((_f = (_e = p.byGenderByCourse) === null || _e === void 0 ? void 0 : _e['BOY']) !== null && _f !== void 0 ? _f : {}) : {};
        const cyGirlsMap = activeIsCurrent ? ((_h = (_g = p.byGenderByCourse) === null || _g === void 0 ? void 0 : _g['GIRL']) !== null && _h !== void 0 ? _h : {}) : {};
        // ── Pre-compute richer analytics ─────────────────────────────────────
        const courseTotal = (c) => { var _a; return (_a = cyCourse[c]) !== null && _a !== void 0 ? _a : 0; };
        const courseBoys = (c) => { var _a; return (_a = cyBoysMap[c]) !== null && _a !== void 0 ? _a : 0; };
        const courseGirls = (c) => { var _a; return (_a = cyGirlsMap[c]) !== null && _a !== void 0 ? _a : 0; };
        const fillPct = (c) => Math.round(courseTotal(c) / MAX_SEATS * 100);
        const girlPct = (c) => {
            const t = courseTotal(c);
            return t > 0 ? Math.round(courseGirls(c) / t * 100) : 0;
        };
        const coursesByTotal = [...COURSES].sort((a, b) => courseTotal(b) - courseTotal(a));
        const coursesByGirlPct = [...COURSES].filter(c => courseTotal(c) > 0)
            .sort((a, b) => girlPct(b) - girlPct(a));
        const topCourse = coursesByTotal[0];
        const bottomCourse = coursesByTotal[coursesByTotal.length - 1];
        const mostGirlsCourse = coursesByGirlPct[0];
        const leastGirlsCourse = coursesByGirlPct[coursesByGirlPct.length - 1];
        // Category analytics
        const catMap = activeIsCurrent ? ((_j = p.byCategory) !== null && _j !== void 0 ? _j : {}) : {};
        const catTotal = Object.values(catMap).reduce((s, v) => s + v, 0);
        const gmCount = (_k = catMap['GM']) !== null && _k !== void 0 ? _k : 0;
        const scCount = (_l = catMap['SC']) !== null && _l !== void 0 ? _l : 0;
        const stCount = (_m = catMap['ST']) !== null && _m !== void 0 ? _m : 0;
        const obcCount = ((_o = catMap['2A']) !== null && _o !== void 0 ? _o : 0) + ((_p = catMap['2B']) !== null && _p !== void 0 ? _p : 0) + ((_q = catMap['3A']) !== null && _q !== void 0 ? _q : 0) + ((_r = catMap['3B']) !== null && _r !== void 0 ? _r : 0);
        const reservedCount = catTotal - gmCount;
        const reservedPct = catTotal > 0 ? Math.round(reservedCount / catTotal * 100) : 0;
        const gmPct = catTotal > 0 ? Math.round(gmCount / catTotal * 100) : 0;
        // Study-year data
        const y1 = activeIsCurrent ? ((_s = p.byYear['1ST YEAR']) !== null && _s !== void 0 ? _s : 0) : 0;
        const y2 = activeIsCurrent ? ((_t = p.byYear['2ND YEAR']) !== null && _t !== void 0 ? _t : 0) : 0;
        const y3 = activeIsCurrent ? ((_u = p.byYear['3RD YEAR']) !== null && _u !== void 0 ? _u : 0) : 0;
        const y1FillPct = Math.round(y1 / MAX_SEATS * 100);
        // Year-over-year analytics
        const cyYoYBase = activeIsCurrent ? p.total : cyTotal;
        const yoyDiff = hasPrev ? cyYoYBase - ((_v = p.prevTotal) !== null && _v !== void 0 ? _v : 0) : 0;
        const yoySign = yoyDiff >= 0 ? '+' : '';
        const yoyPct = hasPrev && p.prevTotal ? Math.round(yoyDiff / p.prevTotal * 100) : 0;
        const courseYoY = hasPrev
            ? COURSES.map(c => {
                var _a, _b;
                const d = courseTotal(c) - ((_b = (_a = p.prevByCourse) === null || _a === void 0 ? void 0 : _a[c]) !== null && _b !== void 0 ? _b : 0);
                return `${c}: ${d >= 0 ? '+' : ''}${d}`;
            }).join(', ')
            : '';
        // Overall all-years analytics
        const hasOverall = p.overallTotal !== undefined && p.overallTotal !== cyTotal;
        const ovGirlPct = hasOverall && p.overallTotal
            ? Math.round(((_w = p.overallGirls) !== null && _w !== void 0 ? _w : 0) / p.overallTotal * 100) : 0;
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
            `  Overall: ${cyTotal} confirmed (${cyBoys} boys ${cyGirls} girls; ${cyTotal > 0 ? Math.round(cyGirls / cyTotal * 100) : 0}% girls overall)`,
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
                `  Admission type: Regular ${(_x = p.byAdmType['REGULAR']) !== null && _x !== void 0 ? _x : 0}, Lateral ${(_y = p.byAdmType['LATERAL']) !== null && _y !== void 0 ? _y : 0}, Repeater ${(_z = p.byAdmType['REPEATER']) !== null && _z !== void 0 ? _z : 0}, SNQ ${(_0 = p.byAdmType['SNQ']) !== null && _0 !== void 0 ? _0 : 0}`,
                `  Study year: 1ST YEAR ${y1} (${y1FillPct}% of ${MAX_SEATS} seats), 2ND YEAR ${y2}, 3RD YEAR ${y3}`,
                `  Pending: ${p.pendingTotal} not yet confirmed (${p.pendingRegular} regular, ${p.pendingLateral} lateral)`,
                ...(p.recentEnrollmentsCount !== undefined ? [`  Last 7 days: ${p.recentEnrollmentsCount} new confirmations`] : []),
            ] : []),
            ...(hasPrev ? [
                `  YoY vs ${p.prevAcademicYear}: ${yoySign}${yoyDiff} students (${yoySign}${yoyPct}%) — by course: ${courseYoY}`,
            ] : []),
            ...(hasOverall ? [
                `  All-years cumulative: ${p.overallTotal} students ever (${(_1 = p.overallBoys) !== null && _1 !== void 0 ? _1 : 0} boys, ${(_2 = p.overallGirls) !== null && _2 !== void 0 ? _2 : 0} girls, ${ovGirlPct}% girls)`,
                `  All-years by course: ${COURSES.map(c => { var _a, _b; return `${c}:${(_b = (_a = p.overallByCourse) === null || _a === void 0 ? void 0 : _a[c]) !== null && _b !== void 0 ? _b : 0}`; }).join(', ')}`,
            ] : []),
            ...(activeIsCurrent && p.byCourseByYear ? [
                `  Course × Year matrix: ${COURSES.map(c => {
                    var _a, _b, _c, _d;
                    const row = (_a = p.byCourseByYear[c]) !== null && _a !== void 0 ? _a : {};
                    return `${c}[1Y:${(_b = row['1ST YEAR']) !== null && _b !== void 0 ? _b : 0} 2Y:${(_c = row['2ND YEAR']) !== null && _c !== void 0 ? _c : 0} 3Y:${(_d = row['3RD YEAR']) !== null && _d !== void 0 ? _d : 0}]`;
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
        const req = https.request({
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
        }, (res) => {
            let raw = '';
            res.on('data', (chunk) => { raw += chunk.toString(); });
            res.on('end', () => {
                var _a, _b, _c, _d, _e;
                try {
                    // Surface HTTP-level errors from Anthropic (4xx / 5xx)
                    if (res.statusCode !== 200) {
                        let apiMsg = `HTTP ${res.statusCode}`;
                        try {
                            const errBody = JSON.parse(raw);
                            if ((_a = errBody.error) === null || _a === void 0 ? void 0 : _a.message)
                                apiMsg += `: ${errBody.error.message}`;
                        }
                        catch ( /* raw may not be JSON */_f) { /* raw may not be JSON */ }
                        reject(new Error(apiMsg));
                        return;
                    }
                    const parsed = JSON.parse(raw);
                    const rawText = (_e = (_d = (_c = (_b = parsed.content) === null || _b === void 0 ? void 0 : _b[0]) === null || _c === void 0 ? void 0 : _c.text) === null || _d === void 0 ? void 0 : _d.trim()) !== null && _e !== void 0 ? _e : '';
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
                    const insights = JSON.parse(match[0]);
                    if (!Array.isArray(insights) || insights.length === 0) {
                        reject(new Error('Empty insights array'));
                        return;
                    }
                    resolve(insights);
                }
                catch (err) {
                    reject(err);
                }
            });
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}
exports.generateAdmissionSummary = (0, https_1.onCall)({ region: 'asia-south1', timeoutSeconds: 300 }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Sign in required.');
    }
    const configSnap = await db.doc('adminConfig/aiSettings').get();
    if (!configSnap.exists) {
        throw new https_1.HttpsError('failed-precondition', 'AI not configured. Add anthropicApiKey to adminConfig/aiSettings in Firestore.');
    }
    const { anthropicApiKey } = configSnap.data();
    if (!(anthropicApiKey === null || anthropicApiKey === void 0 ? void 0 : anthropicApiKey.trim())) {
        throw new https_1.HttpsError('failed-precondition', 'Anthropic API key is empty.');
    }
    const payload = request.data;
    if (typeof payload.total !== 'number') {
        throw new https_1.HttpsError('invalid-argument', 'Invalid stats payload.');
    }
    try {
        const insights = await callClaude(anthropicApiKey.trim(), payload);
        return { insights, generatedAt: new Date().toISOString() };
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new https_1.HttpsError('internal', `AI generation failed: ${msg}`);
    }
});
//# sourceMappingURL=index.js.map