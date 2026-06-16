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
exports.generateAdmissionSummary = exports.sendBulkSMS = void 0;
const admin = __importStar(require("firebase-admin"));
const https_1 = require("firebase-functions/v2/https");
const https = __importStar(require("https"));
admin.initializeApp();
const db = admin.firestore();
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
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2, _3, _4, _5, _6, _7, _8, _9, _10, _11, _12, _13, _14, _15, _16, _17, _18, _19, _20, _21, _22, _23;
        const hasPrev = !!p.prevAcademicYear && p.prevTotal !== undefined;
        // ── helper: course row for Boys/Girls ────────────────────────────────
        const genderCourseRow = (gender, src) => ['CE', 'ME', 'EC', 'CS', 'EE'].map((c) => { var _a, _b; return `${c}:${(_b = (_a = src === null || src === void 0 ? void 0 : src[gender]) === null || _a === void 0 ? void 0 : _a[c]) !== null && _b !== void 0 ? _b : 0}`; }).join(', ');
        const YEAR_INTAKE = 63;
        // ── Determine which data represents the current academic year ─────────
        // If user has current year selected, activeBlock IS the current year.
        // Otherwise current year comes from the currentYear* fields.
        const activeIsCurrent = !!p.currentAcademicYear && p.academicYear === p.currentAcademicYear;
        const cyTotal = activeIsCurrent ? p.total : ((_a = p.currentYearTotal) !== null && _a !== void 0 ? _a : 0);
        const cyBoys = activeIsCurrent ? p.boys : ((_b = p.currentYearBoys) !== null && _b !== void 0 ? _b : 0);
        const cyGirls = activeIsCurrent ? p.girls : ((_c = p.currentYearGirls) !== null && _c !== void 0 ? _c : 0);
        const cyCourse = activeIsCurrent ? p.byCourse : ((_d = p.currentYearByCourse) !== null && _d !== void 0 ? _d : {});
        const cyLabel = p.currentAcademicYear || p.academicYear || 'Current Year';
        const cyBoysPerCourse = activeIsCurrent ? genderCourseRow('BOY', p.byGenderByCourse) : ['CE', 'ME', 'EC', 'CS', 'EE'].map((c) => { var _a, _b, _c; return `${c}:${((_c = (_b = (_a = p.byGenderByCourse) === null || _a === void 0 ? void 0 : _a['BOY']) === null || _b === void 0 ? void 0 : _b[c]) !== null && _c !== void 0 ? _c : 0)}`; }).join(', ');
        const cyGirlsPerCourse = activeIsCurrent ? genderCourseRow('GIRL', p.byGenderByCourse) : ['CE', 'ME', 'EC', 'CS', 'EE'].map((c) => { var _a, _b, _c; return `${c}:${((_c = (_b = (_a = p.byGenderByCourse) === null || _a === void 0 ? void 0 : _a['GIRL']) === null || _b === void 0 ? void 0 : _b[c]) !== null && _c !== void 0 ? _c : 0)}`; }).join(', ');
        // ── SECTION 1 — Current academic year (PRIMARY FOCUS) ────────────────
        const y1 = activeIsCurrent ? ((_e = p.byYear['1ST YEAR']) !== null && _e !== void 0 ? _e : 0) : 0;
        const y2 = activeIsCurrent ? ((_f = p.byYear['2ND YEAR']) !== null && _f !== void 0 ? _f : 0) : 0;
        const y3 = activeIsCurrent ? ((_g = p.byYear['3RD YEAR']) !== null && _g !== void 0 ? _g : 0) : 0;
        const currentYearBlock = [
            `*** CURRENT ACADEMIC YEAR — ${cyLabel} (PRIMARY — generate most insights from this) ***`,
            `  Total confirmed: ${cyTotal} students — ${cyBoys} boys, ${cyGirls} girls`,
            `  By course — CE:${(_h = cyCourse['CE']) !== null && _h !== void 0 ? _h : 0}, ME:${(_j = cyCourse['ME']) !== null && _j !== void 0 ? _j : 0}, EC:${(_k = cyCourse['EC']) !== null && _k !== void 0 ? _k : 0}, CS:${(_l = cyCourse['CS']) !== null && _l !== void 0 ? _l : 0}, EE:${(_m = cyCourse['EE']) !== null && _m !== void 0 ? _m : 0}`,
            `  Boys per course  — ${cyBoysPerCourse}`,
            `  Girls per course — ${cyGirlsPerCourse}`,
            ...(activeIsCurrent && p.byCategory ? [
                `  Category — GM:${(_o = p.byCategory['GM']) !== null && _o !== void 0 ? _o : 0}, SC:${(_p = p.byCategory['SC']) !== null && _p !== void 0 ? _p : 0}, ST:${(_q = p.byCategory['ST']) !== null && _q !== void 0 ? _q : 0}, C1:${(_r = p.byCategory['C1']) !== null && _r !== void 0 ? _r : 0}, 2A:${(_s = p.byCategory['2A']) !== null && _s !== void 0 ? _s : 0}, 2B:${(_t = p.byCategory['2B']) !== null && _t !== void 0 ? _t : 0}, 3A:${(_u = p.byCategory['3A']) !== null && _u !== void 0 ? _u : 0}, 3B:${(_v = p.byCategory['3B']) !== null && _v !== void 0 ? _v : 0}`,
            ] : []),
            ...(activeIsCurrent ? [
                `  Admission type — Regular:${(_w = p.byAdmType['REGULAR']) !== null && _w !== void 0 ? _w : 0}, Lateral:${(_x = p.byAdmType['LATERAL']) !== null && _x !== void 0 ? _x : 0}, Repeater:${(_y = p.byAdmType['REPEATER']) !== null && _y !== void 0 ? _y : 0}, SNQ:${(_z = p.byAdmType['SNQ']) !== null && _z !== void 0 ? _z : 0}`,
                `  Adm seats — GM:${(_1 = (_0 = p.byAdmCat) === null || _0 === void 0 ? void 0 : _0['GM']) !== null && _1 !== void 0 ? _1 : 0}, SNQ:${(_3 = (_2 = p.byAdmCat) === null || _2 === void 0 ? void 0 : _2['SNQ']) !== null && _3 !== void 0 ? _3 : 0}`,
                `  Study year — 1ST YEAR:${y1} (${Math.round(y1 / YEAR_INTAKE * 100)}% of ${YEAR_INTAKE} seats), 2ND YEAR:${y2}, 3RD YEAR:${y3}`,
                `  Pending (not yet confirmed): ${p.pendingTotal} (${p.pendingRegular} regular, ${p.pendingLateral} lateral)`,
                ...(p.recentEnrollmentsCount !== undefined ? [`  New in last 7 days: ${p.recentEnrollmentsCount} students`] : []),
            ] : []),
        ].join('\n');
        // ── SECTION 2 — Course × Year matrix (current year if available) ──────
        const matrixBlock = (activeIsCurrent && p.byCourseByYear)
            ? ['  Course × Year breakdown (current year):',
                ...['CE', 'ME', 'EC', 'CS', 'EE'].map((c) => {
                    var _a, _b, _c, _d;
                    const row = (_a = p.byCourseByYear[c]) !== null && _a !== void 0 ? _a : {};
                    return `    ${c}: 1ST YEAR=${(_b = row['1ST YEAR']) !== null && _b !== void 0 ? _b : 0}, 2ND YEAR=${(_c = row['2ND YEAR']) !== null && _c !== void 0 ? _c : 0}, 3RD YEAR=${(_d = row['3RD YEAR']) !== null && _d !== void 0 ? _d : 0}`;
                }),
            ].join('\n')
            : '';
        // ── SECTION 3 — All-years cumulative (SECONDARY CONTEXT) ─────────────
        const overallBlock = (p.overallTotal !== undefined && p.overallTotal !== cyTotal) ? [
            `*** ALL YEARS COMBINED (secondary context only) ***`,
            `  Total ever enrolled: ${p.overallTotal} students — ${(_4 = p.overallBoys) !== null && _4 !== void 0 ? _4 : 0} boys, ${(_5 = p.overallGirls) !== null && _5 !== void 0 ? _5 : 0} girls`,
            `  By course — CE:${(_7 = (_6 = p.overallByCourse) === null || _6 === void 0 ? void 0 : _6['CE']) !== null && _7 !== void 0 ? _7 : 0}, ME:${(_9 = (_8 = p.overallByCourse) === null || _8 === void 0 ? void 0 : _8['ME']) !== null && _9 !== void 0 ? _9 : 0}, EC:${(_11 = (_10 = p.overallByCourse) === null || _10 === void 0 ? void 0 : _10['EC']) !== null && _11 !== void 0 ? _11 : 0}, CS:${(_13 = (_12 = p.overallByCourse) === null || _12 === void 0 ? void 0 : _12['CS']) !== null && _13 !== void 0 ? _13 : 0}, EE:${(_15 = (_14 = p.overallByCourse) === null || _14 === void 0 ? void 0 : _14['EE']) !== null && _15 !== void 0 ? _15 : 0}`,
            `  Boys  — ${genderCourseRow('BOY', p.overallByGenderByCourse)}`,
            `  Girls — ${genderCourseRow('GIRL', p.overallByGenderByCourse)}`,
            ...(p.overallByCategory ? [
                `  Category — GM:${(_16 = p.overallByCategory['GM']) !== null && _16 !== void 0 ? _16 : 0}, SC:${(_17 = p.overallByCategory['SC']) !== null && _17 !== void 0 ? _17 : 0}, ST:${(_18 = p.overallByCategory['ST']) !== null && _18 !== void 0 ? _18 : 0}, C1:${(_19 = p.overallByCategory['C1']) !== null && _19 !== void 0 ? _19 : 0}, 2A:${(_20 = p.overallByCategory['2A']) !== null && _20 !== void 0 ? _20 : 0}, 2B:${(_21 = p.overallByCategory['2B']) !== null && _21 !== void 0 ? _21 : 0}, 3A:${(_22 = p.overallByCategory['3A']) !== null && _22 !== void 0 ? _22 : 0}, 3B:${(_23 = p.overallByCategory['3B']) !== null && _23 !== void 0 ? _23 : 0}`,
            ] : []),
        ].join('\n') : '';
        // ── SECTION 4 — Year-over-year comparison ────────────────────────────
        const prevBlock = hasPrev ? (() => {
            var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o;
            const base = activeIsCurrent ? p.total : cyTotal;
            const diff = base - ((_a = p.prevTotal) !== null && _a !== void 0 ? _a : 0);
            const sign = diff >= 0 ? '+' : '';
            const pct = p.prevTotal ? Math.round((diff / p.prevTotal) * 100) : 0;
            return [
                `*** YEAR-OVER-YEAR COMPARISON ***`,
                `  Previous year (${p.prevAcademicYear}): ${p.prevTotal} students — ${(_b = p.prevBoys) !== null && _b !== void 0 ? _b : 0} boys, ${(_c = p.prevGirls) !== null && _c !== void 0 ? _c : 0} girls`,
                `  Prev courses — CE:${(_e = (_d = p.prevByCourse) === null || _d === void 0 ? void 0 : _d['CE']) !== null && _e !== void 0 ? _e : 0}, ME:${(_g = (_f = p.prevByCourse) === null || _f === void 0 ? void 0 : _f['ME']) !== null && _g !== void 0 ? _g : 0}, EC:${(_j = (_h = p.prevByCourse) === null || _h === void 0 ? void 0 : _h['EC']) !== null && _j !== void 0 ? _j : 0}, CS:${(_l = (_k = p.prevByCourse) === null || _k === void 0 ? void 0 : _k['CS']) !== null && _l !== void 0 ? _l : 0}, EE:${(_o = (_m = p.prevByCourse) === null || _m === void 0 ? void 0 : _m['EE']) !== null && _o !== void 0 ? _o : 0}`,
                `  Change vs ${cyLabel}: ${sign}${diff} students (${sign}${pct}%)`,
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
            `Generate exactly 15 insights: 10–11 about admission statistics and 4–5 tips about app features, interleaved (do NOT group all tips at the end).`,
            '',
            'PRIORITY RULE: The section marked "CURRENT ACADEMIC YEAR" is your PRIMARY data source.',
            'AT LEAST 7 of your statistics insights MUST be about the current academic year specifically.',
            'Use the overall/all-years data only for 1–2 additional context insights (e.g. cumulative totals).',
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
            `REQUIRED STATISTICS TOPICS for ${cyLabel} (cover ALL of these using the CURRENT YEAR data):`,
            `  1. Total confirmed students in ${cyLabel} with boys/girls split`,
            `  2. Boys per course in ${cyLabel} — which course has the most boys`,
            `  3. Girls per course in ${cyLabel} — which course has the most/least girls`,
            `  4. Which course has the highest total enrollment in ${cyLabel}`,
            `  5. Which course has the lowest enrollment in ${cyLabel}`,
            ...(activeIsCurrent && p.byCategory ? [
                `  6. Category breakdown in ${cyLabel} — highlight SC/ST or GM counts`,
                `  7. Admission type mix in ${cyLabel} — regular vs lateral vs SNQ`,
                `  8. Study year breakdown — 1ST YEAR vs 2ND YEAR vs 3RD YEAR fill rate`,
                `  9. Pending admissions in ${cyLabel} — students not yet confirmed`,
                ...(p.recentEnrollmentsCount !== undefined ? [`  10. New students confirmed in the last 7 days`] : []),
            ] : [`  6. Total combined enrollment across all years for broader context`]),
            ...(hasPrev ? [`  (Additional) Year-over-year change: ${cyLabel} vs ${p.prevAcademicYear}`] : []),
            '',
            'APP TIP TOPICS (exactly 4–5 of these, interleaved with statistics):',
            '  • How to search a student and issue a TC or certificate from the Dashboard',
            '  • How to use the year chips or filters to view specific batches or course data',
            '  • How to enroll a new student or edit an existing student record',
            '  • How to collect a fee or view payment history in the Fee Register',
            '  • What is in the About section and who built this app',
            '',
            'OUTPUT FORMAT — return ONLY a valid JSON array of exactly 15 objects. No markdown, no explanation, no trailing text.',
            'Each object must have exactly these 4 keys:',
            '  title    — short English title (2–4 words)',
            '  titleKn  — same title in Kannada (2–4 words)',
            '  en       — one clear English sentence with exact numbers from the data',
            '  kn       — same sentence in natural Kannada (keep course codes, year labels, and feature names in English)',
            '',
            APP_FEATURES,
            '',
            '=== ADMISSION DATA ===',
            currentYearBlock,
            ...(matrixBlock ? ['', matrixBlock] : []),
            ...(overallBlock ? ['', overallBlock] : []),
            ...(prevBlock ? ['', prevBlock] : []),
        ].join('\n');
        const body = JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: 5000,
            messages: [{ role: 'user', content: prompt }],
        });
        const req = https.request({
            hostname: 'api.anthropic.com',
            path: '/v1/messages',
            method: 'POST',
            headers: {
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
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
exports.generateAdmissionSummary = (0, https_1.onCall)({ region: 'asia-south1', timeoutSeconds: 90 }, async (request) => {
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