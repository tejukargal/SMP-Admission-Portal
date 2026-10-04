import * as admin from 'firebase-admin';
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';

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

/** Notice bodies are rich HTML (older ones plain text) — a push notification
 *  can only show plain text, so strip tags/entities before taking the excerpt. */
function plainExcerpt(body: string | undefined, maxChars: number): string {
  if (!body) return '';
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
      { title: notice.title, body: plainExcerpt(notice.body, 150) },
      { kind: 'notice', id: event.params.noticeId },
    );
  },
);

// ── New Circular → push notification ────────────────────────────────────────
// Circulars are visible to ALL students — department is a display label, not
// access control — so every registered device is notified. Drafts/Scheduled
// (archivedAt set) stay silent here; they notify on publish below. `notify`
// is the admin's "Send push notification" choice (absent on legacy docs = yes).
export const notifyOnNewCircular = onDocumentCreated(
  { document: 'circulars/{circularId}', region: REGION },
  async (event) => {
    const circular = event.data?.data() as { title: string; subject: string; archivedAt?: string; notify?: boolean } | undefined;
    if (!circular || circular.archivedAt || circular.notify === false) return;

    const tokens = await resolveTokens('all');
    await sendPush(
      tokens,
      { title: circular.title, body: circular.subject.slice(0, 150) },
      { kind: 'circular', id: event.params.circularId },
    );
  },
);

// ── Circular pinned or published → push notification ───────────────────────
// Pin and publish are updateDoc calls (see circularService.ts), so they never
// hit notifyOnNewCircular above — this trigger covers those transitions (incl.
// scheduled publishes by circularLifecycleTick). The client writes `notify`
// together with each transition: publish pushes unless notify === false
// (legacy behaviour), pin pushes only when notify === true (silent by default).
// Routine title/body edits stay silent.
export const notifyOnCircularUpdated = onDocumentUpdated(
  { document: 'circulars/{circularId}', region: REGION },
  async (event) => {
    const before = event.data?.before.data() as { pinned?: boolean; archivedAt?: string } | undefined;
    const after = event.data?.after.data() as { title: string; subject: string; pinned?: boolean; archivedAt?: string; notify?: boolean } | undefined;
    if (!before || !after) return;

    const justPublished = !!before.archivedAt && !after.archivedAt && after.notify !== false;
    const justPinned = !before.pinned && !!after.pinned && after.notify === true;
    if (!justPinned && !justPublished) return;

    const tokens = await resolveTokens('all');
    // Publish + pin in one write (Publish dialog's "Pin to top") sends one push.
    const pinOnly = justPinned && !justPublished;
    await sendPush(
      tokens,
      {
        title: pinOnly ? `📌 Pinned: ${after.title}` : after.title,
        body: pinOnly ? 'This circular has been pinned to the top.' : after.subject.slice(0, 150),
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
        body: justPinned ? 'This notice has been pinned to the top.' : plainExcerpt(after.body, 150),
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

// ── Circular reminder (admin "Send Reminder" on a Live circular) ───────────
// Re-notifies students about an already-live circular with an admin-edited
// title/body. audience 'unseen' skips students who have already opened it
// (studentCircularState: the web portal stores bare ids, the mobile app
// `id:updatedAt` keys). dryRun returns the recipient counts without sending.
// Records lastReminderAt/reminderCount but never updatedAt (that would
// re-flag the circular as unread).
const REMINDER_COOLDOWN_MS = 5 * 60 * 1000;

export const sendCircularReminder = onCall({ region: REGION }, async (request) => {
  if (request.auth?.token?.admin !== true) {
    throw new HttpsError('permission-denied', 'Admin sign-in required.');
  }
  const { circularId, title, body, audience, dryRun } = (request.data ?? {}) as {
    circularId?: string; title?: string; body?: string; audience?: 'all' | 'unseen'; dryRun?: boolean;
  };
  if (!circularId) throw new HttpsError('invalid-argument', 'circularId is required.');

  const ref = db().collection('circulars').doc(circularId);
  const snap = await ref.get();
  const circular = snap.data() as { archivedAt?: string; expiredAt?: string; lastReminderAt?: string } | undefined;
  if (!circular) throw new HttpsError('not-found', 'Circular not found.');
  if (circular.archivedAt || circular.expiredAt) {
    throw new HttpsError('failed-precondition', 'Only Live circulars can be reminded.');
  }

  const tokenDocs = (await db().collection('studentPushTokens').get()).docs;
  let excluded = new Set<string>();
  if (audience === 'unseen') {
    const stateDocs = (await db().collection('studentCircularState').get()).docs;
    excluded = new Set(
      stateDocs
        .filter((d) => ((d.data().seenCircularIds as string[] | undefined) ?? [])
          .some((k) => k === circularId || k.startsWith(`${circularId}:`)))
        .map((d) => d.id),
    );
  }
  const tokens = new Set<string>();
  let students = 0;
  for (const d of tokenDocs) {
    const regNumber = (d.data().regNumber as string | undefined) ?? d.id;
    if (excluded.has(regNumber)) continue;
    const list = (d.data().tokens as string[] | undefined) ?? [];
    if (list.length === 0) continue;
    students++;
    list.forEach((t) => tokens.add(t));
  }

  if (dryRun) return { students, devices: tokens.size, sent: false };

  const cleanTitle = (title ?? '').trim().slice(0, 80);
  const cleanBody = (body ?? '').trim().slice(0, 200);
  if (!cleanTitle) throw new HttpsError('invalid-argument', 'A notification title is required.');
  if (circular.lastReminderAt && Date.now() - Date.parse(circular.lastReminderAt) < REMINDER_COOLDOWN_MS) {
    throw new HttpsError('resource-exhausted', 'A reminder was sent less than 5 minutes ago. Please wait before sending another.');
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
function isNewerVersion(remote: string, local: string): boolean {
  const r = remote.split('.').map((p) => parseInt(p, 10) || 0);
  const l = local.split('.').map((p) => parseInt(p, 10) || 0);
  for (let i = 0; i < Math.max(r.length, l.length); i++) {
    if ((r[i] ?? 0) > (l[i] ?? 0)) return true;
    if ((r[i] ?? 0) < (l[i] ?? 0)) return false;
  }
  return false;
}

export const sendAppUpdateReminder = onCall({ region: REGION }, async (request) => {
  if (request.auth?.token?.admin !== true) {
    throw new HttpsError('permission-denied', 'Admin sign-in required.');
  }
  const { title, body, dryRun } = (request.data ?? {}) as { title?: string; body?: string; dryRun?: boolean };

  const versionRef = db().doc('appConfig/version');
  const config = (await versionRef.get()).data() as
    { latestVersion?: string; updateUrl?: string; lastUpdateReminderAt?: string } | undefined;
  const latestVersion = config?.latestVersion?.trim();
  if (!latestVersion) {
    throw new HttpsError('failed-precondition', 'Publish a version in App Version first.');
  }

  const tokens = new Set<string>();
  let students = 0;
  let upToDate = 0;
  for (const d of (await db().collection('studentPushTokens').get()).docs) {
    const data = d.data() as { tokens?: string[]; tokenVersions?: Record<string, string> };
    const outdated = (data.tokens ?? []).filter((t) => {
      const v = data.tokenVersions?.[t];
      return !v || isNewerVersion(latestVersion, v);
    });
    if (outdated.length > 0) {
      students++;
      outdated.forEach((t) => tokens.add(t));
    } else if ((data.tokens ?? []).length > 0) {
      upToDate++;
    }
  }

  if (dryRun) return { students, devices: tokens.size, upToDate, latestVersion, sent: false };

  const cleanTitle = (title ?? '').trim().slice(0, 80);
  const cleanBody = (body ?? '').trim().slice(0, 200);
  if (!cleanTitle) throw new HttpsError('invalid-argument', 'A notification title is required.');
  if (config?.lastUpdateReminderAt && Date.now() - Date.parse(config.lastUpdateReminderAt) < REMINDER_COOLDOWN_MS) {
    throw new HttpsError('resource-exhausted', 'An update reminder was sent less than 5 minutes ago. Please wait before sending another.');
  }

  await sendPush([...tokens], { title: cleanTitle, body: cleanBody }, { kind: 'update', url: config?.updateUrl ?? '' });
  await versionRef.set({
    lastUpdateReminderAt: new Date().toISOString(),
    updateReminderCount: admin.firestore.FieldValue.increment(1),
  }, { merge: true });
  return { students, devices: tokens.size, upToDate, latestVersion, sent: true };
});
