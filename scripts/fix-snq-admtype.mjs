/**
 * One-time data correction: for students in academic years 2024-25 and
 * 2025-26 who were saved with BOTH admCat === 'SNQ' AND admType === 'SNQ',
 * set admType to 'REGULAR' (SNQ status is already captured by admCat;
 * 'SNQ' is no longer an offered Adm Type option in the app).
 *
 * Only the `admType` and `updatedAt` fields are touched — every other
 * field on each matched document (including admCat) is left untouched.
 *
 * Uses Firestore REST API (no quota issues, no service account needed).
 * Auth: Firebase CLI stored credentials (firebase login).
 *
 * Usage:
 *   node scripts/fix-snq-admtype.mjs --dry-run   # preview only
 *   node scripts/fix-snq-admtype.mjs              # apply changes
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const DRY_RUN    = process.argv.includes('--dry-run');
const PROJECT_ID = 'smp-admissions';
const BASE       = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const CLIENT_ID     = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
const CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi';
const TARGET_ACADEMIC_YEARS = ['2024-25', '2025-26'];

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
 * Fetch only students where academicYear IN [2024-25, 2025-26]
 * AND admCat == 'SNQ' AND admType == 'SNQ'.
 */
async function queryMistaggedStudents(token) {
  const url = `${BASE}:runQuery`;
  const body = {
    structuredQuery: {
      from: [{ collectionId: 'students' }],
      where: {
        compositeFilter: {
          op: 'AND',
          filters: [
            {
              fieldFilter: {
                field: { fieldPath: 'academicYear' },
                op: 'IN',
                value: {
                  arrayValue: {
                    values: TARGET_ACADEMIC_YEARS.map((y) => ({ stringValue: y })),
                  },
                },
              },
            },
            {
              fieldFilter: {
                field: { fieldPath: 'admCat' },
                op: 'EQUAL',
                value: { stringValue: 'SNQ' },
              },
            },
            {
              fieldFilter: {
                field: { fieldPath: 'admType' },
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

/**
 * PATCH admType + updatedAt on a single student document.
 * Only these two fields are touched; every other field (incl. admCat)
 * is left completely unchanged by the update mask.
 */
async function patchAdmType(token, docPath, updatedAtIso) {
  const url = `${BASE}/${docPath}?updateMask.fieldPaths=admType&updateMask.fieldPaths=updatedAt`;
  const body = {
    fields: {
      admType: { stringValue: 'REGULAR' },
      updatedAt: { stringValue: updatedAtIso },
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

  console.log(`Querying students where academicYear IN [${TARGET_ACADEMIC_YEARS.join(', ')}] and admCat=SNQ and admType=SNQ…`);
  const docs = await queryMistaggedStudents(token);
  console.log(`Records matching: ${docs.length}`);

  if (docs.length === 0) {
    console.log('\nNothing to update. Done.');
    return;
  }

  console.log('\nRecords that will be updated (admType SNQ -> REGULAR; admCat stays SNQ):');
  for (const doc of docs) {
    const f = doc.fields ?? {};
    const docId = doc.name.split('/').pop();
    console.log(
      `  [${docId}]  ${str(f, 'studentNameSSLC') ?? '?'}` +
      `  |  AY: ${str(f, 'academicYear') ?? '?'}` +
      `  |  ${str(f, 'course') ?? '?'} ${str(f, 'year') ?? '?'}` +
      `  |  admType: ${str(f, 'admType') ?? '?'} -> REGULAR` +
      `  |  admCat: ${str(f, 'admCat') ?? '?'}`
    );
  }

  if (DRY_RUN) {
    console.log('\n[DRY RUN] Exiting without writing.');
    return;
  }

  console.log('\nApplying updates…');
  const updatedAtIso = new Date().toISOString();
  let updated = 0;
  const updatedIds = [];
  for (const doc of docs) {
    const docPath = doc.name.split('/documents/')[1];
    await patchAdmType(token, docPath, updatedAtIso);
    updated++;
    updatedIds.push(docPath.split('/').pop());
    if (updated % 50 === 0) console.log(`  ${updated}/${docs.length} done…`);
  }

  console.log(`\nDone. ${updated} record(s) updated.`);
  console.log('Updated student IDs:', updatedIds.join(', '));
}

main().catch((err) => {
  console.error('Error:', err.message ?? err);
  process.exit(1);
});
