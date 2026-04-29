import type { Student } from '../types';
import { INSTITUTE_LOGO_B64 } from './instituteLogo';

const COURSE_NAMES: Record<string, string> = {
  CE: 'Civil',
  ME: 'Mechanical',
  EC: 'Electronics &amp; Communication',
  CS: 'Computer Science',
  EE: 'Electrical &amp; Electronics',
};

const YEAR_LABEL: Record<string, string> = {
  '1ST YEAR': '1st Year',
  '2ND YEAR': '2nd Year',
  '3RD YEAR': '3rd Year',
};

const YEAR_TITLE: Record<string, string> = {
  '1ST YEAR': 'I YEAR',
  '2ND YEAR': 'II YEAR',
  '3RD YEAR': 'III YEAR',
};

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatAcademicYear(ay: string): string {
  return ay.replace('-', ' – ');
}

function formatDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function buildOrderBlock(student: Student, counsellingDate: string): string {
  const name        = esc(student.studentNameSSLC.trim());
  const fatherName  = esc(student.fatherName.trim());
  const appNo       = esc(student.applicationNumber ?? '');
  const yearLabel   = YEAR_LABEL[student.year] ?? '1st Year';
  const yearTitle   = YEAR_TITLE[student.year] ?? 'I YEAR';
  const courseName  = COURSE_NAMES[student.course] ?? esc(student.course);
  const category    = student.allottedCategory ? esc(student.allottedCategory) : '';
  const counselDate = formatDate(counsellingDate);
  const ayFormatted = formatAcademicYear(student.academicYear);

  const relation    = student.gender === 'GIRL' ? 'D/o' : 'S/o';

  return `
    <div class="order-header">
      <div class="logo-spacer"></div>
      <div class="order-header-text">
        <div class="gov-line">Government of Karnataka</div>
        <div class="dept-line">Department of Collegiate &amp; Technical Education</div>
        <div class="inst-line">308 SANJAY MEMORIAL POLYTECHNIC, SAGAR &#8211; 577 401</div>
      </div>
      <img class="order-logo" src="${INSTITUTE_LOGO_B64}" alt="Institute Crest" />
    </div>

    <div class="header-rule"></div>

    <div class="order-title">PROVISIONAL ADMISSION ORDER FOR ${yearTitle} DIPLOMA ${ayFormatted}</div>

    <div class="app-no-row">
      <span class="app-no-label">Application No.&nbsp;:</span>
      <span class="app-val">${appNo}</span>
    </div>

    <div class="body-para">
      Kum.&nbsp;<span class="hl">${name}</span>,&nbsp;${relation}&nbsp;Sri.&nbsp;<span class="hl">${fatherName}</span>,
      is hereby allotted a Diploma seat for&nbsp;<span class="hl">${yearLabel}</span>&nbsp;<span class="hl">${courseName}</span>
      Engineering Programme in the Institute of <strong>Sanjay Memorial Polytechnic, Sagar, Shivamogga</strong>,
      under&nbsp;<span class="hl">${category}</span>&nbsp;Category
      through Offline Counselling held on&nbsp;<span class="hl">${counselDate}</span>.
    </div>

    <div class="sigs">
      <div class="sig-col">
        <div class="sig-line"></div>
        <div class="sig-label">Signature of Candidate</div>
        <div class="sig-seal-space"></div>
      </div>
      <div class="sig-col">
        <div class="sig-line"></div>
        <div class="sig-label">Signature of Parent / Guardian</div>
        <div class="sig-seal-space"></div>
      </div>
      <div class="sig-col">
        <div class="sig-line"></div>
        <div class="sig-label">Signature of Principal</div>
        <div class="sig-seal-space"></div>
      </div>
    </div>
  `;
}

export function buildAdmissionOrderHTML(student: Student, counsellingDate: string): string {
  const name = esc(student.studentNameSSLC.trim());

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Admission Order &#8211; ${name}</title>
<style>
  @page { size: A4 portrait; margin: 8mm 14mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Times New Roman', Times, serif;
    font-size: 11pt;
    color: #000;
    background: #fff;
  }
  @media screen {
    html { background: #94a3b8; min-height: 100%; padding: 24px 0; }
    body { max-width: 210mm; margin: 0 auto; background: #fff; box-shadow: 0 4px 24px rgba(0,0,0,0.22); border-radius: 4px; }
  }

  /* ── Copy wrapper ── */
  .copy {
    padding: 10pt 14pt 12pt;
    min-height: 134mm;
    display: flex;
    flex-direction: column;
  }
  .copy:first-child {
    border-bottom: 1.5pt dashed #999;
  }
  .copy-label {
    text-align: right;
    font-size: 7.5pt;
    color: #666;
    font-style: italic;
    margin-bottom: 5pt;
    letter-spacing: 0.5pt;
    text-transform: uppercase;
  }

  /* ── Header ── */
  .order-header {
    display: flex;
    align-items: center;
    gap: 6pt;
    margin-bottom: 5pt;
  }
  .logo-spacer {
    flex-shrink: 0;
    width: 52pt;
  }
  .order-logo {
    flex-shrink: 0;
    width: 52pt;
    height: 52pt;
    object-fit: contain;
  }
  .order-header-text {
    flex: 1;
    text-align: center;
  }
  .gov-line {
    font-size: 13.5pt;
    font-weight: bold;
    letter-spacing: 0.4pt;
  }
  .dept-line {
    font-size: 9.5pt;
    margin-top: 2pt;
    letter-spacing: 0.1pt;
  }
  .inst-line {
    font-size: 11pt;
    font-weight: bold;
    margin-top: 4pt;
    letter-spacing: 0.5pt;
  }
  .header-rule {
    border: none;
    border-top: 2.5pt double #000;
    margin: 6pt 0 8pt;
  }

  /* ── Title ── */
  .order-title {
    text-align: center;
    font-size: 12pt;
    font-weight: bold;
    margin-bottom: 12pt;
    text-decoration: underline;
    text-underline-offset: 3pt;
    letter-spacing: 0.5pt;
  }

  /* ── Application number ── */
  .app-no-row {
    font-size: 11pt;
    margin-bottom: 16pt;
    display: flex;
    align-items: baseline;
    gap: 4pt;
  }
  .app-no-label {
    font-weight: 600;
    white-space: nowrap;
  }
  .app-val {
    border-bottom: 1pt solid #000;
    min-width: 120pt;
    display: inline-block;
    line-height: 1.4;
  }

  /* ── Body paragraph ── */
  .body-para {
    font-size: 12pt;
    line-height: 2.15;
    text-align: justify;
    flex: 1;
    letter-spacing: 0.1pt;
  }
  .hl {
    text-decoration: underline;
    font-weight: bold;
    text-underline-offset: 2pt;
  }

  /* ── Signatures ── */
  .sigs {
    display: flex;
    justify-content: space-between;
    margin-top: 20pt;
    gap: 10pt;
  }
  .sig-col {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
  }
  .sig-line {
    width: 100%;
    border-bottom: 1pt solid #333;
    height: 26pt;
  }
  .sig-label {
    font-size: 10pt;
    font-weight: 600;
    white-space: nowrap;
    margin-top: 4pt;
  }
  .sig-seal-space {
    height: 30pt;
  }

  /* ── Cut hint ── */
  .cut-hint {
    text-align: center;
    font-size: 7pt;
    color: #888;
    letter-spacing: 3pt;
    padding: 2pt 0;
    text-transform: uppercase;
  }

  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>

  <!-- ── Student Copy ── -->
  <div class="copy">
    <div class="copy-label">Student&rsquo;s Copy</div>
    ${buildOrderBlock(student, counsellingDate)}
  </div>

  <!-- ── Cut hint ── -->
  <div class="cut-hint">&#9988;&nbsp;&nbsp;Cut Here&nbsp;&nbsp;&#9988;</div>

  <!-- ── Office Copy ── -->
  <div class="copy">
    <div class="copy-label">Office Copy</div>
    ${buildOrderBlock(student, counsellingDate)}
  </div>

</body>
</html>`;
}

export function generateAdmissionOrder(student: Student, counsellingDate: string): void {
  const base = buildAdmissionOrderHTML(student, counsellingDate);
  const html = base.replace('</body>', `<script>
    window.onload = function () {
      window.print();
      window.addEventListener('afterprint', function () { window.close(); });
    };
  </script>\n</body>`);
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
