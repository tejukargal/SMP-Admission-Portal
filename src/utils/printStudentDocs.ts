import type { Student, DocRecord } from '../types';
import { REQUIRED_DOCS } from '../types';

function formatDate(iso: string): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d} ${months[parseInt(m, 10) - 1]} ${y}`;
}

function todayFormatted(): string {
  return formatDate(new Date().toISOString().slice(0, 10));
}

function esc(s: string | number | undefined | null): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const COURSE_NAMES: Record<string, string> = {
  CE: 'Civil Engineering',
  ME: 'Mechanical Engineering',
  EC: 'Electronics & Communication',
  CS: 'Computer Science & Engineering',
  EE: 'Electrical & Electronics Engineering',
};

const YEAR_LABELS: Record<string, string> = {
  '1ST YEAR': '1st Year',
  '2ND YEAR': '2nd Year',
  '3RD YEAR': '3rd Year',
};

function buildCopy(student: Student, docs: DocRecord, copyLabel: string, today: string): string {
  const submittedCount = REQUIRED_DOCS.filter(({ key }) => docs[key].submitted).length;
  const total = REQUIRED_DOCS.length;
  const allSubmitted = submittedCount === total;

  const rows = REQUIRED_DOCS.map(({ key, label }, idx) => {
    const entry = docs[key];
    const statusCell = entry.submitted
      ? `<td class="td-status submitted">&#10003; Submitted</td>
         <td class="td-date">${esc(formatDate(entry.submittedOn))}</td>`
      : `<td class="td-status pending">&#9744; Not Submitted</td>
         <td class="td-date td-dash">—</td>`;
    const remarksCell = entry.submitted && entry.returned
      ? `<td class="td-remarks">Returned on ${esc(formatDate(entry.returnedOn))}</td>`
      : entry.remarks
      ? `<td class="td-remarks">${esc(entry.remarks)}</td>`
      : `<td class="td-remarks td-dash">—</td>`;

    return `
      <tr class="${idx % 2 === 1 ? 'row-alt' : ''}">
        <td class="td-num">${idx + 1}</td>
        <td class="td-doc">${esc(label)}</td>
        ${statusCell}
        ${remarksCell}
      </tr>`;
  }).join('');

  return `
  <div class="copy">

    <!-- Header -->
    <div class="header">
      <div class="college-name">SANJAY MEMORIAL POLYTECHNIC</div>
      <div class="college-sub">(Approved by AICTE, New Delhi and running with Grant-In-Aid of State Govt. of Karnataka)</div>
      <div class="college-addr">Ikkeri Road, Sagar – 577 401, Shivamogga Dist., Karnataka &nbsp;|&nbsp; Ph: 9449685992 &nbsp;|&nbsp; Inst. Code: 308</div>
    </div>

    <!-- Title row -->
    <div class="title-row">
      <span class="doc-title">Document Submission Acknowledgement</span>
      <span class="copy-label">${esc(copyLabel)}</span>
      <span class="doc-date">Date: ${today}</span>
    </div>

    <!-- Student info -->
    <div class="student-info">
      <div class="info-grid">
        <div class="info-field">
          <span class="info-lbl">Student Name</span>
          <span class="info-val">${esc(student.studentNameSSLC)}</span>
        </div>
        <div class="info-field">
          <span class="info-lbl">Reg. No.</span>
          <span class="info-val">${esc(student.regNumber) || '—'}</span>
        </div>
        <div class="info-field">
          <span class="info-lbl">Course</span>
          <span class="info-val">${esc(COURSE_NAMES[student.course] ?? student.course)}</span>
        </div>
        <div class="info-field">
          <span class="info-lbl">Year / Academic Year</span>
          <span class="info-val">${esc(YEAR_LABELS[student.year] ?? student.year)} &nbsp;·&nbsp; ${esc(student.academicYear)}</span>
        </div>
      </div>
      <div class="submitted-badge ${allSubmitted ? 'badge-green' : submittedCount === 0 ? 'badge-red' : 'badge-yellow'}">
        ${submittedCount} / ${total} Submitted
      </div>
    </div>

    <!-- Documents table -->
    <table>
      <thead>
        <tr>
          <th class="th-num">#</th>
          <th class="th-doc">Document</th>
          <th class="th-status">Status</th>
          <th class="th-date">Date Submitted</th>
          <th class="th-remarks">Remarks</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>

    <!-- Acknowledgement note -->
    <div class="ack-note">
      I acknowledge that the above details of documents submitted / pending are true and correct. I understand that all original documents must be submitted within the stipulated time. The institution reserves the right to withhold results/certificates until all required documents are received.
    </div>

    <!-- Signatures -->
    <div class="sigs">
      <div class="sig-block">
        <div class="sig-line"></div>
        <div>Student's Signature</div>
      </div>
      <div class="sig-block">
        <div class="sig-line"></div>
        <div>Parent / Guardian Signature</div>
      </div>
      <div class="sig-block">
        <div class="sig-line"></div>
        <div>Office Seal &amp; Signature</div>
      </div>
    </div>

  </div>`;
}

export function printStudentDocs(student: Student, docs: DocRecord): void {
  const today = todayFormatted();

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Document Acknowledgement – ${esc(student.studentNameSSLC)}</title>
<style>
  @page { size: A4; margin: 7mm 10mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Times New Roman', Times, serif;
    font-size: 8.5pt;
    color: #000;
    background: #fff;
  }

  /* ── Copy box ── */
  .copy {
    border: 1.5pt solid #000;
    padding: 7pt 12pt 7pt;
  }

  /* ── Cut line ── */
  .cut-line {
    text-align: center;
    font-size: 7pt;
    color: #555;
    letter-spacing: 1pt;
    margin: 3pt 0;
    border-top: 1pt dashed #888;
    padding-top: 2.5pt;
  }

  /* ── Header ── */
  .header {
    text-align: center;
    border-bottom: 1pt solid #000;
    padding-bottom: 4pt;
    margin-bottom: 4pt;
  }
  .college-name { font-size: 14pt; font-weight: bold; letter-spacing: 0.3pt; line-height: 1.2; }
  .college-sub  { font-size: 6.5pt; margin: 1.5pt 0; color: #222; }
  .college-addr { font-size: 7.5pt; font-weight: bold; }

  /* ── Title row ── */
  .title-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 4pt;
  }
  .doc-title  { font-size: 10pt; font-weight: bold; text-decoration: underline; }
  .copy-label { font-size: 7.5pt; font-style: italic; font-weight: bold; border: 0.5pt solid #555; padding: 1pt 5pt; border-radius: 2pt; }
  .doc-date   { font-size: 7.5pt; }

  /* ── Student info ── */
  .student-info {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: #f5f5f5;
    border: 0.5pt solid #ccc;
    border-radius: 2pt;
    padding: 4pt 8pt;
    margin-bottom: 5pt;
    gap: 8pt;
  }
  .info-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.5pt 18pt;
    flex: 1;
  }
  .info-field { display: flex; gap: 3pt; align-items: baseline; }
  .info-lbl   { font-size: 6.5pt; color: #555; white-space: nowrap; min-width: 70pt; }
  .info-lbl::after { content: ':'; }
  .info-val   { font-size: 7.5pt; font-weight: bold; }

  .submitted-badge {
    font-size: 8pt;
    font-weight: bold;
    padding: 3pt 8pt;
    border-radius: 3pt;
    white-space: nowrap;
    text-align: center;
  }
  .badge-green  { background: #dcfce7; border: 0.5pt solid #4ade80; color: #166534; }
  .badge-yellow { background: #fef9c3; border: 0.5pt solid #fde047; color: #854d0e; }
  .badge-red    { background: #fee2e2; border: 0.5pt solid #fca5a5; color: #991b1b; }

  /* ── Documents table ── */
  table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 5pt;
    font-size: 7.5pt;
  }
  th, td { border: 0.5pt solid #ccc; }
  thead th {
    background: #e8e8e8;
    font-weight: bold;
    font-size: 7pt;
    padding: 2.5pt 4pt;
    text-align: left;
  }
  .th-num    { width: 14pt; text-align: center; }
  .th-doc    { width: auto; }
  .th-status { width: 68pt; }
  .th-date   { width: 60pt; }
  .th-remarks{ width: 70pt; }

  tbody td { padding: 2pt 4pt; vertical-align: middle; }
  .row-alt { background: #f9f9f9; }

  .td-num    { text-align: center; color: #888; font-size: 7pt; }
  .td-doc    { font-weight: 500; }
  .td-status { font-weight: bold; white-space: nowrap; }
  .td-date   { font-size: 7pt; white-space: nowrap; }
  .td-remarks{ font-size: 7pt; color: #555; }
  .td-dash   { color: #bbb; text-align: center; }

  .submitted { color: #166534; }
  .pending   { color: #9ca3af; }

  /* ── Acknowledgement note ── */
  .ack-note {
    font-size: 6.5pt;
    line-height: 1.55;
    border: 0.5pt solid #aaa;
    padding: 3pt 7pt;
    margin-bottom: 5pt;
    color: #222;
  }

  /* ── Signatures ── */
  .sigs {
    display: flex;
    justify-content: space-between;
    gap: 10pt;
  }
  .sig-block {
    flex: 1;
    text-align: center;
    font-size: 7pt;
  }
  .sig-line {
    border-top: 0.5pt solid #000;
    margin: 14pt auto 2pt;
    width: 90%;
  }

  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>

  ${buildCopy(student, docs, 'Student Copy', today)}

  <div class="cut-line">✂ &nbsp;&nbsp; CUT HERE &nbsp;&nbsp; ✂</div>

  ${buildCopy(student, docs, 'Office Copy', today)}

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
