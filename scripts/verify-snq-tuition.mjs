import { readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const CLIENT_ID     = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
const CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi';

const p = join(homedir(), '.config', 'configstore', 'firebase-tools.json');
const cfg = JSON.parse(readFileSync(p, 'utf8'));
const rt = cfg.tokens?.refresh_token;

const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, grant_type: 'refresh_token', refresh_token: rt }),
});
const { access_token } = await tokenRes.json();

const res = await fetch(
  'https://firestore.googleapis.com/v1/projects/smp-admissions/databases/(default)/documents:runQuery',
  {
    method: 'POST',
    headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'feeRecords' }],
        where: {
          compositeFilter: {
            op: 'OR',
            filters: [
              { fieldFilter: { field: { fieldPath: 'admType' }, op: 'EQUAL', value: { stringValue: 'SNQ' } } },
              { fieldFilter: { field: { fieldPath: 'admCat'  }, op: 'EQUAL', value: { stringValue: 'SNQ' } } },
            ],
          },
        },
      },
    }),
  }
);

const rows = await res.json();
const docs = rows.filter((r) => r.document).map((r) => r.document);

const years = {};
for (const d of docs) {
  const ay      = d.fields?.academicYear?.stringValue ?? 'unknown';
  const tuition = Number(
    d.fields?.smp?.mapValue?.fields?.tuition?.integerValue ??
    d.fields?.smp?.mapValue?.fields?.tuition?.doubleValue  ?? -1
  );
  if (!years[ay]) years[ay] = { total: 0, zero: 0, nonZero: 0 };
  years[ay].total++;
  if (tuition === 0) years[ay].zero++; else years[ay].nonZero++;
}

console.log('\nAcademic Year  | Total SNQ | tuition=0 | tuition≠0 (remaining)');
console.log('---------------|-----------|-----------|----------------------');
let grandTotal = 0, grandZero = 0, grandNonZero = 0;
for (const [ay, s] of Object.entries(years).sort()) {
  console.log(`${ay.padEnd(15)}| ${String(s.total).padEnd(10)}| ${String(s.zero).padEnd(10)}| ${s.nonZero}`);
  grandTotal   += s.total;
  grandZero    += s.zero;
  grandNonZero += s.nonZero;
}
console.log('---------------|-----------|-----------|----------------------');
console.log(`${'TOTAL'.padEnd(15)}| ${String(grandTotal).padEnd(10)}| ${String(grandZero).padEnd(10)}| ${grandNonZero}`);
