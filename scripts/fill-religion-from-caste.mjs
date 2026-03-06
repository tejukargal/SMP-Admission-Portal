/**
 * One-time migration: fill blank `religion` field based on `caste` field.
 *
 * Rules:
 *   caste contains "MUSLIM"              → MUSLIM
 *   caste contains "CHRISTIAN"           → CHRISTIAN
 *   caste contains "JAIN" or "DIGAMBAR"  → JAIN
 *   everything else                      → HINDU
 *
 * Only updates records where religion is blank/undefined/null.
 *
 * Usage:
 *   ADMIN_EMAIL=your@email.com ADMIN_PASSWORD=yourpassword node scripts/fill-religion-from-caste.mjs
 */

import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs, doc, updateDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyDb1qDfE3VMJ1jaaDJWBrAqIuOlgA--Yso',
  authDomain: 'smp-admissions.firebaseapp.com',
  projectId: 'smp-admissions',
  storageBucket: 'smp-admissions.firebasestorage.app',
  messagingSenderId: '942106004636',
  appId: '1:942106004636:web:3270790981b7d2b1ceb159',
};

function getReligionFromCaste(caste) {
  if (!caste) return 'HINDU';
  const upper = caste.toUpperCase();
  if (upper.includes('MUSLIM')) return 'MUSLIM';
  if (upper.includes('CHRISTIAN')) return 'CHRISTIAN';
  if (upper.includes('JAIN') || upper.includes('DIGAMBAR')) return 'JAIN';
  return 'HINDU';
}

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    console.error('Usage: ADMIN_EMAIL=... ADMIN_PASSWORD=... node scripts/fill-religion-from-caste.mjs');
    process.exit(1);
  }

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);

  console.log(`Signing in as ${email}...`);
  await signInWithEmailAndPassword(auth, email, password);
  console.log('Signed in.\n');

  const snapshot = await getDocs(collection(db, 'students'));
  console.log(`Total students fetched: ${snapshot.size}`);

  const toUpdate = [];
  for (const docSnap of snapshot.docs) {
    const data = docSnap.data();
    if (!data.religion || data.religion.trim() === '') {
      const newReligion = getReligionFromCaste(data.caste);
      toUpdate.push({ id: docSnap.id, caste: data.caste, newReligion });
    }
  }

  console.log(`Students with blank religion: ${toUpdate.length}`);
  if (toUpdate.length === 0) {
    console.log('Nothing to update.');
    process.exit(0);
  }

  // Preview first few
  console.log('\nSample updates (first 10):');
  toUpdate.slice(0, 10).forEach(({ id, caste, newReligion }) => {
    console.log(`  [${id}] caste="${caste}" → religion="${newReligion}"`);
  });

  // Prompt confirmation
  const readline = await import('readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise(resolve => rl.question(`\nProceed with updating ${toUpdate.length} records? (yes/no): `, resolve));
  rl.close();

  if (answer.trim().toLowerCase() !== 'yes') {
    console.log('Aborted.');
    process.exit(0);
  }

  console.log('\nUpdating...');
  let updated = 0;
  let errors = 0;
  for (const { id, newReligion } of toUpdate) {
    try {
      await updateDoc(doc(db, 'students', id), { religion: newReligion });
      updated++;
      if (updated % 10 === 0) console.log(`  ${updated}/${toUpdate.length} updated...`);
    } catch (err) {
      console.error(`  ERROR updating ${id}: ${err.message}`);
      errors++;
    }
  }

  console.log(`\nDone. Updated: ${updated}, Errors: ${errors}`);
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
