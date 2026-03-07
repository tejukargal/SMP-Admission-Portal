import type { Student, DocRecord } from '../types';
import { REQUIRED_DOCS } from '../types';

export interface DocStatusRow {
  student: Student;
  docs: DocRecord;
  submittedCount: number;
}

// Short labels for the rotated column headers
const DOC_SHORT: Record<string, string> = {
  sslcMarksCard:          'SSLC Marks Card',
  transferCertificate:    'Transfer Cert.',
  studyCertificate:       'Study Cert.',
  characterConduct:       'Char. & Conduct Cert.',
  casteCertificate:       'Caste Cert.',
  incomeCertificate:      'Income Cert.',
  physicalFitness:        'Physical Fitness Cert.',
  aadharCopy:             'Copy of Aadhar',
  eligibilityCertificate: 'Eligibility Cert.',
  passportPhotos:         'Passport Photos (5 nos.)',
};

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function esc(s: string | number | undefined | null): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function printDocStatus(rows: DocStatusRow[]): void {
  const today = formatDate(new Date());
  const total = REQUIRED_DOCS.length;

  // Per-document submitted totals for summary row
  const docTotals: Record<string, number> = {};
  for (const { key } of REQUIRED_DOCS) docTotals[key] = 0;
  for (const { docs } of rows) {
    for (const { key } of REQUIRED_DOCS) {
      if (docs[key].submitted) docTotals[key]++;
    }
  }

  const docHeaderCells = REQUIRED_DOCS.map(({ key }) => `
    <th class="doc-header">
      <span class="doc-label">${esc(DOC_SHORT[key] ?? key)}</span>
    </th>`).join('');

  const dataRows = rows.map(({ student: s, docs, submittedCount }, idx) => {
    const countClass = submittedCount === total ? 'all' : submittedCount === 0 ? 'none' : 'some';
    const yearShort = s.year === '1ST YEAR' ? '1st Yr' : s.year === '2ND YEAR' ? '2nd Yr' : '3rd Yr';

    const docCells = REQUIRED_DOCS.map(({ key }) =>
      docs[key].submitted
        ? `<td class="td-doc"><span class="box box-yes">✓</span></td>`
        : `<td class="td-doc"><span class="box box-no"></span></td>`
    ).join('');

    return `
    <tr>
      <td class="td-num">${idx + 1}</td>
      <td class="td-name">${esc(s.studentNameSSLC)}</td>
      <td class="td-year">${esc(yearShort)}</td>
      <td class="td-course">${esc(s.course)}</td>
      <td class="td-count ${countClass}">${submittedCount}/${total}</td>
      ${docCells}
    </tr>`;
  }).join('');

  const summaryDocCells = REQUIRED_DOCS.map(({ key }) =>
    `<td class="td-doc td-summary">${docTotals[key]}/${rows.length}</td>`
  ).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Document Status Report</title>
<style>
  @page { size: A4 landscape; margin: 8mm 8mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 7.5pt;
    color: #000;
    background: #fff;
  }

  /* ── College header ── */
  .header {
    text-align: center;
    border-bottom: 1.5pt solid #000;
    padding-bottom: 4pt;
    margin-bottom: 5pt;
  }
  .college-name  { font-size: 15pt; font-weight: bold; letter-spacing: 0.3pt; line-height: 1.2; }
  .college-sub   { font-size: 6pt;  margin: 1.5pt 0; color: #222; }
  .college-addr  { font-size: 7.5pt; font-weight: bold; }

  /* ── Title row ── */
  .title-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 5pt;
  }
  .report-title { font-size: 10pt; font-weight: bold; text-decoration: underline; }
  .report-meta  { font-size: 7pt; color: #444; }

  /* ── Table ── */
  table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }
  th, td {
    border: 0.5pt solid #c0c0c0;
    overflow: hidden;
  }

  /* Fixed column widths — total ≈ 775pt (fits A4 landscape 796pt usable) */
  .col-num    { width: 18pt; }
  .col-name   { width: 190pt; }
  .col-year   { width: 36pt; }
  .col-course { width: 26pt; }
  .col-count  { width: 24pt; }
  .col-doc    { width: 48pt; } /* 10 × 48pt = 480pt */

  /* Header row (non-rotated) */
  thead tr.static-header th {
    background: #e0e0e0;
    font-size: 7pt;
    font-weight: bold;
    text-align: center;
    padding: 2.5pt 2pt;
    vertical-align: middle;
    white-space: nowrap;
  }
  thead tr.static-header th.th-name { text-align: left; padding-left: 4pt; }

  /* Rotated doc headers */
  .doc-header {
    background: #e8eaf6;
    height: 58pt;
    padding: 2pt 1pt;
    text-align: center;
    vertical-align: bottom;
  }
  .doc-label {
    writing-mode: vertical-rl;
    transform: rotate(180deg);
    white-space: nowrap;
    font-size: 6.5pt;
    font-weight: bold;
    display: inline-block;
    letter-spacing: 0.2pt;
  }

  /* Data cells */
  tbody td { padding: 2pt 3pt; vertical-align: middle; }
  tbody tr:nth-child(even) { background: #f7f7f7; }

  .td-num    { text-align: center; color: #888; font-size: 7pt; }
  .td-name   { font-size: 7.5pt; font-weight: 600; white-space: nowrap; text-overflow: ellipsis; }
  .td-year   { text-align: center; font-size: 6.5pt; }
  .td-course { text-align: center; font-size: 8pt; font-weight: bold; }
  .td-count  { text-align: center; font-size: 7pt; font-weight: bold; }
  .td-count.all  { color: #166534; }
  .td-count.some { color: #92400e; }
  .td-count.none { color: #991b1b; }

  /* Checkbox cells */
  .td-doc { text-align: center; padding: 1.5pt 1pt; }
  .box {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 9pt;
    height: 9pt;
    border-radius: 1.5pt;
    font-size: 6.5pt;
    font-weight: bold;
    line-height: 1;
  }
  .box-yes { background: #dcfce7; border: 0.5pt solid #4ade80; color: #166534; }
  .box-no  { background: #fff;    border: 0.5pt solid #d1d5db; color: #d1d5db; }

  /* Summary row */
  .summary-row td {
    background: #f0f4ff;
    border-top: 1pt solid #6b7280;
    font-weight: bold;
    font-size: 7pt;
    text-align: center;
    padding: 2pt;
    vertical-align: middle;
  }
  .summary-row .td-summary { color: #1e3a8a; }
  .summary-label { text-align: left !important; padding-left: 4pt !important; font-size: 7pt; }

  /* Footer */
  .footer {
    margin-top: 5pt;
    display: flex;
    justify-content: space-between;
    font-size: 6.5pt;
    color: #555;
    border-top: 0.5pt solid #ccc;
    padding-top: 3pt;
  }

  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>

  <!-- College header -->
  <div class="header">
    <div class="college-name">SANJAY MEMORIAL POLYTECHNIC</div>
    <div class="college-sub">(Approved by AICTE, New Delhi and running with Grant-In-Aid of State Govt. of Karnataka)</div>
    <div class="college-addr">Ikkeri Road, Sagar – 577 401, Shivamogga Dist., Karnataka &nbsp;|&nbsp; Ph: 9449685992 &nbsp;|&nbsp; Inst. Code: 308</div>
  </div>

  <!-- Title row -->
  <div class="title-row">
    <span class="report-title">Document Status Report</span>
    <span class="report-meta">Total: ${rows.length} student${rows.length !== 1 ? 's' : ''} &nbsp;|&nbsp; Date: ${today}</span>
  </div>

  <!-- Table -->
  <table>
    <colgroup>
      <col class="col-num">
      <col class="col-name">
      <col class="col-year">
      <col class="col-course">
      <col class="col-count">
      ${REQUIRED_DOCS.map(() => '<col class="col-doc">').join('')}
    </colgroup>
    <thead>
      <!-- Static header row -->
      <tr class="static-header">
        <th>#</th>
        <th class="th-name">Student Name</th>
        <th>Year</th>
        <th>Course</th>
        <th>Sub.</th>
        ${docHeaderCells}
      </tr>
    </thead>
    <tbody>
      ${dataRows}
      <!-- Summary row -->
      <tr class="summary-row">
        <td colspan="2" class="summary-label">Summary (submitted / total students)</td>
        <td></td>
        <td></td>
        <td class="td-summary">${rows.filter(r => r.submittedCount === total).length}/${rows.length}</td>
        ${summaryDocCells}
      </tr>
    </tbody>
  </table>

  <!-- Footer -->
  <div class="footer">
    <span>Generated from SMP Admissions System</span>
    <span>✓ = Submitted &nbsp;|&nbsp; □ = Not Submitted &nbsp;|&nbsp; Sub. = Documents Submitted Count</span>
  </div>

  <script>
    window.onload = function () {
      window.print();
      window.addEventListener('afterprint', function () { window.close(); });
    };
  </script>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html; charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  if (win) {
    win.addEventListener('afterprint', () => URL.revokeObjectURL(url));
  } else {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}
