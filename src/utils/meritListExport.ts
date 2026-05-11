import ExcelJS from 'exceljs';

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
  applicationNumber?: string;
  studentMobile?: string;
  fatherMobile?: string;
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

function msPct(s: MeritRow): number {
  if (!s.mathsScienceMaxTotal || s.mathsScienceMaxTotal === 0) return 0;
  return (s.mathsScienceObtainedTotal / s.mathsScienceMaxTotal) * 100;
}

export function sortByMerit<T extends MeritRow>(students: T[]): T[] {
  return [...students].sort((a, b) => {
    const pctDiff = sslcPct(b) - sslcPct(a);
    if (pctDiff !== 0) return pctDiff;
    return msPct(b) - msPct(a);
  });
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
      <td class="c merit-no">${idx + 1}</td>
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
  @page {
    size: A4 landscape;
    margin: 8mm 12mm 14mm;
    @bottom-right {
      content: "Page " counter(page) " / " counter(pages);
      font-size: 9pt;
      color: #555;
      font-family: 'Noto Sans Kannada', Arial, sans-serif;
    }
  }
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
  table { width: 100%; border-collapse: collapse; font-size: 11.5pt; }
  th, td { border: 0.5pt solid #444; padding: 7.5pt 4pt; vertical-align: middle; }
  thead tr { background: #d8d8d8; }
  thead th { font-weight: bold; text-align: center; font-size: 11pt; line-height: 1.45; }
  .alt { background: #f5f5f5; }
  .c { text-align: center; white-space: nowrap; }
  .l { text-align: left; }
  .r { text-align: right; white-space: nowrap; }
  .merit-no { font-weight: bold; font-size: 12.5pt; }
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

// ── Excel (ExcelJS — styled) ──────────────────────────────────────────────────

const TOTAL_COLS = 16;
const LAST_COL   = 'P'; // column 16

const thinBorder: Partial<ExcelJS.Borders> = {
  top:    { style: 'thin' },
  left:   { style: 'thin' },
  bottom: { style: 'thin' },
  right:  { style: 'thin' },
};

const headerFill: ExcelJS.Fill = {
  type: 'pattern', pattern: 'solid',
  fgColor: { argb: 'FFD8D8D8' },
};


export async function exportMeritListExcel(
  students: MeritRow[],
  academicYear: string | null,
): Promise<void> {
  const sorted = sortByMerit(students);

  const now    = new Date();
  const dd     = String(now.getDate()).padStart(2, '0');
  const mm     = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy   = now.getFullYear();
  const todayFmt = `${dd}/${mm}/${yyyy}`;
  const ayDisplay = academicYear ?? '';

  // ── Workbook ────────────────────────────────────────────────────────────────

  const wb = new ExcelJS.Workbook();
  wb.creator = 'SMP Admissions';

  const ws = wb.addWorksheet(
    academicYear ? `Merit ${academicYear}` : 'Merit List',
    {
      pageSetup: {
        orientation:        'landscape',
        paperSize:          9,   // A4
        horizontalCentered: true,
      },
    },
  );

  ws.pageSetup.margins = {
    left: 0.50, right: 0.50,
    top:  0.60, bottom: 0.60,
    header: 0.30, footer: 0.30,
  };

  // ── Column widths ────────────────────────────────────────────────────────────

  ws.columns = [
    { width: 5  },   // A  Sl
    { width: 9  },   // B  Merit No.
    { width: 16 },   // C  Application No.
    { width: 32 },   // D  Name (SSLC)
    { width: 9  },   // E  Gender
    { width: 28 },   // F  Father Name
    { width: 13 },   // G  DOB
    { width: 12 },   // H  Category
    { width: 14 },   // I  Annual Income
    { width: 14 },   // J  Student Mobile
    { width: 14 },   // K  Father Mobile
    { width: 13 },   // L  M+S Marks
    { width: 10 },   // M  M+S %
    { width: 11 },   // N  SSLC Max
    { width: 14 },   // O  SSLC Obtained
    { width: 10 },   // P  SSLC %
  ];

  // ── Helper: add a full-width merged title row ────────────────────────────────

  const addTitle = (
    text: string,
    fontSize: number,
    bold: boolean,
    height = 16,
    bottomBorder = false,
  ): ExcelJS.Row => {
    const row = ws.addRow([text]);
    ws.mergeCells(`A${row.number}:${LAST_COL}${row.number}`);
    row.height = height;
    const cell = row.getCell(1);
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.font = { name: 'Arial', size: fontSize, bold };
    if (bottomBorder) cell.border = { bottom: { style: 'medium' } };
    return row;
  };

  // ── Institution header ────────────────────────────────────────────────────────

  addTitle('GOVERNMENT OF KARNATAKA',                                    10, false, 18);
  addTitle('DEPARTMENT OF TECHNICAL EDUCATION',                          10, false, 18);
  addTitle('COMMISSIONER FOR COLLEGIATE AND TECHNICAL EDUCATION',        10, false, 18);
  addTitle('SANJAY MEMORIAL POLYTECHNIC',                                16, true,  26);
  addTitle('SAGAR – 577401',                                             11, true,  18, true);

  ws.addRow([]);           // blank separator

  // ── Title block (bordered box) ────────────────────────────────────────────────

  const tb1 = addTitle(
    'MERIT LIST FOR FIRST SEMESTER ENGINEERING DIPLOMA ADMISSION THROUGH OFFLINE PROCESS AS PER MERIT AND ROSTER',
    11, true, 36,
  );
  const tb2 = addTitle(`Academic Year: ${ayDisplay}`, 13, true, 28);

  // draw box border around the title block rows
  for (const row of [tb1, tb2]) {
    row.getCell(1).border = {
      top:    { style: 'medium' },
      left:   { style: 'medium' },
      bottom: { style: 'medium' },
      right:  { style: 'medium' },
    };
  }

  ws.addRow([]);           // blank separator

  // ── Info row ─────────────────────────────────────────────────────────────────
  // Left side: label + count  |  Right side: date

  const infoRow = ws.addRow([
    `Eligible Candidates Merit List   (${sorted.length} candidates)`,
    ...Array(TOTAL_COLS - 2).fill(''),
    `Date: ${todayFmt}`,
  ]);
  infoRow.height = 20;
  infoRow.getCell(1).font            = { bold: true, size: 10 };
  infoRow.getCell(1).alignment       = { horizontal: 'left', vertical: 'middle' };
  infoRow.getCell(TOTAL_COLS).font   = { bold: true, size: 10 };
  infoRow.getCell(TOTAL_COLS).alignment = { horizontal: 'right', vertical: 'middle' };

  ws.addRow([]);           // blank separator

  // ── Column header row ────────────────────────────────────────────────────────

  const headerRow = ws.addRow([
    'Sl', 'Merit\nNo.', 'App.\nNo.', 'Name (SSLC)', 'Gender',
    'Father Name', 'Date of\nBirth', 'Category', 'Annual\nIncome',
    'Student\nMobile', 'Father\nMobile',
    'M+S\nMarks', 'M+S\n%',
    'SSLC\nMax', 'SSLC\nObtained', 'SSLC\n%',
  ]);
  headerRow.height = 42;
  headerRow.eachCell({ includeEmpty: true }, cell => {
    cell.fill      = headerFill;
    cell.font      = { name: 'Arial', bold: true, size: 11 };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border    = thinBorder;
  });

  // Repeat column header when printing
  ws.pageSetup.printTitlesRow = `${headerRow.number}:${headerRow.number}`;

  // ── Data rows ────────────────────────────────────────────────────────────────

  sorted.forEach((s, i) => {
    const msPct = s.mathsScienceMaxTotal
      ? parseFloat(((s.mathsScienceObtainedTotal / s.mathsScienceMaxTotal) * 100).toFixed(2))
      : 0;

    const dataRow = ws.addRow([
      i + 1,
      i + 1,
      s.applicationNumber || '',
      s.studentNameSSLC,
      fmtGender(s.gender),
      s.fatherName || '',
      fmtDOB(s.dateOfBirth),
      s.category,
      s.annualIncome || 0,
      s.studentMobile || '',
      s.fatherMobile || '',
      `${s.mathsScienceObtainedTotal}/${s.mathsScienceMaxTotal}`,
      msPct,
      s.sslcMaxTotal,
      s.sslcObtainedTotal,
      parseFloat(sslcPct(s).toFixed(2)),
    ]);

    dataRow.height = 23;

    if (i % 2 === 1) {
      dataRow.eachCell({ includeEmpty: true }, cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
      });
    }

    dataRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
      cell.font   = { name: 'Arial', size: 11 };
      cell.border = thinBorder;
      // Merit No. bold
      if (colNum === 2) cell.font = { name: 'Arial', size: 11, bold: true };
      // Alignment: name columns left, income/percentage right, others center
      if (colNum === 4 || colNum === 6) {
        cell.alignment = { horizontal: 'left', vertical: 'middle' };
      } else if (colNum === 9 || colNum === 13 || colNum === 16) {
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
      } else {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      }
    });
  });

  // ── Footer note ──────────────────────────────────────────────────────────────

  ws.addRow([]);
  const footerRow = ws.addRow([
    `Sorted by SSLC % (highest first)  ·  Generated: ${todayFmt}  ·  ${sorted.length} candidates`,
  ]);
  ws.mergeCells(`A${footerRow.number}:${LAST_COL}${footerRow.number}`);
  footerRow.getCell(1).font      = { name: 'Arial', size: 9, italic: true, color: { argb: 'FF555555' } };
  footerRow.getCell(1).alignment = { horizontal: 'center' };

  // ── Download ─────────────────────────────────────────────────────────────────

  const buffer = await wb.xlsx.writeBuffer();
  const blob   = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href    = url;
  const ay  = academicYear?.replace(/[^0-9-]/g, '') ?? 'merit';
  a.download = `merit_list_${ay}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
