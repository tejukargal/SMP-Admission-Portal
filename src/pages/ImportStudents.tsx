import { useState, useRef, type ChangeEvent } from 'react';
import * as XLSX from 'xlsx';
import { Button } from '../components/common/Button';
import { importStudents, type ImportRow, type ImportResult } from '../services/importService';

interface AcademicYearSummary {
  year: string;
  count: number;
}

type PageState = 'idle' | 'preview' | 'importing' | 'done';

const EXPECTED_COLUMNS = [
  'Name',
  'Father Name',
  'Acdmc Year',
  'Year',
  'Course',
  'Reg No.',
  'Cat',
  'Gender',
  'Phone No.',
  'Adm Type',
  'Caste',
  'Admn Cat',
];

function buildSummary(rows: ImportRow[]): AcademicYearSummary[] {
  const map = new Map<string, number>();
  for (const r of rows) {
    const ay = r.academicYear.trim();
    map.set(ay, (map.get(ay) ?? 0) + 1);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([year, count]) => ({ year, count }));
}

function parseSheet(file: File): Promise<{ rows: ImportRow[]; warnings: string[] }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const wb = XLSX.read(data, { type: 'binary', cellText: false, cellDates: false });
        const wsName = wb.SheetNames[0];
        const ws = wb.Sheets[wsName];
        const raw: Record<string, string | number | null>[] = XLSX.utils.sheet_to_json(ws, {
          defval: '',
          raw: true,
        });

        const warnings: string[] = [];
        const rows: ImportRow[] = [];

        // Detect header names (case-insensitive lookup)
        const firstRow = raw[0] ?? {};
        const keys = Object.keys(firstRow);

        function findCol(target: string): string | undefined {
          return keys.find((k) => k.trim().toLowerCase() === target.trim().toLowerCase());
        }

        const missing = EXPECTED_COLUMNS.filter((c) => !findCol(c));
        if (missing.length > 0) {
          warnings.push(`Missing columns (will be skipped): ${missing.join(', ')}`);
        }

        const colName = findCol('Name') ?? '';
        const colFather = findCol('Father Name') ?? '';
        const colYear = findCol('Acdmc Year') ?? '';
        const colStudentYear = findCol('Year') ?? '';
        const colCourse = findCol('Course') ?? '';
        const colReg = findCol('Reg No.') ?? '';
        const colCat = findCol('Cat') ?? '';
        const colGender = findCol('Gender') ?? '';
        const colPhone = findCol('Phone No.') ?? '';
        const colAdmType = findCol('Adm Type') ?? '';
        const colCaste = findCol('Caste') ?? '';
        const colAdmCat = findCol('Admn Cat') ?? '';

        for (let i = 0; i < raw.length; i++) {
          const r = raw[i];
          const name = String(r[colName] ?? '').trim();
          if (!name) continue; // skip blank rows

          rows.push({
            name,
            fatherName: String(r[colFather] ?? '').trim(),
            academicYear: String(r[colYear] ?? '').trim(),
            year: String(r[colStudentYear] ?? '').trim(),
            course: String(r[colCourse] ?? '').trim(),
            regNumber: String(r[colReg] ?? '').trim(),
            category: String(r[colCat] ?? '').trim(),
            gender: String(r[colGender] ?? '').trim(),
            phone: String(r[colPhone] ?? '').trim(),
            admType: String(r[colAdmType] ?? '').trim(),
            caste: String(r[colCaste] ?? '').trim(),
            admCat: String(r[colAdmCat] ?? '').trim(),
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

export function ImportStudents() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pageState, setPageState] = useState<PageState>('idle');
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [summary, setSummary] = useState<AcademicYearSummary[]>([]);
  const [parseError, setParseError] = useState('');
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [result, setResult] = useState<ImportResult | null>(null);

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
      const res = await importStudents(rows, (current, total) => {
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

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Import Students</h2>
        <p className="text-sm text-gray-500 mt-1">
          Import student data from an Excel (.xlsx) file. Fields not present in the file will be
          left blank for later update.
        </p>
      </div>

      {/* Upload section */}
      {(pageState === 'idle') && (
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
          </div>
        </section>
      )}

      {/* Preview section */}
      {pageState === 'preview' && (
        <>
          <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-4">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-base font-semibold text-gray-800">Preview</h3>
                <p className="text-sm text-gray-500 mt-0.5">{fileName}</p>
              </div>
              <button
                className="text-xs text-gray-400 hover:text-gray-600 underline"
                onClick={handleReset}
              >
                Change file
              </button>
            </div>

            <div className="flex items-center gap-6 mb-5">
              <div className="text-center">
                <p className="text-3xl font-bold text-blue-600">{rows.length}</p>
                <p className="text-xs text-gray-500 mt-0.5">Total Students</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold text-gray-700">{summary.length}</p>
                <p className="text-xs text-gray-500 mt-0.5">Academic Years</p>
              </div>
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

          {/* Sample preview rows */}
          <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-4">
            <h3 className="text-sm font-semibold text-gray-800 mb-3">
              Sample rows (first 5)
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-gray-100">
                    <th className="pb-2 pr-4 font-medium">Name</th>
                    <th className="pb-2 pr-4 font-medium">Father</th>
                    <th className="pb-2 pr-4 font-medium">Yr</th>
                    <th className="pb-2 pr-4 font-medium">Course</th>
                    <th className="pb-2 pr-4 font-medium">Reg No.</th>
                    <th className="pb-2 pr-4 font-medium">Acad. Year</th>
                    <th className="pb-2 font-medium">Adm Type</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 5).map((r, i) => (
                    <tr key={i} className="border-b border-gray-50">
                      <td className="py-1.5 pr-4 text-gray-700">{r.name}</td>
                      <td className="py-1.5 pr-4 text-gray-500">{r.fatherName}</td>
                      <td className="py-1.5 pr-4 text-gray-500">{r.year}</td>
                      <td className="py-1.5 pr-4 text-gray-500">{r.course}</td>
                      <td className="py-1.5 pr-4 font-mono text-gray-600">{r.regNumber}</td>
                      <td className="py-1.5 pr-4 text-gray-500">{r.academicYear}</td>
                      <td className="py-1.5 text-gray-500">{r.admType}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="flex gap-3">
            <Button size="lg" onClick={() => { void handleImport(); }}>
              Import {rows.length} Students
            </Button>
            <Button size="lg" variant="secondary" onClick={handleReset}>
              Cancel
            </Button>
          </div>
        </>
      )}

      {/* Progress section */}
      {pageState === 'importing' && (
        <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-base font-semibold text-gray-800 mb-4">Importing...</h3>

          <p className="text-sm text-gray-600 mb-3">
            Saving student {progress.current} of {progress.total}
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

      {/* Result section */}
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
                <p className="text-xs text-gray-500 mt-0.5">Failed</p>
              </div>
            )}
          </div>

          {result.failed === 0 && (
            <p className="text-sm text-green-700 bg-green-50 rounded-md px-4 py-3 mb-4">
              All {result.success} students imported successfully.
            </p>
          )}

          {result.errors.length > 0 && (
            <div className="mb-4">
              <p className="text-sm font-medium text-red-600 mb-2">Errors:</p>
              <div className="bg-red-50 rounded-md px-4 py-3 max-h-40 overflow-y-auto space-y-1">
                {result.errors.map((e, i) => (
                  <p key={i} className="text-xs text-red-700">
                    Row {e.row}: {e.message}
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
