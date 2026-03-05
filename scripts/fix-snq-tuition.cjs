/**
 * One-time migration: set smp.tuition = 0 for all feeRecords where
 * admType === 'SNQ' OR admCat === 'SNQ', across all academic years.
 *
 * Auth: automatically uses the Firebase CLI's stored credentials (firebase login).
 * No service account key required.
 *
 * Usage:
 *   node scripts/fix-snq-tuition.cjs --dry-run   # preview only
 *   node scripts/fix-snq-tuition.cjs              # apply changes
 */

const path = require('path');
const fs   = require('fs');
const os   = require('os');

const DRY_RUN    = process.argv.includes('--dry-run');
const PROJECT_ID = 'smp-admissions';
const BATCH_SIZE = 400;

// ── Write authorized_user ADC file from Firebase CLI credentials ──────────────
function setupADC() {
  const cfgPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
  if (!fs.existsSync(cfgPath)) throw new Error('Firebase CLI config not found. Run: npx firebase login');
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  const refreshToken = cfg?.tokens?.refresh_token;
  if (!refreshToken) throw new Error('No refresh_token in Firebase CLI config. Run: npx firebase login');

  const toolsApiPath = path.join(os.homedir(), 'AppData', 'Roaming', 'npm', 'node_modules', 'firebase-tools', 'lib', 'api.js');
  if (!fs.existsSync(toolsApiPath)) throw new Error('firebase-tools not found globally.');
  const api = require(toolsApiPath);

  const tmpFile = path.join(os.tmpdir(), 'firebase-migration-adc.json');
  fs.writeFileSync(tmpFile, JSON.stringify({
    type:          'authorized_user',
    client_id:     api.clientId(),
    client_secret: api.clientSecret(),
    refresh_token: refreshToken,
  }));

  // Point ADC to our temp file
  process.env.GOOGLE_APPLICATION_CREDENTIALS = tmpFile;
  return tmpFile;
}

async function main() {
  if (DRY_RUN) console.log('[DRY RUN] No changes will be written.\n');

  console.log('Authenticating via Firebase CLI credentials…');
  const tmpFile = setupADC();

  // Require firebase-admin AFTER setting GOOGLE_APPLICATION_CREDENTIALS
  const admin = require('firebase-admin');
  admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: PROJECT_ID });
  const db = admin.firestore();

  try {
    console.log('Fetching all feeRecords…');
    const snap = await db.collection('feeRecords').get();
    console.log(`Total records fetched: ${snap.size}`);

    const snqDocs = snap.docs.filter((doc) => {
      const d = doc.data();
      return d.admType === 'SNQ' || d.admCat === 'SNQ';
    });

    console.log(`Records matching SNQ admType or admCat: ${snqDocs.length}`);

    const alreadyZero = snqDocs.filter((doc) => (doc.data().smp?.tuition ?? 0) === 0);
    const needsUpdate = snqDocs.filter((doc) => (doc.data().smp?.tuition ?? 0) !== 0);

    console.log(`  → Already zero (skip): ${alreadyZero.length}`);
    console.log(`  → Needs update:        ${needsUpdate.length}`);

    if (needsUpdate.length > 0) {
      console.log('\nRecords that will be updated:');
      for (const doc of needsUpdate) {
        const d = doc.data();
        console.log(
          `  [${doc.id}] ${d.studentName} | AY: ${d.academicYear} | ` +
          `${d.course} ${d.year} | admType: ${d.admType} | admCat: ${d.admCat} | tuition: ${d.smp?.tuition} → 0`
        );
      }
    }

    if (DRY_RUN || needsUpdate.length === 0) {
      console.log(
        needsUpdate.length === 0
          ? '\nNothing to update. Done.'
          : '\n[DRY RUN] Exiting without writing.'
      );
      process.exit(0);
    }

    console.log('\nCommitting updates…');
    let updated = 0;
    for (let i = 0; i < needsUpdate.length; i += BATCH_SIZE) {
      const chunk = needsUpdate.slice(i, i + BATCH_SIZE);
      const batch = db.batch();
      for (const doc of chunk) batch.update(doc.ref, { 'smp.tuition': 0 });
      await batch.commit();
      updated += chunk.length;
      console.log(`  Batch committed: ${updated}/${needsUpdate.length}`);
    }

    console.log(`\nDone. ${updated} record(s) updated.`);
  } finally {
    try { fs.unlinkSync(tmpFile); } catch (_) {}
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('Error:', err.message ?? err);
  process.exit(1);
});
