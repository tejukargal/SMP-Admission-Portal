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
exports.sendAppUpdateReminder = exports.sendCircularReminder = exports.notifyOnStudentNotification = exports.notifyOnNoticeUpdated = exports.notifyOnCircularUpdated = exports.notifyOnNewCircular = exports.notifyOnNewNotice = void 0;
const admin = __importStar(require("firebase-admin"));
const firestore_1 = require("firebase-functions/v2/firestore");
const https_1 = require("firebase-functions/v2/https");
const REGION = 'asia-south1';
function db() {
    return admin.firestore();
}
/** Firestore 'in' queries accept at most 30 values — chunk regNumbers accordingly. */
function chunk(arr, size) {
    const out = [];
    for (let i = 0; i < arr.length; i += size)
        out.push(arr.slice(i, i + size));
    return out;
}
/** Resolves push tokens for a set of regNumbers (or every registered device
 *  when regNumbers is 'all'). */
async function resolveTokens(regNumbers) {
    var _a, _b;
    const tokens = new Set();
    if (regNumbers === 'all') {
        const snap = await db().collection('studentPushTokens').get();
        for (const d of snap.docs) {
            for (const t of (_a = d.data().tokens) !== null && _a !== void 0 ? _a : [])
                tokens.add(t);
        }
        return [...tokens];
    }
    const unique = [...new Set(regNumbers.filter(Boolean))];
    for (const batch of chunk(unique, 30)) {
        if (batch.length === 0)
            continue;
        const snap = await db().collection('studentPushTokens').where('regNumber', 'in', batch).get();
        for (const d of snap.docs) {
            for (const t of (_b = d.data().tokens) !== null && _b !== void 0 ? _b : [])
                tokens.add(t);
        }
    }
    return [...tokens];
}
/** Sends a push to every token, then prunes tokens FCM reports as dead. */
async function sendPush(tokens, notification, data) {
    if (tokens.length === 0)
        return;
    for (const batch of chunk(tokens, 500)) {
        const response = await admin.messaging().sendEachForMulticast({
            tokens: batch,
            notification,
            data,
            android: { priority: 'high', notification: { channelId: 'default' } },
        });
        const dead = [];
        response.responses.forEach((r, i) => {
            var _a;
            const code = (_a = r.error) === null || _a === void 0 ? void 0 : _a.code;
            if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') {
                dead.push(batch[i]);
            }
        });
        if (dead.length > 0)
            await pruneTokens(dead);
    }
}
async function pruneTokens(deadTokens) {
    var _a;
    const snap = await db().collection('studentPushTokens').get();
    const batch = db().batch();
    let touched = false;
    for (const d of snap.docs) {
        const current = (_a = d.data().tokens) !== null && _a !== void 0 ? _a : [];
        const remaining = current.filter((t) => !deadTokens.includes(t));
        if (remaining.length !== current.length) {
            batch.update(d.ref, { tokens: remaining });
            touched = true;
        }
    }
    if (touched)
        await batch.commit();
}
/** Notice bodies are rich HTML (older ones plain text) — a push notification
 *  can only show plain text, so strip tags/entities before taking the excerpt. */
function plainExcerpt(body, maxChars) {
    if (!body)
        return '';
    const text = body
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
async function resolveNoticeRecipients(notice) {
    var _a;
    switch (notice.scope) {
        case 'all':
            return 'all';
        case 'regNumber':
            return notice.scopeValue ? [notice.scopeValue] : [];
        case 'selected':
            return (_a = notice.targetRegNumbers) !== null && _a !== void 0 ? _a : [];
        case 'academicYear':
        case 'course': {
            if (!notice.scopeValue)
                return [];
            const field = notice.scope === 'academicYear' ? 'academicYear' : 'course';
            const snap = await db().collection('students').where(field, '==', notice.scopeValue).get();
            return [...new Set(snap.docs.map((d) => d.data().regNumber).filter((r) => !!r))];
        }
        default:
            return [];
    }
}
// ── New Notice → push notification ──────────────────────────────────────────
exports.notifyOnNewNotice = (0, firestore_1.onDocumentCreated)({ document: 'notices/{noticeId}', region: REGION }, async (event) => {
    var _a;
    const notice = (_a = event.data) === null || _a === void 0 ? void 0 : _a.data();
    if (!notice)
        return;
    const recipients = await resolveNoticeRecipients(notice);
    const tokens = await resolveTokens(recipients);
    await sendPush(tokens, { title: notice.title, body: plainExcerpt(notice.body, 150) }, { kind: 'notice', id: event.params.noticeId });
});
// ── New Circular → push notification ────────────────────────────────────────
// Circulars are visible to ALL students — department is a display label, not
// access control — so every registered device is notified. Drafts/Scheduled
// (archivedAt set) stay silent here; they notify on publish below. `notify`
// is the admin's "Send push notification" choice (absent on legacy docs = yes).
exports.notifyOnNewCircular = (0, firestore_1.onDocumentCreated)({ document: 'circulars/{circularId}', region: REGION }, async (event) => {
    var _a;
    const circular = (_a = event.data) === null || _a === void 0 ? void 0 : _a.data();
    if (!circular || circular.archivedAt || circular.notify === false)
        return;
    const tokens = await resolveTokens('all');
    await sendPush(tokens, { title: circular.title, body: circular.subject.slice(0, 150) }, { kind: 'circular', id: event.params.circularId });
});
// ── Circular pinned or published → push notification ───────────────────────
// Pin and publish are updateDoc calls (see circularService.ts), so they never
// hit notifyOnNewCircular above — this trigger covers those transitions (incl.
// scheduled publishes by circularLifecycleTick). The client writes `notify`
// together with each transition: publish pushes unless notify === false
// (legacy behaviour), pin pushes only when notify === true (silent by default).
// Routine title/body edits stay silent.
exports.notifyOnCircularUpdated = (0, firestore_1.onDocumentUpdated)({ document: 'circulars/{circularId}', region: REGION }, async (event) => {
    var _a, _b;
    const before = (_a = event.data) === null || _a === void 0 ? void 0 : _a.before.data();
    const after = (_b = event.data) === null || _b === void 0 ? void 0 : _b.after.data();
    if (!before || !after)
        return;
    const justPublished = !!before.archivedAt && !after.archivedAt && after.notify !== false;
    const justPinned = !before.pinned && !!after.pinned && after.notify === true;
    if (!justPinned && !justPublished)
        return;
    const tokens = await resolveTokens('all');
    // Publish + pin in one write (Publish dialog's "Pin to top") sends one push.
    const pinOnly = justPinned && !justPublished;
    await sendPush(tokens, {
        title: pinOnly ? `📌 Pinned: ${after.title}` : after.title,
        body: pinOnly ? 'This circular has been pinned to the top.' : after.subject.slice(0, 150),
    }, { kind: 'circular', id: event.params.circularId });
});
// ── Notice pinned or (re)published → push notification ─────────────────────
// Pin and publish/unpublish are updateDoc calls (see noticeService.ts), so
// they never hit notifyOnNewNotice above — this trigger covers those edits.
// Only fires on the specific transition, not every field edit, so routine
// title/body edits stay silent.
exports.notifyOnNoticeUpdated = (0, firestore_1.onDocumentUpdated)({ document: 'notices/{noticeId}', region: REGION }, async (event) => {
    var _a, _b;
    const before = (_a = event.data) === null || _a === void 0 ? void 0 : _a.before.data();
    const after = (_b = event.data) === null || _b === void 0 ? void 0 : _b.after.data();
    if (!before || !after)
        return;
    const justPinned = !before.pinned && !!after.pinned;
    const justPublished = !!before.archivedAt && !after.archivedAt;
    if (!justPinned && !justPublished)
        return;
    const recipients = await resolveNoticeRecipients(after);
    const tokens = await resolveTokens(recipients);
    await sendPush(tokens, {
        title: justPinned ? `📌 Pinned: ${after.title}` : after.title,
        body: justPinned ? 'This notice has been pinned to the top.' : plainExcerpt(after.body, 150),
    }, { kind: 'notice', id: event.params.noticeId });
});
// ── New Student Notification (fee-paid, status-changed, etc.) → push ───────
exports.notifyOnStudentNotification = (0, firestore_1.onDocumentCreated)({ document: 'studentNotifications/{notificationId}', region: REGION }, async (event) => {
    var _a;
    const notif = (_a = event.data) === null || _a === void 0 ? void 0 : _a.data();
    if (!(notif === null || notif === void 0 ? void 0 : notif.regNumber))
        return;
    const tokens = await resolveTokens([notif.regNumber]);
    // studentNotifications don't have their own detail screen — tapping opens
    // the app to the portal shell (the "What's New" modal already surfaces it).
    await sendPush(tokens, { title: notif.title, body: notif.message.slice(0, 150) }, { kind: 'studentNotification', id: event.params.notificationId });
});
// ── Circular reminder (admin "Send Reminder" on a Live circular) ───────────
// Re-notifies students about an already-live circular with an admin-edited
// title/body. audience 'unseen' skips students who have already opened it
// (studentCircularState: the web portal stores bare ids, the mobile app
// `id:updatedAt` keys). dryRun returns the recipient counts without sending.
// Records lastReminderAt/reminderCount but never updatedAt (that would
// re-flag the circular as unread).
const REMINDER_COOLDOWN_MS = 5 * 60 * 1000;
exports.sendCircularReminder = (0, https_1.onCall)({ region: REGION }, async (request) => {
    var _a, _b, _c, _d, _e;
    if (((_b = (_a = request.auth) === null || _a === void 0 ? void 0 : _a.token) === null || _b === void 0 ? void 0 : _b.admin) !== true) {
        throw new https_1.HttpsError('permission-denied', 'Admin sign-in required.');
    }
    const { circularId, title, body, audience, dryRun } = ((_c = request.data) !== null && _c !== void 0 ? _c : {});
    if (!circularId)
        throw new https_1.HttpsError('invalid-argument', 'circularId is required.');
    const ref = db().collection('circulars').doc(circularId);
    const snap = await ref.get();
    const circular = snap.data();
    if (!circular)
        throw new https_1.HttpsError('not-found', 'Circular not found.');
    if (circular.archivedAt || circular.expiredAt) {
        throw new https_1.HttpsError('failed-precondition', 'Only Live circulars can be reminded.');
    }
    const tokenDocs = (await db().collection('studentPushTokens').get()).docs;
    let excluded = new Set();
    if (audience === 'unseen') {
        const stateDocs = (await db().collection('studentCircularState').get()).docs;
        excluded = new Set(stateDocs
            .filter((d) => {
            var _a;
            return ((_a = d.data().seenCircularIds) !== null && _a !== void 0 ? _a : [])
                .some((k) => k === circularId || k.startsWith(`${circularId}:`));
        })
            .map((d) => d.id));
    }
    const tokens = new Set();
    let students = 0;
    for (const d of tokenDocs) {
        const regNumber = (_d = d.data().regNumber) !== null && _d !== void 0 ? _d : d.id;
        if (excluded.has(regNumber))
            continue;
        const list = (_e = d.data().tokens) !== null && _e !== void 0 ? _e : [];
        if (list.length === 0)
            continue;
        students++;
        list.forEach((t) => tokens.add(t));
    }
    if (dryRun)
        return { students, devices: tokens.size, sent: false };
    const cleanTitle = (title !== null && title !== void 0 ? title : '').trim().slice(0, 80);
    const cleanBody = (body !== null && body !== void 0 ? body : '').trim().slice(0, 200);
    if (!cleanTitle)
        throw new https_1.HttpsError('invalid-argument', 'A notification title is required.');
    if (circular.lastReminderAt && Date.now() - Date.parse(circular.lastReminderAt) < REMINDER_COOLDOWN_MS) {
        throw new https_1.HttpsError('resource-exhausted', 'A reminder was sent less than 5 minutes ago. Please wait before sending another.');
    }
    await sendPush([...tokens], { title: cleanTitle, body: cleanBody }, { kind: 'circular', id: circularId });
    await ref.update({
        lastReminderAt: new Date().toISOString(),
        reminderCount: admin.firestore.FieldValue.increment(1),
    });
    return { students, devices: tokens.size, sent: true };
});
// ── App update reminder (Settings › App Version › "Remind Students to Update") ─
// Pushes kind 'update' to every device still on an older app version than the
// published appConfig/version.latestVersion. The app (1.0.38+) records its
// installed version per token in studentPushTokens.tokenVersions; a token with
// no recorded version is from an older build, so it's always counted as
// outdated. Tapping the push opens the in-app update card (1.0.38+; older
// builds open the Play Store directly). dryRun returns the counts only.
/** Compares dot-separated numeric versions — same rule as the app's utils/version.ts. */
function isNewerVersion(remote, local) {
    var _a, _b, _c, _d;
    const r = remote.split('.').map((p) => parseInt(p, 10) || 0);
    const l = local.split('.').map((p) => parseInt(p, 10) || 0);
    for (let i = 0; i < Math.max(r.length, l.length); i++) {
        if (((_a = r[i]) !== null && _a !== void 0 ? _a : 0) > ((_b = l[i]) !== null && _b !== void 0 ? _b : 0))
            return true;
        if (((_c = r[i]) !== null && _c !== void 0 ? _c : 0) < ((_d = l[i]) !== null && _d !== void 0 ? _d : 0))
            return false;
    }
    return false;
}
exports.sendAppUpdateReminder = (0, https_1.onCall)({ region: REGION }, async (request) => {
    var _a, _b, _c, _d, _e, _f, _g;
    if (((_b = (_a = request.auth) === null || _a === void 0 ? void 0 : _a.token) === null || _b === void 0 ? void 0 : _b.admin) !== true) {
        throw new https_1.HttpsError('permission-denied', 'Admin sign-in required.');
    }
    const { title, body, dryRun } = ((_c = request.data) !== null && _c !== void 0 ? _c : {});
    const versionRef = db().doc('appConfig/version');
    const config = (await versionRef.get()).data();
    const latestVersion = (_d = config === null || config === void 0 ? void 0 : config.latestVersion) === null || _d === void 0 ? void 0 : _d.trim();
    if (!latestVersion) {
        throw new https_1.HttpsError('failed-precondition', 'Publish a version in App Version first.');
    }
    const tokens = new Set();
    let students = 0;
    let upToDate = 0;
    for (const d of (await db().collection('studentPushTokens').get()).docs) {
        const data = d.data();
        const outdated = ((_e = data.tokens) !== null && _e !== void 0 ? _e : []).filter((t) => {
            var _a;
            const v = (_a = data.tokenVersions) === null || _a === void 0 ? void 0 : _a[t];
            return !v || isNewerVersion(latestVersion, v);
        });
        if (outdated.length > 0) {
            students++;
            outdated.forEach((t) => tokens.add(t));
        }
        else if (((_f = data.tokens) !== null && _f !== void 0 ? _f : []).length > 0) {
            upToDate++;
        }
    }
    if (dryRun)
        return { students, devices: tokens.size, upToDate, latestVersion, sent: false };
    const cleanTitle = (title !== null && title !== void 0 ? title : '').trim().slice(0, 80);
    const cleanBody = (body !== null && body !== void 0 ? body : '').trim().slice(0, 200);
    if (!cleanTitle)
        throw new https_1.HttpsError('invalid-argument', 'A notification title is required.');
    if ((config === null || config === void 0 ? void 0 : config.lastUpdateReminderAt) && Date.now() - Date.parse(config.lastUpdateReminderAt) < REMINDER_COOLDOWN_MS) {
        throw new https_1.HttpsError('resource-exhausted', 'An update reminder was sent less than 5 minutes ago. Please wait before sending another.');
    }
    await sendPush([...tokens], { title: cleanTitle, body: cleanBody }, { kind: 'update', url: (_g = config === null || config === void 0 ? void 0 : config.updateUrl) !== null && _g !== void 0 ? _g : '' });
    await versionRef.set({
        lastUpdateReminderAt: new Date().toISOString(),
        updateReminderCount: admin.firestore.FieldValue.increment(1),
    }, { merge: true });
    return { students, devices: tokens.size, upToDate, latestVersion, sent: true };
});
//# sourceMappingURL=pushNotifications.js.map