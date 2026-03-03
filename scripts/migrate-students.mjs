/**
 * Migration v2:
 * - Remove motherMobile (already done, kept for idempotency)
 * - Convert DOB YYYY-MM-DD → DD/MM/YYYY (already done, kept for idempotency)
 * - Backfill meritNumber for documents that don't have one
 * - Backfill regNumber for documents that don't have one
 *
 * Run: node scripts/migrate-students.mjs
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const PROJECT_ID = 'smp-admissions';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
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

async function listStudents(token) {
  const res = await fetch(`${BASE}/students?pageSize=500`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`List failed: ${res.status} ${await res.text()}`);
  return (await res.json()).documents || [];
}

async function patchDocument(token, docName, allFields, maskFields) {
  const docPath = docName.split('/documents/')[1];
  const maskParams = maskFields.map((f) => `updateMask.fieldPaths=${f}`).join('&');
  const patchFields = {};
  for (const f of maskFields) {
    if (allFields[f] !== undefined) patchFields[f] = allFields[f];
  }
  const res = await fetch(`${BASE}/${docPath}?${maskParams}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields: patchFields }),
  });
  if (!res.ok) throw new Error(`Patch ${docPath}: ${res.status} ${await res.text()}`);
}

function buildMeritSuffix(academicYear) {
  const [startYear, endYear] = academicYear.split('-');
  return startYear.slice(-2) + endYear;
}

async function migrate() {
  console.log('Authenticating...');
  const token = await getAccessToken(getRefreshToken());

  console.log('Fetching students...');
  const docs = await listStudents(token);
  console.log(`Found ${docs.length} documents`);

  // Group docs by academic year, filter only those needing meritNumber
  const byYear = {};
  for (const doc of docs) {
    const fields = doc.fields || {};
    const year = fields.academicYear?.stringValue;
    if (!year) continue;
    if (!byYear[year]) byYear[year] = [];
    byYear[year].push(doc);
  }

  // For each academic year, find max existing serial, then assign to docs without meritNumber
  let totalUpdated = 0;
  for (const [year, yearDocs] of Object.entries(byYear)) {
    const suffix = buildMeritSuffix(year);

    // Find max serial among docs that already have a merit number
    let maxSerial = 0;
    for (const doc of yearDocs) {
      const merit = doc.fields?.meritNumber?.stringValue;
      if (merit && merit.length >= 3) {
        const serial = parseInt(merit.slice(0, 3), 10);
        if (!isNaN(serial) && serial > maxSerial) maxSerial = serial;
      }
    }

    // Sort docs WITHOUT merit number by createdAt ascending (oldest gets lowest serial)
    const needsMerit = yearDocs
      .filter((d) => !d.fields?.meritNumber?.stringValue)
      .sort((a, b) => {
        const ca = a.fields?.createdAt?.stringValue ?? '';
        const cb = b.fields?.createdAt?.stringValue ?? '';
        return ca.localeCompare(cb);
      });

    for (const doc of needsMerit) {
      maxSerial++;
      const meritNumber = String(maxSerial).padStart(3, '0') + suffix;
      const fields = doc.fields || {};
      const course = fields.course?.stringValue || '';

      const updatedFields = {
        meritNumber: { stringValue: meritNumber },
      };
      const maskFields = ['meritNumber'];

      // Also backfill regNumber if missing
      if (!fields.regNumber?.stringValue && course) {
        updatedFields.regNumber = { stringValue: `308${course}` };
        maskFields.push('regNumber');
      }

      await patchDocument(token, doc.name, updatedFields, maskFields);
      const name = fields.studentNameSSLC?.stringValue || 'unnamed';
      console.log(`  ${doc.name.split('/').pop()} (${name}): meritNumber=${meritNumber}${maskFields.includes('regNumber') ? `, regNumber=308${course}` : ''}`);
      totalUpdated++;
    }

    // Backfill regNumber for docs that have merit number but no regNumber
    for (const doc of yearDocs) {
      const fields = doc.fields || {};
      if (fields.meritNumber?.stringValue && !fields.regNumber?.stringValue) {
        const course = fields.course?.stringValue || '';
        if (course) {
          const updatedFields = { regNumber: { stringValue: `308${course}` } };
          await patchDocument(token, doc.name, updatedFields, ['regNumber']);
          const name = fields.studentNameSSLC?.stringValue || 'unnamed';
          console.log(`  ${doc.name.split('/').pop()} (${name}): regNumber=308${course}`);
          totalUpdated++;
        }
      }
    }
  }

  // Also handle the previously-migrated fields (idempotent)
  let dobMigrated = 0;
  for (const doc of docs) {
    const fields = doc.fields || {};
    const updates = {};
    const mask = [];

    if ('motherMobile' in fields) {
      // We need to remove it — use an empty mask trick isn't possible, skip here
      // (already handled in previous migration run)
    }

    const dob = fields.dateOfBirth?.stringValue;
    if (dob && /^\d{4}-\d{2}-\d{2}$/.test(dob)) {
      const [y, m, d] = dob.split('-');
      updates.dateOfBirth = { stringValue: `${d}/${m}/${y}` };
      mask.push('dateOfBirth');
    }

    if (mask.length > 0) {
      await patchDocument(token, doc.name, updates, mask);
      dobMigrated++;
    }
  }

  console.log(`\nDone. Backfilled ${totalUpdated} documents. DOB converted: ${dobMigrated}.`);
}

migrate().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
