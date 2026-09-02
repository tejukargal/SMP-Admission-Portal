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
exports.generateDailyMotivation = exports.generateStudentAISummary = exports.generateAdmissionSummary = exports.sendBulkSMS = exports.studentLogin = exports.syncMyAdminClaim = exports.syncAdminClaim = exports.checkPlayStoreRelease = exports.notifyOnStudentNotification = exports.notifyOnCircularUpdated = exports.notifyOnNewCircular = exports.notifyOnNoticeUpdated = exports.notifyOnNewNotice = void 0;
const admin = __importStar(require("firebase-admin"));
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-functions/v2/firestore");
const https = __importStar(require("https"));
admin.initializeApp();
const db = admin.firestore();
var pushNotifications_1 = require("./pushNotifications");
Object.defineProperty(exports, "notifyOnNewNotice", { enumerable: true, get: function () { return pushNotifications_1.notifyOnNewNotice; } });
Object.defineProperty(exports, "notifyOnNoticeUpdated", { enumerable: true, get: function () { return pushNotifications_1.notifyOnNoticeUpdated; } });
Object.defineProperty(exports, "notifyOnNewCircular", { enumerable: true, get: function () { return pushNotifications_1.notifyOnNewCircular; } });
Object.defineProperty(exports, "notifyOnCircularUpdated", { enumerable: true, get: function () { return pushNotifications_1.notifyOnCircularUpdated; } });
Object.defineProperty(exports, "notifyOnStudentNotification", { enumerable: true, get: function () { return pushNotifications_1.notifyOnStudentNotification; } });
var playStoreVersionCheck_1 = require("./playStoreVersionCheck");
Object.defineProperty(exports, "checkPlayStoreRelease", { enumerable: true, get: function () { return playStoreVersionCheck_1.checkPlayStoreRelease; } });
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
function sanitizeDocId(s) {
    return s.replace(/[/\s]/g, '_').slice(0, 200);
}
async function checkAndRecordAttempt(key) {
    const ref = db.collection('loginAttempts').doc(sanitizeDocId(key));
    const snap = await ref.get();
    const now = Date.now();
    const data = snap.exists ? snap.data() : null;
    if (data && now - data.firstAttemptAt < LOGIN_LOCKOUT_WINDOW_MS) {
        if (data.count >= MAX_LOGIN_ATTEMPTS) {
            return { blocked: true };
        }
        await ref.set({ count: data.count + 1, firstAttemptAt: data.firstAttemptAt });
    }
    else {
        await ref.set({ count: 1, firstAttemptAt: now });
    }
    return { blocked: false };
}
async function clearAttempts(key) {
    await db.collection('loginAttempts').doc(sanitizeDocId(key)).delete().catch(() => { });
}
// The client sends DOB as "YYYY-MM-DD" (native <input type="date"> value), but
// students are stored with dateOfBirth as "DD/MM/YYYY" (see EnrollStudent.tsx —
// a free-text field with slash formatting, not a date input). Convert before
// comparing so logins actually match.
function isoToDDMMYYYY(iso) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
    if (!match)
        return iso.trim();
    const [, y, m, d] = match;
    return `${d}/${m}/${y}`;
}
exports.studentLogin = (0, https_1.onCall)({ region: 'asia-south1' }, async (request) => {
    var _a, _b, _c, _d;
    const { identifier, mode, dob } = request.data;
    if (!(identifier === null || identifier === void 0 ? void 0 : identifier.trim()) || !(dob === null || dob === void 0 ? void 0 : dob.trim()) || (mode !== 'reg' && mode !== 'mobile')) {
        throw new https_1.HttpsError('invalid-argument', 'Register/Mobile number and Date of Birth are required.');
    }
    const cleanIdentifier = identifier.trim().toUpperCase();
    const attemptKey = `${mode}:${cleanIdentifier}`;
    const { blocked } = await checkAndRecordAttempt(attemptKey);
    if (blocked) {
        throw new https_1.HttpsError('resource-exhausted', 'Too many attempts. Please try again in 15 minutes.');
    }
    // 1. Find candidate student docs
    let docs;
    if (mode === 'reg') {
        const snap = await db.collection('students').where('regNumber', '==', cleanIdentifier).get();
        docs = snap.docs;
    }
    else {
        const [byStudent, byFather] = await Promise.all([
            db.collection('students').where('studentMobile', '==', identifier.trim()).get(),
            db.collection('students').where('fatherMobile', '==', identifier.trim()).get(),
        ]);
        const map = new Map();
        for (const d of [...byStudent.docs, ...byFather.docs])
            map.set(d.id, d);
        docs = [...map.values()];
    }
    // 2. Filter by exact DOB match (stored as DD/MM/YYYY)
    const dobDDMMYYYY = isoToDDMMYYYY(dob);
    const matches = docs.filter((d) => d.data().dateOfBirth === dobDDMMYYYY);
    if (matches.length === 0) {
        throw new https_1.HttpsError('not-found', 'No matching record found. Please check your details.');
    }
    // 3. Determine the claim identity — prefer regNumber (stable across all of a
    //    student's enrollment-year docs); fall back to a single-doc claim for
    //    pre-confirmation records that don't have one yet.
    const withRegNumber = matches.find((d) => { var _a; return !!((_a = d.data().regNumber) === null || _a === void 0 ? void 0 : _a.trim()); });
    let uid;
    let claims;
    if (withRegNumber) {
        const regNumber = withRegNumber.data().regNumber.trim();
        uid = `student_${sanitizeDocId(regNumber)}`;
        claims = { student: true, regNumber };
    }
    else {
        const doc = matches[0];
        uid = `student_doc_${doc.id}`;
        claims = { student: true, studentDocId: doc.id };
    }
    await clearAttempts(attemptKey);
    const token = await admin.auth().createCustomToken(uid, claims);
    // Record portal login activity (Admin SDK bypasses rules — students can't
    // write this themselves) so the admin side can show "active users".
    const activityDoc = withRegNumber !== null && withRegNumber !== void 0 ? withRegNumber : matches[0];
    const activityData = activityDoc.data();
    const now = new Date().toISOString();
    await db.collection('studentLoginActivity').doc(uid).set({
        regNumber: (_a = activityData.regNumber) !== null && _a !== void 0 ? _a : '',
        studentName: (_b = activityData.studentNameSSLC) !== null && _b !== void 0 ? _b : '',
        course: (_c = activityData.course) !== null && _c !== void 0 ? _c : '',
        year: (_d = activityData.year) !== null && _d !== void 0 ? _d : '',
        lastLoginAt: now,
        loginCount: admin.firestore.FieldValue.increment(1),
        online: true,
    }, { merge: true });
    return { token };
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
// Mirrors src/types/index.ts's SMP_FEE_HEADS keys (14 fee heads) from the student app —
// duplicated here since Cloud Functions can't import from that repo.
const SMP_FEE_HEAD_KEYS = [
    'adm', 'tuition', 'lib', 'rr', 'sports', 'lab', 'dvp', 'mag', 'idCard', 'ass', 'swf', 'twf', 'nss', 'fine',
];
// Mirrors src/utils/noticeUtils.ts's `noticeAppliesToMe` from the student app —
// duplicated here (8 lines) since Cloud Functions can't import from that repo.
function noticeAppliesToStudent(n, student) {
    var _a, _b;
    if (n.archivedAt)
        return false;
    if (n.scope === 'all')
        return true;
    if (n.scope === 'academicYear')
        return n.scopeValue === student.academicYear;
    if (n.scope === 'course')
        return n.scopeValue === student.course;
    if (n.scope === 'regNumber')
        return n.scopeValue === student.regNumber;
    if (n.scope === 'selected')
        return ((_a = n.targetRegNumbers) !== null && _a !== void 0 ? _a : []).includes((_b = student.regNumber) !== null && _b !== void 0 ? _b : '');
    return false;
}
function sumFeeRecord(r) {
    var _a, _b, _c;
    const smpTotal = Object.values((_a = r.smp) !== null && _a !== void 0 ? _a : {}).reduce((s, v) => s + (typeof v === 'number' ? v : 0), 0);
    const additionalTotal = ((_b = r.additionalPaid) !== null && _b !== void 0 ? _b : []).reduce((s, h) => { var _a; return s + ((_a = h.amount) !== null && _a !== void 0 ? _a : 0); }, 0);
    return smpTotal + ((_c = r.svk) !== null && _c !== void 0 ? _c : 0) + additionalTotal;
}
// Mirrors src/utils/feeCalc.ts's calcAllotted (+ its calcEffectiveFine helper) from the
// student app — duplicated here since Cloud Functions can't import from that repo. The
// "fine" head is special-cased to the larger of the structure's allotted fine and whatever
// fine has actually been paid this year, same as the client.
function calcAllottedForYear(effSmp, effSvk, effAdditional, yearRecords) {
    var _a;
    const structureFine = (_a = effSmp.fine) !== null && _a !== void 0 ? _a : 0;
    const finePaid = yearRecords.reduce((s, r) => { var _a, _b; return s + ((_b = (_a = r.smp) === null || _a === void 0 ? void 0 : _a.fine) !== null && _b !== void 0 ? _b : 0); }, 0);
    const effectiveFine = Math.max(structureFine, finePaid);
    const smpTotal = SMP_FEE_HEAD_KEYS.reduce((t, key) => { var _a; return t + (key === 'fine' ? effectiveFine : ((_a = effSmp[key]) !== null && _a !== void 0 ? _a : 0)); }, 0);
    const additionalTotal = effAdditional.reduce((s, h) => { var _a; return s + ((_a = h.amount) !== null && _a !== void 0 ? _a : 0); }, 0);
    return smpTotal + effSvk + additionalTotal;
}
function callClaudeForStudent(apiKey, dataBlock) {
    return new Promise((resolve, reject) => {
        const SYSTEM = `You are a friendly assistant inside the student portal app of Sanjay Memorial Polytechnic (SMP), Sagar, Karnataka. You write a short personal summary for one student, based only on the data given to you.

## WRITING STYLE
- Plain, warm, direct English — like a helpful note, not a dashboard.
- Each point is one short sentence (12–24 words), using exact numbers/titles/dates from the data.
- Always include, as separate points:
  1. Fee due status, stated clearly as either "no pending dues" or the exact amount due.
  2. The total circulars count, for context on how much has been published.
  3. One point per pinned circular, using its subject to say something specific — not just repeating the title. If there are more than 3 pinned circulars, combine the rest into one point rather than listing every one.
- Also cover any recent/notable non-pinned circulars or notices relevant to them, and certificate/document status (TC/PC/refunds) if any exist.
- If a category has nothing to report (e.g. no certificates issued, no pinned circulars), skip it rather than inventing filler.
- Never mention data you were not given. Never invent numbers.

## OUTPUT FORMAT — STRICT
Return ONLY a raw JSON object: {"points": string[]}. 6 to 10 short bullet strings. No markdown fences, no explanation, no trailing text.`;
        const body = JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 600,
            // Cached: this system prompt is identical for every student, so caching it (1h TTL)
            // cuts ~90% off its cost on every call after the first within that window — the same
            // pattern generateAdmissionSummary/callClaude above uses.
            system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral', ttl: '1h' } }],
            messages: [{ role: 'user', content: dataBlock }],
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
                    const stripped = rawText
                        .replace(/^```(?:json)?\s*/i, '')
                        .replace(/\s*```\s*$/i, '')
                        .trim();
                    const match = stripped.match(/\{[\s\S]*\}/);
                    if (!match) {
                        reject(new Error(`No JSON object in response. Got: ${stripped.slice(0, 200)}`));
                        return;
                    }
                    const parsedBody = JSON.parse(match[0]);
                    if (!Array.isArray(parsedBody.points) || parsedBody.points.length === 0) {
                        reject(new Error('Empty points array'));
                        return;
                    }
                    resolve(parsedBody.points.filter((p) => typeof p === 'string'));
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
exports.generateStudentAISummary = (0, https_1.onCall)({ region: 'asia-south1', timeoutSeconds: 120 }, async (request) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
    const claims = (_a = request.auth) === null || _a === void 0 ? void 0 : _a.token;
    if (!(claims === null || claims === void 0 ? void 0 : claims.student)) {
        throw new https_1.HttpsError('unauthenticated', 'Student sign-in required.');
    }
    let regNumber = claims.regNumber;
    if (!regNumber && claims.studentDocId) {
        const doc = await db.collection('students').doc(claims.studentDocId).get();
        regNumber = (_b = doc.data()) === null || _b === void 0 ? void 0 : _b.regNumber;
    }
    if (!regNumber) {
        throw new https_1.HttpsError('failed-precondition', 'No registration number on this account yet.');
    }
    // Day-window cache: if today's summary was already generated for this student, return
    // it directly — no Firestore reads of their circulars/fees/certificates, no Claude call.
    const today = todayIST();
    const cacheRef = db.collection('aiSummaryCache').doc(regNumber);
    const cacheSnap = await cacheRef.get();
    const cached = cacheSnap.data();
    if ((cached === null || cached === void 0 ? void 0 : cached.date) === today && Array.isArray(cached.points) && cached.points.length > 0) {
        return { points: cached.points, generatedAt: (_c = cached.generatedAt) !== null && _c !== void 0 ? _c : new Date().toISOString() };
    }
    const configSnap = await db.doc('adminConfig/aiSettings').get();
    if (!configSnap.exists) {
        throw new https_1.HttpsError('failed-precondition', 'AI not configured. Add anthropicApiKey to adminConfig/aiSettings in Firestore.');
    }
    const { anthropicApiKey } = configSnap.data();
    if (!(anthropicApiKey === null || anthropicApiKey === void 0 ? void 0 : anthropicApiKey.trim())) {
        throw new https_1.HttpsError('failed-precondition', 'Anthropic API key is empty.');
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
    const studentDocs = studentsSnap.docs.map((d) => (Object.assign({ id: d.id }, d.data())));
    if (studentDocs.length === 0) {
        throw new https_1.HttpsError('not-found', 'Student record not found.');
    }
    // Prefer the doc for the current-looking enrollment (has admissionStatus/course); fall
    // back to the first match — mirrors how fetchMyTcRecords/fetchMyPcRecords aggregate
    // across all of a student's year-by-year docs on the client.
    const primary = (_d = studentDocs.find((s) => !!s.course)) !== null && _d !== void 0 ? _d : studentDocs[0];
    const tcCount = studentDocs.reduce((s, d) => { var _a, _b; return s + ((_b = (_a = d.tcHistory) === null || _a === void 0 ? void 0 : _a.length) !== null && _b !== void 0 ? _b : 0); }, 0);
    const pcCount = studentDocs.reduce((s, d) => { var _a, _b; return s + ((_b = (_a = d.pcHistory) === null || _a === void 0 ? void 0 : _a.length) !== null && _b !== void 0 ? _b : 0); }, 0);
    const refundCount = refundsSnap.size;
    const feeRecords = feeSnap.docs.map((d) => d.data());
    const totalPaid = feeRecords.reduce((s, r) => s + sumFeeRecord(r), 0);
    // Precise due (allotted − paid) per academic year, mirroring fetchMyTotalDue in
    // src/services/studentPortalService.ts on the client — not just a "paid so far" total.
    const recordsByYear = new Map();
    for (const r of feeRecords) {
        if (!r.academicYear)
            continue;
        const list = (_e = recordsByYear.get(r.academicYear)) !== null && _e !== void 0 ? _e : [];
        list.push(r);
        recordsByYear.set(r.academicYear, list);
    }
    const dueByYear = await Promise.all([...recordsByYear.entries()].map(async ([ay, yearRecords]) => {
        var _a, _b, _c, _d, _e, _f, _g;
        const first = yearRecords[0];
        const structureId = `${ay}__${(_a = first.course) !== null && _a !== void 0 ? _a : ''}__${(_b = first.year) !== null && _b !== void 0 ? _b : ''}__${(_c = first.admType) !== null && _c !== void 0 ? _c : ''}__${(_d = first.admCat) !== null && _d !== void 0 ? _d : ''}`;
        const structureDoc = await db.collection('feeStructure').doc(structureId).get();
        const structure = structureDoc.exists ? structureDoc.data() : null;
        const ownDocForYear = studentDocs.find((s) => s.academicYear === ay);
        const overrideDoc = ownDocForYear
            ? await db.collection('feeOverrides').doc(`${ownDocForYear.id}__${ay}`).get()
            : null;
        const override = (overrideDoc === null || overrideDoc === void 0 ? void 0 : overrideDoc.exists) ? overrideDoc.data() : null;
        const effective = override !== null && override !== void 0 ? override : structure;
        if (!effective)
            return 0;
        const paid = yearRecords.reduce((s, r) => s + sumFeeRecord(r), 0);
        const allotted = calcAllottedForYear((_e = effective.smp) !== null && _e !== void 0 ? _e : {}, (_f = effective.svk) !== null && _f !== void 0 ? _f : 0, (_g = effective.additionalHeads) !== null && _g !== void 0 ? _g : [], yearRecords);
        return Math.max(0, allotted - paid);
    }));
    const totalDue = dueByYear.reduce((s, d) => s + d, 0);
    const totalCircularsCount = circularsCountSnap.data().count;
    const circulars = circularsSnap.docs
        .map((d) => d.data())
        .filter((c) => !c.archivedAt);
    const pinnedCirculars = pinnedSnap.docs
        .map((d) => d.data())
        .filter((c) => !c.archivedAt);
    const notices = noticesSnap.docs
        .map((d) => d.data())
        .filter((n) => noticeAppliesToStudent(n, primary))
        .slice(0, 5);
    const dataBlock = [
        `STUDENT: ${(_f = primary.studentNameSSLC) !== null && _f !== void 0 ? _f : 'Student'}, ${(_g = primary.course) !== null && _g !== void 0 ? _g : ''} ${(_h = primary.year) !== null && _h !== void 0 ? _h : ''} (${(_j = primary.academicYear) !== null && _j !== void 0 ? _j : ''})`,
        `Admission status: ${(_k = primary.admissionStatus) !== null && _k !== void 0 ? _k : 'unknown'}`,
        totalDue > 0
            ? `Fee dues: Rs.${totalDue} pending across academic years (Rs.${totalPaid} paid so far)`
            : `Fee dues: none — fully paid (Rs.${totalPaid} paid so far)`,
        `Certificates: ${tcCount} Transfer Certificate(s), ${pcCount} Provisional Certificate(s), ${refundCount} Refund(s) issued`,
        `Total circulars ever published: ${totalCircularsCount}`,
        '',
        `PINNED CIRCULARS (title | department | date | subject):`,
        ...(pinnedCirculars.length > 0
            ? pinnedCirculars.map((c) => { var _a, _b, _c, _d; return `- ${(_a = c.title) !== null && _a !== void 0 ? _a : ''} | ${(_b = c.department) !== null && _b !== void 0 ? _b : ''} | ${(_c = c.date) !== null && _c !== void 0 ? _c : ''} | ${(_d = c.subject) !== null && _d !== void 0 ? _d : ''}`; })
            : ['(none)']),
        '',
        `RECENT CIRCULARS (title | department | date):`,
        ...circulars.slice(0, 5).map((c) => { var _a, _b, _c; return `- ${(_a = c.title) !== null && _a !== void 0 ? _a : ''} | ${(_b = c.department) !== null && _b !== void 0 ? _b : ''} | ${(_c = c.date) !== null && _c !== void 0 ? _c : ''}`; }),
        '',
        `NOTICES RELEVANT TO THIS STUDENT (title | category | date):`,
        ...(notices.length > 0
            ? notices.map((n) => { var _a, _b, _c; return `- ${(_a = n.title) !== null && _a !== void 0 ? _a : ''} | ${(_b = n.category) !== null && _b !== void 0 ? _b : ''} | ${(_c = n.createdAt) !== null && _c !== void 0 ? _c : ''}`; })
            : ['(none)']),
    ].join('\n');
    try {
        const points = await callClaudeForStudent(anthropicApiKey.trim(), dataBlock);
        const generatedAt = new Date().toISOString();
        await cacheRef.set({ date: today, points, generatedAt });
        return { points, generatedAt };
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new https_1.HttpsError('internal', `AI generation failed: ${msg}`);
    }
});
// ── Student daily motivation ────────────────────────────────────────────────
// Generates one short, warm, mentor-voiced note + motivational quote per
// student per calendar day (Asia/Kolkata), in both English and Kannada —
// shown on the student portal app's "Daily Motivation" screen. Cached in
// Firestore per student per day (collection `dailyMotivation`, doc id =
// regNumber) so repeated calls within the same day — app reopen, a second
// device, a client cache miss — never re-hit Claude; only the first call of
// the day for a given student costs anything. No separate cooldown needed
// (unlike generateStudentAISummary's manual-refresh cooldown) since this
// screen has no refresh button and the day-keyed cache already caps cost to
// once per student per day.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
// Shifts the current instant by IST's fixed +5:30 offset, then reads calendar
// fields off that shifted instant using UTC getters — a small,
// dependency-free way to get "today" in Asia/Kolkata without a timezone
// library (no DST in India, so a fixed offset is safe).
function todayIST() {
    return new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10);
}
function todayLabelsIST() {
    const shifted = new Date(Date.now() + IST_OFFSET_MS);
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return {
        dayLabel: days[shifted.getUTCDay()],
        dateLabel: shifted.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }),
    };
}
function callClaudeForMotivation(apiKey, firstName, dayLabel, dateLabel) {
    return new Promise((resolve, reject) => {
        const SYSTEM = `You are a warm, wise mentor inside the student portal app of Sanjay Memorial Polytechnic (SMP), Sagar, Karnataka — like a favorite teacher and a close friend rolled into one, with a philosopher's calm and warmth. You write a short daily motivational note for one student, addressing them by their first name.

## WRITING STYLE
- Warm, personal, sincere — never generic corporate positivity, never preachy, and phrased differently each time rather than a fixed template.
- messageEn: 2-4 sentences in English, in a mentor/friend/philosopher voice. Grounded and thoughtful, genuinely encouraging, naturally acknowledging that today is a fresh day. Address the student by first name at least once, woven naturally into a sentence (not just in the greeting).
- quoteEn: one short motivational quote in English — either a well-known quote with its real, accurate author, OR (roughly half the time) an original short aphorism written in your own philosopher voice, in which case quoteAuthor must be null. Vary which you pick and vary the theme (effort, patience, curiosity, resilience, self-belief, small daily progress, etc.) so it doesn't feel repetitive day to day.
- messageKn and quoteKn: accurate, natural Kannada translations of messageEn and quoteEn — phrased the way a fluent Kannada speaker would naturally write it, not a stiff literal translation. Use proper Kannada script.
- greeting: a short warm opening addressing the student by first name, e.g. "Dear Aditi," — vary the phrasing day to day rather than always using "Dear".

## OUTPUT FORMAT — STRICT
Return ONLY a raw JSON object: {"greeting": string, "messageEn": string, "messageKn": string, "quoteEn": string, "quoteKn": string, "quoteAuthor": string | null}. No markdown fences, no explanation, no trailing text.`;
        const userMsg = `STUDENT FIRST NAME: ${firstName}\nTODAY: ${dayLabel}, ${dateLabel}`;
        const body = JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            // Kannada script tokenizes far less efficiently than English (roughly 3-4x more
            // tokens per word), and this response packs an English + Kannada message and quote
            // into one JSON object — 700 wasn't enough and truncated mid-response, breaking the
            // JSON parse. 1600 gives comfortable headroom for both languages plus JSON overhead.
            max_tokens: 1600,
            // Cached: this system prompt is identical for every student/day, so caching it (1h
            // TTL) cuts most of its cost on every call after the first within that window — same
            // pattern callClaudeForStudent above uses.
            system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral', ttl: '1h' } }],
            messages: [{ role: 'user', content: userMsg }],
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
                    const stripped = rawText
                        .replace(/^```(?:json)?\s*/i, '')
                        .replace(/\s*```\s*$/i, '')
                        .trim();
                    const match = stripped.match(/\{[\s\S]*\}/);
                    if (!match) {
                        reject(new Error(`No JSON object in response. Got: ${stripped.slice(0, 200)}`));
                        return;
                    }
                    const parsedBody = JSON.parse(match[0]);
                    if (typeof parsedBody.greeting !== 'string' ||
                        typeof parsedBody.messageEn !== 'string' ||
                        typeof parsedBody.messageKn !== 'string' ||
                        typeof parsedBody.quoteEn !== 'string' ||
                        typeof parsedBody.quoteKn !== 'string') {
                        reject(new Error('Missing required fields in response'));
                        return;
                    }
                    resolve({
                        greeting: parsedBody.greeting,
                        messageEn: parsedBody.messageEn,
                        messageKn: parsedBody.messageKn,
                        quoteEn: parsedBody.quoteEn,
                        quoteKn: parsedBody.quoteKn,
                        quoteAuthor: typeof parsedBody.quoteAuthor === 'string' ? parsedBody.quoteAuthor : null,
                    });
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
exports.generateDailyMotivation = (0, https_1.onCall)({ region: 'asia-south1', timeoutSeconds: 60 }, async (request) => {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const claims = (_a = request.auth) === null || _a === void 0 ? void 0 : _a.token;
    if (!(claims === null || claims === void 0 ? void 0 : claims.student)) {
        throw new https_1.HttpsError('unauthenticated', 'Student sign-in required.');
    }
    let regNumber = claims.regNumber;
    if (!regNumber && claims.studentDocId) {
        const doc = await db.collection('students').doc(claims.studentDocId).get();
        regNumber = (_b = doc.data()) === null || _b === void 0 ? void 0 : _b.regNumber;
    }
    if (!regNumber) {
        throw new https_1.HttpsError('failed-precondition', 'No registration number on this account yet.');
    }
    const today = todayIST();
    const cacheRef = db.collection('dailyMotivation').doc(regNumber);
    const cacheSnap = await cacheRef.get();
    const cached = cacheSnap.data();
    if ((cached === null || cached === void 0 ? void 0 : cached.date) === today && cached.greeting && cached.messageEn && cached.quoteEn) {
        return {
            date: today,
            greeting: cached.greeting,
            messageEn: cached.messageEn,
            messageKn: (_c = cached.messageKn) !== null && _c !== void 0 ? _c : '',
            quoteEn: cached.quoteEn,
            quoteKn: (_d = cached.quoteKn) !== null && _d !== void 0 ? _d : '',
            quoteAuthor: (_e = cached.quoteAuthor) !== null && _e !== void 0 ? _e : undefined,
        };
    }
    const configSnap = await db.doc('adminConfig/aiSettings').get();
    if (!configSnap.exists) {
        throw new https_1.HttpsError('failed-precondition', 'AI not configured. Add anthropicApiKey to adminConfig/aiSettings in Firestore.');
    }
    const { anthropicApiKey } = configSnap.data();
    if (!(anthropicApiKey === null || anthropicApiKey === void 0 ? void 0 : anthropicApiKey.trim())) {
        throw new https_1.HttpsError('failed-precondition', 'Anthropic API key is empty.');
    }
    const studentsSnap = await db.collection('students').where('regNumber', '==', regNumber).get();
    const studentDocs = studentsSnap.docs.map((d) => d.data());
    const primary = (_f = studentDocs.find((s) => !!s.course)) !== null && _f !== void 0 ? _f : studentDocs[0];
    const fullName = (_g = primary === null || primary === void 0 ? void 0 : primary.studentNameSSLC) === null || _g === void 0 ? void 0 : _g.trim();
    const firstName = fullName ? fullName.split(/\s+/)[0] : 'Student';
    const { dayLabel, dateLabel } = todayLabelsIST();
    try {
        const result = await callClaudeForMotivation(anthropicApiKey.trim(), firstName, dayLabel, dateLabel);
        const toStore = Object.assign({ date: today }, result);
        await cacheRef.set(toStore);
        return Object.assign(Object.assign({}, toStore), { quoteAuthor: (_h = toStore.quoteAuthor) !== null && _h !== void 0 ? _h : undefined });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new https_1.HttpsError('internal', `AI generation failed: ${msg}`);
    }
});
//# sourceMappingURL=index.js.map