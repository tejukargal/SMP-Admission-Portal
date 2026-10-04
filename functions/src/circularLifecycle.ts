import * as admin from 'firebase-admin';
import { onSchedule } from 'firebase-functions/v2/scheduler';

const REGION = 'asia-south1';

function db() {
  return admin.firestore();
}

/** Today's date (YYYY-MM-DD) in India time. */
function todayIST(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

// ── Circular lifecycle: scheduled publish + "valid until" auto-expiry ──────
// - A Scheduled circular is a Draft (archivedAt set) with publishAt. Once due,
//   clearing archivedAt makes it Live; notifyOnCircularUpdated then sends the
//   push if the admin chose "Send push notification" (stored `notify`).
// - expiresOn is inclusive (valid through that IST day), so a circular expires
//   on the first tick of the following day. Expiry unpins, and leaves
//   updatedAt alone so students don't see it re-flagged as unread.
export const circularLifecycleTick = onSchedule(
  { schedule: 'every 15 minutes', timeZone: 'Asia/Kolkata', region: REGION },
  async () => {
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
      const data = d.data() as { archivedAt?: string; expiredAt?: string };
      // Drafts keep their date until published; already-expired ones are done.
      if (data.expiredAt || data.archivedAt) continue;
      await d.ref.update({
        expiredAt: now,
        pinned: admin.firestore.FieldValue.delete(),
        pinnedAt: admin.firestore.FieldValue.delete(),
      });
    }
  },
);
