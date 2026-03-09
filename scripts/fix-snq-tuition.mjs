/**
 * One-time migration: set smp.tuition = 0 for all feeRecords where
 * admType === 'SNQ' OR admCat === 'SNQ', across all academic years.
 *
 * Uses Firestore REST API (no quota issues, no service account needed).
 * Auth: Firebase CLI stored credentials (firebase login).
 *
 * Usage:
 *   node scripts/fix-snq-tuition.mjs --dry-run   # preview only
 *   node scripts/fix-snq-tuition.mjs              # apply changes
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const DRY_RUN    = process.argv.includes('--dry-run');
const PROJECT_ID = 'smp-admissions';
const BASE       = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const CLIENT_ID     = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
const CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi';

// ── Auth ──────────────────────────────────────────────────────────────────────

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

// ── Firestore helpers ─────────────────────────────────────────────────────────

/**
 * Fetch only feeRecords where admType == 'SNQ' OR admCat == 'SNQ'
 * using a server-side structured query — minimises read quota usage.
 */
async function querySNQFeeRecords(token) {
  const url = `${BASE}:runQuery`;
  const body = {
    structuredQuery: {
      from: [{ collectionId: 'feeRecords' }],
      where: {
        compositeFilter: {
          op: 'OR',
          filters: [
            {
              fieldFilter: {
                field: { fieldPath: 'admType' },
                op: 'EQUAL',
                value: { stringValue: 'SNQ' },
              },
            },
            {
              fieldFilter: {
                field: { fieldPath: 'admCat' },
                op: 'EQUAL',
                value: { stringValue: 'SNQ' },
              },
            },
          ],
        },
      },
    },
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Query failed: ${res.status} ${await res.text()}`);
  const rows = await res.json();
  // Each row is { document: {...} } or { skippedResults: n } at end
  return rows.filter((r) => r.document).map((r) => r.document);
}

/** Extract a string field value from a Firestore REST document. */
function str(fields, key) {
  return fields?.[key]?.stringValue ?? null;
}

/** Extract a number field (integerValue or doubleValue) from a Firestore REST document. */
function num(fields, key) {
  const f = fields?.[key];
  if (!f) return null;
  if ('integerValue' in f) return Number(f.integerValue);
  if ('doubleValue'  in f) return Number(f.doubleValue);
  return null;
}

/** Extract a nested map field value. */
function mapNum(fields, mapKey, subKey) {
  const mapFields = fields?.[mapKey]?.mapValue?.fields;
  return num(mapFields, subKey);
}

/**
 * PATCH a single field within a map using a dotted field path mask.
 * Only `smp.tuition` is touched; all other fields are left unchanged.
 */
async function patchTuition(token, docPath, newValue) {
  const url = `${BASE}/${docPath}?updateMask.fieldPaths=smp.tuition`;
  const body = {
    fields: {
      smp: {
        mapValue: {
          fields: {
            tuition: { integerValue: String(newValue) },
          },
        },
      },
    },
  };
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Patch ${docPath} failed: ${res.status} ${await res.text()}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  if (DRY_RUN) console.log('[DRY RUN] No changes will be written.\n');

  console.log('Authenticating via Firebase CLI credentials…');
  const token = await getAccessToken(getRefreshToken());

  console.log('Querying feeRecords where admType=SNQ or admCat=SNQ…');
  const snqDocs = await querySNQFeeRecords(token);
  console.log(`Records matching SNQ admType or admCat: ${snqDocs.length}`);

  const alreadyZero = snqDocs.filter((doc) => (mapNum(doc.fields, 'smp', 'tuition') ?? 0) === 0);
  const needsUpdate = snqDocs.filter((doc) => (mapNum(doc.fields, 'smp', 'tuition') ?? 0) !== 0);

  console.log(`  → Already zero (skip): ${alreadyZero.length}`);
  console.log(`  → Needs update:        ${needsUpdate.length}`);

  if (needsUpdate.length === 0) {
    console.log('\nNothing to update. Done.');
    return;
  }

  console.log('\nRecords that will be updated:');
  for (const doc of needsUpdate) {
    const f = doc.fields ?? {};
    const docId = doc.name.split('/').pop();
    console.log(
      `  [${docId}]  ${str(f, 'studentName') ?? '?'}` +
      `  |  AY: ${str(f, 'academicYear') ?? '?'}` +
      `  |  ${str(f, 'course') ?? '?'} ${str(f, 'year') ?? '?'}` +
      `  |  admType: ${str(f, 'admType') ?? '?'}` +
      `  |  admCat: ${str(f, 'admCat') ?? '?'}` +
      `  |  tuition: ${mapNum(f, 'smp', 'tuition')} → 0`
    );
  }

  if (DRY_RUN) {
    console.log('\n[DRY RUN] Exiting without writing.');
    return;
  }

  console.log('\nApplying updates…');
  let updated = 0;
  for (const doc of needsUpdate) {
    const docPath = doc.name.split('/documents/')[1];
    await patchTuition(token, docPath, 0);
    updated++;
    if (updated % 50 === 0) console.log(`  ${updated}/${needsUpdate.length} done…`);
  }

  console.log(`\nDone. ${updated} record(s) updated.`);
}

main().catch((err) => {
  console.error('Error:', err.message ?? err);
  process.exit(1);
});
