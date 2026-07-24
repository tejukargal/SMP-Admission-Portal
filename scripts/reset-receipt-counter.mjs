/**
 * One-time fix: delete the receiptCounters/{academicYear} doc so it gets
 * rebuilt from actual feeRecords on next read. Needed after a receipt number
 * from the wrong series (Aided/Unaided) got recorded and dragged the shared
 * counter forward — the rebuild logic now ignores such implausible jumps
 * (see isPlausibleReceiptJump in src/services/feeRecordService.ts).
 *
 * Uses Firestore REST API (Firebase CLI stored credentials, no service account).
 *
 * Usage:
 *   node scripts/reset-receipt-counter.mjs --dry-run   # preview current doc
 *   node scripts/reset-receipt-counter.mjs              # delete the doc
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const DRY_RUN    = process.argv.includes('--dry-run');
const ACADEMIC_YEAR = process.argv.find((a) => /^\d{4}-\d{2}$/.test(a)) ?? '2026-27';
const PROJECT_ID = 'smp-admissions';
const BASE       = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const CLIENT_ID     = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
const CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi';

function getRefreshToken() {
  const p = join(homedir(), '.config', 'configstore', 'firebase-tools.json');
  const data = JSON.parse(readFileSync(p, 'utf8'));
  const rt = data.tokens?.refresh_token;
  if (!rt) throw new Error('No refresh token. Run `firebase login` first.');
  return rt;
}

async function getAccessToken(refreshToken) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${await res.text()}`);
  return (await res.json()).access_token;
}

async function main() {
  if (DRY_RUN) console.log('[DRY RUN] No changes will be written.\n');

  console.log('Authenticating via Firebase CLI credentials…');
  const token = await getAccessToken(getRefreshToken());

  const docUrl = `${BASE}/receiptCounters/${ACADEMIC_YEAR}`;
  console.log(`Fetching receiptCounters/${ACADEMIC_YEAR}…`);
  const getRes = await fetch(docUrl, { headers: { Authorization: `Bearer ${token}` } });

  if (getRes.status === 404) {
    console.log('No counter doc exists for this year — nothing to reset.');
    return;
  }
  if (!getRes.ok) throw new Error(`Fetch failed: ${getRes.status} ${await getRes.text()}`);

  const doc = await getRes.json();
  console.log('Current counter doc:');
  console.log(JSON.stringify(doc.fields, null, 2));

  if (DRY_RUN) {
    console.log('\n[DRY RUN] Exiting without deleting.');
    return;
  }

  console.log('\nDeleting counter doc so it rebuilds from actual fee records on next read…');
  const delRes = await fetch(docUrl, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
  if (!delRes.ok) throw new Error(`Delete failed: ${delRes.status} ${await delRes.text()}`);

  console.log('Done. The counter will be rebuilt (with the new plausibility guard) the next time');
  console.log('the Collect Fee modal is opened or a fee record is saved for this academic year.');
}

main().catch((err) => {
  console.error('Error:', err.message ?? err);
  process.exit(1);
});
