import type { Student } from '../types';

const COURSE_NAMES: Record<string, string> = {
  CE: 'Civil Engineering',
  ME: 'Mechanical Engineering',
  EC: 'Electronics & Communication Engineering',
  CS: 'Computer Science & Engineering',
  EE: 'Electrical & Electronics Engineering',
};

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

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

/** Shift an academic year string (e.g. "2024-25") back by n years. */
function shiftAcademicYear(ay: string, yearsBack: number): string {
  const match = ay.match(/^(\d{4})-(\d{2})$/);
  if (!match) return ay;
  const startY = parseInt(match[1], 10) - yearsBack;
  const endY   = parseInt(match[2], 10) - yearsBack;
  return `${startY}-${endY.toString().padStart(2, '0')}`;
}

/**
 * Returns the academic year the student first enrolled and which year they joined as.
 * LATERAL students enter in 2nd year; others enter in 1st year.
 */
function admissionInfo(student: Student): { admissionYear: string; entryYear: string } {
  const isLateral = student.admType === 'LATERAL';
  const entryYear = isLateral ? '2nd' : '1st';

  let yearsBack = 0;
  if (student.year === '2ND YEAR') {
    yearsBack = isLateral ? 0 : 1;
  } else if (student.year === '3RD YEAR') {
    yearsBack = isLateral ? 1 : 2;
  }

  return {
    admissionYear: shiftAcademicYear(student.academicYear, yearsBack),
    entryYear,
  };
}

export function buildTCApplicationHTML(student: Student): string {
  const name        = esc(student.studentNameSSLC.trim());
  const fatherName  = esc(student.fatherName.trim());
  const regNo       = esc(student.regNumber.trim());
  const courseFull  = esc(COURSE_NAMES[student.course] ?? student.course);
  const currentAY   = esc(student.academicYear);
  const today       = formatToday();

  const { admissionYear, entryYear } = admissionInfo(student);
  const admAY = esc(admissionYear);

  const salutation  = student.gender === 'GIRL' ? 'Madam' : 'Sir';
  const pronoun     = student.gender === 'GIRL' ? 'her' : 'his';
  const yearLabel   = student.year === '1ST YEAR' ? '1st Year'
                    : student.year === '2ND YEAR' ? '2nd Year'
                    : '3rd Year';
  const courseLabel = student.course;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>TC Application &#8211; ${name}</title>
<style>
  @page { size: A4 portrait; margin: 20mm 22mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Times New Roman', Times, serif;
    font-size: 12pt;
    color: #000;
    background: #fff;
  }
  @media screen {
    html { background: #94a3b8; min-height: 100%; padding: 24px 0; }
    body { max-width: 210mm; margin: 0 auto; background: #fff; box-shadow: 0 4px 24px rgba(0,0,0,0.22); border-radius: 4px; padding: 20mm 22mm; }
  }

  .page {
    min-height: calc(297mm - 40mm);
    display: flex;
    flex-direction: column;
  }

  /* ── From / To block ── */
  .from-block {
    text-align: left;
    line-height: 1.8;
    margin-bottom: 24pt;
    font-size: 12pt;
  }
  .from-label {
    font-weight: bold;
    text-decoration: underline;
    margin-bottom: 4pt;
  }

  .to-block {
    text-align: left;
    line-height: 1.45;
    font-size: 12pt;
    margin-bottom: 20pt;
  }

  .date-row {
    text-align: right;
    font-size: 12pt;
    margin-bottom: 10pt;
  }

  /* ── Subject line ── */
  .subject-row {
    font-size: 12pt;
    margin-bottom: 20pt;
    margin-left: 36pt;
    line-height: 1.6;
  }
  .subject-label {
    font-weight: bold;
  }
  .subject-text {
    text-decoration: underline;
  }

  /* ── Salutation ── */
  .salutation {
    font-size: 12pt;
    margin-bottom: 14pt;
  }

  /* ── Body paragraphs ── */
  .para {
    font-size: 12pt;
    line-height: 2;
    text-align: justify;
    text-indent: 36pt;
    margin-bottom: 18pt;
  }

  /* ── Closing / signature ── */
  .closing {
    margin-top: 12pt;
    text-align: left;
    font-size: 12pt;
    line-height: 1.8;
  }
  .closing-line {
    margin-bottom: 4pt;
  }
  .sig-space {
    height: 32pt;
  }
  .sig-name {
    font-weight: bold;
  }

  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
<div class="page">

  <!-- From address (top right) -->
  <div class="from-block">
    <div class="from-label">From,</div>
    <div>${name}</div>
    <div>Reg. No.: ${regNo}</div>
    <div>S/o ${fatherName}</div>
    <div>${yearLabel} &ndash; ${courseLabel}</div>
    <div>Sagar.</div>
  </div>

  <!-- Date (top right, above To) -->
  <div class="date-row">
    <strong>Date:</strong> ${esc(today)}
  </div>

  <!-- To address (right) -->
  <div class="to-block">
    <div><strong>To,</strong></div>
    <div>The Principal,</div>
    <div>Sanjay Memorial Polytechnic,</div>
    <div>Sagar.</div>
  </div>

  <!-- Subject -->
  <div class="subject-row">
    <span class="subject-label">Sub: </span>
    <span class="subject-text">Request for Transfer Certificate.</span>
  </div>

  <!-- Salutation -->
  <div class="salutation">
    Respected ${salutation},
  </div>

  <!-- Body -->
  <p class="para">
    I, <strong>${name}</strong>, bearing Register Number <strong>${regNo}</strong>,
    am a student of ${yearLabel} Diploma in ${courseFull} at your esteemed institution.
    I was admitted in the Academic Year <strong>${admAY}</strong> for the ${entryYear} Year
    Diploma in ${courseFull} and have studied till the Academic Year <strong>${currentAY}</strong>.
  </p>

  <p class="para">
    I hereby respectfully request you to kindly issue me a <strong>Transfer Certificate</strong>
    to enable me to continue ${pronoun} further studies/career at the earliest convenience.
  </p>

  <!-- Closing -->
  <div class="closing">
    <div class="closing-line">Thanking You,</div>
    <div class="closing-line">Yours Faithfully,</div>
    <div class="sig-space"></div>
    <div class="sig-name">${name}</div>
    <div>(Signature of the Student)</div>
  </div>

</div>
</body>
</html>`;
}

export function generateTCApplication(student: Student): void {
  const base = buildTCApplicationHTML(student);
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
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}
