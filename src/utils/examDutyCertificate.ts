import type { ExamDuty, ExamDutyCertificate, ExamDutyType } from '../types';

// ── Exam duty Attendance Certificate ──────────────────────────────────────────
// Half-A4 (210 × 148.5 mm) certificate in the Chief Superintendent's format.
// Every printed A4 sheet carries the same certificate twice — STAFF COPY on the
// top half and OFFICE COPY on the bottom half — separated by a cut line.

export const DUTY_LABELS: Record<ExamDutyType, string> = {
  INVIGILATOR: 'Invigilator',
  RELIEVING_SUPERINTENDENT: 'Relieving Superintendent',
  DEPUTY_CHIEF_SUPERINTENDENT: 'Deputy Chief Superintendent',
  CHIEF_OBSERVER: 'Chief Observer',
  OBSERVER: 'Observer',
  IA_VERIFIER: 'IA Verifier',
  PRACTICAL_EXAMINER: 'Practical Examiner',
  SQUAD_MEMBER: 'Squad Member',
  CUSTODIAN: 'Custodian',
  OTHER: 'Other duty',
};

export const DUTY_ORDER: ExamDutyType[] = [
  'INVIGILATOR', 'RELIEVING_SUPERINTENDENT', 'DEPUTY_CHIEF_SUPERINTENDENT', 'CHIEF_OBSERVER',
  'OBSERVER', 'IA_VERIFIER', 'PRACTICAL_EXAMINER', 'SQUAD_MEMBER', 'CUSTODIAN', 'OTHER',
];

export const SESSION_LABEL_SUGGESTIONS = ['APR/MAY', 'MAY/JUNE', 'OCT/NOV', 'NOV/DEC'];

export type ExamCertContent = Pick<
  ExamDutyCertificate,
  'salutation' | 'name' | 'designation' | 'department' | 'polytechnic'
  | 'sessionLabel' | 'sessionYear' | 'duties' | 'bodyOverride' | 'refNo' | 'issueDate'
>;

// ── Text helpers ──────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 'YYYY-MM-DD' → 'dd/mm/yyyy' */
export function dmy(iso: string): string {
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${d}/${m}/${y}` : iso;
}

function joinAnd(parts: string[]): string {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

export function dutyLabel(d: Pick<ExamDuty, 'type' | 'customLabel'>): string {
  return d.type === 'OTHER' ? d.customLabel.trim() || 'Examination Duty' : DUTY_LABELS[d.type];
}

export function dutyDates(d: ExamDuty): string[] {
  if (d.mode === 'dates') return [...new Set(d.dates.filter(Boolean))].sort();
  if (d.mode === 'range' && d.to && d.to !== d.from) return [d.from, d.to];
  return d.from ? [d.from] : [];
}

/** "on 03/06/2026" · "from 18/05/2026 to 29/05/2026 (both days inclusive)" · "on 18/05/2026, 20/05/2026 and 22/05/2026" */
export function dutyPeriod(d: ExamDuty): string {
  if (d.mode === 'range' && d.to && d.to !== d.from) {
    return `from ${dmy(d.from)} to ${dmy(d.to)} (both days inclusive)`;
  }
  const dates = dutyDates(d);
  return dates.length ? `on ${joinAnd(dates.map(dmy))}` : '';
}

/** Short period for tables / Excel: "18/05/2026 – 29/05/2026", "03/06/2026", "18/05, 20/05/2026". */
export function dutyPeriodShort(d: ExamDuty): string {
  if (d.mode === 'range' && d.to && d.to !== d.from) return `${dmy(d.from)} – ${dmy(d.to)}`;
  return dutyDates(d).map(dmy).join(', ');
}

function personPhrase(c: ExamCertContent): string {
  const dept = c.department.trim();
  const parts = [`${c.salutation} ${c.name.trim().toUpperCase()}`];
  if (c.designation.trim()) parts.push(c.designation.trim());
  if (dept) parts.push(/^(dept\.?|department)\b/i.test(dept) ? dept : `Department of ${dept}`);
  if (c.polytechnic.trim()) parts.push(c.polytechnic.trim().toUpperCase());
  return parts.join(', ');
}

function examName(duties: ExamDuty[]): string {
  const kinds = new Set(duties.filter((d) => d.type !== 'IA_VERIFIER').map((d) => d.examKind));
  if (kinds.size === 2) return 'Diploma Theory and Practical Examinations';
  if (kinds.has('THEORY')) return 'Diploma Theory Examinations';
  if (kinds.has('PRACTICAL')) return 'Diploma Practical Examinations';
  return 'Diploma Examinations';
}

/** The generated certificate paragraph (plain text). */
export function buildExamCertBody(c: ExamCertContent): string {
  const session = `${c.sessionLabel}-${c.sessionYear}`;
  const person = personPhrase(c);
  const general = c.duties.filter((d) => d.type !== 'PRACTICAL_EXAMINER');
  const practical = c.duties.filter((d) => d.type === 'PRACTICAL_EXAMINER');
  const sentences: string[] = [];

  if (general.length === 1) {
    const d = general[0];
    sentences.push(
      `This is to certify that ${person}, has worked as ${dutyLabel(d)} for the ` +
      `${examName(general)} ${session} at this centre ${dutyPeriod(d)}.`
    );
  } else if (general.length > 1) {
    const clauses = general.map((d) => `as ${dutyLabel(d)} ${dutyPeriod(d)}`);
    sentences.push(
      `This is to certify that ${person}, has worked ${joinAnd(clauses)} during the ` +
      `${examName(general)} ${session} held at this centre.`
    );
  }

  if (practical.length) {
    const lead = general.length ? 'The above-named has also' : `This is to certify that ${person}, has`;
    // One sitting: "…Practical Examinations in <subject> of the …". Several: subject per date clause.
    const single = practical.length === 1;
    const onlySubject = single ? practical[0].subject.trim() : '';
    const clauses = practical.map((d) => {
      const subject = single ? '' : d.subject.trim();
      return `${subject ? `in ${subject} ` : ''}${dutyPeriod(d)}`;
    });
    sentences.push(
      `${lead} set and conducted the Diploma Practical Examinations${onlySubject ? ` in ${onlySubject}` : ''} ` +
      `of the ${session} Semester Examinations at this centre ${joinAnd(clauses)}, ` +
      `and the marks have been duly uploaded online.`
    );
  }

  if (!sentences.length) {
    sentences.push(`This is to certify that ${person}, has worked at this centre for the Diploma Examinations ${session}.`);
  }
  return sentences.join(' ').replace(/\s+/g, ' ').replace(/\s+([.,])/g, '$1');
}

export function examCertBodyText(c: ExamCertContent): string {
  return c.bodyOverride?.trim() || buildExamCertBody(c);
}

// ── HTML ──────────────────────────────────────────────────────────────────────

const CSS = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { background: #fff; }
  body { font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif; color: #000; }
  .sheet { width: 210mm; height: 297mm; overflow: hidden; page-break-after: always; break-after: page; }
  .sheet:last-child { page-break-after: auto; break-after: auto; }
  .half {
    position: relative; width: 210mm; height: 148.5mm; overflow: hidden;
    padding: 9mm 17mm 9mm; display: flex; flex-direction: column;
  }
  .cutline { position: relative; height: 0; border-top: 0.3mm dashed #9a9a9a; }
  .cutline span { position: absolute; top: -2.3mm; left: 6mm; font-size: 9pt; color: #9a9a9a; background: #fff; padding: 0 1mm; line-height: 1; }
  .copy-tag {
    position: absolute; top: 5.5mm; right: 9mm; font-size: 7pt; letter-spacing: 1.4pt;
    border: 0.25mm solid #444; border-radius: 1mm; padding: 0.6mm 1.8mm; color: #222;
  }
  .head { text-align: center; line-height: 1.38; }
  .head .l1 { font-size: 13pt; letter-spacing: 0.3pt; }
  .head .l2, .head .l3 { font-size: 12pt; }
  .head .l4 { font-size: 11.5pt; margin-top: 1.2mm; }
  .head .l5 { font-size: 12pt; font-weight: bold; }
  .ref { display: flex; justify-content: space-between; align-items: baseline; font-size: 11pt; margin-top: 4mm; }
  .title {
    text-align: center; font-size: 13.5pt; font-weight: bold; letter-spacing: 0.6pt;
    text-decoration: underline; text-underline-offset: 1.2mm; margin: 4.5mm 0 3.5mm;
  }
  .body { font-size: 12.5pt; line-height: 1.9; text-align: justify; text-indent: 12mm; }
  .body b { font-weight: bold; }
  .foot { margin-top: auto; display: flex; justify-content: space-between; align-items: flex-end; padding-top: 3mm; }
  .recv { font-size: 10pt; line-height: 2.1; color: #111; }
  .sig { text-align: center; font-size: 10.5pt; line-height: 1.45; min-width: 72mm; }
  .sig .space { height: 13mm; }
  .sig .who { font-weight: bold; font-size: 11pt; }
  @page { size: A4 portrait; margin: 0; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
`;

// Long text: first tighten the line spacing (1.9 → 1.5), then step the font
// down (12.5pt → 9.5pt) until a half page no longer overflows.
const FIT_SCRIPT = `
function fitHalves() {
  document.querySelectorAll('.half').forEach(function (h) {
    var b = h.querySelector('.body'); if (!b) return;
    var lh = 1.9, size = 12.5;
    b.style.lineHeight = lh; b.style.fontSize = size + 'pt';
    var over = function () { return h.scrollHeight > h.clientHeight + 1; };
    while (over() && lh > 1.5) { lh = Math.round((lh - 0.1) * 10) / 10; b.style.lineHeight = lh; }
    while (over() && size > 9.5) { size -= 0.25; b.style.fontSize = size + 'pt'; }
  });
}`;

function halfHTML(c: ExamCertContent, copy: 'STAFF COPY' | 'OFFICE COPY'): string {
  let body = esc(examCertBodyText(c));
  const who = esc(`${c.salutation} ${c.name.trim().toUpperCase()}`);
  if (who.trim()) body = body.replace(who, `<b>${who}</b>`);

  return `
  <div class="half">
    <span class="copy-tag">${copy}</span>
    <div class="head">
      <div class="l1">GOVERNMENT OF KARNATAKA</div>
      <div class="l2">Board of Technical Education</div>
      <div class="l3">Board of Technical Examination, Bangalore</div>
      <div class="l4">Office of the Chief Superintendent of Examinations / Principal</div>
      <div class="l5">Sanjay Memorial Polytechnic, Sagar</div>
    </div>
    <div class="ref">
      <span>${esc(c.refNo)}</span>
      <span>Date : ${esc(dmy(c.issueDate))}</span>
    </div>
    <div class="title">ATTENDANCE CERTIFICATE</div>
    <p class="body">${body}</p>
    <div class="foot">
      <div class="recv">${copy === 'OFFICE COPY'
        ? 'Received by : ____________________<br/>Date : ____________'
        : ''}</div>
      <div class="sig">
        <div class="space"></div>
        <div class="who">Chief Superintendent / Principal</div>
        <div>Sanjay Memorial Polytechnic,</div>
        <div>Sagar &#8211; 577 401</div>
      </div>
    </div>
  </div>`;
}

/**
 * Full print document: one A4 sheet per certificate (staff + office copy).
 * `preview` renders only the staff half, for the live preview in the form.
 */
export function buildExamCertHTML(certs: ExamCertContent[], opts: { preview?: boolean } = {}): string {
  const title = certs.length === 1
    ? `Attendance Certificate - ${certs[0].name || 'Draft'}`
    : `Attendance Certificates (${certs.length})`;
  const content = opts.preview
    ? halfHTML(certs[0], 'STAFF COPY')
    : certs.map((c) =>
        `<div class="sheet">${halfHTML(c, 'STAFF COPY')}<div class="cutline"><span>&#9986;</span></div>${halfHTML(c, 'OFFICE COPY')}</div>`
      ).join('\n');

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/><title>${esc(title)}</title>
<style>${CSS}</style></head>
<body>${content}
<script>${FIT_SCRIPT}
if (document.readyState === 'complete') fitHalves(); else window.addEventListener('load', fitHalves);
</script>
</body></html>`;
}

/**
 * Opens the print window. Pass `target` (a window opened synchronously in the
 * click handler) when printing after an await, so the popup isn't blocked.
 */
export function printExamCerts(certs: ExamCertContent[], target?: Window | null): void {
  if (!certs.length) { target?.close(); return; }
  const html = buildExamCertHTML(certs).replace('</body>', `<script>
  window.addEventListener('load', function () {
    fitHalves();
    setTimeout(function () { window.print(); }, 60);
    window.addEventListener('afterprint', function () { window.close(); });
  });
</script>\n</body>`);
  const blob = new Blob([html], { type: 'text/html; charset=utf-8' });
  const url = URL.createObjectURL(blob);
  if (target && !target.closed) {
    target.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return;
  }
  const win = window.open(url, '_blank');
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
