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
 *
 * Firebase config is read from environment variables (set in .env or shell):
 *   VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID,
 *   VITE_FIREBASE_STORAGE_BUCKET, VITE_FIREBASE_MESSAGING_SENDER_ID, VITE_FIREBASE_APP_ID
 */

import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Load .env file manually (no dotenv dependency needed)
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '../.env');
try {
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
} catch {
  // .env not found — rely on shell environment variables
}

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
};

if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  console.error('Missing Firebase config. Set VITE_FIREBASE_* env vars or add a .env file.');
  process.exit(1);
}

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
