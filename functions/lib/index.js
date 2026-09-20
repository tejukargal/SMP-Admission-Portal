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
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.optimizeStoredImages = exports.generateCategoryIcon = exports.generateTabHeaderBackground = exports.generateCircularBackground = exports.generateNoticeDraft = exports.generateCircularDraft = exports.previewStudentBriefing = exports.generateDailyBriefing = exports.publishScholarshipUpdates = exports.fetchScholarshipUpdates = exports.saveDailyQuote = exports.generateDailyQuotePreview = exports.generateAdmissionSummary = exports.sendBulkSMS = exports.studentLogin = exports.syncMyAdminClaim = exports.syncAdminClaim = exports.checkPlayStoreRelease = exports.notifyOnStudentNotification = exports.notifyOnCircularUpdated = exports.notifyOnNewCircular = exports.notifyOnNoticeUpdated = exports.notifyOnNewNotice = void 0;
const admin = __importStar(require("firebase-admin"));
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-functions/v2/firestore");
const https = __importStar(require("https"));
const crypto = __importStar(require("crypto"));
const sharp_1 = __importDefault(require("sharp"));
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
// Mirrors src/utils/htmlContent.ts's `circularSeenKey` from the student app:
// a circular counts as unread again whenever it's edited, so the seen key
// carries the edit timestamp.
function circularSeenKey(c) {
    var _a, _b, _c;
    return `${(_a = c.id) !== null && _a !== void 0 ? _a : ''}:${(_c = (_b = c.updatedAt) !== null && _b !== void 0 ? _b : c.createdAt) !== null && _c !== void 0 ? _c : ''}`;
}
// Notice/circular bodies are stored as HTML; the digest only needs a short
// plain-text excerpt so the model knows what a notice actually asks for.
function htmlExcerpt(html, maxChars) {
    if (!html)
        return '';
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
function buildDailyQuoteImagePrompt(scene, provider) {
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
async function uploadDailyQuoteImage(date, imageBase64, mimeType) {
    const path = `dailyQuoteBackgrounds/${date}-${Date.now()}.${imageExtensionFor(mimeType)}`;
    const bucket = admin.storage().bucket();
    await bucket.file(path).save(Buffer.from(imageBase64, 'base64'), {
        metadata: { contentType: mimeType, cacheControl: OPTIMIZED_CACHE_CONTROL },
        resumable: false,
    });
    return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media`;
}
function imageExtensionFor(mimeType) {
    if (mimeType === 'image/webp')
        return 'webp';
    if (mimeType === 'image/jpeg')
        return 'jpg';
    return 'png';
}
// Shown only until the admin saves the very first quote — keeps the student
// app's briefing screen (which requires a `quote`) working out of the box.
const FALLBACK_QUOTE = {
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
async function getLatestDailyQuote() {
    var _a;
    const snap = await db.collection('dailyQuote').orderBy('date', 'desc').limit(1).get();
    const latest = (_a = snap.docs[0]) === null || _a === void 0 ? void 0 : _a.data();
    return (latest === null || latest === void 0 ? void 0 : latest.quoteEn) ? latest : FALLBACK_QUOTE;
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
function isQuoteResult(value) {
    if (!value || typeof value !== 'object')
        return false;
    const v = value;
    return (typeof v.quoteEn === 'string' && v.quoteEn.trim().length > 0 &&
        typeof v.quoteAuthor === 'string' && v.quoteAuthor.trim().length > 0 &&
        typeof v.quoteKn === 'string' &&
        typeof v.theme === 'string' &&
        typeof v.scene === 'string' && v.scene.trim().length > 0);
}
/** Asks Gemini for a fresh quote of the day, steering it away from the last
 *  30 saved quotes so consecutive days don't repeat. */
async function generateQuoteText(apiKey, textModel) {
    const recentSnap = await db.collection('dailyQuote').orderBy('date', 'desc').limit(30).get();
    const recent = recentSnap.docs
        .map((d) => d.data())
        .filter((q) => q.quoteEn)
        .map((q) => { var _a, _b, _c; return `- "${q.quoteEn}" — ${(_a = q.quoteAuthor) !== null && _a !== void 0 ? _a : ''} (theme: ${(_b = q.theme) !== null && _b !== void 0 ? _b : ''}; scene: ${(_c = q.scene) !== null && _c !== void 0 ? _c : 'n/a'})`; });
    const { dayLabel, dateLabel } = todayLabelsIST();
    const userMessage = [
        `TODAY: ${dayLabel}, ${dateLabel}`,
        '',
        'RECENTLY USED QUOTES (most recent first) — do not repeat these:',
        ...(recent.length > 0 ? recent : ['(none yet)']),
    ].join('\n');
    const rawText = await callGeminiTextForCircular(apiKey, textModel, QUOTE_SYSTEM, userMessage, 800, 'application/json');
    const parsed = JSON.parse(extractJsonObject(rawText));
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
function isBriefingResult(value) {
    if (!value || typeof value !== 'object')
        return false;
    const v = value;
    return (typeof v.greeting === 'string' &&
        typeof v.messageEn === 'string' &&
        typeof v.messageKn === 'string' &&
        Array.isArray(v.points) && v.points.length > 0 && v.points.every((p) => typeof p === 'string'));
}
/** Reads adminConfig/aiSettings and validates the keys the daily briefing
 *  needs — shared by the on-demand callable below and the scheduled
 *  pre-generation job. Gemini's key is required unconditionally (it drives
 *  the text briefing whichever provider draws the image). */
async function loadBriefingAiSettings() {
    const configSnap = await db.doc('adminConfig/aiSettings').get();
    if (!configSnap.exists) {
        throw new https_1.HttpsError('failed-precondition', 'AI not configured. Add a geminiApiKey or openaiApiKey to adminConfig/aiSettings in Firestore.');
    }
    const { geminiApiKey, geminiTextModel, geminiImageModel, imageProvider, openaiApiKey, openaiImageModel, openaiImageQuality, replicateApiKey, replicateImageModel, budgetpixelApiKey, budgetpixelImageModel } = configSnap.data();
    if (!(geminiApiKey === null || geminiApiKey === void 0 ? void 0 : geminiApiKey.trim())) {
        throw new https_1.HttpsError('failed-precondition', 'Gemini API key is empty.');
    }
    if (imageProvider === 'openai' && !(openaiApiKey === null || openaiApiKey === void 0 ? void 0 : openaiApiKey.trim())) {
        throw new https_1.HttpsError('failed-precondition', 'OpenAI API key is empty.');
    }
    if (imageProvider === 'replicate' && !(replicateApiKey === null || replicateApiKey === void 0 ? void 0 : replicateApiKey.trim())) {
        throw new https_1.HttpsError('failed-precondition', 'Replicate API key is empty.');
    }
    if (imageProvider === 'budgetpixel' && !(budgetpixelApiKey === null || budgetpixelApiKey === void 0 ? void 0 : budgetpixelApiKey.trim())) {
        throw new https_1.HttpsError('failed-precondition', 'BudgetPixel API key is empty.');
    }
    return {
        textModel: (geminiTextModel === null || geminiTextModel === void 0 ? void 0 : geminiTextModel.trim()) || 'gemini-3.5-flash-lite',
        imageSettings: {
            imageProvider,
            geminiApiKey: geminiApiKey.trim(),
            geminiImageModel: (geminiImageModel === null || geminiImageModel === void 0 ? void 0 : geminiImageModel.trim()) || 'gemini-3.1-flash-lite-image',
            openaiApiKey: openaiApiKey === null || openaiApiKey === void 0 ? void 0 : openaiApiKey.trim(),
            openaiImageModel: openaiImageModel === null || openaiImageModel === void 0 ? void 0 : openaiImageModel.trim(),
            openaiImageQuality: openaiImageQuality === null || openaiImageQuality === void 0 ? void 0 : openaiImageQuality.trim(),
            replicateApiKey: replicateApiKey === null || replicateApiKey === void 0 ? void 0 : replicateApiKey.trim(),
            replicateImageModel: replicateImageModel === null || replicateImageModel === void 0 ? void 0 : replicateImageModel.trim(),
            budgetpixelApiKey: budgetpixelApiKey === null || budgetpixelApiKey === void 0 ? void 0 : budgetpixelApiKey.trim(),
            budgetpixelImageModel: budgetpixelImageModel === null || budgetpixelImageModel === void 0 ? void 0 : budgetpixelImageModel.trim(),
        },
    };
}
function requireAdmin(request) {
    var _a, _b;
    if (((_b = (_a = request.auth) === null || _a === void 0 ? void 0 : _a.token) === null || _b === void 0 ? void 0 : _b.admin) !== true) {
        throw new https_1.HttpsError('permission-denied', 'Admin sign-in required.');
    }
}
/** Settings › Daily Briefing › "Generate": writes a fresh quote (Gemini
 *  text) and draws its background image, returning both for preview —
 *  nothing is stored until the admin clicks Save (saveDailyQuote). Passing
 *  `scene` skips the text step and only redraws the image, so the admin can
 *  keep (or hand-edit) the quote and just try another picture. Same
 *  stateless generate → preview → save flow as generateTabHeaderBackground. */
exports.generateDailyQuotePreview = (0, https_1.onCall)({ region: 'asia-south1', timeoutSeconds: 120 }, async (request) => {
    var _a, _b;
    requireAdmin(request);
    const { scene: sceneOnly } = ((_a = request.data) !== null && _a !== void 0 ? _a : {});
    const { textModel, imageSettings } = await loadBriefingAiSettings();
    const geminiApiKey = (_b = imageSettings.geminiApiKey) !== null && _b !== void 0 ? _b : '';
    try {
        const quote = (sceneOnly === null || sceneOnly === void 0 ? void 0 : sceneOnly.trim())
            ? { quoteEn: '', quoteAuthor: '', quoteKn: '', theme: '', scene: sceneOnly.trim() }
            : await generateQuoteText(geminiApiKey, textModel);
        const image = await generateAiImage(imageSettings, buildDailyQuoteImagePrompt(quote.scene, imageSettings.imageProvider), '16:9');
        return Object.assign(Object.assign({ date: todayIST() }, quote), { imageBase64: image.imageBase64, mimeType: image.mimeType });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new https_1.HttpsError('internal', `AI generation failed: ${msg}`);
    }
});
/** Settings › Daily Briefing › "Save": uploads the previewed image and writes
 *  dailyQuote/{date}. Done server-side (not client upload + setDoc like the
 *  tab-header flow) because storage.rules allows no client write on
 *  dailyQuoteBackgrounds/ and dailyQuote/* is Admin-SDK-only. */
exports.saveDailyQuote = (0, https_1.onCall)({ region: 'asia-south1', timeoutSeconds: 120 }, async (request) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r;
    requireAdmin(request);
    const data = ((_a = request.data) !== null && _a !== void 0 ? _a : {});
    const date = (_c = (_b = data.date) === null || _b === void 0 ? void 0 : _b.trim()) !== null && _c !== void 0 ? _c : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new https_1.HttpsError('invalid-argument', 'date must be YYYY-MM-DD.');
    }
    const quoteEn = (_e = (_d = data.quoteEn) === null || _d === void 0 ? void 0 : _d.trim()) !== null && _e !== void 0 ? _e : '';
    const quoteAuthor = (_g = (_f = data.quoteAuthor) === null || _f === void 0 ? void 0 : _f.trim()) !== null && _g !== void 0 ? _g : '';
    if (!quoteEn || !quoteAuthor) {
        throw new https_1.HttpsError('invalid-argument', 'quoteEn and quoteAuthor are required.');
    }
    if (!data.imageBase64 || !((_h = data.mimeType) === null || _h === void 0 ? void 0 : _h.startsWith('image/'))) {
        throw new https_1.HttpsError('invalid-argument', 'A generated image is required.');
    }
    try {
        const backgroundImageUrl = await uploadDailyQuoteImage(date, data.imageBase64, data.mimeType);
        const toStore = {
            date,
            quoteEn,
            quoteAuthor,
            quoteKn: (_k = (_j = data.quoteKn) === null || _j === void 0 ? void 0 : _j.trim()) !== null && _k !== void 0 ? _k : '',
            theme: (_m = (_l = data.theme) === null || _l === void 0 ? void 0 : _l.trim()) !== null && _m !== void 0 ? _m : '',
            scene: (_p = (_o = data.scene) === null || _o === void 0 ? void 0 : _o.trim()) !== null && _p !== void 0 ? _p : '',
            backgroundImageUrl,
            savedAt: new Date().toISOString(),
            savedBy: (_r = (_q = request.auth) === null || _q === void 0 ? void 0 : _q.uid) !== null && _r !== void 0 ? _r : '',
        };
        await db.collection('dailyQuote').doc(date).set(toStore);
        return toStore;
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new https_1.HttpsError('internal', `Could not save the quote: ${msg}`);
    }
});
const SCHOLARSHIP_STATUSES = ['open', 'closing-soon', 'closed', 'upcoming', 'unknown'];
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
/** Like callGeminiTextForCircular, but with Gemini's built-in Google Search
 *  and URL-context tools switched on so the model can read live web pages.
 *  JSON response mode is not allowed alongside these tools, so the caller
 *  parses the text with extractJsonObject. Also returns the URLs the model
 *  grounded on, for attribution. */
function callGeminiGrounded(apiKey, model, systemPrompt, userMessage, maxTokens) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify({
            contents: [{ parts: [{ text: userMessage }] }],
            systemInstruction: { parts: [{ text: systemPrompt }] },
            tools: [{ google_search: {} }, { url_context: {} }],
            generationConfig: { maxOutputTokens: maxTokens },
        });
        const req = https.request({
            hostname: 'generativelanguage.googleapis.com',
            path: `/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${apiKey}`,
            method: 'POST',
            headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) },
        }, (res) => {
            let raw = '';
            res.on('data', (chunk) => { raw += chunk.toString(); });
            res.on('end', () => {
                var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
                try {
                    if (res.statusCode !== 200) {
                        let apiMsg = `HTTP ${res.statusCode}`;
                        try {
                            const errBody = JSON.parse(raw);
                            if ((_a = errBody.error) === null || _a === void 0 ? void 0 : _a.message)
                                apiMsg += `: ${errBody.error.message}`;
                        }
                        catch ( /* raw may not be JSON */_l) { /* raw may not be JSON */ }
                        reject(new Error(apiMsg));
                        return;
                    }
                    const parsed = JSON.parse(raw);
                    const candidate = (_b = parsed.candidates) === null || _b === void 0 ? void 0 : _b[0];
                    const text = (_e = (_d = (_c = candidate === null || candidate === void 0 ? void 0 : candidate.content) === null || _c === void 0 ? void 0 : _c.parts) === null || _d === void 0 ? void 0 : _d.map((p) => { var _a; return (_a = p.text) !== null && _a !== void 0 ? _a : ''; }).join('')) !== null && _e !== void 0 ? _e : '';
                    const sources = new Set();
                    for (const chunk of (_g = (_f = candidate === null || candidate === void 0 ? void 0 : candidate.groundingMetadata) === null || _f === void 0 ? void 0 : _f.groundingChunks) !== null && _g !== void 0 ? _g : []) {
                        if ((_h = chunk.web) === null || _h === void 0 ? void 0 : _h.uri)
                            sources.add(chunk.web.uri);
                    }
                    for (const meta of (_k = (_j = candidate === null || candidate === void 0 ? void 0 : candidate.urlContextMetadata) === null || _j === void 0 ? void 0 : _j.urlMetadata) !== null && _k !== void 0 ? _k : []) {
                        if (meta.retrievedUrl)
                            sources.add(meta.retrievedUrl);
                    }
                    resolve({ text: text.trim(), sources: [...sources] });
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
function cleanString(value, maxLen = 2000) {
    return typeof value === 'string' ? value.trim().slice(0, maxLen) : '';
}
function cleanStringList(value, maxItems, maxLen = 500) {
    if (!Array.isArray(value))
        return [];
    return value.map((v) => cleanString(v, maxLen)).filter(Boolean).slice(0, maxItems);
}
/** Accepts only http(s) URLs, so a stray value can never become a javascript:
 *  link in the app. */
function cleanUrl(value) {
    const s = cleanString(value, 1000);
    return /^https?:\/\//i.test(s) ? s : '';
}
/** Normalises one scheme from the model (or the admin's edited form) into the
 *  stored shape; returns null if it has no usable name. */
function normalizeScheme(value, today) {
    if (!value || typeof value !== 'object')
        return null;
    const v = value;
    const name = cleanString(v.name, 200);
    if (!name)
        return null;
    const applyByRaw = cleanString(v.applyBy, 20);
    const applyBy = /^\d{4}-\d{2}-\d{2}$/.test(applyByRaw) ? applyByRaw : null;
    let status = SCHOLARSHIP_STATUSES.includes(v.status) ? v.status : 'unknown';
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
        applyByText: cleanString(v.applyByText, 300) || (applyBy !== null && applyBy !== void 0 ? applyBy : 'Not announced yet — check the portal'),
        eligibility: cleanString(v.eligibility, 1000),
        documents: cleanStringList(v.documents, 20, 200),
        howToApply: cleanString(v.howToApply, 1000),
        notes: cleanString(v.notes, 1000),
        summaryKn: cleanString(v.summaryKn, 500),
        sources: cleanStringList(v.sources, 10, 1000).map((s) => cleanUrl(s)).filter(Boolean),
    };
}
function normalizeNewsItem(value) {
    if (!value || typeof value !== 'object')
        return null;
    const v = value;
    const title = cleanString(v.title, 300);
    if (!title)
        return null;
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
function normalizeScholarshipUpdates(value, today) {
    if (!value || typeof value !== 'object')
        return null;
    const v = value;
    const schemes = Array.isArray(v.schemes)
        ? v.schemes.map((s) => normalizeScheme(s, today)).filter((s) => s !== null).slice(0, MAX_SCHOLARSHIP_SCHEMES)
        : [];
    if (schemes.length === 0)
        return null;
    // News is optional — a summary with schemes and no announcements is valid.
    const news = Array.isArray(v.news)
        ? v.news.map(normalizeNewsItem).filter((n) => n !== null).slice(0, MAX_SCHOLARSHIP_NEWS)
        : [];
    return { overviewEn: cleanString(v.overviewEn, 600), overviewKn: cleanString(v.overviewKn, 600), schemes, news };
}
/** Whole days from `from` to `to` (both YYYY-MM-DD); negative when `to` is past. */
function daysBetweenIsoDates(from, to) {
    return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}
function randomHue() {
    return Math.floor(Math.random() * 360);
}
async function getScholarshipUpdates() {
    const snap = await db.doc('scholarshipUpdates/current').get();
    const data = snap.data();
    return data && Array.isArray(data.schemes) && data.schemes.length > 0 ? data : null;
}
/** The lines the student's briefing model sees: only schemes closing within
 *  SCHOLARSHIP_NUDGE_DAYS, and only their public facts. */
function scholarshipDeadlineLines(updates, today) {
    if (!updates)
        return ['(none)'];
    const lines = updates.schemes
        .filter((s) => s.applyBy && daysBetweenIsoDates(today, s.applyBy) >= 0 && daysBetweenIsoDates(today, s.applyBy) <= SCHOLARSHIP_NUDGE_DAYS)
        .map((s) => `- ${s.name} | ${s.portal} | closes ${s.applyBy} (${daysBetweenIsoDates(today, s.applyBy)} day(s) left) | ${s.eligibility || 'see portal'}`);
    return lines.length > 0 ? lines : ['(none)'];
}
/** Settings › Daily Briefing › Scholarship Updates › "Fetch latest": asks
 *  Gemini (grounded) for the current summary. Stateless — nothing is written
 *  until the admin publishes. */
exports.fetchScholarshipUpdates = (0, https_1.onCall)({ region: 'asia-south1', timeoutSeconds: 180 }, async (request) => {
    var _a, _b;
    requireAdmin(request);
    const requested = cleanStringList(((_a = request.data) !== null && _a !== void 0 ? _a : {}).sourceUrls, 10, 1000).map(cleanUrl).filter(Boolean);
    const sourceUrls = requested.length > 0 ? requested : DEFAULT_SCHOLARSHIP_SOURCES;
    const { textModel, imageSettings } = await loadBriefingAiSettings();
    const geminiApiKey = ((_b = imageSettings.geminiApiKey) !== null && _b !== void 0 ? _b : '').trim();
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
    let groundedSources = [];
    try {
        ({ text: rawText, sources: groundedSources } = await callGeminiGrounded(geminiApiKey, textModel, SCHOLARSHIP_SYSTEM, userMessage, 6000));
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new https_1.HttpsError('internal', `AI fetch failed: ${msg}`);
    }
    let parsedJson;
    try {
        parsedJson = JSON.parse(extractJsonObject(rawText));
    }
    catch (_c) {
        throw new https_1.HttpsError('internal', `The AI response was not valid JSON. It began: ${rawText.slice(0, 200)}`);
    }
    const normalized = normalizeScholarshipUpdates(parsedJson, today);
    if (!normalized) {
        throw new https_1.HttpsError('internal', 'The AI response contained no usable schemes. Try again, or switch the Gemini text model in AI Settings.');
    }
    // Schemes the model left unattributed fall back to the grounding URLs.
    const schemes = normalized.schemes.map((s) => (s.sources.length > 0 ? s : Object.assign(Object.assign({}, s), { sources: groundedSources.slice(0, 5) })));
    return Object.assign(Object.assign({}, normalized), { schemes, themeHue: randomHue(), sourceUrls, fetchedAt: new Date().toISOString() });
});
/** Settings › Daily Briefing › Scholarship Updates › "Publish": stores the
 *  reviewed summary at scholarshipUpdates/current (Admin SDK — clients can't
 *  write it). */
exports.publishScholarshipUpdates = (0, https_1.onCall)({ region: 'asia-south1', timeoutSeconds: 30 }, async (request) => {
    var _a, _b, _c;
    requireAdmin(request);
    const data = ((_a = request.data) !== null && _a !== void 0 ? _a : {});
    const today = todayIST();
    const normalized = normalizeScholarshipUpdates(data, today);
    if (!normalized) {
        throw new https_1.HttpsError('invalid-argument', 'At least one scheme with a name is required.');
    }
    const doc = Object.assign(Object.assign({}, normalized), { sourceUrls: cleanStringList(data.sourceUrls, 10, 1000).map(cleanUrl).filter(Boolean), themeHue: Number.isInteger(data.themeHue) && data.themeHue >= 0 && data.themeHue < 360 ? data.themeHue : randomHue(), fetchedAt: cleanString(data.fetchedAt, 40) || new Date().toISOString(), publishedAt: new Date().toISOString(), publishedBy: (_c = (_b = request.auth) === null || _b === void 0 ? void 0 : _b.uid) !== null && _c !== void 0 ? _c : '' });
    await db.doc('scholarshipUpdates/current').set(doc);
    return doc;
});
async function collectStudentBriefingData(regNumber) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w;
    const [studentsSnap, feeSnap, refundsSnap, circularsSnap, noticesSnap, circularsCountSnap, pinnedSnap, resultsSnap, notificationsSnap, noticeStateSnap, circularStateSnap, scholarshipUpdates,] = await Promise.all([
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
    const studentDocs = studentsSnap.docs.map((d) => (Object.assign({ id: d.id }, d.data())));
    if (studentDocs.length === 0) {
        throw new https_1.HttpsError('not-found', 'Student record not found.');
    }
    // Prefer the doc for the current-looking enrollment (has admissionStatus/course); fall
    // back to the first match — mirrors how fetchMyTcRecords/fetchMyPcRecords aggregate
    // across all of a student's year-by-year docs on the client.
    const primary = (_a = studentDocs.find((s) => !!s.course)) !== null && _a !== void 0 ? _a : studentDocs[0];
    const tcRecords = studentDocs.flatMap((d) => { var _a; return (_a = d.tcHistory) !== null && _a !== void 0 ? _a : []; });
    const pcRecords = studentDocs.flatMap((d) => { var _a; return (_a = d.pcHistory) !== null && _a !== void 0 ? _a : []; });
    const ansLetters = studentDocs
        .flatMap((d) => { var _a; return (_a = d.ansHistory) !== null && _a !== void 0 ? _a : []; })
        .sort((a, b) => { var _a, _b; return ((_a = b.issuedAt) !== null && _a !== void 0 ? _a : '').localeCompare((_b = a.issuedAt) !== null && _b !== void 0 ? _b : ''); });
    const refundRecords = refundsSnap.docs.map((d) => d.data());
    // One combined, most-recent-first, capped line list — real per-record facts
    // (not just counts) so the model can cite specifics instead of a bare aggregate.
    const certificateAndRefundLines = [
        ...tcRecords.map((r) => { var _a, _b, _c, _d, _e; return ({ date: (_a = r.issuedAt) !== null && _a !== void 0 ? _a : '', line: `TC #${(_b = r.tcNumber) !== null && _b !== void 0 ? _b : '?'} | ${(_c = r.course) !== null && _c !== void 0 ? _c : ''} ${(_d = r.semester) !== null && _d !== void 0 ? _d : ''} | issued ${(_e = r.issuedAt) !== null && _e !== void 0 ? _e : 'unknown date'}` }); }),
        ...pcRecords.map((r) => { var _a, _b, _c, _d; return ({ date: (_a = r.issuedAt) !== null && _a !== void 0 ? _a : '', line: `PC | ${(_b = r.examPeriod) !== null && _b !== void 0 ? _b : ''}, ${(_c = r.resultClass) !== null && _c !== void 0 ? _c : ''} | issued ${(_d = r.issuedAt) !== null && _d !== void 0 ? _d : 'unknown date'}` }); }),
        ...refundRecords.map((r) => { var _a, _b, _c, _d; return ({ date: (_a = r.paymentDate) !== null && _a !== void 0 ? _a : '', line: `Refund | Rs.${(_b = r.refundAmount) !== null && _b !== void 0 ? _b : '?'} (${(_c = r.refundCategory) !== null && _c !== void 0 ? _c : 'GENERAL'}) | ${(_d = r.paymentDate) !== null && _d !== void 0 ? _d : 'unknown date'}` }); }),
    ]
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 8)
        .map((e) => e.line);
    const feeRecords = feeSnap.docs.map((d) => d.data());
    const totalPaid = feeRecords.reduce((s, r) => s + sumFeeRecord(r), 0);
    const lastPayment = [...feeRecords]
        .filter((r) => r.date)
        .sort((a, b) => { var _a, _b; return ((_a = b.date) !== null && _a !== void 0 ? _a : '').localeCompare((_b = a.date) !== null && _b !== void 0 ? _b : ''); })[0];
    // Precise due (allotted − paid) per academic year, mirroring fetchMyTotalDue in
    // src/services/studentPortalService.ts on the client — reported per year (with
    // the year's fine) so the digest can quote the exact figure a student will see
    // on their Fee History tab, not just an overall total.
    const recordsByYear = new Map();
    for (const r of feeRecords) {
        if (!r.academicYear)
            continue;
        const list = (_b = recordsByYear.get(r.academicYear)) !== null && _b !== void 0 ? _b : [];
        list.push(r);
        recordsByYear.set(r.academicYear, list);
    }
    const feeYears = await Promise.all([...recordsByYear.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(async ([ay, yearRecords]) => {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j;
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
        const paid = yearRecords.reduce((s, r) => s + sumFeeRecord(r), 0);
        if (!effective)
            return { ay, allotted: null, paid, due: 0, fine: 0 };
        const allotted = calcAllottedForYear((_e = effective.smp) !== null && _e !== void 0 ? _e : {}, (_f = effective.svk) !== null && _f !== void 0 ? _f : 0, (_g = effective.additionalHeads) !== null && _g !== void 0 ? _g : [], yearRecords);
        const finePaid = yearRecords.reduce((s, r) => { var _a, _b; return s + ((_b = (_a = r.smp) === null || _a === void 0 ? void 0 : _a.fine) !== null && _b !== void 0 ? _b : 0); }, 0);
        const fine = Math.max((_j = (_h = effective.smp) === null || _h === void 0 ? void 0 : _h.fine) !== null && _j !== void 0 ? _j : 0, finePaid);
        return { ay, allotted, paid, due: Math.max(0, allotted - paid), fine };
    }));
    const totalDue = feeYears.reduce((s, y) => s + y.due, 0);
    const totalCircularsCount = circularsCountSnap.data().count;
    const seenCircularKeys = new Set((_d = ((_c = circularStateSnap.data()) === null || _c === void 0 ? void 0 : _c.seenCircularIds)) !== null && _d !== void 0 ? _d : []);
    const seenNoticeIds = new Set((_f = ((_e = noticeStateSnap.data()) === null || _e === void 0 ? void 0 : _e.seenNoticeIds)) !== null && _f !== void 0 ? _f : []);
    const circularLine = (c) => { var _a, _b, _c, _d; return `- ${(_a = c.title) !== null && _a !== void 0 ? _a : ''} | ${(_b = c.department) !== null && _b !== void 0 ? _b : ''} | ${(_c = c.date) !== null && _c !== void 0 ? _c : ''} | ${(_d = c.subject) !== null && _d !== void 0 ? _d : ''} | ${seenCircularKeys.has(circularSeenKey(c)) ? 'read' : 'UNREAD'}`; };
    const circulars = circularsSnap.docs
        .map((d) => (Object.assign({ id: d.id }, d.data())))
        .filter((c) => !c.archivedAt && !c.expiredAt);
    const pinnedCirculars = pinnedSnap.docs
        .map((d) => (Object.assign({ id: d.id }, d.data())))
        .filter((c) => !c.archivedAt && !c.expiredAt);
    const notices = noticesSnap.docs
        .map((d) => (Object.assign({ id: d.id }, d.data())))
        .filter((n) => !n.inactiveAt && noticeAppliesToStudent(n, primary))
        .slice(0, 8);
    // Latest exam session only — the ledger import keeps one doc per session,
    // and "what should I clear / how am I doing" is about the most recent one.
    const latestResult = resultsSnap.docs
        .map((d) => d.data())
        .sort((a, b) => { var _a, _b, _c, _d; return ((_b = (_a = b.updatedAt) !== null && _a !== void 0 ? _a : b.importedAt) !== null && _b !== void 0 ? _b : '').localeCompare((_d = (_c = a.updatedAt) !== null && _c !== void 0 ? _c : a.importedAt) !== null && _d !== void 0 ? _d : ''); })[0];
    const resultLines = [];
    if (latestResult) {
        const cgpa = typeof latestResult.cgpa === 'number' ? String(latestResult.cgpa) : (latestResult.cgpaStatus || 'n/a');
        resultLines.push(`- Session: ${(_g = latestResult.examSession) !== null && _g !== void 0 ? _g : 'unknown'} | Overall result: ${(_h = latestResult.overallResult) !== null && _h !== void 0 ? _h : 'n/a'} | CGPA: ${cgpa}`);
        const sgpas = ((_j = latestResult.semesterSummary) !== null && _j !== void 0 ? _j : [])
            .filter((s) => typeof s.sgpa === 'number')
            .slice(-2)
            .map((s) => { var _a; return `Sem ${(_a = s.semester) !== null && _a !== void 0 ? _a : '?'} SGPA ${s.sgpa}`; });
        if (sgpas.length > 0)
            resultLines.push(`- Latest SGPA: ${sgpas.join(', ')}`);
        const toClear = ((_k = latestResult.subjects) !== null && _k !== void 0 ? _k : []).filter((s) => s.result === 'F' || s.result === 'AB');
        resultLines.push(toClear.length > 0
            ? `- Subjects to clear (${toClear.length}): ${toClear.map((s) => { var _a, _b; return `${(_a = s.subject) !== null && _a !== void 0 ? _a : ''} (${(_b = s.code) !== null && _b !== void 0 ? _b : ''}, ${s.result === 'AB' ? 'absent' : 'fail'})`; }).join('; ')}`
            : `- All ${((_l = latestResult.subjects) !== null && _l !== void 0 ? _l : []).length} subjects passed`);
    }
    const unseenNotifications = notificationsSnap.docs
        .map((d) => d.data())
        .filter((n) => !n.seen)
        .sort((a, b) => { var _a, _b; return ((_a = b.createdAt) !== null && _a !== void 0 ? _a : '').localeCompare((_b = a.createdAt) !== null && _b !== void 0 ? _b : ''); })
        .slice(0, 5);
    const fullName = (_m = primary.studentNameSSLC) === null || _m === void 0 ? void 0 : _m.trim();
    const firstName = fullName ? fullName.split(/\s+/)[0] : 'Student';
    const { dayLabel, dateLabel } = todayLabelsIST();
    const dataBlock = [
        `STUDENT FIRST NAME: ${firstName}`,
        `TODAY: ${dayLabel}, ${dateLabel}`,
        `STUDENT: ${fullName !== null && fullName !== void 0 ? fullName : 'Student'}, ${(_o = primary.course) !== null && _o !== void 0 ? _o : ''} ${(_p = primary.year) !== null && _p !== void 0 ? _p : ''} (${(_q = primary.academicYear) !== null && _q !== void 0 ? _q : ''})`,
        `Admission: ${(_r = primary.admissionStatus) !== null && _r !== void 0 ? _r : 'unknown'}${primary.notAdmittedStatusTag ? ` (${primary.notAdmittedStatusTag})` : ''} | ${(_s = primary.admType) !== null && _s !== void 0 ? _s : ''} ${(_t = primary.admCat) !== null && _t !== void 0 ? _t : ''} | enrolled ${(_u = primary.enrollmentDate) !== null && _u !== void 0 ? _u : 'unknown'}`,
        '',
        `FEES BY ACADEMIC YEAR (year | allotted | paid | due | fine):`,
        ...(feeYears.length > 0
            ? feeYears.map((y) => `- ${y.ay} | ${y.allotted === null ? 'allotted unknown' : `Rs.${y.allotted}`} | Rs.${y.paid} | ${y.due > 0 ? `Rs.${y.due} DUE` : 'no dues'} | ${y.fine > 0 ? `Rs.${y.fine}` : 'none'}`)
            : ['(no fee records)']),
        totalDue > 0
            ? `Fee summary: Rs.${totalDue} pending in total (Rs.${totalPaid} paid so far)`
            : `Fee summary: no dues — fully paid (Rs.${totalPaid} paid so far)`,
        lastPayment
            ? `Last payment: ${lastPayment.date} | receipt ${(_v = lastPayment.receiptNumber) !== null && _v !== void 0 ? _v : 'n/a'} | ${(_w = lastPayment.paymentMode) !== null && _w !== void 0 ? _w : ''} | Rs.${sumFeeRecord(lastPayment)}`
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
            ? notices.map((n) => { var _a, _b, _c, _d; return `- ${(_a = n.title) !== null && _a !== void 0 ? _a : ''} | ${(_b = n.category) !== null && _b !== void 0 ? _b : ''} | ${(_c = n.createdAt) !== null && _c !== void 0 ? _c : ''} | ${seenNoticeIds.has((_d = n.id) !== null && _d !== void 0 ? _d : '') ? 'read' : 'UNREAD'} | ${n.pinned ? 'pinned' : 'not pinned'} | ${htmlExcerpt(n.body, 160) || '(no text)'}`; })
            : ['(none)']),
        '',
        `CERTIFICATES & REFUNDS (most recent first):`,
        ...(certificateAndRefundLines.length > 0 ? certificateAndRefundLines.map((l) => `- ${l}`) : ['(none)']),
        `Certificate totals: ${tcRecords.length} Transfer Certificate(s), ${pcRecords.length} Provisional Certificate(s), ${refundRecords.length} Refund(s)`,
        '',
        `ATTENDANCE SHORTAGE LETTERS (academic year | issued | status):`,
        ...(ansLetters.length > 0
            ? ansLetters.slice(0, 3).map((l) => { var _a, _b, _c; return `- ${(_a = l.academicYear) !== null && _a !== void 0 ? _a : ''} | ${(_b = l.issuedAt) !== null && _b !== void 0 ? _b : 'unknown date'} | ${(_c = l.status) !== null && _c !== void 0 ? _c : 'sent'}`; })
            : ['(none)']),
        '',
        `UNSEEN NOTIFICATIONS (type | title | message | date):`,
        ...(unseenNotifications.length > 0
            ? unseenNotifications.map((n) => { var _a, _b, _c, _d; return `- ${(_a = n.type) !== null && _a !== void 0 ? _a : ''} | ${(_b = n.title) !== null && _b !== void 0 ? _b : ''} | ${(_c = n.message) !== null && _c !== void 0 ? _c : ''} | ${(_d = n.createdAt) !== null && _d !== void 0 ? _d : ''}`; })
            : ['(none)']),
        '',
        `SCHOLARSHIP DEADLINES within ${SCHOLARSHIP_NUDGE_DAYS} days, from the admin-published scholarship summary (scheme | portal | closes on | who can apply):`,
        ...scholarshipDeadlineLines(scholarshipUpdates, todayIST()),
    ].join('\n');
    return { primary, dataBlock };
}
async function generateBriefingText(apiKey, textModel, dataBlock) {
    const rawText = await callGeminiTextForCircular(apiKey, textModel, BRIEFING_SYSTEM, dataBlock, 2400, 'application/json');
    const parsedJson = JSON.parse(extractJsonObject(rawText));
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
exports.generateDailyBriefing = (0, https_1.onCall)({ region: 'asia-south1', timeoutSeconds: 120 }, async (request) => {
    var _a, _b, _c;
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
    const { textModel, imageSettings } = await loadBriefingAiSettings();
    const geminiApiKey = (_c = imageSettings.geminiApiKey) !== null && _c !== void 0 ? _c : '';
    const today = todayIST();
    const [quote, scholarships, cachedBriefingSnap] = await Promise.all([
        getLatestDailyQuote(),
        getScholarshipUpdates(),
        db.collection('dailyBriefing').doc(regNumber).get(),
    ]);
    const cachedBriefing = cachedBriefingSnap.data();
    const cachedGeneratedAt = cachedBriefing === null || cachedBriefing === void 0 ? void 0 : cachedBriefing.generatedAt;
    if ((cachedBriefing === null || cachedBriefing === void 0 ? void 0 : cachedBriefing.date) === today && isBriefingResult(cachedBriefing)) {
        const { greeting, messageEn, messageKn, points } = cachedBriefing;
        return { date: today, quote, scholarships, greeting, messageEn, messageKn, points, generatedAt: cachedGeneratedAt !== null && cachedGeneratedAt !== void 0 ? cachedGeneratedAt : new Date().toISOString() };
    }
    const { dataBlock } = await collectStudentBriefingData(regNumber);
    try {
        const result = await generateBriefingText(geminiApiKey.trim(), textModel, dataBlock);
        const generatedAt = new Date().toISOString();
        await db.collection('dailyBriefing').doc(regNumber).set(Object.assign(Object.assign({ date: today }, result), { generatedAt }));
        return Object.assign(Object.assign({ date: today, quote, scholarships }, result), { generatedAt });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new https_1.HttpsError('internal', `AI generation failed: ${msg}`);
    }
});
/** Settings › Daily Briefing › "Preview a student's briefing": runs the exact
 *  same data collection + generation as generateDailyBriefing for any reg
 *  number, WITHOUT touching that student's cached digest, and also returns
 *  the data block the model was given so the admin can check every
 *  highlight against its source line. */
exports.previewStudentBriefing = (0, https_1.onCall)({ region: 'asia-south1', timeoutSeconds: 120 }, async (request) => {
    var _a, _b, _c;
    requireAdmin(request);
    const regNumber = (_b = ((_a = request.data) !== null && _a !== void 0 ? _a : {}).regNumber) === null || _b === void 0 ? void 0 : _b.trim();
    if (!regNumber) {
        throw new https_1.HttpsError('invalid-argument', 'regNumber is required.');
    }
    const { textModel, imageSettings } = await loadBriefingAiSettings();
    const geminiApiKey = (_c = imageSettings.geminiApiKey) !== null && _c !== void 0 ? _c : '';
    const [quote, scholarships, { dataBlock }] = await Promise.all([
        getLatestDailyQuote(),
        getScholarshipUpdates(),
        collectStudentBriefingData(regNumber),
    ]);
    try {
        const result = await generateBriefingText(geminiApiKey.trim(), textModel, dataBlock);
        return Object.assign(Object.assign({ date: todayIST(), quote, scholarships }, result), { generatedAt: new Date().toISOString(), dataBlock });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new https_1.HttpsError('internal', `AI generation failed: ${msg}`);
    }
});
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
const CIRCULAR_DEPARTMENTS = [
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
// Explicit script name + a concrete anchor phrase, because some models (Claude
// in particular, observed generating Hindi/Devanagari instead) will otherwise
// conflate "Kannada" with a generic "Indian regional language" request. The
// Unicode block is named as well since a model that is unsure of the script
// still knows its code points; and the whole thing is paired with a
// post-generation script check (see checkDraftScript) because prompting alone
// has been seen to fail.
const KANNADA_ANCHOR = 'KANNADA (ಕನ್ನಡ) — the official language of Karnataka state, written ONLY in the Kannada script (Unicode block U+0C80–U+0CFF: ಅ ಆ ಇ ಕ ಖ ಗ ನ ಮ ವ). ' +
    'Hindi and the Devanagari script (U+0900–U+097F: अ आ इ क ख ग) are WRONG and must not appear anywhere in the output, nor any other Indian language. ' +
    'For reference, a natural Kannada notice opening reads like "ಎಲ್ಲಾ ವಿದ್ಯಾರ್ಥಿಗಳಿಗೆ ಈ ಮೂಲಕ ತಿಳಿಸಲಾಗಿದೆ..." — match that script and register.';
// Short, unmissable statement of the language requirement, placed FIRST in the
// system prompt and repeated at the end of the user message, so it isn't buried
// among the formatting rules (which is where it was when Claude drifted to Hindi).
function draftLanguageHeadline(language) {
    if (language === 'kannada')
        return 'LANGUAGE: Kannada only, in Kannada script (ಕನ್ನಡ). Not Hindi, not Devanagari.';
    if (language === 'both')
        return 'LANGUAGE: English AND Kannada. The Kannada part must be in Kannada script (ಕನ್ನಡ) — not Hindi, not Devanagari.';
    return 'LANGUAGE: English only.';
}
function circularLanguageInstruction(language) {
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
function draftTextForScriptCheck(rawText) {
    try {
        const parsed = JSON.parse(extractJsonObject(rawText));
        if (parsed && typeof parsed === 'object') {
            return Object.values(parsed)
                .filter((v) => typeof v === 'string')
                .join('\n');
        }
    }
    catch ( /* not JSON — check the raw text */_a) { /* not JSON — check the raw text */ }
    return rawText;
}
/** Returns a correction to feed back to the model when a Kannada/both draft
 *  came out in the wrong script (Devanagari present, or no Kannada at all), or
 *  null when the script is right. English drafts are never checked. */
function checkDraftScript(rawText, language) {
    if (language === 'english')
        return null;
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
function buildCircularDraftSystemPrompt(language) {
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
function buildCircularDraftUserMessage(brief, keyDates, language) {
    const lines = [`BRIEF: ${brief}`];
    if (keyDates === null || keyDates === void 0 ? void 0 : keyDates.trim())
        lines.push(`KEY DATES/DEADLINES: ${keyDates.trim()}`);
    lines.push(draftLanguageHeadline(language));
    return lines.join('\n');
}
function extractJsonObject(text) {
    const trimmed = text.trim();
    const fenced = /```(?:json)?\s*([\s\S]*?)\s*```/.exec(trimmed);
    if (fenced)
        return fenced[1];
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start)
        return trimmed.slice(start, end + 1);
    return trimmed;
}
function isCircularDraft(value) {
    if (!value || typeof value !== 'object')
        return false;
    const v = value;
    return (typeof v.title === 'string' && v.title.trim() !== '' &&
        typeof v.subject === 'string' && v.subject.trim() !== '' &&
        typeof v.bodyHtml === 'string' && v.bodyHtml.trim() !== '' &&
        (v.department === undefined || typeof v.department === 'string'));
}
// Allowlist-strip anything outside the small tag set the prompt asks for, and
// drop all attributes even on allowed tags. RichTextEditor seeds its
// contentEditable innerHTML directly and unsanitized (sanitizeHtmlContent on
// the client only runs at render time, not at editor-seed time), so AI output
// must already be safe before it reaches the client.
const ALLOWED_BODY_TAGS = new Set(['p', 'strong', 'em', 'u', 'ul', 'ol', 'li', 'br']);
function sanitizeCircularBodyHtml(html) {
    return html.replace(/<\/?([a-zA-Z0-9]+)[^>]*>/g, (match, tag) => {
        const lower = tag.toLowerCase();
        if (!ALLOWED_BODY_TAGS.has(lower))
            return '';
        return match.startsWith('</') ? `</${lower}>` : `<${lower}>`;
    });
}
// Sonnet rather than Haiku for drafting: Haiku kept slipping into Hindi/
// Devanagari on Kannada requests, and a draft is a few hundred output tokens
// at most, so the stronger model costs next to nothing per call.
const CLAUDE_DRAFT_MODEL = 'claude-sonnet-5';
function callClaudeForCircular(apiKey, systemPrompt, userMessage, maxTokens) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify({
            model: CLAUDE_DRAFT_MODEL,
            max_tokens: maxTokens,
            system: systemPrompt,
            messages: [{ role: 'user', content: userMessage }],
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
                var _a, _b, _c, _d;
                try {
                    if (res.statusCode !== 200) {
                        let apiMsg = `HTTP ${res.statusCode}`;
                        try {
                            const errBody = JSON.parse(raw);
                            if ((_a = errBody.error) === null || _a === void 0 ? void 0 : _a.message)
                                apiMsg += `: ${errBody.error.message}`;
                        }
                        catch ( /* raw may not be JSON */_e) { /* raw may not be JSON */ }
                        reject(new Error(apiMsg));
                        return;
                    }
                    const parsed = JSON.parse(raw);
                    // Newer models can put a non-text block first (seen with Sonnet 5:
                    // reading content[0] alone came back empty), so join every text
                    // block rather than trusting the first one.
                    const text = ((_b = parsed.content) !== null && _b !== void 0 ? _b : [])
                        .filter((c) => c.type === 'text' && typeof c.text === 'string')
                        .map((c) => c.text)
                        .join('')
                        .trim();
                    if (!text) {
                        reject(new Error(`empty response from Claude (stop_reason: ${(_c = parsed.stop_reason) !== null && _c !== void 0 ? _c : 'unknown'}, blocks: ${((_d = parsed.content) !== null && _d !== void 0 ? _d : []).map((c) => c.type).join(',') || 'none'})`));
                        return;
                    }
                    resolve(text);
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
function callGeminiTextForCircular(apiKey, model, systemPrompt, userMessage, maxTokens, responseMimeType, 
// Some Gemini models spend part of maxOutputTokens on an internal "thinking"
// phase before writing the visible answer — if that phase eats the whole
// budget, the real output gets cut off almost immediately (seen as JSON
// truncated a few hundred characters in). Passing 0 here disables thinking
// so the full token budget goes to the actual answer; omit to leave the
// model's default thinking behavior untouched (existing callers unaffected).
thinkingBudget) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify({
            contents: [{ parts: [{ text: userMessage }] }],
            systemInstruction: { parts: [{ text: systemPrompt }] },
            generationConfig: Object.assign(Object.assign({ maxOutputTokens: maxTokens }, (responseMimeType ? { responseMimeType } : {})), (thinkingBudget !== undefined ? { thinkingConfig: { thinkingBudget } } : {})),
        });
        const req = https.request({
            hostname: 'generativelanguage.googleapis.com',
            path: `/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${apiKey}`,
            method: 'POST',
            headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) },
        }, (res) => {
            let raw = '';
            res.on('data', (chunk) => { raw += chunk.toString(); });
            res.on('end', () => {
                var _a, _b, _c, _d, _e, _f;
                try {
                    if (res.statusCode !== 200) {
                        let apiMsg = `HTTP ${res.statusCode}`;
                        try {
                            const errBody = JSON.parse(raw);
                            if ((_a = errBody.error) === null || _a === void 0 ? void 0 : _a.message)
                                apiMsg += `: ${errBody.error.message}`;
                        }
                        catch ( /* raw may not be JSON */_g) { /* raw may not be JSON */ }
                        reject(new Error(apiMsg));
                        return;
                    }
                    const parsed = JSON.parse(raw);
                    const text = (_f = (_e = (_d = (_c = (_b = parsed.candidates) === null || _b === void 0 ? void 0 : _b[0]) === null || _c === void 0 ? void 0 : _c.content) === null || _d === void 0 ? void 0 : _d.parts) === null || _e === void 0 ? void 0 : _e.map((p) => { var _a; return (_a = p.text) !== null && _a !== void 0 ? _a : ''; }).join('')) !== null && _f !== void 0 ? _f : '';
                    resolve(text.trim());
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
// Shared by the circular and notice drafting callables: reads the admin's AI
// keys/model from Firestore, checks the chosen provider is actually configured,
// runs the prompt and maps every failure to an HttpsError the client can show.
// For Kannada/both drafts the output's script is verified; a wrong-script draft
// is sent back once with a correction, and a second failure is reported rather
// than handed to the admin as if it were Kannada.
async function runDraftModel(provider, systemPrompt, userMessage, maxTokens, language) {
    const configSnap = await db.doc('adminConfig/aiSettings').get();
    if (!configSnap.exists) {
        throw new https_1.HttpsError('failed-precondition', 'AI not configured. Add anthropicApiKey/geminiApiKey to adminConfig/aiSettings in Firestore.');
    }
    const { anthropicApiKey, geminiApiKey, geminiTextModel } = configSnap.data();
    const useGemini = provider === 'gemini';
    if (useGemini && !(geminiApiKey === null || geminiApiKey === void 0 ? void 0 : geminiApiKey.trim())) {
        throw new https_1.HttpsError('failed-precondition', 'Gemini API key is empty.');
    }
    if (!useGemini && !(anthropicApiKey === null || anthropicApiKey === void 0 ? void 0 : anthropicApiKey.trim())) {
        throw new https_1.HttpsError('failed-precondition', 'Anthropic API key is empty.');
    }
    const generate = (message) => useGemini
        ? callGeminiTextForCircular(geminiApiKey.trim(), (geminiTextModel === null || geminiTextModel === void 0 ? void 0 : geminiTextModel.trim()) || 'gemini-3.5-flash-lite', systemPrompt, message, maxTokens)
        : callClaudeForCircular(anthropicApiKey.trim(), systemPrompt, message, maxTokens);
    // Kannada is written with ordinary full stops; models still tend to close
    // Kannada sentences with the Hindi-style danda, so swap those out.
    const normalise = (text) => text.replace(DANDA_RE, '.');
    let rawText;
    try {
        rawText = normalise(await generate(userMessage));
        const correction = checkDraftScript(rawText, language);
        if (correction) {
            console.warn(`Draft came back in the wrong script (${useGemini ? 'gemini' : 'claude'}, ${language}) — retrying once with a correction.`);
            rawText = normalise(await generate(`${userMessage}\n\n${correction}`));
        }
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new https_1.HttpsError('internal', `Draft generation failed: ${msg}`);
    }
    if (checkDraftScript(rawText, language)) {
        throw new https_1.HttpsError('internal', 'The AI wrote the Kannada part in the wrong script (Hindi/Devanagari) twice. Please retry, or try the other provider.');
    }
    return rawText;
}
exports.generateCircularDraft = (0, https_1.onCall)({ region: 'asia-south1', timeoutSeconds: 60 }, async (request) => {
    var _a, _b, _c;
    if (((_b = (_a = request.auth) === null || _a === void 0 ? void 0 : _a.token) === null || _b === void 0 ? void 0 : _b.admin) !== true) {
        throw new https_1.HttpsError('permission-denied', 'Admin sign-in required.');
    }
    const { brief, keyDates, provider, language } = ((_c = request.data) !== null && _c !== void 0 ? _c : {});
    if (!(brief === null || brief === void 0 ? void 0 : brief.trim())) {
        throw new https_1.HttpsError('invalid-argument', 'brief is required.');
    }
    const lang = language !== null && language !== void 0 ? language : 'english';
    const systemPrompt = buildCircularDraftSystemPrompt(lang);
    const userMessage = buildCircularDraftUserMessage(brief.trim(), keyDates, lang);
    // "both" roughly doubles output length (full English + full Kannada blocks).
    const maxTokens = lang === 'both' ? 2500 : 1500;
    const rawText = await runDraftModel(provider, systemPrompt, userMessage, maxTokens, lang);
    let parsed;
    try {
        parsed = JSON.parse(extractJsonObject(rawText));
    }
    catch (_d) {
        throw new https_1.HttpsError('internal', 'The AI returned malformed JSON. Please retry.');
    }
    if (!isCircularDraft(parsed)) {
        throw new https_1.HttpsError('internal', 'The AI response was missing required fields. Please retry.');
    }
    const draft = parsed;
    const validDepartment = CIRCULAR_DEPARTMENTS.some((d) => d.code === draft.department)
        ? draft.department
        : undefined;
    return {
        title: draft.title.trim(),
        subject: draft.subject.trim(),
        department: validDepartment,
        bodyHtml: sanitizeCircularBodyHtml(draft.bodyHtml.trim()),
    };
});
// ── Notice AI drafting ("Compose with AI" on Student Messages › Compose) ────
// Same shape as generateCircularDraft, but for the targeted notices an admin
// sends to a hand-picked/filtered set of students (fee reminders, document
// requests, …): the draft is a short direct message with a suggested category
// instead of a college-wide circular with a department. Stateless — the admin
// reviews/edits it in the compose modal and nothing is written until Send.
const NOTICE_CATEGORIES = ['fee', 'document', 'general'];
function buildNoticeDraftSystemPrompt(language) {
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
function buildNoticeDraftUserMessage(brief, keyDates, audience, language) {
    const lines = [`BRIEF: ${brief}`];
    if (keyDates === null || keyDates === void 0 ? void 0 : keyDates.trim())
        lines.push(`KEY DATES/DEADLINES: ${keyDates.trim()}`);
    if (audience) {
        const label = audience.label.trim() || 'Selected students';
        lines.push(`AUDIENCE: ${label} (${audience.count} student${audience.count === 1 ? '' : 's'})`);
    }
    lines.push(draftLanguageHeadline(language));
    return lines.join('\n');
}
function isNoticeDraft(value) {
    if (!value || typeof value !== 'object')
        return false;
    const v = value;
    return (typeof v.title === 'string' && v.title.trim() !== '' &&
        typeof v.bodyHtml === 'string' && v.bodyHtml.trim() !== '' &&
        (v.category === undefined || typeof v.category === 'string'));
}
exports.generateNoticeDraft = (0, https_1.onCall)({ region: 'asia-south1', timeoutSeconds: 60 }, async (request) => {
    var _a, _b, _c, _d, _e;
    if (((_b = (_a = request.auth) === null || _a === void 0 ? void 0 : _a.token) === null || _b === void 0 ? void 0 : _b.admin) !== true) {
        throw new https_1.HttpsError('permission-denied', 'Admin sign-in required.');
    }
    const { brief, keyDates, provider, language, audience } = ((_c = request.data) !== null && _c !== void 0 ? _c : {});
    if (!(brief === null || brief === void 0 ? void 0 : brief.trim())) {
        throw new https_1.HttpsError('invalid-argument', 'brief is required.');
    }
    const lang = language !== null && language !== void 0 ? language : 'english';
    const systemPrompt = buildNoticeDraftSystemPrompt(lang);
    const userMessage = buildNoticeDraftUserMessage(brief.trim(), keyDates, audience && typeof audience.count === 'number'
        ? { count: audience.count, label: typeof audience.label === 'string' ? audience.label : '' }
        : undefined, lang);
    // Notices are shorter than circulars; "both" still needs room for the
    // full English + full Kannada blocks.
    const maxTokens = lang === 'both' ? 2200 : 1200;
    const rawText = await runDraftModel(provider, systemPrompt, userMessage, maxTokens, lang);
    let parsed;
    try {
        parsed = JSON.parse(extractJsonObject(rawText));
    }
    catch (_f) {
        throw new https_1.HttpsError('internal', 'The AI returned malformed JSON. Please retry.');
    }
    if (!isNoticeDraft(parsed)) {
        throw new https_1.HttpsError('internal', 'The AI response was missing required fields. Please retry.');
    }
    const draft = parsed;
    const category = NOTICE_CATEGORIES.includes((_e = (_d = draft.category) === null || _d === void 0 ? void 0 : _d.trim().toLowerCase()) !== null && _e !== void 0 ? _e : '')
        ? draft.category.trim().toLowerCase()
        : undefined;
    return {
        title: draft.title.trim(),
        category,
        bodyHtml: sanitizeCircularBodyHtml(draft.bodyHtml.trim()),
    };
});
function callGeminiImage(apiKey, model, prompt, aspectRatio) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                responseModalities: ['IMAGE'],
                imageConfig: { aspectRatio },
            },
        });
        const req = https.request({
            hostname: 'generativelanguage.googleapis.com',
            path: `/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${apiKey}`,
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'content-length': Buffer.byteLength(body),
            },
        }, (res) => {
            let raw = '';
            res.on('data', (chunk) => { raw += chunk.toString(); });
            res.on('end', () => {
                var _a, _b, _c, _d, _e, _f, _g;
                try {
                    if (res.statusCode !== 200) {
                        let apiMsg = `HTTP ${res.statusCode}`;
                        try {
                            const errBody = JSON.parse(raw);
                            if ((_a = errBody.error) === null || _a === void 0 ? void 0 : _a.message)
                                apiMsg += `: ${errBody.error.message}`;
                        }
                        catch ( /* raw may not be JSON */_h) { /* raw may not be JSON */ }
                        reject(new Error(apiMsg));
                        return;
                    }
                    const parsed = JSON.parse(raw);
                    const inlineData = (_f = (_e = (_d = (_c = (_b = parsed.candidates) === null || _b === void 0 ? void 0 : _b[0]) === null || _c === void 0 ? void 0 : _c.content) === null || _d === void 0 ? void 0 : _d.parts) === null || _e === void 0 ? void 0 : _e.find((p) => { var _a; return (_a = p.inlineData) === null || _a === void 0 ? void 0 : _a.data; })) === null || _f === void 0 ? void 0 : _f.inlineData;
                    if (!(inlineData === null || inlineData === void 0 ? void 0 : inlineData.data)) {
                        reject(new Error(`No image returned. Got: ${raw.slice(0, 200)}`));
                        return;
                    }
                    resolve({ imageBase64: inlineData.data, mimeType: (_g = inlineData.mimeType) !== null && _g !== void 0 ? _g : 'image/png' });
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
/** OpenAI's gpt-image-1 family always returns base64 PNG data (no url/response_format
 *  option like the older dall-e models), so mimeType is always 'image/png' here. */
const OPENAI_IMAGE_QUALITIES = ['low', 'medium', 'high'];
function callOpenAiImage(apiKey, model, prompt, aspectRatio, quality) {
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
            quality: OPENAI_IMAGE_QUALITIES.includes(quality !== null && quality !== void 0 ? quality : '') ? quality : 'high',
            n: 1,
        });
        const req = https.request({
            hostname: 'api.openai.com',
            path: '/v1/images/generations',
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'content-length': Buffer.byteLength(body),
                authorization: `Bearer ${apiKey}`,
            },
        }, (res) => {
            let raw = '';
            res.on('data', (chunk) => { raw += chunk.toString(); });
            res.on('end', () => {
                var _a, _b, _c;
                try {
                    if (res.statusCode !== 200) {
                        let apiMsg = `HTTP ${res.statusCode}`;
                        try {
                            const errBody = JSON.parse(raw);
                            if ((_a = errBody.error) === null || _a === void 0 ? void 0 : _a.message)
                                apiMsg += `: ${errBody.error.message}`;
                        }
                        catch ( /* raw may not be JSON */_d) { /* raw may not be JSON */ }
                        reject(new Error(apiMsg));
                        return;
                    }
                    const parsed = JSON.parse(raw);
                    const b64 = (_c = (_b = parsed.data) === null || _b === void 0 ? void 0 : _b[0]) === null || _c === void 0 ? void 0 : _c.b64_json;
                    if (!b64) {
                        reject(new Error(`No image returned. Got: ${raw.slice(0, 200)}`));
                        return;
                    }
                    resolve({ imageBase64: b64, mimeType: 'image/png' });
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
function downloadAsBase64(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            if (res.statusCode !== 200) {
                reject(new Error(`Failed to download generated image: HTTP ${res.statusCode}`));
                return;
            }
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => resolve(Buffer.concat(chunks)));
            res.on('error', reject);
        }).on('error', reject);
    });
}
function replicateRequest(method, url, apiKey, body) {
    return new Promise((resolve, reject) => {
        const payload = body !== undefined ? JSON.stringify(body) : undefined;
        const parsed = new URL(url);
        const req = https.request({
            hostname: parsed.hostname,
            path: `${parsed.pathname}${parsed.search}`,
            method,
            headers: Object.assign(Object.assign({ authorization: `Bearer ${apiKey}` }, (method === 'POST' ? { 'content-type': 'application/json', prefer: 'wait=60' } : {})), (payload ? { 'content-length': Buffer.byteLength(payload) } : {})),
        }, (res) => {
            let raw = '';
            res.on('data', (chunk) => { raw += chunk.toString(); });
            res.on('end', () => {
                try {
                    if (res.statusCode !== 200 && res.statusCode !== 201) {
                        let apiMsg = `HTTP ${res.statusCode}`;
                        try {
                            const errBody = JSON.parse(raw);
                            if (errBody.detail)
                                apiMsg += `: ${errBody.detail}`;
                            else if (raw)
                                apiMsg += `: ${raw.slice(0, 300)}`;
                        }
                        catch (_a) {
                            if (raw)
                                apiMsg += `: ${raw.slice(0, 300)}`;
                        }
                        reject(new Error(apiMsg));
                        return;
                    }
                    resolve(JSON.parse(raw));
                }
                catch (err) {
                    reject(err);
                }
            });
        });
        req.on('error', reject);
        if (payload)
            req.write(payload);
        req.end();
    });
}
/** Replicate's `Prefer: wait=60` header makes the create-prediction call block until
 *  done (or 60s elapses), which comfortably covers flux-2-klein-4b's ~4-step, few-second
 *  generation time — so a poll loop is only needed as a fallback for the rare case the
 *  model is still 'starting'/'processing' when the initial response returns. Output is
 *  a hosted image URL (string or array), downloaded and re-encoded to match the other
 *  providers' { imageBase64, mimeType } shape. */
async function callReplicateImage(apiKey, model, prompt, aspectRatio) {
    var _a;
    let prediction = await replicateRequest('POST', `https://api.replicate.com/v1/models/${model}/predictions`, apiKey, { input: { prompt, aspect_ratio: aspectRatio, output_format: 'png' } });
    const maxAttempts = 20;
    const pollIntervalMs = 2000;
    for (let attempt = 0; attempt < maxAttempts && prediction.status !== 'succeeded' && prediction.status !== 'failed' && prediction.status !== 'canceled'; attempt++) {
        if (!((_a = prediction.urls) === null || _a === void 0 ? void 0 : _a.get))
            break;
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
function budgetPixelRequest(method, path, apiKey, body) {
    return new Promise((resolve, reject) => {
        const payload = body !== undefined ? JSON.stringify(body) : undefined;
        const req = https.request({
            hostname: 'api.budgetpixel.com',
            path,
            method,
            headers: Object.assign({ authorization: `Bearer ${apiKey}` }, (payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {})),
        }, (res) => {
            let raw = '';
            res.on('data', (chunk) => { raw += chunk.toString(); });
            res.on('end', () => {
                var _a;
                try {
                    if (res.statusCode !== 200 && res.statusCode !== 201) {
                        let apiMsg = `HTTP ${res.statusCode}`;
                        try {
                            const errBody = JSON.parse(raw);
                            const detail = (_a = errBody.message) !== null && _a !== void 0 ? _a : errBody.error;
                            const detailMsg = typeof detail === 'string' ? detail : undefined;
                            apiMsg += `: ${detailMsg || raw.slice(0, 300)}`;
                        }
                        catch (_b) {
                            if (raw)
                                apiMsg += `: ${raw.slice(0, 300)}`;
                        }
                        reject(new Error(apiMsg));
                        return;
                    }
                    resolve(JSON.parse(raw));
                }
                catch (err) {
                    reject(err);
                }
            });
        });
        req.on('error', reject);
        if (payload)
            req.write(payload);
        req.end();
    });
}
/** BudgetPixel is a multi-model aggregator (Flux, Seedream, GPT-Image, etc. behind one
 *  key) — image generation is an async job: POST creates it (path keyed by model slug),
 *  GET polls it (path keyed by job id) until status is 'succeeded'/'failed'/'timeout'. */
async function callBudgetPixelImage(apiKey, model, prompt, aspectRatio) {
    var _a, _b;
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
    const outputUrl = (_b = (_a = job.images) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.url;
    if (!outputUrl) {
        throw new Error('BudgetPixel reported success but returned no image URL.');
    }
    const bytes = await downloadAsBase64(outputUrl);
    return { imageBase64: bytes.toString('base64'), mimeType: 'image/png' };
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
const OPTIMIZED_IMAGE_WIDTH = { '16:9': 1280, '1:1': 800 };
const OPTIMIZED_IMAGE_QUALITY = 82;
const OPTIMIZED_CACHE_CONTROL = 'public, max-age=31536000, immutable';
async function optimizeImageBuffer(input, aspectRatio) {
    return (0, sharp_1.default)(input)
        .resize({ width: OPTIMIZED_IMAGE_WIDTH[aspectRatio], withoutEnlargement: true })
        .webp({ quality: OPTIMIZED_IMAGE_QUALITY })
        .toBuffer();
}
async function optimizeGeneratedImage(image, aspectRatio) {
    try {
        const out = await optimizeImageBuffer(Buffer.from(image.imageBase64, 'base64'), aspectRatio);
        return { imageBase64: out.toString('base64'), mimeType: OPTIMIZED_IMAGE_MIME };
    }
    catch (err) {
        // Never fail a generation over the optimisation step — the raw provider
        // output is still a perfectly valid (just larger) image.
        console.warn('optimizeGeneratedImage: falling back to raw provider output', err);
        return image;
    }
}
async function generateAiImage(settings, prompt, aspectRatio = '16:9') {
    const raw = await generateRawAiImage(settings, prompt, aspectRatio);
    return optimizeGeneratedImage(raw, aspectRatio);
}
function generateRawAiImage(settings, prompt, aspectRatio) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    if (settings.imageProvider === 'openai') {
        return callOpenAiImage(((_a = settings.openaiApiKey) !== null && _a !== void 0 ? _a : '').trim(), ((_b = settings.openaiImageModel) === null || _b === void 0 ? void 0 : _b.trim()) || 'gpt-image-1-mini', prompt, aspectRatio, (_c = settings.openaiImageQuality) === null || _c === void 0 ? void 0 : _c.trim());
    }
    if (settings.imageProvider === 'replicate') {
        return callReplicateImage(((_d = settings.replicateApiKey) !== null && _d !== void 0 ? _d : '').trim(), ((_e = settings.replicateImageModel) === null || _e === void 0 ? void 0 : _e.trim()) || 'black-forest-labs/flux-2-klein-4b', prompt, aspectRatio);
    }
    if (settings.imageProvider === 'budgetpixel') {
        return callBudgetPixelImage(((_f = settings.budgetpixelApiKey) !== null && _f !== void 0 ? _f : '').trim(), ((_g = settings.budgetpixelImageModel) === null || _g === void 0 ? void 0 : _g.trim()) || 'nano-banana-2-lite', prompt, aspectRatio);
    }
    return callGeminiImage(((_h = settings.geminiApiKey) !== null && _h !== void 0 ? _h : '').trim(), ((_j = settings.geminiImageModel) === null || _j === void 0 ? void 0 : _j.trim()) || 'gemini-3.1-flash-lite-image', prompt, aspectRatio);
}
/** Gemini's Nano Banana models already follow "flat vector illustration" prompts
 *  reliably, but GPT-Image models (gpt-image-1 family) tend to default toward busier,
 *  more photoreal/painterly renders and are prone to adding unwanted text/labels (text
 *  rendering is one of their strengths, so it needs to be explicitly, firmly refused)
 *  unless the negative-space and flatness constraints are spelled out more forcefully.
 *  Kept provider-aware here so switching providers doesn't require retuning prompts. */
function imageStyleDirective(provider, palette, aspectRatio = '16:9', 
// The one piece of text the image may contain (e.g. the college's short
// name on a building). Omitted = the default blanket ban on any text,
// which is what every prompt except the Home header wants.
allowedText) {
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
function buildCircularImagePrompt(title, subject, department, bodySnippet, provider) {
    return [
        'Flat vector illustration for a college notice-board banner card, wide 16:9 landscape composition.',
        `Context: a "${department}" circular titled "${title}"${subject ? `, subject: "${subject}"` : ''}.`,
        bodySnippet ? `Additional context: ${bodySnippet}` : '',
        'Depict a friendly, relevant scene for this context — for example, a Scholarships circular should show students in school/college uniform with books or documents; an Exams circular should show an exam hall or desk with papers; a Fee Dues circular should show a receipt or an office counter; a Sports/Annual Day/Functions circular should show students on a playground or a celebratory stage.',
        imageStyleDirective(provider, 'warm and friendly college-brochure color palette'),
    ].filter(Boolean).join(' ');
}
exports.generateCircularBackground = (0, https_1.onCall)({ region: 'asia-south1', timeoutSeconds: 120 }, async (request) => {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    if (((_b = (_a = request.auth) === null || _a === void 0 ? void 0 : _a.token) === null || _b === void 0 ? void 0 : _b.admin) !== true) {
        throw new https_1.HttpsError('permission-denied', 'Admin sign-in required.');
    }
    const { title, subject, department, bodySnippet } = ((_c = request.data) !== null && _c !== void 0 ? _c : {});
    if (!(title === null || title === void 0 ? void 0 : title.trim()) || !(department === null || department === void 0 ? void 0 : department.trim())) {
        throw new https_1.HttpsError('invalid-argument', 'title and department are required.');
    }
    const configSnap = await db.doc('adminConfig/aiSettings').get();
    if (!configSnap.exists) {
        throw new https_1.HttpsError('failed-precondition', 'AI not configured. Add a geminiApiKey or openaiApiKey to adminConfig/aiSettings in Firestore.');
    }
    const settings = configSnap.data();
    if (settings.imageProvider === 'openai') {
        if (!((_d = settings.openaiApiKey) === null || _d === void 0 ? void 0 : _d.trim())) {
            throw new https_1.HttpsError('failed-precondition', 'OpenAI API key is empty.');
        }
    }
    else if (settings.imageProvider === 'replicate') {
        if (!((_e = settings.replicateApiKey) === null || _e === void 0 ? void 0 : _e.trim())) {
            throw new https_1.HttpsError('failed-precondition', 'Replicate API key is empty.');
        }
    }
    else if (settings.imageProvider === 'budgetpixel') {
        if (!((_f = settings.budgetpixelApiKey) === null || _f === void 0 ? void 0 : _f.trim())) {
            throw new https_1.HttpsError('failed-precondition', 'BudgetPixel API key is empty.');
        }
    }
    else if (!((_g = settings.geminiApiKey) === null || _g === void 0 ? void 0 : _g.trim())) {
        throw new https_1.HttpsError('failed-precondition', 'Gemini API key is empty.');
    }
    const prompt = buildCircularImagePrompt(title.trim(), (_h = subject === null || subject === void 0 ? void 0 : subject.trim()) !== null && _h !== void 0 ? _h : '', department.trim(), (bodySnippet !== null && bodySnippet !== void 0 ? bodySnippet : '').trim().slice(0, 400), settings.imageProvider);
    try {
        return await generateAiImage(settings, prompt);
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new https_1.HttpsError('internal', `Image generation failed: ${msg}`);
    }
});
// ── Tab header AI background generation ─────────────────────────────────────
// Generates one fixed illustrated background per student-portal tab (Home,
// Circulars, Profile, Fee History, Certificates, Notices), shown behind the
// portal header instead of the old static hex-pattern watermark. Same
// stateless generate → preview → client-side upload flow as
// generateCircularBackground above, just keyed by a fixed tab identity
// instead of a per-circular one.
const TAB_HEADER_KEYS = ['home', 'circulars', 'profile', 'fees', 'certificates', 'notices'];
const TAB_HEADER_SCENES = {
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
// Every tab header (Home and the rest) now picks a fresh background at
// random from this shared pool on each Generate, instead of one background
// fixed per tab — the same "regenerate for real variety" behaviour Home
// already had, extended to Circulars/Profile/Fees/Certificates/Notices so
// their headers stop looking identical every time and on every reopen.
//
// `textHex` is the deep, same-hue tone the student app draws the Home
// greeting/name in over the picked pastel (pale sky blue → deep slate blue,
// and so on — the "Saltwater Sky" / "Blue Surf" pairing), instead of plain
// black; it's only read for tabKey 'home' (generateTabHeaderBackground's
// handler), since every entry here is a light pastel and the other tabs'
// black title text stays legible against any of them. It rides back out of
// generateTabHeaderBackground and is saved next to the image URL by
// tabHeaderService.ts as appConfig/tabHeaders.homeTextColor.
const HEADER_BACKGROUND_PALETTES = [
    { color: 'soft pastel blush pink (a light, warm rose)', textHex: '#8A3B5C' },
    { color: 'soft pastel peach (a light, warm apricot)', textHex: '#8A4B36' },
    { color: 'soft pastel butter yellow (a light, creamy yellow)', textHex: '#8A6A2E' },
    { color: 'soft pastel mint (a light, minty aqua-green)', textHex: '#2F6B5E' },
    { color: 'soft pastel sky blue (a light, airy baby blue)', textHex: '#3B5B8A' },
    { color: 'soft pastel periwinkle blue (a light, lavender-tinted blue)', textHex: '#544B8A' },
    { color: 'soft pastel lilac (a light lavender-purple)', textHex: '#7A4A63' },
    { color: 'soft pastel coral (a light, warm salmon pink)', textHex: '#8F3F3A' },
    { color: 'soft pastel sage (a light, muted grey-green)', textHex: '#3F6B45' },
];
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
function pickRandom(items) {
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
const CHARACTER_FIGURES = [
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
const CHARACTER_PROPS = [
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
function drawRandomCharacter(options = {}) {
    const figure = pickRandom(CHARACTER_FIGURES);
    const prop = options.withProps ? pickRandom(CHARACTER_PROPS)(pickRandom(CHARACTER_BACKPACK_COLOURS)) : '';
    return {
        subject: `a cheerful college student who is ${figure.who}`,
        outfit: `${figure.pronoun} has ${pickRandom(figure.hair)} and wears ${pickRandom(CHARACTER_TOPS)}, ${pickRandom(figure.bottoms)} and ${pickRandom(CHARACTER_SHOES)}` +
            (prop ? `, with ${prop}` : '') +
            ' — exactly this person and this outfit.',
    };
}
// Scene strings below carry this token where the student goes, so the
// drawn figure lands in the opening sentence (see drawRandomCharacter).
const STUDENT_TOKEN = '{student}';
function withStudent(scene, subject) {
    return scene.replace(STUDENT_TOKEN, subject);
}
// The caller picks `background` (generateTabHeaderBackground) so it can
// report the matching text colour alongside the image.
function buildHomeHeaderPrompt(provider, background) {
    const pose = pickRandom(HOME_HEADER_POSES);
    const backpack = pickRandom(CHARACTER_BACKPACK_COLOURS);
    const character = drawRandomCharacter();
    return [
        `Flat vector illustration for a mobile app header banner, wide 16:9 landscape composition. The entire background is one single, solid, flat ${background.color} filling the frame edge-to-edge — completely plain: no gradient, no scene, no sky, no clouds, no ground line, no shadows or texture on the background.`,
        `Depict ${character.subject}, ${pose}, wearing a ${backpack} college backpack on their back (its straps visible over the shoulders), with ${TAB_HEADER_SCENES.home}, positioned in the right two-thirds of the frame.`,
        `${character.outfit} Draw the character in a colourful, modern flat-vector app-illustration style: full body, a friendly expressive face with simple eyes and a smile, the outfit in vivid medium-saturation colours, clean rounded shapes, soft flat cel-shading. The character and their props are the only saturated elements in the picture and must stand out clearly against the pale background. Not abstract, not geometric, not faceless.`,
        'The building prop is compact and simple — a few flat rounded shapes, smaller than the character is tall — and its "SMP" signage must be the exact three capital letters S, M, P in a clean bold sans-serif, legible but modest in size, part of the building facade.',
        'Leave the left third of the frame completely empty, plain background colour only, so text can sit on it. Optionally add two or three tiny simple accent marks (small circles or dots) near the character in a slightly darker tint of the background colour — nothing else.',
        imageStyleDirective(provider, 'a soft pastel solid background with a colourful flat-vector character — bright and cheerful, not dull, dark, muddy, or photorealistic', '16:9', 'SMP'),
    ].join(' ');
}
// Non-Home tabs only — Home is built by buildHomeHeaderPrompt directly from
// generateTabHeaderBackground's handler. Both take the same randomly-picked
// background so every tab header shares the one "regenerate for a fresh
// colour" behaviour.
function buildTabHeaderPrompt(tabKey, provider, background) {
    // Every non-Home tab now draws a character too, the same randomly drawn
    // look used everywhere else, named in the "Depict …" sentence itself.
    const character = drawRandomCharacter({ withProps: true });
    const scene = withStudent(TAB_HEADER_SCENES[tabKey], character.subject);
    return [
        'Flat vector illustration for a mobile app header banner, wide 16:9 landscape composition, filling the entire frame edge-to-edge as one continuous illustration — no hard vertical seam, no two separate color blocks pasted together.',
        `The entire background is one single, solid, flat ${background.color} across the whole frame — completely plain: no gradient, no sky, no ground line, no shadows or texture on the background, and never a dull grey pastel. No glow, no luminous or light-emitting effects, no bloom, no halos, no lens flares — just clean flat color.`,
        `Depict ${scene}, occupying roughly the right two-thirds of the frame and extending comfortably past the center, rendered in bright, medium-saturation flat colours so the scene stays cheerful and readable — never dark or heavy — and stands out clearly against the pale background. Only the leftmost quarter of the frame should stay free of strong shapes, lines, or objects — a calm zone for text — but keep it the same flat background colour, with just a few subtle flat background elements such as soft simple shapes fading in from the scene; do not make it a different or lighter wash.`,
        `${character.outfit} Give them a friendly expressive face.`,
        imageStyleDirective(provider, 'a soft pastel solid background with a colourful, medium-saturation flat-vector scene — bright and cheerful, not dull, dark, muddy, or photorealistic; no glow or luminous effects'),
    ].join(' ');
}
exports.generateTabHeaderBackground = (0, https_1.onCall)({ region: 'asia-south1', timeoutSeconds: 120 }, async (request) => {
    var _a, _b, _c, _d, _e, _f, _g;
    if (((_b = (_a = request.auth) === null || _a === void 0 ? void 0 : _a.token) === null || _b === void 0 ? void 0 : _b.admin) !== true) {
        throw new https_1.HttpsError('permission-denied', 'Admin sign-in required.');
    }
    const { tabKey } = ((_c = request.data) !== null && _c !== void 0 ? _c : {});
    if (!tabKey || !TAB_HEADER_KEYS.includes(tabKey)) {
        throw new https_1.HttpsError('invalid-argument', `tabKey must be one of: ${TAB_HEADER_KEYS.join(', ')}`);
    }
    const configSnap = await db.doc('adminConfig/aiSettings').get();
    if (!configSnap.exists) {
        throw new https_1.HttpsError('failed-precondition', 'AI not configured. Add a geminiApiKey or openaiApiKey to adminConfig/aiSettings in Firestore.');
    }
    const settings = configSnap.data();
    if (settings.imageProvider === 'openai') {
        if (!((_d = settings.openaiApiKey) === null || _d === void 0 ? void 0 : _d.trim())) {
            throw new https_1.HttpsError('failed-precondition', 'OpenAI API key is empty.');
        }
    }
    else if (settings.imageProvider === 'replicate') {
        if (!((_e = settings.replicateApiKey) === null || _e === void 0 ? void 0 : _e.trim())) {
            throw new https_1.HttpsError('failed-precondition', 'Replicate API key is empty.');
        }
    }
    else if (settings.imageProvider === 'budgetpixel') {
        if (!((_f = settings.budgetpixelApiKey) === null || _f === void 0 ? void 0 : _f.trim())) {
            throw new https_1.HttpsError('failed-precondition', 'BudgetPixel API key is empty.');
        }
    }
    else if (!((_g = settings.geminiApiKey) === null || _g === void 0 ? void 0 : _g.trim())) {
        throw new https_1.HttpsError('failed-precondition', 'Gemini API key is empty.');
    }
    const background = pickRandom(HEADER_BACKGROUND_PALETTES);
    const prompt = tabKey === 'home'
        ? buildHomeHeaderPrompt(settings.imageProvider, background)
        : buildTabHeaderPrompt(tabKey, settings.imageProvider, background);
    try {
        const image = await generateAiImage(settings, prompt);
        // Only Home needs the matching text colour — every other tab's title
        // stays black, which reads fine against any of these light pastels.
        return tabKey === 'home' ? Object.assign(Object.assign({}, image), { textColor: background.textHex }) : image;
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new https_1.HttpsError('internal', `Image generation failed: ${msg}`);
    }
});
// ── Category icon AI generation ─────────────────────────────────────────────
// Generates one full-bleed illustrated stat-card background per student-portal
// Overview category (Circulars, Notices, Fees, Certificates) — the whole tile
// becomes this image (character scene + colored background filling the frame),
// not a small icon inset over the app's own gradient. Same stateless generate →
// preview → client-side upload flow as generateCircularBackground/
// generateTabHeaderBackground above, just keyed by a fixed category identity.
const CATEGORY_ICON_KEYS = ['circulars', 'notices', 'fees', 'certificates', 'dailyBriefing', 'scholarships'];
// The last two aren't Overview tiles but the two full-width Home banners
// (Daily Briefing, Scholarship Info & News). Same look, but generated wide
// and composed for the short strip the banner crops out of the middle.
const CATEGORY_ICON_BANNER_KEYS = new Set(['dailyBriefing', 'scholarships']);
function categoryIconAspect(key) {
    return CATEGORY_ICON_BANNER_KEYS.has(key) ? '16:9' : '1:1';
}
// Each category keeps a recognisable prop/action so the four tiles stay
// distinguishable at a glance; the character itself is styled once, below, in
// buildCategoryIconPrompt (same colourful flat-vector look as the Home tab
// header's waving student from buildTabHeaderPrompt).
const CATEGORY_ICON_SCENES = {
    circulars: '{student} pinning a paper flyer onto a small bulletin board, holding a few extra flyers in the other hand',
    notices: '{student} looking up brightly at a small ringing bell overhead, one hand raised beside their ear',
    fees: '{student} happily holding up a paid receipt in one hand and a payment card in the other',
    certificates: '{student} proudly holding up a rolled certificate scroll tied with a ribbon',
    dailyBriefing: '{student} stretching happily at sunrise with one arm raised, a small steaming mug on a ledge beside them, and a simple rising sun with a few short rays behind',
    scholarships: '{student} holding up a graduation cap in one hand and a small coin-marked money bag in the other, with a rolled award ribbon at their feet',
};
// Reference look: a course-catalogue style app card — one plain, solid soft
// pastel background per card (peach / periwinkle / mint / lavender) with a
// single colourful illustration sitting on it. The background is the *only*
// pastel element; the character is deliberately vivid so it pops against it.
// Four distinct hues keep the Overview tiles visually separate from each other.
const CATEGORY_ICON_COLORS = {
    circulars: 'soft pastel peach (a light, warm apricot)',
    notices: 'soft pastel periwinkle blue (a light, lavender-tinted blue)',
    fees: 'soft pastel mint (a light, minty aqua-green)',
    certificates: 'soft pastel lilac (a light lavender-purple)',
    dailyBriefing: 'soft pastel butter yellow (a light, warm sunrise yellow)',
    scholarships: 'soft pastel sage (a light, gentle sage green)',
};
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
function buildCategoryIconPrompt(key, provider) {
    const character = drawRandomCharacter({ withProps: true });
    return [
        `Flat vector illustration for a mobile app stat card, square 1:1 composition. The entire background is one single, solid, flat ${CATEGORY_ICON_COLORS[key]} filling the frame edge-to-edge — completely plain: no gradient, no scene, no sky, no ground line, no shadows or texture on the background.`,
        `Depict ${withStudent(CATEGORY_ICON_SCENES[key], character.subject)}, positioned in the right two-thirds of the frame.`,
        `${character.outfit} Draw the character in a colourful, modern flat-vector app-illustration style: full body, a friendly expressive face with simple eyes and a smile, the outfit in vivid medium-saturation colours, clean rounded shapes, soft flat cel-shading. The character and their props are the only saturated elements in the picture and must stand out clearly against the pale background. Not abstract, not geometric, not faceless.`,
        'Leave the left third of the frame completely empty, plain background colour only, so text can sit on it. Optionally add two or three tiny simple accent marks (small circles or dots) near the character in a slightly darker tint of the background colour — nothing else.',
        imageStyleDirective(provider, 'a soft pastel solid background with a colourful flat-vector character — bright and cheerful, not dull, dark, muddy, or photorealistic', '1:1'),
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
// HEADER_BACKGROUND_PALETTES above), independently per banner, so Regenerate
// gives real variety instead of the same fixed colour every time. The
// student app reads back `textIsLight` (see generateCategoryIcon below,
// threaded through categoryIconService.ts's setCategoryIcon into
// appConfig/categoryIcons.{key}TextIsLight) to switch its title/subtitle
// between dark and light text to match whichever was picked.
const CATEGORY_ICON_BANNER_PALETTES = [
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
const CATEGORY_ICON_BANNER_ART_SIDE = {
    dailyBriefing: 'right',
    scholarships: 'left',
};
function buildBannerIconPrompt(key, provider, palette) {
    const artSide = CATEGORY_ICON_BANNER_ART_SIDE[key];
    const textSide = artSide === 'right' ? 'left' : 'right';
    const character = drawRandomCharacter({ withProps: true });
    return [
        `Flat vector illustration for a mobile app banner, wide 16:9 landscape composition. The entire background is one single, solid, flat ${palette.color} filling the frame edge-to-edge — completely plain: no gradient, no scene, no sky, no ground line, no shadows or texture on the background.`,
        `Depict ${withStudent(CATEGORY_ICON_SCENES[key], character.subject)}, placed hard against the ${artSide} edge of the frame — the character's outer side no more than about 5% of the frame's width in from the ${artSide} edge, the whole character and props contained within the ${artSide}-most 35% of the frame — and drawn small and zoomed out: the whole character and their props, from the top of their head to the bottom of their feet, must fit inside a narrow horizontal band no taller than roughly 25% of the frame's total height, centred vertically in the frame — leaving generous plain background above and below, at least a third of the frame's height clear on each side. The final banner keeps only a narrow strip through the exact vertical middle, so anything drawn above or below that central band will be cut off.`,
        `${character.outfit} Draw the character in a colourful, modern flat-vector app-illustration style: full body, a friendly expressive face with simple eyes and a smile, the outfit in vivid medium-saturation colours, clean rounded shapes, soft flat cel-shading. The character and their props are the only saturated elements in the picture and must stand out clearly against the plain background. Not abstract, not geometric, not faceless.`,
        `Leave the ${textSide} 60% of the frame completely empty, plain background colour only, so text can sit on it — nothing from the scene may cross into it. Optionally add two or three tiny simple accent marks (small circles or dots) near the character in a slightly lighter or darker tint of the background colour — nothing else.`,
        imageStyleDirective(provider, `a solid ${palette.color} background with a colourful flat-vector character — bright and cheerful, not dull, dark, muddy, or photorealistic`, '16:9'),
    ].join(' ');
}
exports.generateCategoryIcon = (0, https_1.onCall)({ region: 'asia-south1', timeoutSeconds: 120 }, async (request) => {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    if (((_b = (_a = request.auth) === null || _a === void 0 ? void 0 : _a.token) === null || _b === void 0 ? void 0 : _b.admin) !== true) {
        throw new https_1.HttpsError('permission-denied', 'Admin sign-in required.');
    }
    const { key } = ((_c = request.data) !== null && _c !== void 0 ? _c : {});
    if (!key || !CATEGORY_ICON_KEYS.includes(key)) {
        throw new https_1.HttpsError('invalid-argument', `key must be one of: ${CATEGORY_ICON_KEYS.join(', ')}`);
    }
    const configSnap = await db.doc('adminConfig/aiSettings').get();
    if (!configSnap.exists) {
        throw new https_1.HttpsError('failed-precondition', 'AI not configured. Add a geminiApiKey or openaiApiKey to adminConfig/aiSettings in Firestore.');
    }
    const settings = configSnap.data();
    if (settings.imageProvider === 'openai') {
        if (!((_d = settings.openaiApiKey) === null || _d === void 0 ? void 0 : _d.trim())) {
            throw new https_1.HttpsError('failed-precondition', 'OpenAI API key is empty.');
        }
    }
    else if (settings.imageProvider === 'replicate') {
        if (!((_e = settings.replicateApiKey) === null || _e === void 0 ? void 0 : _e.trim())) {
            throw new https_1.HttpsError('failed-precondition', 'Replicate API key is empty.');
        }
    }
    else if (settings.imageProvider === 'budgetpixel') {
        if (!((_f = settings.budgetpixelApiKey) === null || _f === void 0 ? void 0 : _f.trim())) {
            throw new https_1.HttpsError('failed-precondition', 'BudgetPixel API key is empty.');
        }
    }
    else if (!((_g = settings.geminiApiKey) === null || _g === void 0 ? void 0 : _g.trim())) {
        throw new https_1.HttpsError('failed-precondition', 'Gemini API key is empty.');
    }
    const isBanner = CATEGORY_ICON_BANNER_KEYS.has(key);
    const bannerPalette = isBanner ? pickRandom(CATEGORY_ICON_BANNER_PALETTES) : null;
    const prompt = bannerPalette
        ? buildBannerIconPrompt(key, settings.imageProvider, bannerPalette)
        : buildCategoryIconPrompt(key, settings.imageProvider);
    try {
        const image = await generateAiImage(settings, prompt, categoryIconAspect(key));
        return Object.assign(Object.assign({}, image), { textIsLight: (_h = bannerPalette === null || bannerPalette === void 0 ? void 0 : bannerPalette.textIsLight) !== null && _h !== void 0 ? _h : false });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new https_1.HttpsError('internal', `Image generation failed: ${msg}`);
    }
});
/** Extracts the bucket object path from a Firebase Storage download URL
 *  (`.../o/{encodedPath}?alt=media...`), or null if it isn't one. */
function storagePathFromDownloadUrl(url) {
    const m = /\/o\/([^?]+)/.exec(url);
    if (!m)
        return null;
    try {
        return decodeURIComponent(m[1]);
    }
    catch (_a) {
        return null;
    }
}
async function optimizeOneStoredImage(target) {
    const oldPath = storagePathFromDownloadUrl(target.url);
    if (!oldPath)
        return { status: 'skipped', reason: 'not a Firebase Storage download URL' };
    if (/\.webp$/i.test(oldPath))
        return { status: 'skipped', reason: 'already WebP' };
    const bucket = admin.storage().bucket();
    const oldFile = bucket.file(oldPath);
    const [exists] = await oldFile.exists();
    if (!exists)
        return { status: 'skipped', reason: `object not found: ${oldPath}` };
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
    const newUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(newPath)}` +
        `?alt=media&token=${token}`;
    await target.update(newUrl);
    // Firestore now points at the WebP; the old PNG is unreferenced and can go.
    // Best-effort — an orphaned file is harmless, a failed migration isn't.
    try {
        await oldFile.delete();
    }
    catch (err) {
        console.warn(`optimizeStoredImages: could not delete old object ${oldPath}`, err);
    }
    return { status: 'converted', from: oldPath, to: newPath, bytesBefore: original.length, bytesAfter: optimized.length };
}
exports.optimizeStoredImages = (0, https_1.onCall)({ region: 'asia-south1', timeoutSeconds: 540, memory: '1GiB' }, async (request) => {
    var _a, _b, _c, _d;
    if (((_b = (_a = request.auth) === null || _a === void 0 ? void 0 : _a.token) === null || _b === void 0 ? void 0 : _b.admin) !== true) {
        throw new https_1.HttpsError('permission-denied', 'Admin sign-in required.');
    }
    const targets = [];
    const tabHeadersRef = db.doc('appConfig/tabHeaders');
    const tabHeaders = (_c = (await tabHeadersRef.get()).data()) !== null && _c !== void 0 ? _c : {};
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
    const categoryIcons = (_d = (await categoryIconsRef.get()).data()) !== null && _d !== void 0 ? _d : {};
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
    const result = { converted: [], skipped: [], failed: [] };
    // Sequential on purpose: each conversion holds a multi-MB decode in
    // memory, and there are at most a few dozen images — well inside the
    // 540 s ceiling without needing to parallelise.
    for (const target of targets) {
        try {
            const outcome = await optimizeOneStoredImage(target);
            if (outcome.status === 'converted') {
                const { status: _status } = outcome, rest = __rest(outcome, ["status"]);
                result.converted.push(Object.assign({ label: target.label }, rest));
            }
            else {
                result.skipped.push({ label: target.label, reason: outcome.reason });
            }
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`optimizeStoredImages: ${target.label} failed`, err);
            result.failed.push({ label: target.label, error: msg });
        }
    }
    return result;
});
//# sourceMappingURL=index.js.map