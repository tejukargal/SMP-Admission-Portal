import * as XLSX from 'xlsx';

/** Structural type satisfied by both Student and MeritListStudent. */
interface MeritRow {
  studentNameSSLC: string;
  fatherName: string;
  gender: string;
  dateOfBirth: string;
  category: string;
  annualIncome: number;
  mathsScienceMaxTotal: number;
  mathsScienceObtainedTotal: number;
  sslcMaxTotal: number;
  sslcObtainedTotal: number;
  meritNumber: string;
}

export interface MeritExportOptions {
  /** ISO timestamp — used as the notice-board date in the PDF header. Defaults to now. */
  savedAt?: string;
  /** e.g. "Merit List Phase 1" — shown in the PDF info row. */
  phaseLabel?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Converts YYYY-MM-DD → DD/MM/YYYY. Returns '—' for empty/invalid values. */
export function fmtDate(dateStr: string | undefined | null): string {
  if (!dateStr) return '—';
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return dateStr;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** Converts YYYY-MM-DD → DD-MM-YY (2-digit year, official roster format). */
export function fmtDOB(dateStr: string | undefined | null): string {
  if (!dateStr) return '—';
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return dateStr;
  return `${m[3]}-${m[2]}-${m[1].slice(2)}`;
}

/** BOY → M, GIRL → F */
export function fmtGender(gender: string): string {
  return gender === 'BOY' ? 'M' : gender === 'GIRL' ? 'F' : gender;
}

export function sslcPct(s: MeritRow): number {
  if (!s.sslcMaxTotal || s.sslcMaxTotal === 0) return 0;
  return (s.sslcObtainedTotal / s.sslcMaxTotal) * 100;
}

export function sortByMerit<T extends MeritRow>(students: T[]): T[] {
  return [...students].sort((a, b) => sslcPct(b) - sslcPct(a));
}

// ── PDF (HTML print — supports Kannada Unicode) ───────────────────────────────

export function exportMeritListPdf(
  students: MeritRow[],
  academicYear: string | null,
  options: MeritExportOptions = {},
): void {
  const sorted = sortByMerit(students);

  const refDate = options.savedAt ? new Date(options.savedAt) : new Date();
  const dd  = String(refDate.getDate()).padStart(2, '0');
  const mm  = String(refDate.getMonth() + 1).padStart(2, '0');
  const yy  = String(refDate.getFullYear()).slice(2);
  const todayFmt = `${dd}-${mm}-${yy}`;

  const esc = (s: string | number | undefined | null): string =>
    String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const fmtIncome = (v: number | undefined | null): string => {
    if (!v && v !== 0) return '—';
    return v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const rows = sorted.map((s, idx) => `
    <tr class="${idx % 2 === 1 ? 'alt' : ''}">
      <td class="c">${idx + 1}</td>
      <td class="c">${esc(s.meritNumber || String(idx + 1))}</td>
      <td class="l name">${esc(s.studentNameSSLC)}</td>
      <td class="c">${fmtGender(s.gender)}</td>
      <td class="l father">${esc(s.fatherName || '—')}</td>
      <td class="c">${fmtDOB(s.dateOfBirth)}</td>
      <td class="c">${esc(s.category)}</td>
      <td class="r">${fmtIncome(s.annualIncome)}</td>
      <td class="c">${s.mathsScienceObtainedTotal}/${s.mathsScienceMaxTotal}</td>
      <td class="r">${s.mathsScienceMaxTotal ? ((s.mathsScienceObtainedTotal / s.mathsScienceMaxTotal) * 100).toFixed(2) : '—'}</td>
      <td class="c">${s.sslcMaxTotal}</td>
      <td class="c">${s.sslcObtainedTotal}</td>
      <td class="r">${sslcPct(s).toFixed(2)}</td>
    </tr>`).join('');

  const ayDisplay = academicYear ?? '';

  const html = `<!DOCTYPE html>
<html lang="kn">
<head>
<meta charset="UTF-8">
<title>Merit List – ${esc(ayDisplay)}</title>
<style>
  @page { size: A4 landscape; margin: 8mm 12mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Noto Sans Kannada', 'Arial Unicode MS', Arial, sans-serif; font-size: 11pt; color: #000; background: #fff; }

  /* ── Institution header ── */
  .inst-header { text-align: center; line-height: 1.6; border-bottom: 2pt solid #000; padding-bottom: 6pt; margin-bottom: 6pt; }
  .ih-govt   { font-size: 11pt; }
  .ih-dept   { font-size: 10pt; }
  .ih-comm   { font-size: 10pt; }
  .ih-college{ font-size: 15pt; font-weight: bold; }
  .ih-addr   { font-size: 10pt; font-weight: bold; }

  /* ── Title block ── */
  .title-block { border: 1pt solid #000; text-align: center; padding: 5pt 8pt; margin-bottom: 5pt; }
  .tb-main { font-size: 12pt; font-weight: bold; line-height: 1.55; }
  .tb-year { font-size: 14pt; font-weight: bold; margin-top: 4pt; }

  /* ── Info row ── */
  .info-row { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6pt; font-size: 10.5pt; font-weight: bold; }

  /* ── Table ── */
  table { width: 100%; border-collapse: collapse; font-size: 10.5pt; }
  th, td { border: 0.5pt solid #444; padding: 5.5pt 4pt; vertical-align: middle; }
  thead tr { background: #d8d8d8; }
  thead th { font-weight: bold; text-align: center; font-size: 10pt; line-height: 1.45; }
  .alt { background: #f5f5f5; }
  .c { text-align: center; white-space: nowrap; }
  .l { text-align: left; }
  .r { text-align: right; white-space: nowrap; }
  .name   { max-width: 120pt; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .father { max-width: 100pt; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  /* ── Footer ── */
  .footer { margin-top: 7pt; font-size: 9pt; color: #555; display: flex; justify-content: space-between; }

  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>

<!-- Institution header -->
<div class="inst-header">
  <div class="ih-govt">ಕರ್ನಾಟಕ ಸರ್ಕಾರ</div>
  <div class="ih-dept">ಕರ್ನಾಟಕ ತಾಂತ್ರಿಕ ಶಿಕ್ಷಣ ಇಲಾಖೆ</div>
  <div class="ih-comm">ಕಾಲೇಜು ಮತ್ತು ತಾಂತ್ರಿಕ ಶಿಕ್ಷಣ ಆಯುಕ್ತಾಲಯ</div>
  <div class="ih-college">ಸಂಜಯ ಮೆಮೋರಿಯಲ್ ಪಾಲಿಟೆಕ್ನಿಕ್</div>
  <div class="ih-addr">ಸಾಗರ– 577401</div>
</div>

<!-- Title block -->
<div class="title-block">
  <div class="tb-main">ಮೆರಿಟ್ ಮತ್ತು ರೋಷ್ಟರ್ ಅನುಗುಣವಾಗಿ ಆಫ್ ಲೈನ್ ಮುಖಾಂತರ ಪ್ರಥಮ ಸೆಮೆಸ್ಟರ್ ಇಂಜಿನಿಯರಿಂಗ್ ಡಿಪ್ಲೊಮಾ ಪ್ರವೇಶ ಪ್ರಕ್ರಿಯೆ</div>
  <div class="tb-year">ಸಾಲು-${esc(ayDisplay)}</div>
</div>

<!-- Info row -->
<div class="info-row">
  <span>${esc(options.phaseLabel ?? 'ಅರ್ಹ ಅಭ್ಯರ್ಥಿಗಳ ಮೆರಿಟ್ ಪಟ್ಟಿ')} &nbsp;(${sorted.length} ಅಭ್ಯರ್ಥಿಗಳು)</span>
  <span>ಸೂಚನಾ ಫಲಕದಲ್ಲಿ ಪ್ರಕಟಿಸಿದ ದಿನಾಂಕ: ${todayFmt}</span>
</div>

<!-- Merit table -->
<table>
  <thead>
    <tr>
      <th style="width:18pt">ಕ್ರ.ಸಂ</th>
      <th style="width:24pt">ಮೆರಿಟ್<br>ನಂ.</th>
      <th>ಅಭ್ಯರ್ಥಿಯ ಹೆಸರು</th>
      <th style="width:18pt">ಲಿಂಗ</th>
      <th>ತಂದೆಯ ಹೆಸರು</th>
      <th style="width:40pt">ಹುಟ್ಟಿದ<br>ದಿನಾಂಕ</th>
      <th style="width:30pt">ಅರ್ಹ<br>ಪ್ರವರ್ಗ</th>
      <th style="width:55pt">ಆದಾಯ</th>
      <th style="width:36pt">ಗ+ವಿ<br>ಅಂಕ</th>
      <th style="width:30pt">ಗ+ವಿ<br>ಶೇಕಡಾ</th>
      <th style="width:28pt">ಗರಿಷ್ಠ<br>ಅಂಕ</th>
      <th style="width:28pt">ಗಳಿಸಿದ<br>ಅಂಕ</th>
      <th style="width:30pt">ಶೇಕಡಾ</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>

<div class="footer">
  <span>ಸಂಜಯ ಮೆಮೋರಿಯಲ್ ಪಾಲಿಟೆಕ್ನಿಕ್, ಸಾಗರ – 577401</span>
  <span>Sorted by SSLC % (highest first) &nbsp;·&nbsp; Generated: ${todayFmt}</span>
</div>

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

// ── Excel ─────────────────────────────────────────────────────────────────────

export function exportMeritListExcel(students: MeritRow[], academicYear: string | null): void {
  const sorted = sortByMerit(students);

  const header = [
    'Sl', 'Merit No.', 'Name (SSLC)', 'Gender',
    'Father Name', 'Date of Birth', 'Category', 'Annual Income',
    'M+S Marks', 'M+S %',
    'SSLC Max', 'SSLC Obtained', 'SSLC %',
  ];

  const rows = sorted.map((s, i) => {
    const msPct = s.mathsScienceMaxTotal
      ? parseFloat(((s.mathsScienceObtainedTotal / s.mathsScienceMaxTotal) * 100).toFixed(2))
      : 0;
    return [
      i + 1,
      s.meritNumber || i + 1,
      s.studentNameSSLC,
      fmtGender(s.gender),
      s.fatherName || '',
      fmtDOB(s.dateOfBirth),
      s.category,
      s.annualIncome || 0,
      `${s.mathsScienceObtainedTotal}/${s.mathsScienceMaxTotal}`,
      msPct,
      s.sslcMaxTotal,
      s.sslcObtainedTotal,
      parseFloat(sslcPct(s).toFixed(2)),
    ];
  });

  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);

  ws['!cols'] = [
    { wch: 5  },  // Sl
    { wch: 10 },  // Merit No.
    { wch: 28 },  // Name
    { wch: 8  },  // Gender
    { wch: 25 },  // Father
    { wch: 12 },  // DOB
    { wch: 10 },  // Category
    { wch: 15 },  // Income
    { wch: 13 },  // M+S Marks
    { wch: 10 },  // M+S %
    { wch: 11 },  // SSLC Max
    { wch: 13 },  // SSLC Obtained
    { wch: 10 },  // SSLC %
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, academicYear ? `Merit ${academicYear}` : 'Merit List');

  const ay = academicYear?.replace(/[^0-9-]/g, '') ?? 'merit';
  XLSX.writeFile(wb, `merit_list_${ay}.xlsx`);
}
