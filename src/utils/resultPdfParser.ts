import * as pdfjsLib from 'pdfjs-dist';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { Course, ExamResultSubject, ExamResultSemesterSummary } from '../types';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

// ── Text Extraction ─────────────────────────────────────────────────────
// pdfjs-dist returns text items with X/Y coordinates. Sort by Y (descending
// = top of page first) then X (left→right) and group into lines by
// proximity, reconstructing newline-separated text per page.

async function extractPages(file: File): Promise<string[]> {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
  const pages: string[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();

    const items = content.items.filter(
      (item): item is TextItem => 'str' in item && (item as TextItem).str.length > 0
    );

    if (items.length === 0) {
      pages.push('');
      continue;
    }

    const sorted = [...items].sort((a, b) => {
      const dy = b.transform[5] - a.transform[5];
      if (Math.abs(dy) > 3) return dy;
      return a.transform[4] - b.transform[4];
    });

    const lines: string[] = [];
    let lineTokens: string[] = [];
    let lastY = sorted[0].transform[5];

    for (const item of sorted) {
      const y = item.transform[5];
      if (Math.abs(y - lastY) > 3) {
        if (lineTokens.length) lines.push(lineTokens.join(' '));
        lineTokens = [];
        lastY = y;
      }
      const t = item.str.trim();
      if (t) lineTokens.push(t);
    }
    if (lineTokens.length) lines.push(lineTokens.join(' '));

    pages.push(lines.join('\n'));
  }

  return pages;
}

// ── Header Extraction ────────────────────────────────────────────────────

export interface LedgerHeader {
  course: Course | null;
  collegeCode: string;
  examSession: string;
}

const VALID_COURSES: Course[] = ['CE', 'ME', 'EC', 'CS', 'EE'];

function parseHeader(fullText: string): LedgerHeader {
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

// ── Block Splitting ─────────────────────────────────────────────────────
// Each student record starts with "<serial> <regNumber> <NAME> [ S/D/O : ... ]".
// Split on that marker line, discarding the pre-first-match header fragment.

const STUDENT_START_RE = /^\d+\s+\d{3}[A-Z]{2}\d{5,}\s+.+\[\s*S\/D\/O\s*:.+?\]\s*$/m;

function splitBlocks(pages: string[]): string[] {
  const fullText = pages.join('\n');
  const lines = fullText.split('\n');

  const blocks: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (STUDENT_START_RE.test(line)) {
      if (current.length) blocks.push(current.join('\n'));
      current = [line];
    } else if (current.length) {
      current.push(line);
    }
  }
  if (current.length) blocks.push(current.join('\n'));

  return blocks;
}

// ── Per-block Parsing ────────────────────────────────────────────────────

export interface RawResult {
  regNumber: string;
  studentName: string;
  parentName: string;
  subjects: ExamResultSubject[];
  semesterSummary: ExamResultSemesterSummary[];
  creditsEarnedCumulative: number | null;
  cgpa: number | null;
  cgpaStatus: string;
  percentageConversion: number | null;
  overallResult: string;
}

function parseNumOrNull(raw: string): number | null {
  const t = raw.trim();
  const n = Number(t);
  return t !== '' && isFinite(n) ? n : null;
}

function parseBlock(block: string): RawResult | null {
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
    subjects,
    semesterSummary,
    creditsEarnedCumulative,
    cgpa,
    cgpaStatus,
    percentageConversion,
    overallResult,
  };
}

// ── Public Entry Point ──────────────────────────────────────────────────

export interface ParsedResultLedger extends LedgerHeader {
  results: RawResult[];
}

export async function parseResultPdf(file: File): Promise<ParsedResultLedger> {
  const pages = await extractPages(file);
  const header = parseHeader(pages.join('\n'));
  const blocks = splitBlocks(pages);
  const results = blocks.map(parseBlock).filter((r): r is RawResult => r !== null);
  return { ...header, results };
}
