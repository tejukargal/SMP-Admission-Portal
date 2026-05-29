import type { Student } from '../types';
import { INSTITUTE_LOGO_B64 } from './instituteLogo';

export type CertificateType = 'STUDYING' | 'COMPLETED' | 'CANCELLED';

const COURSE_NAMES: Record<string, string> = {
  CE: 'Civil Engineering',
  ME: 'Mechanical Engineering',
  EC: 'Electronics & Communication Engineering',
  CS: 'Computer Science & Engineering',
  EE: 'Electrical & Electronics Engineering',
};

const YEAR_FIGURES: Record<string, string> = {
  '1ST YEAR': '1st',
  '2ND YEAR': '2nd',
  '3RD YEAR': '3rd',
};

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Format today's date as "15 March 2025" */
function formatToday(): string {
  const d = new Date();
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface StudyCertOptions {
  includeCaste?: boolean;
  casteName?: string;
  casteCategory?: string;
  // Edit-mode overrides
  customDate?: string;   // replaces today's date in the Ref row
  customBody?: string;   // plain text; double-newlines = paragraph breaks
  customExtra?: string;  // extra paragraphs appended after the body
}

/** Returns the default certificate body as plain text (for pre-filling the edit textarea). */
export function getDefaultBodyText(student: Student, certType: CertificateType, opts: StudyCertOptions = {}): string {
  const courseFull  = COURSE_NAMES[student.course] ?? student.course;
  const yearFigure  = YEAR_FIGURES[student.year] ?? student.year;
  const name        = student.studentNameSSLC.trim();
  const father      = student.fatherName.trim();
  const ay          = student.academicYear;
  const regNo       = student.regNumber ?? '';
  const isFemale    = student.gender === 'GIRL';
  const salutation  = 'Kum.';
  const sonDaughter = isFemale ? 'Daughter' : 'Son';
  const pronoun     = isFemale ? 'She' : 'He';
  const hisHer      = isFemale ? 'her' : 'his';
  const isRealReg   = /^\d{3}[A-Z]{2}\d{4,5}$/.test(regNo);
  const regClause   = isRealReg ? `, bearing Registration No. ${regNo},` : ',';

  const isCompleted = certType === 'COMPLETED';
  const isLeft      = certType === 'CANCELLED';

  let para1: string;
  if (isCompleted) {
    para1 = `This is to certify that ${salutation} ${name}, ${sonDaughter} of Sri. ${father}${regClause} was a bonafide student of this institution. ${pronoun} has successfully completed the Three-Year Diploma in ${courseFull} during the Academic Year ${ay}.`;
  } else if (isLeft) {
    para1 = `This is to certify that ${salutation} ${name}, ${sonDaughter} of Sri. ${father}${regClause} was a bonafide student of this institution. ${pronoun} had studied up to the ${yearFigure} Year of Diploma in ${courseFull} during the Academic Year ${ay}.`;
  } else {
    para1 = `This is to certify that ${salutation} ${name}, ${sonDaughter} of Sri. ${father}${regClause} is a bonafide student of this institution. ${pronoun} is currently studying in the ${yearFigure} Year of Diploma in ${courseFull} during the Academic Year ${ay}.`;
  }

  const conductVerb = (isCompleted || isLeft) ? 'were' : 'are';
  const para2 = `During ${hisHer} stay in this institution ${hisHer} character and conduct ${conductVerb} satisfactory.`;

  const parts = [para1, para2];
  if (opts.includeCaste && opts.casteName && opts.casteCategory) {
    parts.push(`${pronoun} belongs to ${opts.casteName.trim()} caste under ${opts.casteCategory.trim()} category as per our records.`);
  }
  return parts.join('\n\n');
}

export function buildStudyCertHTML(student: Student, certType: CertificateType, opts: StudyCertOptions = {}): string {
  const today        = opts.customDate ?? formatToday();
  const courseFull   = COURSE_NAMES[student.course] ?? student.course;
  const yearFigure   = YEAR_FIGURES[student.year] ?? student.year;
  const studentName  = esc(student.studentNameSSLC.trim());
  const fatherName   = esc(student.fatherName.trim());
  const academicYear = esc(student.academicYear);
  const regNo        = esc(student.regNumber ?? '');

  const isFemale    = student.gender === 'GIRL';
  const salutation  = 'Kum.';
  const sonDaughter = isFemale ? 'Daughter' : 'Son';
  const pronoun     = isFemale ? 'She' : 'He';
  const hisHer      = isFemale ? 'her' : 'his';


  const refNumber = `SMP/ADM/${student.academicYear}/`;

  const casteClause = opts.includeCaste && opts.casteName && opts.casteCategory
    ? `<p class="cert-para">${pronoun} belongs to <span class="hl">${esc(opts.casteName.trim())}</span> caste under <span class="hl">${esc(opts.casteCategory.trim())}</span> category as per our records.</p>`
    : '';

  // Only show reg number when it matches the real format: 308XX99999 (9–10 chars)
  const isRealRegNo = /^\d{3}[A-Z]{2}\d{4,5}$/.test(regNo);
  const regClause = isRealRegNo
    ? `, bearing Registration No.&nbsp;<span class="hl">${regNo}</span>,`
    : ',';

  const isCompleted = certType === 'COMPLETED';
  const isLeft      = certType === 'CANCELLED';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Study Certificate &#8211; ${studentName}</title>
<style>
  @page { size: A4 portrait; margin: 8mm 10mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Times New Roman', Times, serif;
    font-size: 12pt;
    color: #000;
    background: #fff;
  }
  @media screen {
    html { background: #94a3b8; min-height: 100%; padding: 24px 0; }
    body { max-width: 210mm; margin: 0 auto; background: #fff; box-shadow: 0 4px 24px rgba(0,0,0,0.22); border-radius: 4px; }
  }

  /* ── Page wrapper (no border) ── */
  .page {
    min-height: calc(297mm - 16mm);
    display: flex;
    flex-direction: column;
  }

  /* ── Header ── */
  .header {
    display: flex;
    align-items: flex-start;
    gap: 10pt;
    padding: 10pt 14pt 10pt;
    border-bottom: 4pt double #000;
  }
  .header-text {
    flex: 1;
    text-align: center;
  }
  .college-name {
    font-size: 20pt;
    font-weight: bold;
    letter-spacing: 0.6pt;
    margin-bottom: 3pt;
    white-space: nowrap;
  }
  .college-tagline {
    font-size: 8.5pt;
    margin-bottom: 4pt;
  }
  .college-instcode {
    font-size: 12pt;
    font-weight: bold;
    margin-bottom: 3pt;
  }
  .college-address {
    font-size: 10pt;
    margin-bottom: 2pt;
  }
  .college-contact {
    font-size: 10pt;
  }
  .seal-header {
    flex-shrink: 0;
    width: 72pt;
    height: 72pt;
    object-fit: contain;
  }

  /* ── Ref / Date row ── */
  .ref-row {
    display: flex;
    justify-content: space-between;
    padding: 7pt 18pt 6pt;
    font-size: 11pt;
  }

  /* ── Body ── */
  .body {
    padding: 36pt 28pt 0;
    flex: 1;
  }
  .cert-title {
    text-align: center;
    font-size: 16pt;
    font-weight: bold;
    letter-spacing: 3pt;
    text-decoration: underline;
    margin-bottom: 40pt;
    margin-top: 10pt;
    text-transform: uppercase;
  }
  .cert-para {
    font-size: 13pt;
    line-height: 2.2;
    text-align: justify;
    text-indent: 36pt;
    margin-bottom: 20pt;
  }
  .hl {
    font-weight: bold;
    text-decoration: underline;
  }
  .seal-circle {
    width: 80pt;
    height: 80pt;
    border: 1.5pt dashed #999;
    border-radius: 50%;
    margin: 16pt 0 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 7pt;
    color: #aaa;
    letter-spacing: 1pt;
  }

  /* ── Footer ── */
  .footer {
    padding: 0 28pt 22pt;
    margin-top: -80pt;
  }
  .footer-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
  }
  .footer-left {
    font-size: 11.5pt;
    line-height: 1.8;
  }
  .sig-block {
    text-align: center;
    min-width: 170pt;
  }
  .sig-space {
    height: 38pt;
  }
  .sig-line {
    border-top: 1pt solid #000;
    margin-bottom: 5pt;
  }
  .sig-title {
    font-size: 13pt;
    font-weight: bold;
  }

  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
<div class="page">

  <!-- ── Header ── -->
  <div class="header">
    <div style="flex-shrink:0;width:72pt"></div>
    <div class="header-text">
      <div class="college-name">SANJAY MEMORIAL POLYTECHNIC</div>
      <div class="college-tagline">(Approved by A.I.C.T.E., New&#8209;Delhi, and running with Grant&#8209;in&#8209;aid of State Govt. of Karnataka)</div>
      <div class="college-instcode">[Inst. Code: 308]</div>
      <div class="college-address">Ikkeri Road, Sagar &#8211; 577 401, Shimoga Dist., Karnataka.</div>
      <div class="college-contact">Phone: 9449685992</div>
    </div>
    <img class="seal-header" src="${INSTITUTE_LOGO_B64}" alt="Institute Crest" />
  </div>

  <!-- ── Ref / Date ── -->
  <div class="ref-row">
    <span>Ref: ${esc(refNumber)}</span>
    <span>Date: ${today}</span>
  </div>

  <!-- ── Certificate Body ── -->
  <div class="body">
    <div class="cert-title">Study Certificate</div>

    ${opts.customBody !== undefined
      ? opts.customBody.split(/\n\n+/).filter(p => p.trim()).map(p => `<p class="cert-para">${esc(p.trim())}</p>`).join('\n    ')
      : isCompleted ? `
    <p class="cert-para">
      This is to certify that <span class="hl">${salutation} ${studentName}</span>,
      ${sonDaughter} of <span class="hl">Sri. ${fatherName}</span>${regClause}
      was a <em>bonafide</em> student of this institution. ${pronoun} has
      successfully completed the <span class="hl">Three&#8209;Year Diploma</span>
      in <span class="hl">${esc(courseFull)}</span>
      during the Academic Year <span class="hl">${academicYear}</span>.
    </p>
    <p class="cert-para">
      During ${hisHer} stay in this institution ${hisHer} character and conduct
      were satisfactory.
    </p>
    ${casteClause}` : isLeft ? `
    <p class="cert-para">
      This is to certify that <span class="hl">${salutation} ${studentName}</span>,
      ${sonDaughter} of <span class="hl">Sri. ${fatherName}</span>${regClause}
      was a <em>bonafide</em> student of this institution. ${pronoun} had studied
      up to the <span class="hl">${yearFigure} Year</span> of
      <span class="hl">Diploma in ${esc(courseFull)}</span>
      during the Academic Year <span class="hl">${academicYear}</span>.
    </p>
    <p class="cert-para">
      During ${hisHer} stay in this institution ${hisHer} character and conduct
      were satisfactory.
    </p>
    ${casteClause}` : `
    <p class="cert-para">
      This is to certify that <span class="hl">${salutation} ${studentName}</span>,
      ${sonDaughter} of <span class="hl">Sri. ${fatherName}</span>${regClause}
      is a <em>bonafide</em> student of this institution. ${pronoun} is currently
      studying in the <span class="hl">${yearFigure} Year</span> of
      <span class="hl">Diploma in ${esc(courseFull)}</span>
      during the Academic Year <span class="hl">${academicYear}</span>.
    </p>
    <p class="cert-para">
      During ${hisHer} stay in this institution ${hisHer} character and conduct
      are satisfactory.
    </p>
    ${casteClause}`}
    ${opts.customExtra ? opts.customExtra.split(/\n\n+/).filter(p => p.trim()).map(p => `<p class="cert-para">${esc(p.trim())}</p>`).join('\n    ') : ''}

    <!-- Seal -->
    <div class="seal-circle">SEAL</div>
  </div>

  <!-- ── Footer ── -->
  <div class="footer">
    <div class="footer-row">

      <!-- Left: Place -->
      <div class="footer-left">
        <div><strong>Place:</strong>&nbsp; Sagar</div>
      </div>

      <!-- Right: Principal signature -->
      <div class="sig-block">
        <div class="sig-space"></div>
        <div class="sig-line"></div>
        <div class="sig-title">Principal</div>
      </div>

    </div>
  </div>

</div>
</body>
</html>`;
}

export function generateStudyCertificate(student: Student, certType: CertificateType, opts: StudyCertOptions = {}): void {
  const base = buildStudyCertHTML(student, certType, opts);
  const html = base.replace('</body>', `<script>
  window.onload = function () {
    window.print();
    window.addEventListener('afterprint', function () { window.close(); });
  };
</script>\n</body>`);
  const blob = new Blob([html], { type: 'text/html; charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const win  = window.open(url, '_blank');
  if (win) {
    win.addEventListener('afterprint', () => URL.revokeObjectURL(url));
  } else {
    // Popup blocked — fallback: navigate directly
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}
