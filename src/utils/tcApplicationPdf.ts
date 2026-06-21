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

function academicYearRange(from: AcademicYear, to: AcademicYear): string {
  const start = parseInt(from.split('-')[0], 10);
  const end   = parseInt(to.split('-')[0], 10);
  const years: string[] = [];
  for (let y = start; y <= end; y++) {
    const shortEnd = String((y + 1) % 100).padStart(2, '0');
    years.push(`${y}-${shortEnd}`);
  }
  return years.join(', ');
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inr(n: number): string {
  return '₹ ' + n.toLocaleString('en-IN');
}

// ── Per-year fee due row ──────────────────────────────────────────────────────
interface YearDueRow {
  studyYear: string;
  academicYear: string;
  allotted: number | null;
  paid: number;
  unavailable: boolean;
}

async function loadFeeDues(records: Student[]): Promise<YearDueRow[]> {
  const { SMP_FEE_HEADS } = await import('../types');
  const { getFeeStructuresByAcademicYear } = await import('../services/feeStructureService');
  const { getFeeRecordsByStudent } = await import('../services/feeRecordService');
  const { getFeeOverride } = await import('../services/feeOverrideService');

  const sorted = [...records].sort((a, b) => a.academicYear.localeCompare(b.academicYear));

  // Pre-fetch structures for all unique post-2021-22 years in parallel
  const eligibleYears = [...new Set(
    sorted.filter((r) => r.academicYear >= '2021-22').map((r) => r.academicYear)
  )];
  const structsByYear = new Map<string, import('../types').FeeStructure[]>();
  await Promise.all(
    eligibleYears.map(async (ay) => {
      const s = await getFeeStructuresByAcademicYear(ay as AcademicYear);
      structsByYear.set(ay, s);
    })
  );

  const rows: YearDueRow[] = [];

  for (const r of sorted) {
    const studyYear =
      r.year === '1ST YEAR' ? '1st Year'
      : r.year === '2ND YEAR' ? '2nd Year'
      : '3rd Year';

    if (r.academicYear < '2021-22') {
      rows.push({ studyYear, academicYear: r.academicYear, allotted: null, paid: 0, unavailable: true });
      continue;
    }

    const [feeRecs, override] = await Promise.all([
      getFeeRecordsByStudent(r.id, r.academicYear),
      getFeeOverride(r.id, r.academicYear),
    ]);

    const finePaid = feeRecs.reduce((sum, rec) => sum + (rec.smp.fine ?? 0), 0);
    const paid = feeRecs.reduce((sum, rec) => {
      const smpSum = SMP_FEE_HEADS.reduce((t, { key }) => t + (rec.smp[key] ?? 0), 0);
      const addlSum = (rec.additionalPaid ?? []).reduce((t, h) => t + h.amount, 0);
      return sum + smpSum + rec.svk + addlSum;
    }, 0);

    let allotted: number | null = null;
    if (override) {
      const fineAllotted = override.smp.fine ?? 0;
      const effectiveFine = Math.max(fineAllotted, finePaid);
      const smpSum = SMP_FEE_HEADS.reduce((t, { key }) => t + (key === 'fine' ? effectiveFine : (override.smp[key] ?? 0)), 0);
      const addlSum = (override.additionalHeads ?? []).reduce((t, h) => t + h.amount, 0);
      allotted = smpSum + override.svk + addlSum;
    } else {
      const struct = (structsByYear.get(r.academicYear) ?? []).find(
        (s) => s.course === r.course && s.year === r.year && s.admType === r.admType && s.admCat === r.admCat
      );
      if (struct) {
        const fineAllotted = struct.smp.fine ?? 0;
        const effectiveFine = Math.max(fineAllotted, finePaid);
        const smpSum = SMP_FEE_HEADS.reduce((t, { key }) => t + (key === 'fine' ? effectiveFine : (struct.smp[key] ?? 0)), 0);
        const addlSum = (struct.additionalHeads ?? []).reduce((t, h) => t + h.amount, 0);
        allotted = smpSum + struct.svk + addlSum;
      }
    }

    rows.push({ studyYear, academicYear: r.academicYear, allotted, paid, unavailable: false });
  }

  return rows;
}

function buildFeeSection(rows: YearDueRow[]): string {
  const dueRows = rows.filter((r) => !r.unavailable && r.allotted !== null && (r.allotted - r.paid) > 0);
  const totalDue = dueRows.reduce((s, r) => s + (r.allotted! - r.paid), 0);

  let content: string;
  if (dueRows.length === 0) {
    content = `<span class="fd-nil">No Fee Dues</span>`;
  } else {
    const items = dueRows
      .map((r) => `<span class="fd-item">${r.academicYear} &mdash; ${inr(r.allotted! - r.paid)}</span>`)
      .join('<span class="fd-sep"> &middot; </span>');
    content = `${items}<span class="fd-sep"> &middot; </span><span class="fd-total">Total &mdash; ${inr(totalDue)}</span>`;
  }

  return `
  <div class="fd-wrap">
    <span class="fd-label">Fee Dues</span>
    ${content}
  </div>`;
}

export function buildTCApplicationHTML(
  student: Student,
  admittedYear: AcademicYear,
  studiedTillYear: AcademicYear,
  lastStudiedYear: import('../types').Year,
  feeDues?: YearDueRow[],
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
  const yearLabel   = lastStudiedYear === '1ST YEAR' ? '1st Year'
                    : lastStudiedYear === '2ND YEAR' ? '2nd Year'
                    : '3rd Year';
  const courseLabel = student.course;

  const feeSectionHTML = feeDues && feeDues.length > 0 ? buildFeeSection(feeDues) : '';

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
    font-size: 14pt;
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
    font-size: 14pt;
  }

  .date-cell {
    text-align: right;
    font-size: 14pt;
    white-space: nowrap;
  }

  .from-block {
    text-align: left;
    line-height: 1.4;
    margin-bottom: 20pt;
    font-size: 14pt;
  }
  .from-label {
    font-weight: bold;
    text-decoration: underline;
    margin-bottom: 4pt;
  }

  /* ── Subject line ── */
  .subject-row {
    font-size: 14pt;
    margin-bottom: 20pt;
    margin-left: 72pt;
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
    font-size: 14pt;
    margin-bottom: 14pt;
  }

  /* ── Body paragraphs ── */
  .para {
    font-size: 14pt;
    line-height: 2;
    text-align: justify;
    text-indent: 36pt;
    margin-bottom: 8pt;
  }

  /* ── Closing / signature ── */
  .closing {
    margin-top: 12pt;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    font-size: 14pt;
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

  /* ── Fee dues section ── */
  .fd-wrap {
    margin-top: 14pt;
    border-top: 0.75pt solid #000;
    padding-top: 5pt;
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 6pt;
    font-size: 9.5pt;
  }
  .fd-label {
    font-size: 9pt;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 0.4pt;
    white-space: nowrap;
  }
  .fd-item { white-space: nowrap; font-weight: bold; color: #900; }
  .fd-sep  { color: #aaa; }
  .fd-total { white-space: nowrap; font-weight: bold; color: #900; }
  .fd-nil  { color: #060; font-style: italic; }

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
    <div>${student.gender === 'GIRL' ? 'D/o' : 'S/o'} ${fatherName}</div>
    <div>${yearLabel} &ndash; ${courseLabel} (${esc(academicYearRange(admittedYear, studiedTillYear))})</div>
    <div>Sagar.</div>
    ${(student.studentMobile || student.fatherMobile) ? `<div>Mob: ${esc(student.studentMobile || student.fatherMobile)}</div>` : ''}
  </div>

  <!-- Salutation -->
  <div class="salutation">
    Respected ${salutation},
  </div>

  <!-- Subject -->
  <div class="subject-row">
    <span class="subject-label">Sub: </span>
    <span class="subject-text">Request for Transfer Certificate.</span>
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

  <!-- Fee dues -->
  ${feeSectionHTML}

</div>
</body>
</html>`;
}

export async function generateTCApplication(student: Student): Promise<void> {
  const { getStudentEnrollmentHistory } = await import('../services/studentService');
  const { admittedYear, studiedTillYear, lastStudiedYear, records } = await getStudentEnrollmentHistory(student);
  const feeDues = await loadFeeDues(records);
  const base = buildTCApplicationHTML(student, admittedYear, studiedTillYear, lastStudiedYear, feeDues);
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
