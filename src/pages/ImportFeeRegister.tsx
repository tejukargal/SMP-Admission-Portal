import { useState, useRef, type ChangeEvent } from 'react';
import * as XLSX from 'xlsx';
import { Button } from '../components/common/Button';
import {
  importFeeRegister,
  type FeeImportRow,
  type FeeImportResult,
} from '../services/importFeeRegisterService';

interface AcademicYearSummary {
  year: string;
  count: number;
}

type PageState = 'idle' | 'preview' | 'importing' | 'done';

// Expected Excel column headers (case-insensitive match)
const EXPECTED_COLUMNS = [
  'Student Name', 'Year', 'Course', 'Reg No', 'Adm Type', 'Adm Cat',
  'Date', 'Rpt', 'Adm', 'Tution', 'Lib', 'RR', 'Sports', 'Lab',
  'DVP', 'Mag', 'ID', 'Ass', 'SWF', 'TWF', 'NSS', 'Fine', 'SVK Paid', 'Acdmc Year',
];

/** Convert an Excel serial date number to "YYYY-MM-DD" string. */
function excelSerialToISO(serial: number): string {
  // Excel serial: days since 1899-12-30 (adjusted for 1900 leap year bug)
  const d = new Date(Math.round((serial - 25569) * 86400 * 1000));
  if (isNaN(d.getTime())) return '';
  return d.toISOString().split('T')[0];
}

/** Parse any Excel cell value into a "YYYY-MM-DD" string or empty string. */
function parseExcelDate(val: unknown): string {
  if (val === null || val === undefined || val === '') return '';
  if (typeof val === 'number') return excelSerialToISO(val);
  if (val instanceof Date) return val.toISOString().split('T')[0];
  const s = String(val).trim();
  if (!s) return '';
  // Try ISO or locale-formatted strings
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  return '';
}

/** Parse any cell value as a non-negative integer (0 if absent/invalid). */
function num(val: unknown): number {
  if (val === null || val === undefined || val === '') return 0;
  const n = Number(val);
  return isFinite(n) && n >= 0 ? Math.round(n) : 0;
}

function str(val: unknown): string {
  return String(val ?? '').trim();
}

function buildSummary(rows: FeeImportRow[]): AcademicYearSummary[] {
  const map = new Map<string, number>();
  for (const r of rows) {
    const ay = r.academicYear.trim();
    map.set(ay, (map.get(ay) ?? 0) + 1);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([year, count]) => ({ year, count }));
}

function parseSheet(file: File): Promise<{ rows: FeeImportRow[]; warnings: string[] }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const wb = XLSX.read(data, { type: 'binary', cellText: false, cellDates: false });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, {
          defval: '',
          raw: true,
        });

        const warnings: string[] = [];
        const rows: FeeImportRow[] = [];

        if (raw.length === 0) {
          return resolve({ rows, warnings: ['The file appears to be empty.'] });
        }

        // Build case-insensitive column map
        const firstRow = raw[0] ?? {};
        const keys = Object.keys(firstRow);

        function findCol(target: string): string | undefined {
          return keys.find(
            (k) => k.trim().toLowerCase() === target.trim().toLowerCase()
          );
        }

        // Warn about missing optional columns
        const missing = EXPECTED_COLUMNS.filter((c) => !findCol(c));
        if (missing.length > 0) {
          warnings.push(`Missing columns (will default to 0/empty): ${missing.join(', ')}`);
        }

        // Accept both "Tution" (typo in source) and "Tuition"
        const tuitionColRaw =
          findCol('Tution') ?? findCol('Tuition') ?? '';

        const colStudentName = findCol('Student Name') ?? '';
        const colYear        = findCol('Year') ?? '';
        const colCourse      = findCol('Course') ?? '';
        const colRegNo       = findCol('Reg No') ?? '';
        const colAdmType     = findCol('Adm Type') ?? '';
        const colAdmCat      = findCol('Adm Cat') ?? '';
        const colDate        = findCol('Date') ?? '';
        const colRpt         = findCol('Rpt') ?? '';
        const colAdm         = findCol('Adm') ?? '';
        const colLib         = findCol('Lib') ?? '';
        const colRR          = findCol('RR') ?? '';
        const colSports      = findCol('Sports') ?? '';
        const colLab         = findCol('Lab') ?? '';
        const colDVP         = findCol('DVP') ?? '';
        const colMag         = findCol('Mag') ?? '';
        const colID          = findCol('ID') ?? '';
        const colAss         = findCol('Ass') ?? '';
        const colSWF         = findCol('SWF') ?? '';
        const colTWF         = findCol('TWF') ?? '';
        const colNSS         = findCol('NSS') ?? '';
        const colFine        = findCol('Fine') ?? '';
        const colSVKPaid     = findCol('SVK Paid') ?? '';
        const colAcdmcYear   = findCol('Acdmc Year') ?? '';

        for (let i = 0; i < raw.length; i++) {
          const r = raw[i];

          // Skip rows with no student name
          const studentName = str(r[colStudentName]);
          if (!studentName) continue;

          // Receipt number — may be numeric in Excel
          const rptRaw = r[colRpt];
          const receiptNumber = rptRaw !== '' && rptRaw !== null && rptRaw !== undefined
            ? String(rptRaw).replace(/\.0+$/, '').trim()
            : '';

          // Reg No — may be numeric in Excel
          const regRaw = r[colRegNo];
          const regNumber = regRaw !== '' && regRaw !== null && regRaw !== undefined
            ? String(regRaw).replace(/\.0+$/, '').trim()
            : '';

          rows.push({
            rowIndex: i + 2, // 1-based + header row
            studentName,
            year:          str(r[colYear]),
            course:        str(r[colCourse]),
            regNumber,
            admType:       str(r[colAdmType]),
            admCat:        str(r[colAdmCat]),
            date:          parseExcelDate(r[colDate]),
            receiptNumber,
            adm:     num(r[colAdm]),
            tuition: num(r[tuitionColRaw]),
            lib:     num(r[colLib]),
            rr:      num(r[colRR]),
            sports:  num(r[colSports]),
            lab:     num(r[colLab]),
            dvp:     num(r[colDVP]),
            mag:     num(r[colMag]),
            idCard:  num(r[colID]),
            ass:     num(r[colAss]),
            swf:     num(r[colSWF]),
            twf:     num(r[colTWF]),
            nss:     num(r[colNSS]),
            fine:    num(r[colFine]),
            svk:     num(r[colSVKPaid]),
            academicYear: str(r[colAcdmcYear]),
          });
        }

        resolve({ rows, warnings });
      } catch (err) {
        reject(err instanceof Error ? err : new Error('Failed to parse file'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsBinaryString(file);
  });
}

export function ImportFeeRegister() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pageState, setPageState] = useState<PageState>('idle');
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<FeeImportRow[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [summary, setSummary] = useState<AcademicYearSummary[]>([]);
  const [parseError, setParseError] = useState('');
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [result, setResult] = useState<FeeImportResult | null>(null);

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setParseError('');
    setFileName(file.name);
    setPageState('idle');

    try {
      const { rows: parsed, warnings: w } = await parseSheet(file);
      setRows(parsed);
      setWarnings(w);
      setSummary(buildSummary(parsed));
      setPageState('preview');
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Failed to parse file');
    }
  }

  async function handleImport() {
    if (rows.length === 0) return;
    setPageState('importing');
    setProgress({ current: 0, total: rows.length });

    try {
      const res = await importFeeRegister(rows, (current, total) => {
        setProgress({ current, total });
      });
      setResult(res);
    } catch (err) {
      setResult({
        success: 0,
        failed: rows.length,
        errors: [{ row: 0, message: err instanceof Error ? err.message : 'Import failed' }],
      });
    } finally {
      setPageState('done');
    }
  }

  function handleReset() {
    setPageState('idle');
    setFileName('');
    setRows([]);
    setWarnings([]);
    setSummary([]);
    setParseError('');
    setProgress({ current: 0, total: 0 });
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  const progressPct =
    progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  // Totals for preview
  const feeTotal = rows.reduce(
    (s, r) =>
      s + r.adm + r.tuition + r.lib + r.rr + r.sports + r.lab +
      r.dvp + r.mag + r.idCard + r.ass + r.swf + r.twf + r.nss + r.fine + r.svk,
    0
  );

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Import Fee Register</h2>
        <p className="text-sm text-gray-500 mt-1">
          Import fee payment records from an Excel (.xlsx) file. Each row is matched to a
          student by registration number and academic year.
        </p>
      </div>

      {/* ── Idle: file picker ── */}
      {pageState === 'idle' && (
        <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-base font-semibold text-gray-800 mb-4">Select File</h3>

          <div
            className="border-2 border-dashed border-gray-300 rounded-lg p-10 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="text-4xl mb-3">📂</div>
            <p className="text-sm font-medium text-gray-700">
              Click to browse or drag &amp; drop your Excel file
            </p>
            <p className="text-xs text-gray-400 mt-1">.xlsx or .xls format</p>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => { void handleFileChange(e); }}
          />

          {parseError && (
            <p className="mt-4 text-sm text-red-600 bg-red-50 rounded-md px-4 py-3">
              {parseError}
            </p>
          )}

          <div className="mt-5 text-sm text-gray-500">
            <p className="font-medium text-gray-700 mb-1">Expected columns:</p>
            <p className="font-mono text-xs bg-gray-50 rounded p-2 leading-relaxed">
              {EXPECTED_COLUMNS.join(' · ')}
            </p>
            <p className="text-xs text-gray-400 mt-2">
              Each row is matched to an enrolled student via <strong>Reg No</strong> +{' '}
              <strong>Acdmc Year</strong>. Students not found in the system will be skipped.
            </p>
          </div>
        </section>
      )}

      {/* ── Preview ── */}
      {pageState === 'preview' && (
        <>
          <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-4">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-base font-semibold text-gray-800">Preview</h3>
                <p className="text-sm text-gray-500 mt-0.5">{fileName}</p>
              </div>
              <button
                className="text-xs text-gray-400 hover:text-gray-600 underline cursor-pointer"
                onClick={handleReset}
              >
                Change file
              </button>
            </div>

            <div className="flex items-center gap-6 mb-5">
              <div className="text-center">
                <p className="text-3xl font-bold text-blue-600">{rows.length}</p>
                <p className="text-xs text-gray-500 mt-0.5">Total Records</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold text-gray-700">{summary.length}</p>
                <p className="text-xs text-gray-500 mt-0.5">Academic Years</p>
              </div>
              {feeTotal > 0 && (
                <div className="text-center">
                  <p className="text-2xl font-bold text-green-600">
                    ₹{feeTotal.toLocaleString()}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">Total Fee Amount</p>
                </div>
              )}
            </div>

            {warnings.length > 0 && (
              <div className="mb-4 bg-yellow-50 border border-yellow-200 rounded-md px-4 py-3">
                {warnings.map((w, i) => (
                  <p key={i} className="text-xs text-yellow-800">⚠ {w}</p>
                ))}
              </div>
            )}

            {/* Per-year breakdown */}
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Breakdown by Academic Year</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {summary.map(({ year, count }) => (
                  <div
                    key={year}
                    className="flex items-center justify-between bg-gray-50 rounded-md px-3 py-2 text-sm"
                  >
                    <span className="font-mono text-gray-700">{year}</span>
                    <span className="font-semibold text-blue-600">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Sample rows */}
          <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-4">
            <h3 className="text-sm font-semibold text-gray-800 mb-3">
              Sample rows (first 5)
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-gray-100">
                    <th className="pb-2 pr-4 font-medium">Student Name</th>
                    <th className="pb-2 pr-4 font-medium">Reg No</th>
                    <th className="pb-2 pr-4 font-medium">Course</th>
                    <th className="pb-2 pr-4 font-medium">Yr</th>
                    <th className="pb-2 pr-4 font-medium">Rpt</th>
                    <th className="pb-2 pr-4 font-medium">Date</th>
                    <th className="pb-2 pr-4 font-medium">Acad Year</th>
                    <th className="pb-2 font-medium text-right">SMP ₹</th>
                    <th className="pb-2 font-medium text-right">SVK ₹</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 5).map((r) => {
                    const smp = r.adm + r.tuition + r.lib + r.rr + r.sports + r.lab +
                      r.dvp + r.mag + r.idCard + r.ass + r.swf + r.twf + r.nss + r.fine;
                    return (
                      <tr key={r.rowIndex} className="border-b border-gray-50">
                        <td className="py-1.5 pr-4 text-gray-700">{r.studentName}</td>
                        <td className="py-1.5 pr-4 font-mono text-gray-600">{r.regNumber || '—'}</td>
                        <td className="py-1.5 pr-4 text-gray-500">{r.course}</td>
                        <td className="py-1.5 pr-4 text-gray-500">{r.year}</td>
                        <td className="py-1.5 pr-4 font-mono text-gray-600">{r.receiptNumber || '—'}</td>
                        <td className="py-1.5 pr-4 text-gray-500">{r.date || '—'}</td>
                        <td className="py-1.5 pr-4 text-gray-500">{r.academicYear}</td>
                        <td className="py-1.5 pr-4 text-right tabular-nums text-gray-700">
                          {smp > 0 ? smp.toLocaleString() : '—'}
                        </td>
                        <td className="py-1.5 text-right tabular-nums text-gray-700">
                          {r.svk > 0 ? r.svk.toLocaleString() : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <div className="flex gap-3">
            <Button size="lg" onClick={() => { void handleImport(); }}>
              Import {rows.length} Records
            </Button>
            <Button size="lg" variant="secondary" onClick={handleReset}>
              Cancel
            </Button>
          </div>
        </>
      )}

      {/* ── Importing: progress ── */}
      {pageState === 'importing' && (
        <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-base font-semibold text-gray-800 mb-4">Importing…</h3>
          <p className="text-sm text-gray-600 mb-3">
            Processing record {progress.current} of {progress.total}
          </p>
          <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
            <div
              className="h-3 bg-blue-500 rounded-full transition-all duration-150"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <p className="text-xs text-gray-400 mt-1.5 text-right">{progressPct}%</p>
        </section>
      )}

      {/* ── Done: results ── */}
      {pageState === 'done' && result && (
        <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-base font-semibold text-gray-800 mb-4">Import Complete</h3>

          <div className="flex gap-6 mb-5">
            <div className="text-center">
              <p className="text-3xl font-bold text-green-600">{result.success}</p>
              <p className="text-xs text-gray-500 mt-0.5">Imported</p>
            </div>
            {result.failed > 0 && (
              <div className="text-center">
                <p className="text-3xl font-bold text-red-500">{result.failed}</p>
                <p className="text-xs text-gray-500 mt-0.5">Skipped</p>
              </div>
            )}
          </div>

          {result.failed === 0 && (
            <p className="text-sm text-green-700 bg-green-50 rounded-md px-4 py-3 mb-4">
              All {result.success} fee records imported successfully.
            </p>
          )}

          {result.errors.length > 0 && (
            <div className="mb-4">
              <p className="text-sm font-medium text-red-600 mb-2">
                Skipped rows ({result.errors.length}):
              </p>
              <div className="bg-red-50 rounded-md px-4 py-3 max-h-56 overflow-y-auto space-y-1">
                {result.errors.map((e, i) => (
                  <p key={i} className="text-xs text-red-700">
                    {e.row > 0 ? `Row ${e.row}: ` : ''}{e.message}
                  </p>
                ))}
              </div>
            </div>
          )}

          <Button variant="secondary" onClick={handleReset}>
            Import Another File
          </Button>
        </section>
      )}
    </div>
  );
}
