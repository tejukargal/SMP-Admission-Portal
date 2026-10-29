import type { ExamSettingCertificate, ExamSettingSubject, ExamSettingWork } from '../types';
import { dmy, esc, openPrintHtml } from './examDutyCertificate';

// ── Setting & Conducting Certificate ──────────────────────────────────────────
// Full A4 certificate in the Principal's format (Office of the Chief
// Superintendent of Examination (PRL)). Each certificate prints as two A4
// pages — STAFF COPY, then OFFICE COPY with a "Received by" space.

export const WORK_LABELS: Record<ExamSettingWork, string> = {
  SET_AND_CONDUCTED: 'Set QP & Conducted',
  CONDUCTED: 'Conducted only',
  SET: 'Set QP only',
};

export const WORK_ORDER: ExamSettingWork[] = ['SET_AND_CONDUCTED', 'CONDUCTED', 'SET'];

export type SettingCertContent = Pick<
  ExamSettingCertificate,
  'salutation' | 'name' | 'designation' | 'department' | 'polytechnic'
  | 'sessionLabel' | 'sessionYear' | 'work' | 'subjects' | 'bodyOverride' | 'refNo' | 'issueDate'
>;

/** True when the batch / student columns apply (not for "Set QP only"). */
export function showsCounts(work: ExamSettingWork): boolean {
  return work !== 'SET';
}

export interface SubjectTotals {
  batchesAllotted: number;
  studentsAllotted: number;
  batchesConducted: number;
  studentsAttended: number;
}

export function subjectTotals(subjects: ExamSettingSubject[]): SubjectTotals {
  const t: SubjectTotals = { batchesAllotted: 0, studentsAllotted: 0, batchesConducted: 0, studentsAttended: 0 };
  for (const s of subjects) {
    t.batchesAllotted += s.batchesAllotted || 0;
    t.studentsAllotted += s.studentsAllotted || 0;
    t.batchesConducted += s.batchesConducted || 0;
    t.studentsAttended += s.studentsAttended || 0;
  }
  return t;
}

// ── Text helpers ──────────────────────────────────────────────────────────────

function deptPhrase(dept: string): string {
  const d = dept.trim();
  if (!d) return '';
  return /^(dept\.?|department)\b/i.test(d) ? d : `Dept. of ${d}`;
}

/** "GOVT. WOMEN'S POLYTECHNIC" → "Govt. Women's Polytechnic" */
function titleCase(s: string): string {
  return s.toLowerCase().replace(/(^|[\s(./&-])([a-z])/g, (_m, p: string, c: string) => p + c.toUpperCase());
}

/** "APR/MAY", 2026 → "Semester 2026 APR / MAY examination" */
function examPhrase(c: SettingCertContent): string {
  return `Semester ${c.sessionYear} ${c.sessionLabel.replace(/\s*\/\s*/g, ' / ')} examination`;
}

function personPhrase(c: SettingCertContent): string {
  let s = `${c.salutation} ${c.name.trim().toUpperCase()}`;
  const role = [c.designation.trim(), deptPhrase(c.department)].filter(Boolean).join(', ');
  const poly = c.polytechnic.trim().toUpperCase();
  if (role) s += `, ${role}`;
  if (poly) s += role ? ` of ${poly}` : `, ${poly}`;
  return s;
}

/** The generated certificate paragraph (plain text). */
export function buildSettingCertBody(c: SettingCertContent): string {
  const person = personPhrase(c);
  const subj = c.subjects.length === 1 ? 'subject' : 'subjects';
  const exam = examPhrase(c);
  let text: string;
  if (c.work === 'SET') {
    text = `This is to certify that ${person}, has set the Question paper for the ${exam} in the following ${subj}.`;
  } else if (c.work === 'CONDUCTED') {
    text = `This is to certify that ${person}, has conducted the ${exam} in the following ${subj} at this institution.`;
  } else {
    text = `This is to certify that ${person}, has set the Question paper and conducted the ${exam} in the following ${subj} at this institution.`;
  }
  return text.replace(/\s+/g, ' ').replace(/\s+([.,])/g, '$1');
}

export function settingCertBodyText(c: SettingCertContent): string {
  return c.bodyOverride?.trim() || buildSettingCertBody(c);
}

// ── HTML ──────────────────────────────────────────────────────────────────────

const CSS = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { background: #fff; }
  body { font-family: Arial, Helvetica, 'Liberation Sans', sans-serif; color: #000; }
  .page {
    position: relative; width: 210mm; height: 297mm; overflow: hidden;
    padding: 15mm 18mm 14mm; display: flex; flex-direction: column;
    page-break-after: always; break-after: page;
  }
  .page:last-child { page-break-after: auto; break-after: auto; }
  .toprow {
    position: absolute; top: 7mm; left: 10mm; right: 10mm;
    display: flex; justify-content: space-between; align-items: center;
  }
  .inst-code { font-size: 8pt; letter-spacing: 0.3pt; color: #222; }
  .copy-tag {
    font-size: 7.5pt; letter-spacing: 1.4pt;
    border: 0.25mm solid #444; border-radius: 1mm; padding: 0.6mm 1.8mm; color: #222;
  }
  .head { text-align: center; line-height: 1.45; }
  .head .l1 { font-size: 13.5pt; font-weight: bold; letter-spacing: 0.3pt; }
  .head .l2, .head .l3 { font-size: 12.5pt; }
  .head .l4 { font-size: 10.5pt; margin-top: 0.8mm; }
  .head .l5 { font-size: 10.5pt; }
  .ref { display: flex; justify-content: space-between; align-items: baseline; font-size: 10.5pt; font-weight: bold; margin-top: 4mm; }
  .title {
    text-align: center; font-size: 13pt; font-weight: bold; letter-spacing: 0.6pt;
    text-decoration: underline; text-underline-offset: 1.2mm; margin: 4mm 0 3mm;
  }
  .body { font-size: 12.5pt; line-height: 1.75; text-align: justify; text-indent: 12mm; }
  .body b { font-weight: bold; }
  table.tbl { width: 100%; border-collapse: collapse; margin-top: 2mm; font-size: 11.5pt; }
  .tbl th, .tbl td { border: 0.3mm solid #000; padding: 2.6mm 1.2mm; vertical-align: middle; }
  .tbl th { font-size: 9pt; font-weight: normal; line-height: 1.2; text-align: center; padding: 1mm; }
  .tbl td.c { text-align: center; }
  .tbl td.n { text-align: center; font-size: 1.12em; }
  .tbl td.code { white-space: nowrap; }
  .tbl tr.total td { font-weight: bold; }
  .tbl tr.total td.lbl { text-align: center; font-size: 0.9em; }
  .to { margin-top: 9mm; margin-left: 8mm; font-size: 11pt; line-height: 1.45; }
  .to .addr { margin: 2mm 0 0 14mm; max-width: 120mm; }
  .foot { margin-top: 10mm; display: flex; justify-content: space-between; align-items: flex-end; }
  .recv { font-size: 10pt; line-height: 2.1; color: #111; }
  .sig { text-align: center; font-size: 10.5pt; line-height: 1.45; min-width: 72mm; }
  .sig .space { height: 16mm; }
  .sig .who { font-weight: bold; font-size: 12pt; letter-spacing: 0.4pt; }
  @page { size: A4 portrait; margin: 0; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
`;

// Long text / many subjects: first tighten the line spacing and row padding,
// then the blank gaps around the TO block and signature, then step the table
// font and finally the paragraph font down until the page no longer overflows.
const FIT_SCRIPT = `
function fitPages() {
  document.querySelectorAll('.page').forEach(function (p) {
    var b = p.querySelector('.body'), t = p.querySelector('.tbl');
    var to = p.querySelector('.to'), foot = p.querySelector('.foot'), space = p.querySelector('.sig .space');
    var lh = 1.75, fs = 12.5, ts = 11.5, pad = 2.6, gap = 1;
    var cells = t ? t.querySelectorAll('td') : [];
    function apply() {
      b.style.lineHeight = lh; b.style.fontSize = fs + 'pt';
      if (t) t.style.fontSize = ts + 'pt';
      for (var i = 0; i < cells.length; i++) cells[i].style.padding = pad + 'mm 1.2mm';
      to.style.marginTop = (9 * gap) + 'mm';
      foot.style.marginTop = (10 * gap) + 'mm';
      space.style.height = (10 + 6 * gap) + 'mm';
    }
    var over = function () { return p.scrollHeight > p.clientHeight + 1; };
    apply();
    while (over() && (lh > 1.4 || pad > 1)) {
      lh = Math.max(1.4, Math.round((lh - 0.05) * 100) / 100);
      pad = Math.max(1, Math.round((pad - 0.2) * 10) / 10);
      apply();
    }
    while (over() && gap > 0.3) { gap = Math.round((gap - 0.1) * 10) / 10; apply(); }
    while (over() && ts > 9) { ts -= 0.25; apply(); }
    while (over() && fs > 9) { fs -= 0.25; ts = Math.max(8, ts - 0.25); apply(); }
  });
}`;

function toBlockHTML(c: SettingCertContent): string {
  const lines: string[] = [`${c.salutation} ${c.name.trim().toUpperCase()},`];
  if (c.designation.trim()) lines.push(`${c.designation.trim()},`);
  const dept = deptPhrase(c.department);
  if (dept) lines.push(dept);
  const poly = titleCase(c.polytechnic.trim());
  if (poly) {
    // "…Polytechnic, Shiralakoppa" → place on its own line, like the paper letters
    const i = poly.lastIndexOf(',');
    if (i > 0) lines.push(`${poly.slice(0, i + 1)}`, poly.slice(i + 1).trim());
    else lines.push(poly);
  }
  return lines.map((l) => `<div>${esc(l)}</div>`).join('');
}

function tableHTML(c: SettingCertContent): string {
  const counts = showsCounts(c.work);
  const head = `<tr>
      <th style="width:9mm">SL<br/>NO</th>
      <th style="width:19mm">SUB.<br/>CODE.<br/>NO.</th>
      <th>SUBJECT</th>
      ${counts ? `<th style="width:18mm">NO.OF<br/>BATCHES<br/>ALLOTED</th>
      <th style="width:18mm">NO.OF<br/>STUDENT<br/>ALLOTED</th>
      <th style="width:21mm">NO.OF<br/>BATCHES<br/>CONDUCTED</th>
      <th style="width:20mm">NO.OF<br/>STUDENT<br/>ATTENDED</th>` : ''}
    </tr>`;
  const rows = c.subjects.map((s, i) => `<tr>
      <td class="c">${i + 1}</td>
      <td class="code">${esc(s.code)}</td>
      <td>${esc(s.name)}</td>
      ${counts ? `<td class="n">${s.batchesAllotted}</td>
      <td class="n">${s.studentsAllotted}</td>
      <td class="n">${s.batchesConducted}</td>
      <td class="n">${s.studentsAttended}</td>` : ''}
    </tr>`).join('');
  let total = '';
  if (counts && c.subjects.length) {
    const t = subjectTotals(c.subjects);
    total = `<tr class="total">
      <td></td><td></td><td class="lbl">TOTAL</td>
      <td class="n">${t.batchesAllotted}</td>
      <td class="n">${t.studentsAllotted}</td>
      <td class="n">${t.batchesConducted}</td>
      <td class="n">${t.studentsAttended}</td>
    </tr>`;
  }
  return `<table class="tbl"><thead>${head}</thead><tbody>${rows}${total}</tbody></table>`;
}

function pageHTML(c: SettingCertContent, copy: 'STAFF COPY' | 'OFFICE COPY'): string {
  let body = esc(settingCertBodyText(c));
  const who = esc(`${c.salutation} ${c.name.trim().toUpperCase()}`);
  if (who.trim()) body = body.replace(who, `<b>${who}</b>`);

  return `
  <div class="page">
    <div class="toprow">
      <span class="inst-code">Inst. Code: 308</span>
      <span class="copy-tag">${copy}</span>
    </div>
    <div class="head">
      <div class="l1">GOVERNMENT OF KARNATAKA</div>
      <div class="l2">Board of Technical Education</div>
      <div class="l3">Board of Technical Examination, Bangalore</div>
      <div class="l4">Office of the Chief Superintendent of Examination (PRL)</div>
      <div class="l5">Sanjay Memorial Polytechnic, Sagar</div>
    </div>
    <div class="ref">
      <span>${esc(c.refNo)}</span>
      <span>Date : ${esc(dmy(c.issueDate))}</span>
    </div>
    <div class="title">CERTIFICATE</div>
    <p class="body">${body}</p>
    ${tableHTML(c)}
    <div class="to">
      <div>TO</div>
      <div class="addr">${toBlockHTML(c)}</div>
    </div>
    <div class="foot">
      <div class="recv">${copy === 'OFFICE COPY'
        ? 'Received by : ____________________<br/>Date : ____________'
        : ''}</div>
      <div class="sig">
        <div class="space"></div>
        <div class="who">PRINCIPAL</div>
        <div>Sanjay Memorial Polytechnic,</div>
        <div>SAGAR &#8211; 577 401</div>
      </div>
    </div>
  </div>`;
}

/**
 * Full print document: two A4 pages per certificate (staff + office copy).
 * `preview` renders only the staff copy, for the live preview in the form.
 */
export function buildSettingCertHTML(certs: SettingCertContent[], opts: { preview?: boolean } = {}): string {
  const title = certs.length === 1
    ? `Setting & Conducting Certificate - ${certs[0].name || 'Draft'}`
    : `Setting & Conducting Certificates (${certs.length})`;
  const content = opts.preview
    ? pageHTML(certs[0], 'STAFF COPY')
    : certs.map((c) => `${pageHTML(c, 'STAFF COPY')}${pageHTML(c, 'OFFICE COPY')}`).join('\n');

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/><title>${esc(title)}</title>
<style>${CSS}</style></head>
<body>${content}
<script>${FIT_SCRIPT}
if (document.readyState === 'complete') fitPages(); else window.addEventListener('load', fitPages);
</script>
</body></html>`;
}

/** Opens the print window (see `printExamCerts` for the `target` popup rule). */
export function printSettingCerts(certs: SettingCertContent[], target?: Window | null): void {
  if (!certs.length) { target?.close(); return; }
  openPrintHtml(buildSettingCertHTML(certs), 'fitPages', target);
}
