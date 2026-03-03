/**
 * Creates the first admin user in Firebase Authentication.
 *
 * Prerequisites:
 *   1. Enable Email/Password sign-in in Firebase Console:
 *      Authentication -> Sign-in method -> Email/Password -> Enable
 *   2. Place this project's service-account-key.json in the project root
 *      (Console -> Project Settings -> Service accounts -> Generate new private key)
 *
 * Usage:
 *   node scripts/create-admin-user.mjs
 */
import admin from 'firebase-admin';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

let serviceAccount;
try {
  serviceAccount = require(path.join(__dirname, '..', 'service-account-key.json'));
} catch {
  console.error('service-account-key.json not found in project root.');
  console.error('Download it from: Console -> Project Settings -> Service accounts -> Generate new private key');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'smp-admissions',
});

const EMAIL = 'admin@smp-admissions.com';
const PASSWORD = 'Admin@1234';

try {
  const user = await admin.auth().createUser({
    email: EMAIL,
    password: PASSWORD,
    displayName: 'Admin',
    emailVerified: true,
  });
  console.log('Admin user created successfully!');
  console.log('  UID:     ', user.uid);
  console.log('  Email:   ', user.email);
  console.log('  Password: Admin@1234');
} catch (err) {
  if (err.code === 'auth/email-already-exists') {
    console.log('User already exists:', EMAIL);
  } else {
    console.error('Error:', err.code, '-', err.message);
  }
}
process.exit(0);
