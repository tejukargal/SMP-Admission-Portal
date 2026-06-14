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
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2, _3, _4, _5, _6, _7, _8, _9;
        const hasPrev = !!p.prevAcademicYear && p.prevTotal !== undefined;
        const growthLine = hasPrev
            ? (() => {
                var _a;
                const diff = p.total - ((_a = p.prevTotal) !== null && _a !== void 0 ? _a : 0);
                const sign = diff >= 0 ? '+' : '';
                const pct = p.prevTotal ? Math.round((diff / p.prevTotal) * 100) : 0;
                return `Year-over-year: ${sign}${diff} students (${sign}${pct}%) vs ${p.prevAcademicYear} (${p.prevTotal} confirmed)`;
            })()
            : '';
        const courseYearLines = p.byCourseByYear
            ? ['Course × Year matrix:',
                ...['CE', 'ME', 'EC', 'CS', 'EE'].map((c) => {
                    var _a, _b, _c, _d;
                    const row = (_a = p.byCourseByYear[c]) !== null && _a !== void 0 ? _a : {};
                    return `  ${c}: 1st=${(_b = row['1ST YEAR']) !== null && _b !== void 0 ? _b : 0}, 2nd=${(_c = row['2ND YEAR']) !== null && _c !== void 0 ? _c : 0}, 3rd=${(_d = row['3RD YEAR']) !== null && _d !== void 0 ? _d : 0}`;
                }),
            ]
            : [];
        const categoryLine = p.byCategory
            ? `Category breakdown — GM: ${(_a = p.byCategory['GM']) !== null && _a !== void 0 ? _a : 0}, C1: ${(_b = p.byCategory['C1']) !== null && _b !== void 0 ? _b : 0}, 2A: ${(_c = p.byCategory['2A']) !== null && _c !== void 0 ? _c : 0}, 2B: ${(_d = p.byCategory['2B']) !== null && _d !== void 0 ? _d : 0}, 3A: ${(_e = p.byCategory['3A']) !== null && _e !== void 0 ? _e : 0}, 3B: ${(_f = p.byCategory['3B']) !== null && _f !== void 0 ? _f : 0}, SC: ${(_g = p.byCategory['SC']) !== null && _g !== void 0 ? _g : 0}, ST: ${(_h = p.byCategory['ST']) !== null && _h !== void 0 ? _h : 0}`
            : '';
        const genderCourseLines = p.byGenderByCourse
            ? ['Gender per course (Boys / Girls):',
                ...['CE', 'ME', 'EC', 'CS', 'EE'].map((c) => {
                    var _a, _b, _c, _d;
                    const boys = (_b = (_a = p.byGenderByCourse['BOY']) === null || _a === void 0 ? void 0 : _a[c]) !== null && _b !== void 0 ? _b : 0;
                    const girls = (_d = (_c = p.byGenderByCourse['GIRL']) === null || _c === void 0 ? void 0 : _c[c]) !== null && _d !== void 0 ? _d : 0;
                    return `  ${c}: ${boys}B / ${girls}G`;
                }),
            ]
            : [];
        const recentLine = p.recentEnrollmentsCount !== undefined
            ? `Recent enrollments (last 7 days): ${p.recentEnrollmentsCount} new confirmed students`
            : '';
        const admCatLine = p.byAdmCat
            ? `Admission category — GM seats: ${(_j = p.byAdmCat['GM']) !== null && _j !== void 0 ? _j : 0}, SNQ seats: ${(_k = p.byAdmCat['SNQ']) !== null && _k !== void 0 ? _k : 0}, Others: ${(_l = p.byAdmCat['OTHERS']) !== null && _l !== void 0 ? _l : 0}`
            : '';
        const YEAR_INTAKE = 63;
        const y1 = (_m = p.byYear['1ST YEAR']) !== null && _m !== void 0 ? _m : 0;
        const y2 = (_o = p.byYear['2ND YEAR']) !== null && _o !== void 0 ? _o : 0;
        const y3 = (_p = p.byYear['3RD YEAR']) !== null && _p !== void 0 ? _p : 0;
        const fillLine = `Year-wise fill (intake ${YEAR_INTAKE}/year) — 1st: ${y1} (${Math.round(y1 / YEAR_INTAKE * 100)}%), 2nd: ${y2} (${Math.round(y2 / YEAR_INTAKE * 100)}%), 3rd: ${y3} (${Math.round(y3 / YEAR_INTAKE * 100)}%)`;
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
            `By course — CE: ${(_q = p.byCourse['CE']) !== null && _q !== void 0 ? _q : 0}, ME: ${(_r = p.byCourse['ME']) !== null && _r !== void 0 ? _r : 0}, EC: ${(_s = p.byCourse['EC']) !== null && _s !== void 0 ? _s : 0}, CS: ${(_t = p.byCourse['CS']) !== null && _t !== void 0 ? _t : 0}, EE: ${(_u = p.byCourse['EE']) !== null && _u !== void 0 ? _u : 0}`,
            `By study year — 1st: ${y1}, 2nd: ${y2}, 3rd: ${y3}`,
            fillLine,
            `Admission type — Regular: ${(_v = p.byAdmType['REGULAR']) !== null && _v !== void 0 ? _v : 0}, Lateral: ${(_w = p.byAdmType['LATERAL']) !== null && _w !== void 0 ? _w : 0}, Repeater: ${(_x = p.byAdmType['REPEATER']) !== null && _x !== void 0 ? _x : 0}, SNQ: ${(_y = p.byAdmType['SNQ']) !== null && _y !== void 0 ? _y : 0}, External: ${(_z = p.byAdmType['EXTERNAL']) !== null && _z !== void 0 ? _z : 0}`,
            `Pending (unconfirmed): ${p.pendingTotal} (${p.pendingRegular} regular, ${p.pendingLateral} lateral)`,
            ...(recentLine ? [recentLine] : []),
            ...(categoryLine ? [categoryLine] : []),
            ...(admCatLine ? [admCatLine] : []),
            ...courseYearLines,
            ...genderCourseLines,
            ...(hasPrev ? [
                '',
                `Previous Year (${p.prevAcademicYear}): ${p.prevTotal} students (${p.prevBoys} boys, ${p.prevGirls} girls)`,
                `Prev by course — CE: ${(_1 = (_0 = p.prevByCourse) === null || _0 === void 0 ? void 0 : _0['CE']) !== null && _1 !== void 0 ? _1 : 0}, ME: ${(_3 = (_2 = p.prevByCourse) === null || _2 === void 0 ? void 0 : _2['ME']) !== null && _3 !== void 0 ? _3 : 0}, EC: ${(_5 = (_4 = p.prevByCourse) === null || _4 === void 0 ? void 0 : _4['EC']) !== null && _5 !== void 0 ? _5 : 0}, CS: ${(_7 = (_6 = p.prevByCourse) === null || _6 === void 0 ? void 0 : _6['CS']) !== null && _7 !== void 0 ? _7 : 0}, EE: ${(_9 = (_8 = p.prevByCourse) === null || _8 === void 0 ? void 0 : _8['EE']) !== null && _9 !== void 0 ? _9 : 0}`,
                growthLine,
            ] : []),
        ].join('\n');
        const body = JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 1100,
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
                var _a, _b, _c, _d;
                try {
                    const parsed = JSON.parse(raw);
                    const rawText = (_d = (_c = (_b = (_a = parsed.content) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.text) === null || _c === void 0 ? void 0 : _c.trim()) !== null && _d !== void 0 ? _d : '';
                    const match = rawText.match(/\[[\s\S]*\]/);
                    if (!match) {
                        reject(new Error('Invalid AI response format'));
                        return;
                    }
                    const insights = JSON.parse(match[0]);
                    if (!Array.isArray(insights) || insights.length === 0) {
                        reject(new Error('Empty AI response'));
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
exports.generateAdmissionSummary = (0, https_1.onCall)({ region: 'asia-south1', timeoutSeconds: 30 }, async (request) => {
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
    catch (_a) {
        throw new https_1.HttpsError('internal', 'AI generation failed. Check the API key and try again.');
    }
});
//# sourceMappingURL=index.js.map