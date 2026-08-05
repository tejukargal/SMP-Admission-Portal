import * as admin from 'firebase-admin';
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';

const REGION = 'asia-south1';

function db() {
  return admin.firestore();
}

/** Firestore 'in' queries accept at most 30 values — chunk regNumbers accordingly. */
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Resolves push tokens for a set of regNumbers (or every registered device
 *  when regNumbers is 'all'). */
async function resolveTokens(regNumbers: string[] | 'all'): Promise<string[]> {
  const tokens = new Set<string>();

  if (regNumbers === 'all') {
    const snap = await db().collection('studentPushTokens').get();
    for (const d of snap.docs) {
      for (const t of (d.data().tokens as string[] | undefined) ?? []) tokens.add(t);
    }
    return [...tokens];
  }

  const unique = [...new Set(regNumbers.filter(Boolean))];
  for (const batch of chunk(unique, 30)) {
    if (batch.length === 0) continue;
    const snap = await db().collection('studentPushTokens').where('regNumber', 'in', batch).get();
    for (const d of snap.docs) {
      for (const t of (d.data().tokens as string[] | undefined) ?? []) tokens.add(t);
    }
  }
  return [...tokens];
}

/** Sends a push to every token, then prunes tokens FCM reports as dead. */
async function sendPush(
  tokens: string[],
  notification: { title: string; body: string },
  data: Record<string, string>,
): Promise<void> {
  if (tokens.length === 0) return;

  for (const batch of chunk(tokens, 500)) {
    const response = await admin.messaging().sendEachForMulticast({
      tokens: batch,
      notification,
      data,
      android: { priority: 'high', notification: { channelId: 'default' } },
    });

    const dead: string[] = [];
    response.responses.forEach((r, i) => {
      const code = r.error?.code;
      if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') {
        dead.push(batch[i]);
      }
    });
    if (dead.length > 0) await pruneTokens(dead);
  }
}

async function pruneTokens(deadTokens: string[]): Promise<void> {
  const snap = await db().collection('studentPushTokens').get();
  const batch = db().batch();
  let touched = false;
  for (const d of snap.docs) {
    const current = (d.data().tokens as string[] | undefined) ?? [];
    const remaining = current.filter((t) => !deadTokens.includes(t));
    if (remaining.length !== current.length) {
      batch.update(d.ref, { tokens: remaining });
      touched = true;
    }
  }
  if (touched) await batch.commit();
}

interface NoticeData {
  title: string;
  body: string;
  category?: string;
  scope: 'all' | 'academicYear' | 'course' | 'regNumber' | 'selected';
  scopeValue?: string;
  targetRegNumbers?: string[];
}

async function resolveNoticeRecipients(notice: NoticeData): Promise<string[] | 'all'> {
  switch (notice.scope) {
    case 'all':
      return 'all';
    case 'regNumber':
      return notice.scopeValue ? [notice.scopeValue] : [];
    case 'selected':
      return notice.targetRegNumbers ?? [];
    case 'academicYear':
    case 'course': {
      if (!notice.scopeValue) return [];
      const field = notice.scope === 'academicYear' ? 'academicYear' : 'course';
      const snap = await db().collection('students').where(field, '==', notice.scopeValue).get();
      return [...new Set(snap.docs.map((d) => (d.data().regNumber as string | undefined)).filter((r): r is string => !!r))];
    }
    default:
      return [];
  }
}

// ── New Notice → push notification ──────────────────────────────────────────
export const notifyOnNewNotice = onDocumentCreated(
  { document: 'notices/{noticeId}', region: REGION },
  async (event) => {
    const notice = event.data?.data() as NoticeData | undefined;
    if (!notice) return;

    const recipients = await resolveNoticeRecipients(notice);
    const tokens = await resolveTokens(recipients);
    await sendPush(
      tokens,
      { title: notice.title, body: notice.body.slice(0, 150) },
      { kind: 'notice', id: event.params.noticeId },
    );
  },
);

// ── New Circular → push notification ────────────────────────────────────────
// Circulars are visible to ALL students — department is a display label, not
// access control — so every registered device is notified.
export const notifyOnNewCircular = onDocumentCreated(
  { document: 'circulars/{circularId}', region: REGION },
  async (event) => {
    const circular = event.data?.data() as { title: string; subject: string } | undefined;
    if (!circular) return;

    const tokens = await resolveTokens('all');
    await sendPush(
      tokens,
      { title: circular.title, body: circular.subject.slice(0, 150) },
      { kind: 'circular', id: event.params.circularId },
    );
  },
);

// ── Circular pinned or (re)published → push notification ───────────────────
// Pin and publish/unpublish are updateDoc calls (see circularService.ts), so
// they never hit notifyOnNewCircular above — this trigger covers those edits.
// Only fires on the specific transition, not every field edit, so routine
// title/body edits stay silent.
export const notifyOnCircularUpdated = onDocumentUpdated(
  { document: 'circulars/{circularId}', region: REGION },
  async (event) => {
    const before = event.data?.before.data() as { pinned?: boolean; archivedAt?: string } | undefined;
    const after = event.data?.after.data() as { title: string; subject: string; pinned?: boolean; archivedAt?: string } | undefined;
    if (!before || !after) return;

    const justPinned = !before.pinned && !!after.pinned;
    const justPublished = !!before.archivedAt && !after.archivedAt;
    if (!justPinned && !justPublished) return;

    const tokens = await resolveTokens('all');
    await sendPush(
      tokens,
      {
        title: justPinned ? `📌 Pinned: ${after.title}` : after.title,
        body: justPinned ? 'This circular has been pinned to the top.' : after.subject.slice(0, 150),
      },
      { kind: 'circular', id: event.params.circularId },
    );
  },
);

// ── Notice pinned or (re)published → push notification ─────────────────────
// Pin and publish/unpublish are updateDoc calls (see noticeService.ts), so
// they never hit notifyOnNewNotice above — this trigger covers those edits.
// Only fires on the specific transition, not every field edit, so routine
// title/body edits stay silent.
export const notifyOnNoticeUpdated = onDocumentUpdated(
  { document: 'notices/{noticeId}', region: REGION },
  async (event) => {
    const before = event.data?.before.data() as { pinned?: boolean; archivedAt?: string } | undefined;
    const after = event.data?.after.data() as NoticeData & { pinned?: boolean; archivedAt?: string } | undefined;
    if (!before || !after) return;

    const justPinned = !before.pinned && !!after.pinned;
    const justPublished = !!before.archivedAt && !after.archivedAt;
    if (!justPinned && !justPublished) return;

    const recipients = await resolveNoticeRecipients(after);
    const tokens = await resolveTokens(recipients);
    await sendPush(
      tokens,
      {
        title: justPinned ? `📌 Pinned: ${after.title}` : after.title,
        body: justPinned ? 'This notice has been pinned to the top.' : after.body.slice(0, 150),
      },
      { kind: 'notice', id: event.params.noticeId },
    );
  },
);

// ── New Student Notification (fee-paid, status-changed, etc.) → push ───────
export const notifyOnStudentNotification = onDocumentCreated(
  { document: 'studentNotifications/{notificationId}', region: REGION },
  async (event) => {
    const notif = event.data?.data() as { regNumber?: string; title: string; message: string } | undefined;
    if (!notif?.regNumber) return;

    const tokens = await resolveTokens([notif.regNumber]);
    // studentNotifications don't have their own detail screen — tapping opens
    // the app to the portal shell (the "What's New" modal already surfaces it).
    await sendPush(
      tokens,
      { title: notif.title, body: notif.message.slice(0, 150) },
      { kind: 'studentNotification', id: event.params.notificationId },
    );
  },
);
