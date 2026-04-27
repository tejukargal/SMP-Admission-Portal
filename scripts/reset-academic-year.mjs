/**
 * Resets all student enrollment data for a given academic year.
 *
 * Deletes (scoped to the target year only):
 *   students, feeRecords, feeOverrides, examFeeRecords, inquiries,
 *   studentDocuments (for deleted student IDs), and all counter/receipt docs.
 *
 * Does NOT touch:
 *   feeStructure, fineSchedules, settings, users, or any other academic year.
 *
 * Prerequisites:
 *   Place service-account-key.json in the project root.
 *   (Console → Project Settings → Service Accounts → Generate new private key)
 *
 * Usage (dry-run, shows counts only):
 *   node scripts/reset-academic-year.mjs 2026-27
 *
 * Usage (actually delete):
 *   node scripts/reset-academic-year.mjs 2026-27 --confirm
 */

import admin from 'firebase-admin';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import readline from 'readline';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Args ──────────────────────────────────────────────────────────────────────

const ACADEMIC_YEAR = process.argv[2];
const CONFIRM = process.argv.includes('--confirm');

if (!ACADEMIC_YEAR || !/^\d{4}-\d{2}$/.test(ACADEMIC_YEAR)) {
  console.error('Usage: node scripts/reset-academic-year.mjs <YYYY-YY> [--confirm]');
  console.error('  Example: node scripts/reset-academic-year.mjs 2026-27');
  process.exit(1);
}

// ── Firebase init ─────────────────────────────────────────────────────────────

let serviceAccount;
try {
  serviceAccount = require(path.join(__dirname, '..', 'service-account-key.json'));
} catch {
  console.error('\nERROR: service-account-key.json not found in project root.');
  console.error('Download it from Firebase Console:');
  console.error('  Project Settings → Service Accounts → Generate new private key\n');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'smp-admissions',
});

const db = admin.firestore();
const FieldPath = admin.firestore.FieldPath;

// ── Helpers ───────────────────────────────────────────────────────────────────

async function batchDelete(docs) {
  const CHUNK = 400;
  for (let i = 0; i < docs.length; i += CHUNK) {
    const batch = db.batch();
    docs.slice(i, i + CHUNK).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}

async function countAndDelete(label, snap) {
  const count = snap.size;
  if (count === 0) {
    console.log(`  ${label}: 0 — nothing to delete`);
    return 0;
  }
  if (CONFIRM) {
    await batchDelete(snap.docs);
    console.log(`  ${label}: deleted ${count}`);
  } else {
    console.log(`  ${label}: ${count} would be deleted`);
  }
  return count;
}

async function deleteDocIfExists(label, ref) {
  const snap = await ref.get();
  if (!snap.exists) {
    console.log(`  ${label}: not found — skipping`);
    return;
  }
  if (CONFIRM) {
    await ref.delete();
    console.log(`  ${label}: deleted`);
  } else {
    console.log(`  ${label}: exists — would be deleted`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n' + '═'.repeat(60));
  console.log(`  Academic Year Reset: ${ACADEMIC_YEAR}`);
  console.log(`  Mode: ${CONFIRM ? '⚠️  LIVE DELETE' : '🔍 DRY RUN (no changes)'}`);
  console.log('═'.repeat(60) + '\n');

  // ── Step 1: Fetch student IDs (needed for studentDocuments) ──────────────
  console.log('Scanning students...');
  const studentsSnap = await db.collection('students')
    .where('academicYear', '==', ACADEMIC_YEAR)
    .get();
  const studentIds = studentsSnap.docs.map((d) => d.id);
  console.log(`  Found ${studentIds.length} student(s) enrolled in ${ACADEMIC_YEAR}\n`);

  if (!CONFIRM) {
    console.log('────── Dry-run counts ──────\n');
  } else {
    // Ask for final confirmation before any deletes
    const answer = await new Promise((resolve) => {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      rl.question(
        `This will PERMANENTLY DELETE all ${ACADEMIC_YEAR} data.\nType "${ACADEMIC_YEAR}" to confirm: `,
        (ans) => { rl.close(); resolve(ans.trim()); }
      );
    });
    if (answer !== ACADEMIC_YEAR) {
      console.log('\nAborted — confirmation did not match.');
      process.exit(0);
    }
    console.log('\n────── Deleting ──────\n');
  }

  // ── Step 2: Collections filtered by academicYear field ───────────────────

  const feeRecordsSnap   = await db.collection('feeRecords')
    .where('academicYear', '==', ACADEMIC_YEAR).get();
  const feeOverridesSnap = await db.collection('feeOverrides')
    .where('academicYear', '==', ACADEMIC_YEAR).get();
  const examFeeSnap      = await db.collection('examFeeRecords')
    .where('academicYear', '==', ACADEMIC_YEAR).get();
  const inquiriesSnap    = await db.collection('inquiries')
    .where('academicYear', '==', ACADEMIC_YEAR).get();

  await countAndDelete('students        ', studentsSnap);
  await countAndDelete('feeRecords      ', feeRecordsSnap);
  await countAndDelete('feeOverrides    ', feeOverridesSnap);
  await countAndDelete('examFeeRecords  ', examFeeSnap);
  await countAndDelete('inquiries       ', inquiriesSnap);

  // ── Step 3: studentDocuments (keyed by studentId, no academicYear field) ─
  if (studentIds.length > 0) {
    const CHUNK = 30; // FieldPath.documentId() 'in' limit
    let totalDocDocs = 0;
    const allDocSnaps = [];
    for (let i = 0; i < studentIds.length; i += CHUNK) {
      const chunk = studentIds.slice(i, i + CHUNK);
      const snap = await db.collection('studentDocuments')
        .where(FieldPath.documentId(), 'in', chunk).get();
      allDocSnaps.push(...snap.docs);
      totalDocDocs += snap.size;
    }
    if (totalDocDocs === 0) {
      console.log('  studentDocuments: 0 — nothing to delete');
    } else if (CONFIRM) {
      await batchDelete(allDocSnaps);
      console.log(`  studentDocuments: deleted ${totalDocDocs}`);
    } else {
      console.log(`  studentDocuments: ${totalDocDocs} would be deleted`);
    }
  } else {
    console.log('  studentDocuments: no students — skipping');
  }

  // ── Step 4: Counter documents ─────────────────────────────────────────────
  console.log('');

  await deleteDocIfExists(
    `counters/${ACADEMIC_YEAR} (merit)  `,
    db.collection('counters').doc(ACADEMIC_YEAR)
  );

  await deleteDocIfExists(
    `counters/${ACADEMIC_YEAR}__tc       `,
    db.collection('counters').doc(`${ACADEMIC_YEAR}__tc`)
  );

  await deleteDocIfExists(
    `receiptCounters/${ACADEMIC_YEAR}    `,
    db.collection('receiptCounters').doc(ACADEMIC_YEAR)
  );

  // Reg-number counters: IDs like "2026-27__regseq__1__CE"
  const regPrefix = `${ACADEMIC_YEAR}__regseq__`;
  const regCountersSnap = await db.collection('counters')
    .where(FieldPath.documentId(), '>=', regPrefix)
    .where(FieldPath.documentId(), '<=', regPrefix + '')
    .get();

  if (regCountersSnap.size === 0) {
    console.log(`  counters/${ACADEMIC_YEAR}__regseq__*: 0 — nothing to delete`);
  } else if (CONFIRM) {
    await batchDelete(regCountersSnap.docs);
    console.log(`  counters/${ACADEMIC_YEAR}__regseq__*: deleted ${regCountersSnap.size}`);
  } else {
    console.log(`  counters/${ACADEMIC_YEAR}__regseq__*: ${regCountersSnap.size} would be deleted`);
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(60));
  if (CONFIRM) {
    console.log('  ✅  Reset complete. Academic year 2026-27 is now clean.');
  } else {
    console.log('  ℹ️   Dry run complete. Add --confirm to execute the deletes.');
  }
  console.log('═'.repeat(60) + '\n');
}

main().catch((err) => {
  console.error('\nFATAL ERROR:', err.message);
  process.exit(1);
}).finally(() => process.exit(0));
