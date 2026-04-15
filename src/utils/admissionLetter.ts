import type { Student } from '../types';

const COURSE_NAMES_EN: Record<string, string> = {
  CE: 'Civil Engineering',
  ME: 'Mechanical Engineering',
  EC: 'Electronics & Communication Engineering',
  CS: 'Computer Science & Engineering',
  EE: 'Electrical & Electronics Engineering',
};

const COURSE_NAMES_KN: Record<string, string> = {
  CE: 'ಸಿವಿಲ್ ಎಂಜಿನಿಯರಿಂಗ್',
  ME: 'ಮೆಕ್ಯಾನಿಕಲ್ ಎಂಜಿನಿಯರಿಂಗ್',
  EC: 'ಎಲೆಕ್ಟ್ರಾನಿಕ್ಸ್ ಮತ್ತು ಕಮ್ಯೂನಿಕೇಶನ್ ಎಂಜಿನಿಯರಿಂಗ್',
  CS: 'ಕಂಪ್ಯೂಟರ್ ಸೈನ್ಸ್ ಮತ್ತು ಎಂಜಿನಿಯರಿಂಗ್',
  EE: 'ಎಲೆಕ್ಟ್ರಿಕಲ್ ಮತ್ತು ಎಲೆಕ್ಟ್ರಾನಿಕ್ಸ್ ಎಂಜಿನಿಯರಿಂಗ್',
};

const YEAR_LABELS_EN: Record<string, string> = {
  '1ST YEAR': '1st Year',
  '2ND YEAR': '2nd Year',
  '3RD YEAR': '3rd Year',
};

const YEAR_LABELS_KN: Record<string, string> = {
  '1ST YEAR': '೧ನೇ ವರ್ಷ',
  '2ND YEAR': '೨ನೇ ವರ್ಷ',
  '3RD YEAR': '೩ನೇ ವರ್ಷ',
};

function todayFormatted(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function relation(student: Student): string {
  return student.gender === 'GIRL' ? 'D/o' : 'S/o';
}

// ── Shared CSS (both letters) ────────────────────────────────────────────────

const SHARED_CSS = `
  @page { size: A4; margin: 10mm 9mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Times New Roman', Times, serif; font-size: 11pt; color: #000; background: #fff; }
  .kn { font-family: 'Nirmala UI', 'Noto Sans Kannada', 'Arial Unicode MS', Latha, sans-serif; }
  .mono { font-family: 'Courier New', Courier, monospace; font-size: 10pt; }

  .letter-box { border: 1.5pt solid #000; padding: 10pt 16pt 18pt; }

  .header { text-align: center; border-bottom: 1pt solid #000; padding-bottom: 5pt; margin-bottom: 5pt; }
  .college-name { font-size: 17pt; font-weight: bold; letter-spacing: 0.5pt; }
  .college-tagline { font-size: 8pt; margin: 2pt 0 1pt; }
  .college-address { font-size: 9.5pt; font-weight: bold; margin: 1pt 0; }
  .college-phone { font-size: 9.5pt; font-weight: bold; }

  .title-row { display: flex; justify-content: space-between; align-items: baseline; margin: 5pt 0 8pt; font-size: 10pt; }
  .letter-title { font-size: 11.5pt; font-weight: bold; text-decoration: underline; }

  .details-row { display: flex; gap: 10pt; margin-bottom: 8pt; }
  .to-block { flex: 1.1; line-height: 1.55; }
  .student-block { flex: 1; line-height: 1.6; }

  .subject-line { font-size: 10pt; margin-bottom: 8pt; }

  .body-para { line-height: 1.75; text-align: justify; margin-bottom: 7pt; }

  .deadline-box { border: 1pt solid #000; padding: 6pt 10pt; margin: 7pt 0; line-height: 1.75; }
  .deadline-head { font-weight: bold; margin-bottom: 3pt; }
  .deadline-when { margin: 4pt 0; }
  .forfeit { font-weight: bold; color: #b91c1c; margin-top: 4pt; }

  .footer-line { line-height: 1.75; margin-bottom: 4pt; }

  .final-note {
    font-weight: bold;
    border-top: 0.75pt solid #555; border-bottom: 0.75pt solid #555;
    padding: 4pt 0; margin: 7pt 0; text-align: center; font-size: 10pt;
  }

  .sigs { display: flex; justify-content: space-between; margin-top: 20pt; font-size: 11pt; }

  /* ── Address label — always starts on page 2 ── */
  .label-section {
    page-break-before: always;
    padding-top: 30mm;
    display: flex; flex-direction: column; align-items: center;
  }
  .label-cut-line {
    display: flex; align-items: center; gap: 6pt;
    margin-bottom: 10pt; color: #888; font-size: 7.5pt; font-family: sans-serif;
    width: 60%;
  }
  .label-cut-line::before, .label-cut-line::after { content: ''; flex: 1; border-top: 1pt dashed #bbb; }
  .address-label {
    border: 1.5pt solid #000;
    padding: 14pt 18pt; min-height: 80pt;
    width: 60%;
    line-height: 1.85; font-family: 'Courier New', Courier, monospace; font-size: 11pt;
  }
  .address-label .lbl-to { font-size: 9pt; color: #555; margin-bottom: 4pt; }
  .address-label .lbl-name { font-weight: bold; font-size: 12pt; }
  .address-label .lbl-sub { font-size: 10.5pt; }
  .address-label .lbl-addr { font-size: 10pt; margin-top: 3pt; }

  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
`;

const PRINT_SCRIPT = `<script>
  window.onload = function () {
    window.print();
    window.addEventListener('afterprint', function () { window.close(); });
  };
<\/script>`;

// ── Shared header + address-label HTML builders ──────────────────────────────

function headerHtml(contact: string): string {
  return `<div class="header">
      <div class="college-name">SANJAY MEMORIAL POLYTECHNIC</div>
      <div class="college-tagline">(Approved by AICTE, New Delhi and running with Grant-In-Aid of State Govt. of Karnataka)</div>
      <div class="college-address">Ikkeri Road, Sagar - 577 401, Shivamogga Dist., Karnataka</div>
      <div class="college-phone">Phone : ${contact}</div>
    </div>`;
}

function toBlockHtml(studentName: string, rel: string, fatherName: string, addressLines: string): string {
  return `<div class="to-block mono">
        <div>To,</div>
        <div style="font-weight:bold;">${studentName}</div>
        <div>${rel} ${fatherName}</div>
        <div>${addressLines}</div>
      </div>`;
}

function studentDetailsHtml(studentName: string, regNo: string, courseEn: string, yearEn: string, academicYear: string): string {
  return `<div class="student-block mono">
        <div>Student Details :</div>
        <div>Name   : ${studentName}</div>
        ${regNo ? `<div>Reg No : ${regNo}</div>` : ''}
        <div>Course : ${courseEn}</div>
        <div>Year   : ${yearEn}</div>
        <div>Acad.  : ${academicYear}</div>
      </div>`;
}

function addressLabelHtml(studentName: string, rel: string, fatherName: string, addressLines: string): string {
  return `<div class="label-section">
    <div class="label-cut-line">✂&ensp;Cut and affix to post cover</div>
    <div class="address-label">
      <div class="lbl-to">To,</div>
      <div class="lbl-name">${studentName}</div>
      <div class="lbl-sub">${rel} ${fatherName}</div>
      <div class="lbl-addr">${addressLines}</div>
    </div>
  </div>`;
}

// ── English letter ────────────────────────────────────────────────────────────

function buildEnglishLetter(
  student: Student, reportTime: string, reportDate: string, contact: string
): string {
  const today = todayFormatted();
  const courseEn = esc(COURSE_NAMES_EN[student.course] ?? student.course);
  const yearEn   = esc(YEAR_LABELS_EN[student.year]   ?? student.year);
  const studentName  = esc(student.studentNameSSLC.trim());
  const fatherName   = esc(student.fatherName.trim());
  const addressLines = esc([student.address, student.town].filter(Boolean).join(', ').trim());
  const regNo        = esc(student.regNumber ?? '');
  const academicYear = esc(student.academicYear ?? '');
  const rel          = relation(student);
  const safeContact  = esc(contact.trim() || '9449685992');
  const safeDate     = esc(reportDate);
  const safeTime     = esc(reportTime);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Seat Allotment Intimation — ${studentName}</title>
<style>${SHARED_CSS}</style>
</head>
<body>

<div class="letter-box">
  ${headerHtml(safeContact)}

  <div class="title-row">
    <span>INST CODE : 308</span>
    <span class="letter-title">Seat Allotment Intimation Letter</span>
    <span>Date : ${today}</span>
  </div>

  <div class="details-row">
    ${toBlockHtml(studentName, rel, fatherName, addressLines)}
    ${studentDetailsHtml(studentName, regNo, courseEn, yearEn, academicYear)}
  </div>

  <div class="subject-line">
    <strong>Sub :</strong> Seat Allotment Intimation — Diploma in ${courseEn} (${yearEn}), Academic Year ${academicYear}.
  </div>

  <div class="body-para" style="font-size:11pt;">
    Dear ${studentName},<br><br>
    You have applied for admission to the <strong>Diploma in ${courseEn}</strong> (${yearEn}) at
    <strong>Sanjay Memorial Polytechnic, Sagar</strong> for the academic year <strong>${academicYear}</strong>.
    Based on the details furnished by you, you are found <strong>eligible for the above Diploma course</strong>.
  </div>

  <div class="deadline-box" style="font-size:11pt;">
    <div class="deadline-head">Action Required — Visit in Person</div>
    <div>
      You are hereby directed to visit the <strong>Principal's Office</strong> at the college —
      <strong>in person</strong> or with your <strong>parent / guardian</strong> — to complete the admission formalities:
    </div>
    <div class="deadline-when">
      &bull;&ensp;<strong>On or before :</strong>&ensp;<strong>${safeDate}</strong>
      &emsp;&bull;&ensp;<strong>By :</strong>&ensp;<strong>${safeTime}</strong>
    </div>
    <div class="forfeit">
      Failure to appear within the stipulated time will result in forfeiture of your seat,
      which will be assigned to the next eligible candidate without further notice.
    </div>
  </div>

  <div class="footer-line" style="font-size:10.5pt;">
    For further information, contact <strong>${safeContact}</strong>.
    Seats are limited and may not be available in case of delay.
  </div>

  <div class="final-note">
    This is the final communication regarding your seat allotment and admission. No further intimation will be issued.
  </div>

  <div class="sigs">
    <div>Contact : <strong>${safeContact}</strong></div>
    <div style="text-align:right;"><strong>Principal</strong><br>Sanjay Memorial Polytechnic, Sagar</div>
  </div>
</div>

${addressLabelHtml(studentName, rel, fatherName, addressLines)}

${PRINT_SCRIPT}
</body>
</html>`;
}

// ── Kannada letter ────────────────────────────────────────────────────────────

function buildKannadaLetter(
  student: Student, reportTime: string, reportDate: string, contact: string
): string {
  const today = todayFormatted();
  const courseEn = esc(COURSE_NAMES_EN[student.course] ?? student.course);
  const courseKn = esc(COURSE_NAMES_KN[student.course] ?? student.course);
  const yearEn   = esc(YEAR_LABELS_EN[student.year]   ?? student.year);
  const yearKn   = esc(YEAR_LABELS_KN[student.year]   ?? student.year);
  const studentName  = esc(student.studentNameSSLC.trim());
  const fatherName   = esc(student.fatherName.trim());
  const addressLines = esc([student.address, student.town].filter(Boolean).join(', ').trim());
  const regNo        = esc(student.regNumber ?? '');
  const academicYear = esc(student.academicYear ?? '');
  const rel          = relation(student);
  const safeContact  = esc(contact.trim() || '9449685992');
  const safeDate     = esc(reportDate);
  const safeTime     = esc(reportTime);

  return `<!DOCTYPE html>
<html lang="kn">
<head>
<meta charset="UTF-8">
<title>ಸ್ಥಾನ ಹಂಚಿಕೆ ಸೂಚನಾ ಪತ್ರ — ${studentName}</title>
<style>${SHARED_CSS}</style>
</head>
<body>

<div class="letter-box">
  ${headerHtml(safeContact)}

  <div class="title-row">
    <span>INST CODE : 308</span>
    <span class="letter-title kn">ಸ್ಥಾನ ಹಂಚಿಕೆ ಸೂಚನಾ ಪತ್ರ</span>
    <span>Date : ${today}</span>
  </div>

  <!-- To block and student details use English names only -->
  <div class="details-row">
    ${toBlockHtml(studentName, rel, fatherName, addressLines)}
    ${studentDetailsHtml(studentName, regNo, courseEn, yearEn, academicYear)}
  </div>

  <div class="subject-line kn">
    <strong>ವಿಷಯ :</strong> ಡಿಪ್ಲೊಮಾ — ${courseKn} (${yearKn}), ಶೈಕ್ಷಣಿಕ ವರ್ಷ ${academicYear} — ಸ್ಥಾನ ಹಂಚಿಕೆ ಸೂಚನೆ.
  </div>

  <div class="body-para kn" style="font-size:11.5pt;">
    ಪ್ರಿಯ ${studentName},<br><br>
    ನೀವು ಸಂಜಯ್ ಮೆಮೋರಿಯಲ್ ಪಾಲಿಟೆಕ್ನಿಕ್, ಸಾಗರದಲ್ಲಿ ${academicYear} ಶೈಕ್ಷಣಿಕ ವರ್ಷಕ್ಕಾಗಿ
    <strong>${courseKn}</strong> (${yearKn}) ಡಿಪ್ಲೊಮಾ ಕೋರ್ಸ್‌ಗೆ ಅರ್ಜಿ ಸಲ್ಲಿಸಿರುತ್ತೀರಿ.
    ನೀವು ಒದಗಿಸಿದ ವಿವರಗಳ ಆಧಾರದ ಮೇಲೆ, ನೀವು ಮೇಲ್ಕಂಡ ಡಿಪ್ಲೊಮಾ ಕೋರ್ಸ್‌ಗೆ
    <strong>ಅರ್ಹರಾಗಿರುತ್ತೀರಿ</strong> ಎಂದು ತಿಳಿಸಲಾಗುತ್ತಿದೆ.
  </div>

  <div class="deadline-box kn" style="font-size:11.5pt;">
    <div>
      ಮೇಲ್ಕಂಡ ಕೋರ್ಸ್‌ನ ಪ್ರವೇಶ ಪ್ರಕ್ರಿಯೆಯನ್ನು ಪೂರ್ಣಗೊಳಿಸಲು ನೀವು <strong>ಖುದ್ದಾಗಿ</strong>
      ಅಥವಾ ನಿಮ್ಮ <strong>ಪೋಷಕರು&nbsp;/&nbsp;ಪಾಲಕರೊಂದಿಗೆ</strong>
      ಕಾಲೇಜಿನ ಪ್ರಾಂಶುಪಾಲರ ಕಚೇರಿಗೆ ಭೇಟಿ ನೀಡಬೇಕು:
    </div>
    <div class="deadline-when">
      &bull;&ensp;<strong>ದಿನಾಂಕ :</strong>&ensp;<strong>${safeDate}</strong> ರ ಒಳಗೆ
      &emsp;&bull;&ensp;<strong>ಸಮಯ :</strong>&ensp;<strong>${safeTime}</strong> ರ ಮೊದಲು
    </div>
    <div class="forfeit">
      ನಿಗದಿತ ದಿನಾಂಕ ಮತ್ತು ಸಮಯದೊಳಗೆ ಹಾಜರಾಗದಿದ್ದಲ್ಲಿ, ನಿಮ್ಮ ಸ್ಥಾನವನ್ನು ಮೆರಿಟ್ ಪಟ್ಟಿಯ
      ಮುಂದಿನ ಅರ್ಹ ಅಭ್ಯರ್ಥಿಗೆ ಮತ್ತಷ್ಟು ಸೂಚನೆ ನೀಡದೆ ನೀಡಲಾಗುತ್ತದೆ.
    </div>
  </div>

  <div class="footer-line kn" style="font-size:10.5pt;">
    ಹೆಚ್ಚಿನ ಮಾಹಿತಿಗಾಗಿ <strong>${safeContact}</strong> ಗೆ ಸಂಪರ್ಕಿಸಿ.
    ಸ್ಥಾನಗಳ ಸಂಖ್ಯೆ ಸೀಮಿತ; ತಡ ಮಾಡಿದಲ್ಲಿ ಲಭ್ಯವಿಲ್ಲದಿರಬಹುದು.
  </div>

  <div class="final-note kn">
    ನಿಮ್ಮ ಸ್ಥಾನ ಹಂಚಿಕೆ ಮತ್ತು ಪ್ರವೇಶಕ್ಕೆ ಸಂಬಂಧಿಸಿ ಇದು ಅಂತಿಮ ಸೂಚನೆ. ಇನ್ನಷ್ಟು ಸಂದೇಶ ನೀಡಲಾಗುವುದಿಲ್ಲ.
  </div>

  <div class="sigs">
    <div class="kn">ಸಂ. : <strong>${safeContact}</strong></div>
    <div style="text-align:right;" class="kn">
      <strong>ಪ್ರಾಂಶುಪಾಲರು</strong><br>ಸಂಜಯ್ ಮೆಮೋರಿಯಲ್ ಪಾಲಿಟೆಕ್ನಿಕ್, ಸಾಗರ
    </div>
  </div>
</div>

${addressLabelHtml(studentName, rel, fatherName, addressLines)}

${PRINT_SCRIPT}
</body>
</html>`;
}

// ── Shared opener ─────────────────────────────────────────────────────────────

function openLetter(html: string): void {
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

// ── Public API ────────────────────────────────────────────────────────────────

export function generateAdmissionLetter(
  student: Student, reportTime: string, reportDate: string, contact: string
): void {
  openLetter(buildEnglishLetter(student, reportTime, reportDate, contact));
}

export function generateAdmissionLetterKannada(
  student: Student, reportTime: string, reportDate: string, contact: string
): void {
  openLetter(buildKannadaLetter(student, reportTime, reportDate, contact));
}
