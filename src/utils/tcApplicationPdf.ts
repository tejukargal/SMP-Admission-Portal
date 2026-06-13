import type { Student, AcademicYear } from '../types';

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

export function buildTCApplicationHTML(
  student: Student,
  admittedYear: AcademicYear,
  studiedTillYear: AcademicYear,
): string {
  const name        = esc(student.studentNameSSLC.trim());
  const fatherName  = esc(student.fatherName.trim());
  const regNo       = esc(student.regNumber.trim());
  const courseFull  = esc(COURSE_NAMES[student.course] ?? student.course);
  const today       = formatToday();

  const admAY        = esc(admittedYear);
  const studiedTillAY = esc(studiedTillYear);
  const entryYear    = student.admType === 'LATERAL' ? '2nd' : '1st';

  const salutation  = student.gender === 'GIRL' ? 'Madam' : 'Sir';
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
  .to-date-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 8pt;
  }

  .to-block {
    text-align: left;
    line-height: 1.45;
    font-size: 12pt;
  }

  .date-cell {
    text-align: right;
    font-size: 12pt;
    white-space: nowrap;
  }

  .from-block {
    text-align: left;
    line-height: 1.8;
    margin-bottom: 20pt;
    font-size: 12pt;
  }
  .from-label {
    font-weight: bold;
    text-decoration: underline;
    margin-bottom: 4pt;
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
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    font-size: 12pt;
    line-height: 1.8;
  }
  .closing-left {
    text-align: left;
  }
  .closing-right {
    text-align: right;
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

  <!-- To address (top left) + Date (top right) -->
  <div class="to-date-row">
    <div class="to-block">
      <div><strong>To,</strong></div>
      <div>The Principal,</div>
      <div>Sanjay Memorial Polytechnic,</div>
      <div>Sagar.</div>
    </div>
    <div class="date-cell">
      <strong>Date:</strong> ${esc(today)}
    </div>
  </div>

  <!-- From address -->
  <div class="from-block">
    <div class="from-label">From,</div>
    <div>${name}</div>
    <div>Reg. No.: ${regNo}</div>
    <div>S/o ${fatherName}</div>
    <div>${yearLabel} &ndash; ${courseLabel}</div>
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
    Diploma in ${courseFull} and have studied till the Academic Year <strong>${studiedTillAY}</strong>.
  </p>

  <p class="para">
    I therefore respectfully request you to issue me a <strong>Transfer Certificate</strong>
    to pursue my further studies/career at the earliest convenience.
  </p>

  <!-- Closing -->
  <div class="closing">
    <div class="closing-left">Thanking You,</div>
    <div class="closing-right">
      <div>Yours Faithfully,</div>
      <div class="sig-space"></div>
      <div class="sig-name">${name}</div>
      <div>(Signature of the Student)</div>
    </div>
  </div>

</div>
</body>
</html>`;
}

export async function generateTCApplication(student: Student): Promise<void> {
  const { getStudentEnrollmentHistory } = await import('../services/studentService');
  const { admittedYear, studiedTillYear } = await getStudentEnrollmentHistory(student);
  const base = buildTCApplicationHTML(student, admittedYear, studiedTillYear);
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
