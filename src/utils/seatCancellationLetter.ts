import type { Student } from '../types';

// Kannada request letter written by the student to the Principal, asking to cancel the
// confirmed seat, return original documents and refund the fee paid at admission.

const COURSE_NAMES_KN: Record<string, string> = {
  CE: 'ಸಿವಿಲ್ ಎಂಜಿನಿಯರಿಂಗ್',
  ME: 'ಮೆಕ್ಯಾನಿಕಲ್ ಎಂಜಿನಿಯರಿಂಗ್',
  EC: 'ಎಲೆಕ್ಟ್ರಾನಿಕ್ಸ್ ಮತ್ತು ಕಮ್ಯೂನಿಕೇಶನ್ ಎಂಜಿನಿಯರಿಂಗ್',
  CS: 'ಕಂಪ್ಯೂಟರ್ ಸೈನ್ಸ್ ಮತ್ತು ಎಂಜಿನಿಯರಿಂಗ್',
  EE: 'ಎಲೆಕ್ಟ್ರಿಕಲ್ ಮತ್ತು ಎಲೆಕ್ಟ್ರಾನಿಕ್ಸ್ ಎಂಜಿನಿಯರಿಂಗ್',
};

const YEAR_LABELS_KN: Record<string, string> = {
  '1ST YEAR': '೧ನೇ ವರ್ಷ',
  '2ND YEAR': '೨ನೇ ವರ್ಷ',
  '3RD YEAR': '೩ನೇ ವರ್ಷ',
};

/** Common reasons, phrased as complete clauses that read naturally after "ಆದರೆ …". */
export const SEAT_CANCEL_REASON_PRESETS: { label: string; text: string }[] = [
  { label: 'Admitted elsewhere',  text: 'ನಾನು ಬೇರೆ ಕಾಲೇಜಿನಲ್ಲಿ ಪ್ರವೇಶ ಪಡೆದಿರುತ್ತೇನೆ' },
  { label: 'Other course',        text: 'ನಾನು ಬೇರೆ ಕೋರ್ಸ್‌ಗೆ (ಪಿಯುಸಿ / ಐಟಿಐ) ಸೇರಲು ನಿರ್ಧರಿಸಿರುತ್ತೇನೆ' },
  { label: 'Financial problem',   text: 'ನಮ್ಮ ಕುಟುಂಬದ ಆರ್ಥಿಕ ಪರಿಸ್ಥಿತಿ ಸರಿಯಿಲ್ಲ' },
  { label: 'Health problem',      text: 'ನನಗೆ ಆರೋಗ್ಯ ಸಮಸ್ಯೆ ಇದೆ' },
  { label: 'Distance',            text: 'ಕಾಲೇಜು ನಮ್ಮ ಊರಿನಿಂದ ಬಹಳ ದೂರವಿದೆ' },
  { label: 'Personal / family',   text: 'ಕೆಲವು ವೈಯಕ್ತಿಕ ಹಾಗೂ ಕೌಟುಂಬಿಕ ಸಮಸ್ಯೆಗಳಿವೆ' },
];

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
  const courseKn   = esc(COURSE_NAMES_KN[student.course] ?? student.course);
  const yearKn     = esc(YEAR_LABELS_KN[student.year] ?? student.year);
  const ay         = esc(student.academicYear);
  const mobile     = esc(student.studentMobile || student.fatherMobile || '');
  const date       = esc(isoToDDMMYYYY(opts.letterDate));
  // Drop a trailing full stop the user may have typed — the template adds its own.
  const reason     = esc(opts.reason.trim().replace(/[.।]+$/, '')) || '________________________________';

  return `<!DOCTYPE html>
<html lang="kn">
<head>
<meta charset="UTF-8">
<title>ಸೀಟು ರದ್ದತಿ ಮನವಿ &#8211; ${name}</title>
<style>
  @page { size: A4 portrait; margin: 13mm 18mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Nirmala UI', 'Noto Sans Kannada', 'Arial Unicode MS', Tunga, sans-serif;
    font-size: 12pt;
    color: #000;
    background: #fff;
  }
  @media screen {
    html { background: #94a3b8; min-height: 100%; padding: 24px 0; }
    body { max-width: 210mm; margin: 0 auto; background: #fff; box-shadow: 0 4px 24px rgba(0,0,0,0.22); border-radius: 4px; padding: 13mm 18mm; }
  }
  .en { font-family: 'Times New Roman', Times, serif; }

  .top-row { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10pt; }
  .addr { line-height: 1.5; }
  .addr-label { font-weight: bold; margin-bottom: 2pt; }
  .date-cell { white-space: nowrap; }
  .from { margin-bottom: 12pt; }

  .subject { margin: 0 0 12pt 40pt; line-height: 1.6; }
  .subject b { white-space: nowrap; }
  .subject u { text-underline-offset: 3pt; }

  .salutation { margin-bottom: 8pt; font-weight: bold; }
  .para { line-height: 1.75; text-align: justify; text-indent: 32pt; margin-bottom: 6pt; }

  .bank { margin-top: 10pt; border: 0.75pt solid #000; padding: 6pt 10pt 8pt; }
  .bank-title { font-weight: bold; font-size: 11pt; margin-bottom: 4pt; }
  .bank-grid { display: grid; grid-template-columns: 1fr 1fr; column-gap: 18pt; row-gap: 9pt; font-size: 11pt; }
  .fill { display: flex; align-items: flex-end; gap: 6pt; white-space: nowrap; }
  .fill .line { flex: 1; border-bottom: 0.75pt dotted #000; height: 14pt; }

  .closing { margin-top: 12pt; display: flex; justify-content: space-between; line-height: 1.6; }
  .sigs { display: flex; justify-content: space-between; margin-top: 26pt; text-align: center; }
  .sig { width: 44%; }
  .sig-line { border-top: 0.75pt solid #000; padding-top: 3pt; }
  .sig-name { font-weight: bold; }

  .office { margin-top: 12pt; border: 0.75pt dashed #000; padding: 6pt 10pt 8pt; font-size: 10.5pt; }
  .office-title { font-weight: bold; text-align: center; margin-bottom: 6pt; text-decoration: underline; }
  .office-grid { display: grid; grid-template-columns: 1fr 1fr; column-gap: 18pt; row-gap: 8pt; }

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
  <div class="date-cell"><b>ದಿನಾಂಕ:</b> <span class="en">${date}</span></div>
</div>

<div class="addr from">
  <div class="addr-label">ಇಂದ,</div>
  <div class="en"><b>${name}</b></div>
  <div>ತಂದೆ / ಪೋಷಕರು: <span class="en">${fatherName}</span></div>
  <div>ಡಿಪ್ಲೊಮಾ ${courseKn} &ndash; ${yearKn} (<span class="en">${ay}</span>)</div>
  ${regNo ? `<div>ನೋಂದಣಿ ಸಂಖ್ಯೆ: <span class="en">${regNo}</span></div>` : ''}
  ${mobile ? `<div>ಮೊಬೈಲ್: <span class="en">${mobile}</span></div>` : ''}
</div>

<div class="subject">
  <b>ವಿಷಯ:</b> <u>ಪ್ರವೇಶ (ಸೀಟು) ರದ್ದುಪಡಿಸಿ, ಮೂಲ ದಾಖಲೆಗಳು ಹಾಗೂ ಪಾವತಿಸಿದ ಶುಲ್ಕವನ್ನು ಹಿಂದಿರುಗಿಸುವಂತೆ ಕೋರಿ ಮನವಿ.</u>
</div>

<div class="salutation">ಮಾನ್ಯರೇ,</div>

<p class="para">
  ನಾನು <b class="en">${name}</b>, <span class="en">${ay}</span>ನೇ ಶೈಕ್ಷಣಿಕ ಸಾಲಿನಲ್ಲಿ ತಮ್ಮ ಸಂಸ್ಥೆಯ
  ಡಿಪ್ಲೊಮಾ ${courseKn} ವಿಭಾಗದ ${yearKn}ಕ್ಕೆ ಪ್ರವೇಶ ಪಡೆದು, ಪ್ರವೇಶವನ್ನು ದೃಢೀಕರಿಸಿ
  ನಿಗದಿತ ಶುಲ್ಕವನ್ನು ಪಾವತಿಸಿರುತ್ತೇನೆ.
</p>

<p class="para">
  ಆದರೆ <b>${reason}</b>. ಆದ್ದರಿಂದ ಈ ಸಂಸ್ಥೆಯಲ್ಲಿ ವ್ಯಾಸಂಗವನ್ನು ಮುಂದುವರೆಸಲು ಸಾಧ್ಯವಾಗುತ್ತಿಲ್ಲದ
  ಕಾರಣ, ನನ್ನ ಸ್ವ-ಇಚ್ಛೆಯಿಂದ ನನ್ನ ಪ್ರವೇಶವನ್ನು (ಸೀಟನ್ನು) ರದ್ದುಪಡಿಸಬೇಕೆಂದು ಕೋರುತ್ತೇನೆ.
</p>

<p class="para">
  ಪ್ರವೇಶದ ಸಮಯದಲ್ಲಿ ಸಲ್ಲಿಸಿದ ನನ್ನ ಎಲ್ಲಾ ಮೂಲ ದಾಖಲೆಗಳನ್ನು ಹಾಗೂ ಪ್ರವೇಶದ ಸಮಯದಲ್ಲಿ ಪಾವತಿಸಿದ
  ಶುಲ್ಕವನ್ನು ನಿಯಮಾನುಸಾರ ನನಗೆ ಹಿಂದಿರುಗಿಸಬೇಕೆಂದು ತಮ್ಮಲ್ಲಿ ವಿನಮ್ರವಾಗಿ ವಿನಂತಿಸಿಕೊಳ್ಳುತ್ತೇನೆ.
</p>

<div class="bank">
  <div class="bank-title">ಶುಲ್ಕ ಮರುಪಾವತಿಗಾಗಿ ಬ್ಯಾಂಕ್ ವಿವರ:</div>
  <div class="bank-grid">
    <div class="fill">ಖಾತೆದಾರರ ಹೆಸರು: <span class="line"></span></div>
    <div class="fill">ಖಾತೆ ಸಂಖ್ಯೆ: <span class="line"></span></div>
    <div class="fill">IFSC ಕೋಡ್: <span class="line"></span></div>
    <div class="fill">ಬ್ಯಾಂಕ್ / ಶಾಖೆ: <span class="line"></span></div>
  </div>
</div>

<div class="closing">
  <div>ವಂದನೆಗಳೊಂದಿಗೆ,</div>
  <div>ತಮ್ಮ ವಿಶ್ವಾಸಿ,</div>
</div>

<div class="sigs">
  <div class="sig">
    <div class="sig-line">ಪೋಷಕರ / ತಂದೆಯ ಸಹಿ</div>
    <div class="sig-name en">${fatherName}</div>
  </div>
  <div class="sig">
    <div class="sig-line">ವಿದ್ಯಾರ್ಥಿಯ ಸಹಿ</div>
    <div class="sig-name en">${name}</div>
  </div>
</div>

<div class="office">
  <div class="office-title">ಕಚೇರಿ ಉಪಯೋಗಕ್ಕಾಗಿ</div>
  <div class="office-grid">
    <div class="fill">ದಾಖಲೆ ಹಿಂದಿರುಗಿಸಿದ ದಿನಾಂಕ: <span class="line"></span></div>
    <div class="fill">ದಾಖಲೆ ಸ್ವೀಕರಿಸಿದವರ ಸಹಿ: <span class="line"></span></div>
    <div class="fill">ಮರುಪಾವತಿ ಮೊತ್ತ: <span class="line"></span></div>
    <div class="fill">ಚೆಕ್ / UTR ಸಂ. &amp; ದಿನಾಂಕ: <span class="line"></span></div>
    <div class="fill">ಕಚೇರಿ ಅಧೀಕ್ಷಕರ ಸಹಿ: <span class="line"></span></div>
    <div class="fill">ಪ್ರಾಂಶುಪಾಲರ ಸಹಿ: <span class="line"></span></div>
  </div>
</div>

</body>
</html>`;
}

export function generateSeatCancellationLetter(student: Student, opts: SeatCancelLetterOptions): void {
  const html = buildSeatCancellationLetterHTML(student, opts).replace('</body>', `<script>
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
