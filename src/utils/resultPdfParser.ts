import * as pdfjsLib from 'pdfjs-dist';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { Course, ExamResultSubject, ExamResultSemesterSummary } from '../types';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

// ── Text Extraction ─────────────────────────────────────────────────────
// pdfjs-dist returns text items with X/Y coordinates. Sort by Y (descending
// = top of page first) then X (left→right) and group into lines by
// proximity, reconstructing newline-separated text per page.

interface PosItem {
  str: string;
  x: number;
  y: number;
}

async function loadPageItems(file: File): Promise<PosItem[][]> {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
  const pages: PosItem[][] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();

    const items = content.items
      .filter((item): item is TextItem => 'str' in item && (item as TextItem).str.trim().length > 0)
      .map((item) => ({ str: item.str.trim(), x: item.transform[4], y: item.transform[5] }));

    pages.push(items);
  }

  return pages;
}

// Groups position-tagged items into text lines by Y-proximity (±3 units),
// sorted top-to-bottom then left-to-right within a line.
function groupItemsIntoLines(items: PosItem[]): { y: number; text: string }[] {
  if (items.length === 0) return [];

  const sorted = [...items].sort((a, b) => {
    const dy = b.y - a.y;
    if (Math.abs(dy) > 3) return dy;
    return a.x - b.x;
  });

  const lines: { y: number; text: string }[] = [];
  let tokens: string[] = [];
  let lineY = sorted[0].y;

  for (const item of sorted) {
    if (Math.abs(item.y - lineY) > 3) {
      if (tokens.length) lines.push({ y: lineY, text: tokens.join(' ') });
      tokens = [];
      lineY = item.y;
    }
    tokens.push(item.str);
  }
  if (tokens.length) lines.push({ y: lineY, text: tokens.join(' ') });

  return lines;
}

// ── Header (shared) ─────────────────────────────────────────────────────

export interface LedgerHeader {
  course: Course | null;
  collegeCode: string;
  examSession: string;
}

const VALID_COURSES: Course[] = ['CE', 'ME', 'EC', 'CS', 'EE'];

// ── Shared record shape ─────────────────────────────────────────────────

export interface RawResult {
  regNumber: string;
  studentName: string;
  parentName: string;
  admissionType: string;
  institutionName: string;
  subjects: ExamResultSubject[];
  semesterSummary: ExamResultSemesterSummary[];
  creditsEarnedCumulative: number | null;
  cgpa: number | null;
  cgpaStatus: string;
  percentageConversion: number | null;
  overallResult: string;
}

export interface ParsedResultLedger extends LedgerHeader {
  format: 'A' | 'B';
  results: RawResult[];
}

function parseNumOrNull(raw: string): number | null {
  const t = raw.trim();
  const n = Number(t);
  return t !== '' && isFinite(n) ? n : null;
}

// ═══════════════════════════════════════════════════════════════════════
// Format A — BTE "course-wise Result Ledger" (multi-semester grid, IA/TR/PR
// marks, "[ S/D/O : parent ]" student header, SGPA-per-semester table).
// ═══════════════════════════════════════════════════════════════════════

async function parseFormatA(pages: string[]): Promise<ParsedResultLedger> {
  const header = parseHeaderA(pages.join('\n'));
  const blocks = splitBlocksA(pages);
  const results = blocks.map(parseBlockA).filter((r): r is RawResult => r !== null);
  return { ...header, format: 'A', results };
}

function parseHeaderA(fullText: string): LedgerHeader {
  const sessionM = fullText.match(/DIPLOMA EXAMINATION\s+(.+?)(?:\n|NOTE)/);
  const codeM = fullText.match(/College Code\s*:\s*(\d+)/);
  const progM = fullText.match(/Programme\s*:\s*([A-Z]{2})\s*[—-]/);
  const course = progM && VALID_COURSES.includes(progM[1] as Course) ? (progM[1] as Course) : null;

  return {
    course,
    collegeCode: codeM ? codeM[1].trim() : '',
    examSession: sessionM ? sessionM[1].trim() : '',
  };
}

// Each student record starts with "<serial> <regNumber> <NAME> [ S/D/O : ... ]".
// Split on that marker line, discarding the pre-first-match header fragment.
const STUDENT_START_RE_A = /^\d+\s+\d{3}[A-Z]{2}\d{5,}\s+.+\[\s*S\/D\/O\s*:.+?\]\s*$/m;

function splitBlocksA(pages: string[]): string[] {
  const fullText = pages.join('\n');
  const lines = fullText.split('\n');

  const blocks: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (STUDENT_START_RE_A.test(line)) {
      if (current.length) blocks.push(current.join('\n'));
      current = [line];
    } else if (current.length) {
      current.push(line);
    }
  }
  if (current.length) blocks.push(current.join('\n'));

  return blocks;
}

function parseBlockA(block: string): RawResult | null {
  const headerM = block.match(
    /^\d+\s+(\d{3}[A-Z]{2}\d{5,})\s+(.+?)\s+\[\s*S\/D\/O\s*:\s*(.+?)\s*\]\s*$/m
  );
  if (!headerM) return null;

  const regNumber = headerM[1].trim();
  const studentName = headerM[2].trim();
  const parentName = headerM[3].trim();

  // Subject rows: "<sem> <code> <subject...> <ia/tr/pr> <P|F> <credit> <grade>"
  // Long subject names wrap to a second line in the PDF (e.g. "OBJECT ORIENTED
  // PROGRAMMING & DESIGN WITH" / "JAVA"); the IA/TR/PR..grade cells stay on the
  // row's first line, so the wrapped word lands on its own orphan line right
  // after. Detect those orphan lines and append them to the previous subject.
  const subjects: ExamResultSubject[] = [];
  const subjectRowRe =
    /^(\d)\s+(\S+)\s+(.+?)\s+(\S+\/\S*\/\S*)\s+([PF])\s+(\d+)\s+(\S+)\s*$/;
  const nonSubjectLineRe =
    /^(Sem\s+Code\s+Subject|Semester\b|Credits Applied|Credits Earned\(Cumulative\)|Credits Earned|Credit Points|SGPA \(Attempts\)|CGPA\b|% Conversion|Result\b)/;

  for (const line of block.split('\n')) {
    const m = line.match(subjectRowRe);
    if (m) {
      subjects.push({
        sem: parseInt(m[1], 10),
        code: m[2].trim(),
        subject: m[3].trim(),
        iaTrPr: m[4].trim(),
        result: m[5] as 'P' | 'F',
        credit: parseInt(m[6], 10),
        grade: m[7].trim(),
      });
    } else if (subjects.length > 0 && line.trim() && !nonSubjectLineRe.test(line.trim())) {
      subjects[subjects.length - 1].subject += ' ' + line.trim();
    }
  }

  // Semester summary grid — each row has up to 6 columns, one per semester.
  // Semesters not yet attempted (e.g. lateral-entry students skipping sem
  // 1-2, or future semesters) are marked "--" in the ledger. That placeholder
  // must be kept as a positional entry (not dropped) or every later semester's
  // numbers shift left into the wrong column.
  function row6(label: string): (number | null)[] {
    const re = new RegExp(`${label}\\s+(.+)$`, 'm');
    const rm = block.match(re);
    if (!rm) return [];
    const tokens = rm[1].match(/--|\d+(?:\.\d+)?/g) ?? [];
    return tokens.map((t) => (t === '--' ? null : Number(t)));
  }

  const creditsApplied = row6('Credits Applied');
  const creditsEarned = row6('Credits Earned');
  const creditPoints = row6('Credit Points');

  // "SGPA (Attempts)" row: pairs like "5.89 (6)" repeated per semester,
  // with "--" placeholders for semesters not attempted.
  const sgpaLineM = block.match(/SGPA \(Attempts\)\s+(.+)/);
  const sgpaPairs: { sgpa: number | null; attempts: number | null }[] = [];
  if (sgpaLineM) {
    const pairRe = /--|(\d+\.\d+)\s*\((\d+)\)/g;
    let pm: RegExpExecArray | null;
    while ((pm = pairRe.exec(sgpaLineM[1])) !== null) {
      if (pm[0] === '--') {
        sgpaPairs.push({ sgpa: null, attempts: null });
      } else {
        sgpaPairs.push({ sgpa: parseFloat(pm[1]), attempts: parseInt(pm[2], 10) });
      }
    }
  }

  const summaryLen = Math.max(
    creditsApplied.length,
    creditsEarned.length,
    creditPoints.length,
    sgpaPairs.length
  );

  const semesterSummary: ExamResultSemesterSummary[] = [];
  for (let i = 0; i < summaryLen && i < 6; i++) {
    semesterSummary.push({
      semester: i + 1,
      creditsApplied: creditsApplied[i] ?? null,
      creditsEarned: creditsEarned[i] ?? null,
      creditPoints: creditPoints[i] ?? null,
      sgpa: sgpaPairs[i]?.sgpa ?? null,
      attempts: sgpaPairs[i]?.attempts ?? null,
    });
  }

  const cumulativeM = block.match(/Credits Earned\(Cumulative\)\s+(\d+)/);
  const creditsEarnedCumulative = cumulativeM ? parseInt(cumulativeM[1], 10) : null;

  const cgpaM = block.match(/^CGPA\s+(.+)$/m);
  const cgpaRaw = cgpaM ? cgpaM[1].trim() : '';
  const cgpa = cgpaM ? parseNumOrNull(cgpaRaw) : null;
  const cgpaStatus = cgpa === null ? cgpaRaw : '';

  const pctM = block.match(/% Conversion\s+(.+)/);
  const pctRaw = pctM ? pctM[1].trim() : '';
  const percentageConversion = pctM ? parseNumOrNull(pctRaw) : null;

  const resultM = block.match(/^Result\s+(.+)$/m);
  const overallResult = resultM ? resultM[1].trim() : '';

  return {
    regNumber,
    studentName,
    parentName,
    admissionType: '',
    institutionName: '',
    subjects,
    semesterSummary,
    creditsEarnedCumulative,
    cgpa,
    cgpaStatus,
    percentageConversion,
    overallResult,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Format B — DTE "Diploma Examination Result Ledger" (single-semester
// per-institution table: "Student Details" cell spans multiple physical
// rows, one row per course with Credit/Grade/Result columns; no IA/TR/PR
// marks, no S/D/O parent name).
// ═══════════════════════════════════════════════════════════════════════

const PROGRAM_KEYWORD_TO_COURSE: [RegExp, Course][] = [
  [/computer/i, 'CS'],
  [/civil/i, 'CE'],
  [/mechanical/i, 'ME'],
  [/electronics/i, 'EC'],
  [/electrical/i, 'EE'],
];

function mapProgramNameToCourse(programName: string): Course | null {
  for (const [re, course] of PROGRAM_KEYWORD_TO_COURSE) {
    if (re.test(programName)) return course;
  }
  return null;
}

function parseHeaderB(fullText: string): LedgerHeader & { semester: number | null } {
  const sessionM = fullText.match(/^(.+?)\s*-\s*Diploma Examination Result Ledger/m);
  const instM = fullText.match(/Institution\s*:\s*(\d+)\s*-\s*(.+)/);
  const progM = fullText.match(/Program\s*:\s*(.+?)\s+Sem\s*:\s*(\d+)/);

  return {
    course: progM ? mapProgramNameToCourse(progM[1]) : null,
    collegeCode: instM ? instM[1].trim() : '',
    examSession: sessionM ? sessionM[1].trim() : '',
    semester: progM ? parseInt(progM[2], 10) : null,
  };
}

const FIELD_LABEL_RE_B =
  /^(Register Number|Student Name|Admission Type|Total Credit Earned|Total Credit Applied|SGPA|CGPA)\s*:\s*(.*)$/;

// DTE course codes look like "25CS11I", "25SC11I", "25EE01I", "25CS22T":
// 2 digits, 2-3 letters, 2 digits, trailing paper-type letter (I = internal/
// practical, T = theory, etc. — any single uppercase letter, not just "I").
const COURSE_CODE_RE_B = /^\d{2}[A-Z]{2,3}\d{2}[A-Z]$/i;
// A row starting with "<code> | <name...>", optionally followed on the same
// line by the Credit/Grade/Result cells.
const COURSE_START_RE_B = new RegExp(
  `^(${COURSE_CODE_RE_B.source.slice(1, -1)})\\s*\\|\\s*(.+?)(?:\\s+(\\d+)\\s+(\\S+)\\s+(PASS|FAIL|AB))?\\s*$`,
  'i'
);
// Credit/Grade/Result cells landing on their own line (row wrapped to a
// taller line than the course-name cell, so the trailing cells' Y no
// longer lines up with the code|name line).
const COURSE_TRAILER_RE_B = /^(\d+)\s+(\S+)\s+(PASS|FAIL|AB)\s*$/;

interface FieldLine {
  y: number;
  label: string;
  value: string;
}

interface PendingCourseRow {
  y: number;
  code: string;
  subject: string;
  credit: number | null;
  grade: string;
  result: 'P' | 'F' | 'AB' | null;
}

interface CourseRow {
  y: number;
  code: string;
  subject: string;
  credit: number;
  grade: string;
  result: 'P' | 'F' | 'AB';
}

function mapResultB(raw: string): 'P' | 'F' | 'AB' {
  const u = raw.toUpperCase();
  if (u === 'PASS') return 'P';
  if (u === 'AB') return 'AB';
  return 'F';
}

function parseLeftColumn(lines: { y: number; text: string }[]): FieldLine[] {
  const out: FieldLine[] = [];
  for (const line of lines) {
    const m = line.text.match(FIELD_LABEL_RE_B);
    if (m) out.push({ y: line.y, label: m[1], value: m[2].trim() });
  }
  return out;
}

function isComplete(r: PendingCourseRow): r is CourseRow {
  return r.credit !== null && r.result !== null;
}

function parseRightColumn(lines: { y: number; text: string }[]): CourseRow[] {
  const out: PendingCourseRow[] = [];
  for (const line of lines) {
    const startM = line.text.match(COURSE_START_RE_B);
    if (startM) {
      out.push({
        y: line.y,
        code: startM[1].trim(),
        subject: startM[2].trim(),
        credit: startM[3] ? parseInt(startM[3], 10) : null,
        grade: startM[4] ? startM[4].trim() : '',
        result: startM[5] ? mapResultB(startM[5]) : null,
      });
      continue;
    }

    const last = out[out.length - 1];
    const trailerM = line.text.match(COURSE_TRAILER_RE_B);
    if (trailerM && last && last.result === null) {
      last.credit = parseInt(trailerM[1], 10);
      last.grade = trailerM[2].trim();
      last.result = mapResultB(trailerM[3]);
      continue;
    }

    if (last && line.text.trim()) {
      // Wrapped course-name continuation line.
      last.subject += ' ' + line.text.trim();
    }
  }
  return out.filter(isComplete);
}

async function parseFormatB(pageItems: PosItem[][], fullText: string): Promise<ParsedResultLedger> {
  const header = parseHeaderB(fullText);
  const semester = header.semester ?? 0;
  const instM = fullText.match(/Institution\s*:\s*\d+\s*-\s*(.+)/);
  const institutionName = instM ? instM[1].trim() : '';

  const leftFields: FieldLine[] = [];
  const rightRows: CourseRow[] = [];

  // Y coordinates reset per page, so offset each page's items by a value
  // larger than any real page height — this keeps Y strictly decreasing
  // across the whole document, which the record Y-range assignment below
  // relies on.
  const PAGE_Y_OFFSET = 100000;

  // The "Course Code | Course Name" header only prints once (page 1) — find
  // its X across all pages and reuse that single split point everywhere,
  // since every page shares the same table column layout. A per-page
  // fallback would drift (e.g. page 1's true boundary vs. a guessed
  // fraction of page width) and misclassify course-code text as part of
  // the student-details column on pages without the header.
  const courseHeaderItem = pageItems.flat().find((it) => /^Course\b/i.test(it.str));
  const splitX = courseHeaderItem ? courseHeaderItem.x - 5 : 224;

  pageItems.forEach((items, pageIndex) => {
    const offsetItems = items.map((it) => ({ ...it, y: it.y - pageIndex * PAGE_Y_OFFSET }));

    const leftItems = offsetItems.filter((it) => it.x < splitX);
    const rightItems = offsetItems.filter((it) => it.x >= splitX);

    leftFields.push(...parseLeftColumn(groupItemsIntoLines(leftItems)));
    rightRows.push(...parseRightColumn(groupItemsIntoLines(rightItems)));
  });

  // Group left-column fields into per-student records, one per
  // "Register Number" occurrence, carrying its Y-range for row assignment.
  interface StudentBlock {
    yStart: number;
    yEnd: number;
    fields: StudentFields;
  }
  interface StudentFields {
    regNumber: string;
    studentName: string;
    admissionType: string;
    totalCreditEarned: number | null;
    totalCreditApplied: number | null;
    sgpa: number | null;
    cgpaRaw: string;
  }

  const records: StudentBlock[] = [];
  let current: StudentBlock | null = null;

  for (const f of leftFields) {
    if (f.label === 'Register Number') {
      if (current) current.yEnd = f.y;
      current = {
        yStart: f.y,
        yEnd: -Infinity,
        fields: {
          regNumber: f.value,
          studentName: '',
          admissionType: '',
          totalCreditEarned: null,
          totalCreditApplied: null,
          sgpa: null,
          cgpaRaw: '',
        },
      };
      records.push(current);
      continue;
    }
    if (!current) continue;
    switch (f.label) {
      case 'Student Name': current.fields.studentName = f.value; break;
      case 'Admission Type': current.fields.admissionType = f.value; break;
      case 'Total Credit Earned': current.fields.totalCreditEarned = parseNumOrNull(f.value); break;
      case 'Total Credit Applied': current.fields.totalCreditApplied = parseNumOrNull(f.value); break;
      case 'SGPA': current.fields.sgpa = parseNumOrNull(f.value); break;
      case 'CGPA': current.fields.cgpaRaw = f.value; break;
    }
  }

  // Records are read top-to-bottom (decreasing Y within a page, and pages
  // processed in order), so a record's Y-range runs from its own start down
  // to the next record's start (or -Infinity for the last one).
  for (let i = 0; i < records.length; i++) {
    records[i].yEnd = i + 1 < records.length ? records[i + 1].yStart : -Infinity;
  }

  const results: RawResult[] = records.map((rec) => {
    const rows = rightRows.filter((r) => r.y <= rec.yStart && r.y > rec.yEnd);
    const subjects: ExamResultSubject[] = rows.map((r) => ({
      sem: semester,
      code: r.code,
      subject: r.subject,
      iaTrPr: '',
      result: r.result,
      credit: r.credit,
      grade: r.grade,
    }));

    const cgpa = parseNumOrNull(rec.fields.cgpaRaw);

    const overallResult = subjects.some((s) => s.result === 'F')
      ? 'FAIL'
      : subjects.some((s) => s.result === 'AB')
      ? 'AB'
      : 'PASS';

    const semesterSummary: ExamResultSemesterSummary[] = header.semester
      ? [{
          semester: header.semester,
          creditsApplied: rec.fields.totalCreditApplied,
          creditsEarned: rec.fields.totalCreditEarned,
          creditPoints: null,
          sgpa: rec.fields.sgpa,
          attempts: null,
        }]
      : [];

    return {
      regNumber: rec.fields.regNumber,
      studentName: rec.fields.studentName,
      parentName: '',
      admissionType: rec.fields.admissionType,
      institutionName,
      subjects,
      semesterSummary,
      creditsEarnedCumulative: null,
      cgpa,
      cgpaStatus: cgpa === null ? rec.fields.cgpaRaw : '',
      percentageConversion: null,
      overallResult,
    };
  });

  return {
    course: header.course,
    collegeCode: header.collegeCode,
    examSession: header.examSession,
    format: 'B',
    results,
  };
}

// ── Format Detection & Dispatch ─────────────────────────────────────────

function detectFormat(fullText: string): 'A' | 'B' | null {
  if (/Diploma Examination Result Ledger/i.test(fullText)) return 'B';
  if (/DIPLOMA EXAMINATION/.test(fullText) && STUDENT_START_RE_A.test(fullText)) return 'A';
  return null;
}

export async function parseResultPdf(file: File): Promise<ParsedResultLedger> {
  const pageItems = await loadPageItems(file);
  const pages = pageItems.map((items) => groupItemsIntoLines(items).map((l) => l.text).join('\n'));
  const fullText = pages.join('\n');
  const format = detectFormat(fullText);

  if (format === 'A') return parseFormatA(pages);
  if (format === 'B') return parseFormatB(pageItems, fullText);
  throw new Error('Unrecognized result ledger PDF format');
}
