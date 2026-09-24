import type { Student } from '../types';

// Kannada request letter written by the student to the Principal, asking to cancel the
// confirmed seat, return original documents and refund the fee paid at admission.
// Numbers, course and year are kept in English.

const COURSE_NAMES_EN: Record<string, string> = {
  CE: 'Civil Engineering',
  ME: 'Mechanical Engineering',
  EC: 'Electronics & Communication Engineering',
  CS: 'Computer Science & Engineering',
  EE: 'Electrical & Electronics Engineering',
};

const YEAR_LABELS_EN: Record<string, string> = {
  '1ST YEAR': '1st Yr',
  '2ND YEAR': '2nd Yr',
  '3RD YEAR': '3rd Yr',
};

/** Common reasons, phrased as causal clauses that read naturally in "ಪ್ರಸ್ತುತ …, ಈ ಸಂಸ್ಥೆಯಲ್ಲಿ …". */
export const SEAT_CANCEL_REASON_PRESETS: { label: string; text: string }[] = [
  { label: 'Admitted elsewhere',  text: 'ನನಗೆ ಬೇರೆ ಕಾಲೇಜಿನಲ್ಲಿ ಪ್ರವೇಶಾತಿ ದೊರೆತಿರುವುದರಿಂದ' },
  { label: 'Other course',        text: 'ನಾನು ಬೇರೆ ಕೋರ್ಸ್‌ಗೆ (ಪಿಯುಸಿ / ಐಟಿಐ) ಸೇರಲು ನಿರ್ಧರಿಸಿರುವುದರಿಂದ' },
  { label: 'Financial problem',   text: 'ನಮ್ಮ ಕುಟುಂಬದ ಆರ್ಥಿಕ ಪರಿಸ್ಥಿತಿ ಸರಿಯಿಲ್ಲದ ಕಾರಣ' },
  { label: 'Health problem',      text: 'ನನಗೆ ಆರೋಗ್ಯ ಸಮಸ್ಯೆ ಇರುವುದರಿಂದ' },
  { label: 'Distance',            text: 'ಕಾಲೇಜು ನಮ್ಮ ಊರಿನಿಂದ ಬಹಳ ದೂರವಿರುವುದರಿಂದ' },
  { label: 'Personal / family',   text: 'ಕೆಲವು ವೈಯಕ್ತಿಕ ಹಾಗೂ ಕೌಟುಂಬಿಕ ಸಮಸ್ಯೆಗಳಿರುವುದರಿಂದ' },
];

// Preset texts saved by the earlier letter format ("ಆದರೆ …") — mapped so reprints still read well.
const LEGACY_REASONS: Record<string, string> = {
  'ನಾನು ಬೇರೆ ಕಾಲೇಜಿನಲ್ಲಿ ಪ್ರವೇಶ ಪಡೆದಿರುತ್ತೇನೆ': 'ನನಗೆ ಬೇರೆ ಕಾಲೇಜಿನಲ್ಲಿ ಪ್ರವೇಶಾತಿ ದೊರೆತಿರುವುದರಿಂದ',
  'ನಾನು ಬೇರೆ ಕೋರ್ಸ್‌ಗೆ (ಪಿಯುಸಿ / ಐಟಿಐ) ಸೇರಲು ನಿರ್ಧರಿಸಿರುತ್ತೇನೆ': 'ನಾನು ಬೇರೆ ಕೋರ್ಸ್‌ಗೆ (ಪಿಯುಸಿ / ಐಟಿಐ) ಸೇರಲು ನಿರ್ಧರಿಸಿರುವುದರಿಂದ',
  'ನಮ್ಮ ಕುಟುಂಬದ ಆರ್ಥಿಕ ಪರಿಸ್ಥಿತಿ ಸರಿಯಿಲ್ಲ': 'ನಮ್ಮ ಕುಟುಂಬದ ಆರ್ಥಿಕ ಪರಿಸ್ಥಿತಿ ಸರಿಯಿಲ್ಲದ ಕಾರಣ',
  'ನನಗೆ ಆರೋಗ್ಯ ಸಮಸ್ಯೆ ಇದೆ': 'ನನಗೆ ಆರೋಗ್ಯ ಸಮಸ್ಯೆ ಇರುವುದರಿಂದ',
  'ಕಾಲೇಜು ನಮ್ಮ ಊರಿನಿಂದ ಬಹಳ ದೂರವಿದೆ': 'ಕಾಲೇಜು ನಮ್ಮ ಊರಿನಿಂದ ಬಹಳ ದೂರವಿರುವುದರಿಂದ',
  'ಕೆಲವು ವೈಯಕ್ತಿಕ ಹಾಗೂ ಕೌಟುಂಬಿಕ ಸಮಸ್ಯೆಗಳಿವೆ': 'ಕೆಲವು ವೈಯಕ್ತಿಕ ಹಾಗೂ ಕೌಟುಂಬಿಕ ಸಮಸ್ಯೆಗಳಿರುವುದರಿಂದ',
};

export interface SeatCancelLetterOptions {
  reason: string;
  letterDate: string; // YYYY-MM-DD
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isoToDDMMYYYY(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export function buildSeatCancellationLetterHTML(student: Student, opts: SeatCancelLetterOptions): string {
  const name       = esc(student.studentNameSSLC.trim());
  const fatherName = esc(student.fatherName.trim());
  const regNo      = esc((student.regNumber ?? '').trim());
  const courseEn   = esc(COURSE_NAMES_EN[student.course] ?? student.course);
  const yearEn     = esc(YEAR_LABELS_EN[student.year] ?? student.year);
  const ay         = esc(student.academicYear);
  const mobile     = esc(student.studentMobile || student.fatherMobile || '');
  const date       = esc(isoToDDMMYYYY(opts.letterDate));
  // Drop trailing punctuation the user may have typed — the template adds its own comma.
  const rawReason  = opts.reason.trim().replace(/[.,।]+$/, '').trim();
  const reason     = esc(LEGACY_REASONS[rawReason] ?? rawReason) || '________________________________';

  return `<!DOCTYPE html>
<html lang="kn">
<head>
<meta charset="UTF-8">
<title>ಸೀಟು ರದ್ದತಿ &#8211; ${name}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Kannada:wght@400;700&family=Noto+Sans:wght@400;700&display=swap" rel="stylesheet">
<style>
  @page { size: A4 portrait; margin: 15mm 20mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Noto Sans Kannada', 'Noto Sans', 'Nirmala UI', sans-serif;
    font-size: 12pt;
    color: #000;
    background: #fff;
  }
  @media screen {
    html { background: #94a3b8; min-height: 100%; padding: 24px 0; }
    body { max-width: 210mm; margin: 0 auto; background: #fff; box-shadow: 0 4px 24px rgba(0,0,0,0.22); border-radius: 4px; padding: 15mm 20mm; }
  }

  .top-row { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12pt; }
  .addr { line-height: 1.6; }
  .addr-label { font-weight: bold; margin-bottom: 2pt; }
  .date-cell { white-space: nowrap; }
  .from { margin-bottom: 14pt; }

  .subject { margin: 0 0 14pt 40pt; line-height: 1.6; }
  .sub-gap { display: inline-block; width: 28pt; }

  .salutation { margin-bottom: 8pt; font-weight: bold; }
  .para { line-height: 1.8; text-align: justify; text-indent: 32pt; margin-bottom: 10pt; }

  .closing { margin-top: 6pt; display: flex; justify-content: space-between; line-height: 1.6; padding-left: 32pt; }
  .sigs { display: flex; justify-content: space-between; margin-top: 36pt; text-align: center; }
  .sig { width: 44%; }
  .sig-line { border-top: 0.75pt solid #000; padding-top: 3pt; }
  .sig-name { font-weight: bold; }

  .office { margin-top: 28pt; padding-bottom: 90pt; font-weight: bold; text-align: center; text-decoration: underline; text-underline-offset: 3pt; }

  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>

<div class="top-row">
  <div class="addr">
    <div class="addr-label">ಇವರಿಗೆ,</div>
    <div>ಪ್ರಾಂಶುಪಾಲರು,</div>
    <div>ಸಂಜಯ್ ಮೆಮೋರಿಯಲ್ ಪಾಲಿಟೆಕ್ನಿಕ್,</div>
    <div>ಸಾಗರ.</div>
  </div>
  <div class="date-cell"><b>ದಿನಾಂಕ:</b> ${date}</div>
</div>

<div class="addr from">
  <div class="addr-label">ಇಂದ,</div>
  <div><b>${name}</b></div>
  <div>Diploma in ${courseEn} ${yearEn} (${ay})</div>
  ${regNo ? `<div>Register No.: ${regNo}</div>` : ''}
  ${mobile ? `<div>Mobile: ${mobile}</div>` : ''}
</div>

<div class="subject">
  <b>ವಿಷಯ:</b><span class="sub-gap"></span>ನನ್ನ ಡಿಪ್ಲೊಮಾ ಪ್ರವೇಶಾತಿಯನ್ನು ರದ್ದುಪಡಿಸಿಕೊಳ್ಳುವ ಬಗ್ಗೆ.
</div>

<div class="salutation">ಮಾನ್ಯರೇ,</div>

<p class="para">
  ಈ ಮೇಲ್ಕಂಡ ವಿಷಯಕ್ಕೆ ಸಂಬಂಧಿಸಿದಂತೆ, ನಾನು (<b>${name}</b>) ${ay}ನೇ ಶೈಕ್ಷಣಿಕ ಸಾಲಿಗೆ
  Diploma in ${courseEn} ${yearEn} ಕೋರ್ಸ್‌ಗೆ ಪ್ರವೇಶಾತಿ ಪಡೆದಿರುತ್ತೇನೆ. ಪ್ರಸ್ತುತ <b>${reason}</b>,
  ಈ ಸಂಸ್ಥೆಯಲ್ಲಿ ವ್ಯಾಸಂಗವನ್ನು ಮುಂದುವರೆಸಲು ಸಾಧ್ಯವಾಗುತ್ತಿಲ್ಲ. ಆದ್ದರಿಂದ, ನಾನು ಸ್ವ-ಇಚ್ಛೆಯಿಂದ
  ನನ್ನ ಪ್ರವೇಶವನ್ನು ರದ್ದುಗೊಳಿಸಲು ಬಯಸುತ್ತೇನೆ.
</p>

<p class="para">
  ನನ್ನ ಸೀಟನ್ನು ರದ್ದುಗೊಳಿಸಿ, ಪ್ರವೇಶ ಸಮಯದಲ್ಲಿ ಸಲ್ಲಿಸಲಾದ ನನ್ನ ಮೂಲ ದಾಖಲೆಗಳನ್ನು ಹಾಗೂ ಪಾವತಿಸಿದ
  ಫೀ ಶುಲ್ಕವನ್ನು ಹಿಂತಿರುಗಿಸಿಕೊಡಬೇಕಾಗಿ ತಮ್ಮಲ್ಲಿ ಕೋರುತ್ತೇನೆ.
</p>

<div class="closing">
  <div>ವಂದನೆಗಳೊಂದಿಗೆ,</div>
  <div>ತಮ್ಮ ವಿಶ್ವಾಸಿ,</div>
</div>

<div class="sigs">
  <div class="sig">
    <div class="sig-line">ಪೋಷಕರ / ತಂದೆಯ ಸಹಿ</div>
    <div class="sig-name">${fatherName}</div>
  </div>
  <div class="sig">
    <div class="sig-line">ವಿದ್ಯಾರ್ಥಿಯ ಸಹಿ</div>
    <div class="sig-name">${name}</div>
  </div>
</div>

<div class="office">ಕಚೇರಿ ಉಪಯೋಗಕ್ಕಾಗಿ</div>

</body>
</html>`;
}

export function generateSeatCancellationLetter(student: Student, opts: SeatCancelLetterOptions): void {
  // Wait for the web font before printing so the letter doesn't print in a fallback font.
  const html = buildSeatCancellationLetterHTML(student, opts).replace('</body>', `<script>
  window.onload = function () {
    var ready = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    ready.then(function () { window.print(); });
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
