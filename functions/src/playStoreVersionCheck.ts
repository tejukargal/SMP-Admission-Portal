import * as admin from 'firebase-admin';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import { androidpublisher, auth } from '@googleapis/androidpublisher';

const REGION = 'asia-south1';
const PACKAGE_NAME = 'com.smpstudents.portal';

const playServiceAccountKey = defineSecret('PLAY_SERVICE_ACCOUNT_KEY');

function db() {
  return admin.firestore();
}

interface PendingRelease {
  versionCode: number;
  versionName: string;
  updateUrl: string;
}

function playPublisherClient() {
  const key = JSON.parse(playServiceAccountKey.value()) as { client_email: string; private_key: string };
  const jwt = new auth.JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: ['https://www.googleapis.com/auth/androidpublisher'],
  });
  return androidpublisher({ version: 'v3', auth: jwt });
}

/** Returns the highest versionCode among fully-rolled-out ('completed')
 *  production releases, or null if it can't be determined (no releases yet,
 *  or the API call fails — never throws). */
async function getLiveProductionVersionCode(): Promise<number | null> {
  const publisher = playPublisherClient();
  let editId: string | null = null;
  try {
    const edit = await publisher.edits.insert({ packageName: PACKAGE_NAME });
    editId = edit.data.id ?? null;
    if (!editId) return null;

    const track = await publisher.edits.tracks.get({
      packageName: PACKAGE_NAME,
      editId,
      track: 'production',
    });

    const releases = track.data.releases ?? [];
    let maxVersionCode: number | null = null;
    for (const release of releases) {
      if (release.status !== 'completed') continue;
      for (const vc of release.versionCodes ?? []) {
        const n = Number(vc);
        if (!Number.isNaN(n) && (maxVersionCode === null || n > maxVersionCode)) {
          maxVersionCode = n;
        }
      }
    }
    return maxVersionCode;
  } catch (err) {
    console.error('getLiveProductionVersionCode failed', err);
    return null;
  } finally {
    if (editId) {
      await publisher.edits.delete({ packageName: PACKAGE_NAME, editId }).catch((err) => {
        console.error('Failed to discard Play Store edit', err);
      });
    }
  }
}

// ── Poll the Play Store production track and auto-publish appConfig/version
//    once a pending release (registered manually via Settings → App Version
//    after uploading a build) is confirmed live ────────────────────────────
export const checkPlayStoreRelease = onSchedule(
  { schedule: 'every 6 hours', region: REGION, secrets: [playServiceAccountKey] },
  async () => {
    const pendingSnap = await db().doc('appConfig/pendingRelease').get();
    if (!pendingSnap.exists) return;

    const pending = pendingSnap.data() as PendingRelease;
    const liveVersionCode = await getLiveProductionVersionCode();
    if (liveVersionCode === null || liveVersionCode !== pending.versionCode) return;

    await db().doc('appConfig/version').set(
      { latestVersion: pending.versionName, updateUrl: pending.updateUrl },
      { merge: true },
    );
    await db().doc('appConfig/pendingRelease').delete();
  },
);
