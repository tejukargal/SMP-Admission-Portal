import type { Student } from '../types';

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

function formatDate(date: Date): string {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

function esc(s: string | number | undefined | null): string {
  return String(s ?? '—')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function val(v: string | number | undefined | null): string {
  const s = String(v ?? '').trim();
  return s ? esc(s) : '—';
}

function buildStyles(): string {
  return `
  @page { size: A4; margin: 7mm 10mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Times New Roman', Times, serif;
    font-size: 8pt;
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
    margin: 4pt 0;
    border-top: 1pt dashed #888;
    padding-top: 2pt;
  }

  /* ── Header ── */
  .header {
    text-align: center;
    border-bottom: 1.5pt solid #000;
    padding-bottom: 4pt;
    margin-bottom: 4pt;
  }
  .college-name {
    font-size: 14pt;
    font-weight: bold;
    letter-spacing: 0.4pt;
    text-transform: uppercase;
  }
  .college-sub  { font-size: 6.5pt; margin: 1.5pt 0 1pt; }
  .college-addr { font-size: 7pt;   font-weight: bold; }

  /* ── Title row ── */
  .title-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: #ebebeb;
    padding: 2.5pt 5pt;
    margin-bottom: 5pt;
  }
  .doc-title  { font-size: 9.5pt; font-weight: bold; }
  .copy-label {
    font-size: 7.5pt; font-style: italic; font-weight: bold;
    border: 0.5pt solid #555; padding: 1pt 5pt;
    border-radius: 2pt; background: #fff;
  }
  .doc-date { font-size: 7.5pt; }

  /* ── Fields grid ── */
  .fields {
    display: grid;
    grid-template-columns: 1fr 1fr;
    column-gap: 12pt;
    row-gap: 2pt;
    margin-bottom: 5pt;
  }

  .sec-head {
    grid-column: 1 / -1;
    font-size: 6.5pt;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 0.5pt;
    background: #e8e8e8;
    padding: 1.5pt 4pt;
    margin-top: 4pt;
  }

  .field {
    display: flex;
    align-items: baseline;
    gap: 3pt;
    line-height: 1.5;
    min-width: 0;
  }
  .field.full-width { grid-column: 1 / -1; }
  .lbl {
    font-size: 7pt;
    color: #444;
    white-space: nowrap;
    min-width: 72pt;
    flex-shrink: 0;
  }
  .lbl::after { content: ':'; }
  .val {
    font-size: 7.5pt;
    font-weight: bold;
    flex: 1;
    min-width: 0;
    word-break: break-word;
  }

  /* ── Marks row ── */
  .marks-row {
    grid-column: 1 / -1;
    display: flex;
    align-items: stretch;
    border: 0.5pt solid #bbb;
    border-radius: 2pt;
    overflow: hidden;
    margin: 2pt 0;
  }
  .mark-cell {
    flex: 1;
    text-align: center;
    padding: 2.5pt 4pt;
    background: #f8f8f8;
  }
  .mark-sep  { width: 0.5pt; background: #bbb; }
  .mk-lbl    { font-size: 6.5pt; color: #555; }
  .mk-val    { font-size: 8.5pt; font-weight: bold; }
  .mk-pct    { font-size: 6pt;   color: #777; }

  /* ── Consent ── */
  .consent {
    font-size: 6.5pt;
    line-height: 1.6;
    border: 0.5pt solid #aaa;
    background: #fdfdfd;
    padding: 3pt 6pt;
    margin-bottom: 5pt;
    color: #222;
  }

  /* ── Signatures ── */
  .sigs {
    display: flex;
    justify-content: space-between;
    gap: 10pt;
  }
  .sig-block { flex: 1; text-align: center; font-size: 7pt; }
  .sig-line  { border-top: 0.5pt solid #000; margin: 16pt auto 2pt; width: 85%; }

  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    /* Force both copies onto a single A4 page by splitting the printable
       height (297mm − 7mm top − 7mm bottom = 283mm) equally. */
    .page-wrapper {
      display: flex;
      flex-direction: column;
      height: 283mm;
    }
    .copy {
      flex: 1;
      min-height: 0;
      overflow: hidden;
    }
    .cut-line { flex-shrink: 0; }
  }

  /* ── Screen-only styles (preview readability) ── */
  @media screen {
    html { background: #d1d5db; }
    body { padding: 24px 16px; font-size: 10px; }
    .copy {
      max-width: 740px;
      margin: 0 auto 20px;
      box-shadow: 0 6px 28px rgba(0,0,0,0.16), 0 1px 4px rgba(0,0,0,0.08);
    }
    .cut-line { max-width: 740px; margin: 0 auto 8px; }
    .college-name { font-size: 15px; }
    .college-sub  { font-size: 7.5px; }
    .college-addr { font-size: 8.5px; }
    .doc-title    { font-size: 11px; }
    .copy-label   { font-size: 8.5px; }
    .doc-date     { font-size: 8.5px; }
    .sec-head     { font-size: 7.5px; padding: 2px 5px; }
    .lbl          { font-size: 8px; min-width: 82px; }
    .val          { font-size: 9px; }
    .mk-lbl       { font-size: 7.5px; }
    .mk-val       { font-size: 10px; }
    .mk-pct       { font-size: 7px; }
    .consent      { font-size: 7.5px; }
    .sig-block    { font-size: 8.5px; }
  }
  `;
}

function buildCopy(student: Student, label: string, today: string): string {
  const courseFull = COURSE_NAMES[student.course] ?? student.course;
  const yearLabel  = YEAR_LABELS[student.year]   ?? student.year;

  const sslcPct = student.sslcMaxTotal          > 0 ? Math.round((student.sslcObtainedTotal          / student.sslcMaxTotal)          * 100) : 0;
  const sciPct  = student.scienceMax            > 0 ? Math.round((student.scienceObtained            / student.scienceMax)            * 100) : 0;
  const mathPct = student.mathsMax              > 0 ? Math.round((student.mathsObtained              / student.mathsMax)              * 100) : 0;
  const smPct   = student.mathsScienceMaxTotal  > 0 ? Math.round((student.mathsScienceObtainedTotal  / student.mathsScienceMaxTotal)  * 100) : 0;

  return `
  <div class="copy">

    <div class="header">
      <div class="college-name">Sanjay Memorial Polytechnic</div>
      <div class="college-sub">(Approved by AICTE, New Delhi and running with Grant-In-Aid of State Govt. of Karnataka)</div>
      <div class="college-addr">Ikkeri Road, Sagar – 577 401, Shivamogga Dist., Karnataka &nbsp;|&nbsp; Ph: 9449685992 &nbsp;|&nbsp; Inst. Code: 308</div>
    </div>

    <div class="title-row">
      <span class="doc-title">Student Enrollment Profile</span>
      <span class="copy-label">${esc(label)}</span>
      <span class="doc-date">Date: ${today}</span>
    </div>

    <div class="fields">

      <div class="sec-head">Personal Details</div>

      <div class="field">
        <span class="lbl">Name (SSLC)</span>
        <span class="val">${val(student.studentNameSSLC)}</span>
      </div>
      <div class="field">
        <span class="lbl">Name (Aadhar)</span>
        <span class="val">${val(student.studentNameAadhar)}</span>
      </div>
      <div class="field">
        <span class="lbl">Father's Name</span>
        <span class="val">${val(student.fatherName)}</span>
      </div>
      <div class="field">
        <span class="lbl">Mother's Name</span>
        <span class="val">${val(student.motherName)}</span>
      </div>
      <div class="field">
        <span class="lbl">Date of Birth</span>
        <span class="val">${val(student.dateOfBirth)}</span>
      </div>
      <div class="field">
        <span class="lbl">Gender</span>
        <span class="val">${val(student.gender)}</span>
      </div>
      <div class="field">
        <span class="lbl">Religion</span>
        <span class="val">${val(student.religion)}</span>
      </div>
      <div class="field">
        <span class="lbl">Caste</span>
        <span class="val">${val(student.caste)}</span>
      </div>
      <div class="field">
        <span class="lbl">Category</span>
        <span class="val">${val(student.category)}</span>
      </div>
      <div class="field">
        <span class="lbl">Annual Income</span>
        <span class="val">${student.annualIncome ? '&#8377; ' + esc(student.annualIncome) : '&#8212;'}</span>
      </div>

      <div class="sec-head">Academic Details (SSLC Marks)</div>

      <div class="marks-row">
        <div class="mark-cell">
          <div class="mk-lbl">SSLC Total</div>
          <div class="mk-val">${esc(student.sslcObtainedTotal)} / ${esc(student.sslcMaxTotal)}</div>
          <div class="mk-pct">${sslcPct}%</div>
        </div>
        <div class="mark-sep"></div>
        <div class="mark-cell">
          <div class="mk-lbl">Science</div>
          <div class="mk-val">${esc(student.scienceObtained)} / ${esc(student.scienceMax)}</div>
          <div class="mk-pct">${sciPct}%</div>
        </div>
        <div class="mark-sep"></div>
        <div class="mark-cell">
          <div class="mk-lbl">Maths</div>
          <div class="mk-val">${esc(student.mathsObtained)} / ${esc(student.mathsMax)}</div>
          <div class="mk-pct">${mathPct}%</div>
        </div>
        <div class="mark-sep"></div>
        <div class="mark-cell">
          <div class="mk-lbl">Sci + Maths</div>
          <div class="mk-val">${esc(student.mathsScienceObtainedTotal)} / ${esc(student.mathsScienceMaxTotal)}</div>
          <div class="mk-pct">${smPct}%</div>
        </div>
      </div>

      <div class="sec-head">Admission Details</div>

      <div class="field">
        <span class="lbl">Course</span>
        <span class="val">${esc(courseFull)}</span>
      </div>
      <div class="field">
        <span class="lbl">Year of Study</span>
        <span class="val">${esc(yearLabel)}</span>
      </div>
      <div class="field">
        <span class="lbl">Academic Year</span>
        <span class="val">${val(student.academicYear)}</span>
      </div>
      <div class="field">
        <span class="lbl">Adm. Type</span>
        <span class="val">${val(student.admType)}</span>
      </div>
      <div class="field">
        <span class="lbl">Adm. Category</span>
        <span class="val">${val(student.admCat)}</span>
      </div>
      <div class="field">
        <span class="lbl">Adm. Status</span>
        <span class="val">${val(student.admissionStatus)}</span>
      </div>
      <div class="field">
        <span class="lbl">Merit No.</span>
        <span class="val">${val(student.meritNumber)}</span>
      </div>
      <div class="field">
        <span class="lbl">Reg. No.</span>
        <span class="val">${val(student.regNumber)}</span>
      </div>

      <div class="sec-head">Contact Details</div>

      <div class="field full-width">
        <span class="lbl">Address</span>
        <span class="val">${val(student.address)}, ${val(student.town)}, ${val(student.taluk)}, ${val(student.district)}</span>
      </div>
      <div class="field">
        <span class="lbl">Father's Mobile</span>
        <span class="val">${val(student.fatherMobile)}</span>
      </div>
      <div class="field">
        <span class="lbl">Student's Mobile</span>
        <span class="val">${val(student.studentMobile)}</span>
      </div>

    </div>

    <div class="consent">
      I hereby declare that the above particulars are true and correct to the best of my knowledge. I have personally verified and double-checked all the details furnished. I fully understand that I shall be solely responsible for any discrepancy or consequence arising from incorrect information provided herein.
    </div>

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

function buildHead(studentName: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Enrollment Profile – ${studentName}</title>
<style>${buildStyles()}</style>
</head>
<body>`;
}

function buildBody(student: Student): string {
  const today = formatDate(new Date());
  return `
  <div class="page-wrapper">
    ${buildCopy(student, 'Student Copy', today)}
    <div class="cut-line">&#9988; &nbsp;&nbsp; CUT HERE &nbsp;&nbsp; &#9988;</div>
    ${buildCopy(student, 'College Copy', today)}
  </div>`;
}

/** Returns the full HTML for in-app preview (no auto-print script). */
export function buildPreviewHTML(student: Student): string {
  const studentName = val(student.studentNameSSLC);
  return `${buildHead(studentName)}
${buildBody(student)}
</body>
</html>`;
}

/** Opens a print window that auto-triggers the browser print dialog. */
export function printStudentProfile(student: Student): void {
  const studentName = val(student.studentNameSSLC);
  const html = `${buildHead(studentName)}
${buildBody(student)}
  <script>
    window.onload = function () {
      window.print();
      window.addEventListener('afterprint', function () { window.close(); });
    };
  <\/script>
</body>
</html>`;
  const blob = new Blob([html], { type: 'text/html; charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const win  = window.open(url, '_blank');
  if (win) {
    win.addEventListener('afterprint', () => URL.revokeObjectURL(url));
  } else {
    const a = document.createElement('a');
    a.href = url; a.target = '_blank'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}
