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
exports.notifyOnStudentNotification = exports.notifyOnNoticeUpdated = exports.notifyOnCircularUpdated = exports.notifyOnNewCircular = exports.notifyOnNewNotice = void 0;
const admin = __importStar(require("firebase-admin"));
const firestore_1 = require("firebase-functions/v2/firestore");
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
    await sendPush(tokens, { title: notice.title, body: notice.body.slice(0, 150) }, { kind: 'notice', id: event.params.noticeId });
});
// ── New Circular → push notification ────────────────────────────────────────
// Circulars are visible to ALL students — department is a display label, not
// access control — so every registered device is notified.
exports.notifyOnNewCircular = (0, firestore_1.onDocumentCreated)({ document: 'circulars/{circularId}', region: REGION }, async (event) => {
    var _a;
    const circular = (_a = event.data) === null || _a === void 0 ? void 0 : _a.data();
    if (!circular)
        return;
    const tokens = await resolveTokens('all');
    await sendPush(tokens, { title: circular.title, body: circular.subject.slice(0, 150) }, { kind: 'circular', id: event.params.circularId });
});
// ── Circular pinned or (re)published → push notification ───────────────────
// Pin and publish/unpublish are updateDoc calls (see circularService.ts), so
// they never hit notifyOnNewCircular above — this trigger covers those edits.
// Only fires on the specific transition, not every field edit, so routine
// title/body edits stay silent.
exports.notifyOnCircularUpdated = (0, firestore_1.onDocumentUpdated)({ document: 'circulars/{circularId}', region: REGION }, async (event) => {
    var _a, _b;
    const before = (_a = event.data) === null || _a === void 0 ? void 0 : _a.before.data();
    const after = (_b = event.data) === null || _b === void 0 ? void 0 : _b.after.data();
    if (!before || !after)
        return;
    const justPinned = !before.pinned && !!after.pinned;
    const justPublished = !!before.archivedAt && !after.archivedAt;
    if (!justPinned && !justPublished)
        return;
    const tokens = await resolveTokens('all');
    await sendPush(tokens, {
        title: justPinned ? `📌 Pinned: ${after.title}` : after.title,
        body: justPinned ? 'This circular has been pinned to the top.' : after.subject.slice(0, 150),
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
        body: justPinned ? 'This notice has been pinned to the top.' : after.body.slice(0, 150),
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
//# sourceMappingURL=pushNotifications.js.map