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
exports.circularLifecycleTick = void 0;
const admin = __importStar(require("firebase-admin"));
const scheduler_1 = require("firebase-functions/v2/scheduler");
const REGION = 'asia-south1';
function db() {
    return admin.firestore();
}
/** Today's date (YYYY-MM-DD) in India time. */
function todayIST() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}
// ── Circular lifecycle: scheduled publish + "valid until" auto-expiry ──────
// - A Scheduled circular is a Draft (archivedAt set) with publishAt. Once due,
//   clearing archivedAt makes it Live; notifyOnCircularUpdated then sends the
//   push if the admin chose "Send push notification" (stored `notify`).
// - expiresOn is inclusive (valid through that IST day), so a circular expires
//   on the first tick of the following day. Expiry unpins, and leaves
//   updatedAt alone so students don't see it re-flagged as unread.
exports.circularLifecycleTick = (0, scheduler_1.onSchedule)({ schedule: 'every 15 minutes', timeZone: 'Asia/Kolkata', region: REGION }, async () => {
    const col = db().collection('circulars');
    const now = new Date().toISOString();
    const due = await col.where('publishAt', '<=', now).get();
    for (const d of due.docs) {
        await d.ref.update({
            archivedAt: admin.firestore.FieldValue.delete(),
            expiredAt: admin.firestore.FieldValue.delete(),
            publishAt: admin.firestore.FieldValue.delete(),
        });
    }
    const lapsed = await col.where('expiresOn', '<', todayIST()).get();
    for (const d of lapsed.docs) {
        const data = d.data();
        // Drafts keep their date until published; already-expired ones are done.
        if (data.expiredAt || data.archivedAt)
            continue;
        await d.ref.update({
            expiredAt: now,
            pinned: admin.firestore.FieldValue.delete(),
            pinnedAt: admin.firestore.FieldValue.delete(),
        });
    }
});
//# sourceMappingURL=circularLifecycle.js.map