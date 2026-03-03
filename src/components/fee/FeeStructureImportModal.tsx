import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { saveFeeStructure } from '../../services/feeStructureService';
import type { AcademicYear, Course, Year, AdmType, AdmCat, SMPHeads } from '../../types';
import { ACADEMIC_YEARS } from '../../types';

const COURSES: Course[] = ['CE', 'ME', 'EC', 'CS', 'EE'];
const YEARS: Year[] = ['1ST YEAR', '2ND YEAR', '3RD YEAR'];
const ADM_TYPES: AdmType[] = ['REGULAR', 'REPEATER', 'LATERAL', 'EXTERNAL', 'SNQ'];
const ADM_CATS: AdmCat[] = ['GM', 'SNQ', 'OTHERS'];

interface ParsedRow {
  rowIndex: number;
  academicYear: AcademicYear;
  course: Course;
  year: Year;
  admType: AdmType;
  admCat: AdmCat;
  smp: SMPHeads;
  svk: number;
  errors: string[];
}

interface FeeStructureImportModalProps {
  onClose: () => void;
  onImported: () => void;
}

function num(val: unknown): number {
  if (val === null || val === undefined || val === '') return 0;
  const n = Number(val);
  return isFinite(n) && n >= 0 ? Math.round(n) : 0;
}

function str(val: unknown): string {
  return String(val ?? '').trim();
}

/** Normalize header: lowercase + collapse spaces */
function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/\s+/g, ' ').trim();
}

export function FeeStructureImportModal({ onClose, onImported }: FeeStructureImportModalProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsedRows, setParsedRows] = useState<ParsedRow[] | null>(null);
  const [fileName, setFileName] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);

  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState<{ success: number; failed: number; errors: string[] } | null>(null);
  const [importProgress, setImportProgress] = useState(0);

  const validRows = parsedRows?.filter((r) => r.errors.length === 0) ?? [];
  const invalidRows = parsedRows?.filter((r) => r.errors.length > 0) ?? [];

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setParseError(null);
    setParsedRows(null);
    setImportResults(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = evt.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

        if (rawRows.length === 0) {
          setParseError('The file appears to be empty.');
          return;
        }

        // Build a normalized header map: normalizedKey → original key
        const headerKeys = Object.keys(rawRows[0]);
        const headerMap = new Map<string, string>();
        for (const k of headerKeys) {
          headerMap.set(normalizeHeader(k), k);
        }

        // Check required headers
        const required = ['academic year', 'year', 'course', 'adm type', 'adm cat'];
        const missing = required.filter((h) => !headerMap.has(h));
        if (missing.length > 0) {
          setParseError(`Missing required columns: ${missing.join(', ')}`);
          return;
        }

        const get = (row: Record<string, unknown>, normalized: string): unknown =>
          row[headerMap.get(normalized) ?? ''];

        const rows: ParsedRow[] = rawRows.map((row, i) => {
          const errors: string[] = [];

          const academicYearRaw = str(get(row, 'academic year')).toUpperCase();
          const courseRaw = str(get(row, 'course')).toUpperCase();
          const yearRaw = str(get(row, 'year')).toUpperCase();
          const admTypeRaw = str(get(row, 'adm type')).toUpperCase();
          const admCatRaw = str(get(row, 'adm cat')).toUpperCase();

          // Validate identifiers
          if (!ACADEMIC_YEARS.includes(academicYearRaw as AcademicYear)) {
            errors.push(`Invalid academic year "${academicYearRaw}"`);
          }
          if (!COURSES.includes(courseRaw as Course)) {
            errors.push(`Invalid course "${courseRaw}"`);
          }
          if (!YEARS.includes(yearRaw as Year)) {
            errors.push(`Invalid year "${yearRaw}"`);
          }
          if (!ADM_TYPES.includes(admTypeRaw as AdmType)) {
            errors.push(`Invalid adm type "${admTypeRaw}"`);
          }
          if (!ADM_CATS.includes(admCatRaw as AdmCat)) {
            errors.push(`Invalid adm cat "${admCatRaw}"`);
          }

          // Parse SMP fee heads — accept both "tution" and "tuition" spelling
          const tuitionKey = headerMap.has('tution') ? 'tution' : 'tuition';
          const smp: SMPHeads = {
            adm:     num(get(row, 'adm')),
            tuition: num(get(row, tuitionKey)),
            lib:     num(get(row, 'lib')),
            rr:      num(get(row, 'rr')),
            sports:  num(get(row, 'sports')),
            lab:     num(get(row, 'lab')),
            dvp:     num(get(row, 'dvp')),
            mag:     num(get(row, 'mag')),
            idCard:  num(get(row, 'id')),
            ass:     num(get(row, 'ass')),
            swf:     num(get(row, 'swf')),
            twf:     num(get(row, 'twf')),
            nss:     num(get(row, 'nss')),
            fine:    num(get(row, 'fine')),  // optional; 0 if absent
          };
          const svk = num(get(row, 'svk'));

          return {
            rowIndex: i + 2, // 1-based + header row
            academicYear: academicYearRaw as AcademicYear,
            course: courseRaw as Course,
            year: yearRaw as Year,
            admType: admTypeRaw as AdmType,
            admCat: admCatRaw as AdmCat,
            smp,
            svk,
            errors,
          };
        });

        setParsedRows(rows);
      } catch (err: unknown) {
        setParseError(err instanceof Error ? err.message : 'Failed to parse file');
      }
    };
    reader.readAsBinaryString(file);
  }

  async function handleImport() {
    if (validRows.length === 0) return;
    setImporting(true);
    setImportProgress(0);

    let success = 0;
    const errors: string[] = [];

    for (let i = 0; i < validRows.length; i++) {
      const r = validRows[i];
      try {
        await saveFeeStructure({
          academicYear: r.academicYear,
          course: r.course,
          year: r.year,
          admType: r.admType,
          admCat: r.admCat,
          smp: r.smp,
          svk: r.svk,
          additionalHeads: [],
        });
        success++;
      } catch (err: unknown) {
        errors.push(
          `Row ${r.rowIndex} (${r.course} ${r.year} ${r.admType} ${r.admCat}): ${
            err instanceof Error ? err.message : 'Failed'
          }`
        );
      }
      setImportProgress(i + 1);
    }

    setImporting(false);
    setImportResults({ success, failed: errors.length, errors });
    if (success > 0) onImported();
  }

  const smpSum = (smp: SMPHeads) =>
    Object.values(smp).reduce((a, b) => a + b, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 shrink-0">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Import Fee Structures from Excel</h3>
            <p className="text-[10px] text-gray-400 mt-0.5">
              Upload an .xlsx / .xls file — each row creates or updates one fee structure
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={importing}
            className="text-gray-400 hover:text-gray-600 text-lg leading-none cursor-pointer disabled:opacity-40"
            title="Close"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          {/* File picker */}
          {!importResults && (
            <div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={importing}
                  className="px-3 py-1.5 text-xs font-medium rounded border border-gray-300 bg-white hover:bg-gray-50 cursor-pointer disabled:opacity-40 transition-colors"
                >
                  Choose File
                </button>
                <span className="text-xs text-gray-500">
                  {fileName || 'No file chosen'}
                </span>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>

              {/* Expected columns hint */}
              <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                <p className="text-[10px] font-semibold text-gray-600 mb-1">Expected column headers (row 1):</p>
                <p className="text-[10px] text-gray-500 font-mono leading-relaxed">
                  Academic Year · Year · Course · Adm Type · Adm Cat ·{' '}
                  Adm · Tution · Lib · RR · Sports · Lab · DVP · Mag · ID · Ass · SWF · TWF · NSS · SVK
                </p>
                <p className="text-[10px] text-gray-400 mt-1.5">
                  Values must match exactly: Course (CE/ME/EC/CS/EE), Year (1ST YEAR/2ND YEAR/3RD YEAR),
                  Adm Type (REGULAR/REPEATER/LATERAL/EXTERNAL/SNQ), Adm Cat (GM/SNQ/OTHERS).
                  Amounts are in ₹. Additional SVK heads can be added manually after import.
                </p>
              </div>
            </div>
          )}

          {/* Parse error */}
          {parseError && (
            <div className="p-3 bg-red-50 rounded-lg border border-red-200 text-xs text-red-700">
              <span className="font-semibold">Parse error: </span>{parseError}
            </div>
          )}

          {/* Preview table */}
          {parsedRows && !importResults && (
            <div className="space-y-2">
              {/* Summary chips */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-gray-600 font-medium">{parsedRows.length} rows found</span>
                {validRows.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-100 text-green-700">
                    {validRows.length} valid
                  </span>
                )}
                {invalidRows.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-100 text-red-700">
                    {invalidRows.length} with errors
                  </span>
                )}
              </div>

              {/* Table */}
              <div className="overflow-auto rounded-lg border border-gray-200 max-h-80">
                <table className="w-full text-[10px]">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-2 py-1.5 text-left font-semibold text-gray-600 border-b border-gray-200">#</th>
                      <th className="px-2 py-1.5 text-left font-semibold text-gray-600 border-b border-gray-200">Acad Year</th>
                      <th className="px-2 py-1.5 text-left font-semibold text-gray-600 border-b border-gray-200">Course</th>
                      <th className="px-2 py-1.5 text-left font-semibold text-gray-600 border-b border-gray-200">Year</th>
                      <th className="px-2 py-1.5 text-left font-semibold text-gray-600 border-b border-gray-200">Adm Type</th>
                      <th className="px-2 py-1.5 text-left font-semibold text-gray-600 border-b border-gray-200">Adm Cat</th>
                      <th className="px-2 py-1.5 text-right font-semibold text-gray-600 border-b border-gray-200">SMP ₹</th>
                      <th className="px-2 py-1.5 text-right font-semibold text-gray-600 border-b border-gray-200">SVK ₹</th>
                      <th className="px-2 py-1.5 text-right font-semibold text-gray-600 border-b border-gray-200">Total ₹</th>
                      <th className="px-2 py-1.5 text-left font-semibold text-gray-600 border-b border-gray-200">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedRows.map((r) => {
                      const smp = smpSum(r.smp);
                      const grand = smp + r.svk;
                      const ok = r.errors.length === 0;
                      return (
                        <tr
                          key={r.rowIndex}
                          className={ok ? 'hover:bg-gray-50' : 'bg-red-50'}
                        >
                          <td className="px-2 py-1 text-gray-400">{r.rowIndex}</td>
                          <td className="px-2 py-1 text-gray-700">{r.academicYear}</td>
                          <td className="px-2 py-1 font-medium text-gray-800">{r.course}</td>
                          <td className="px-2 py-1 text-gray-700">{r.year}</td>
                          <td className="px-2 py-1 text-gray-700">{r.admType}</td>
                          <td className="px-2 py-1 text-gray-700">{r.admCat}</td>
                          <td className="px-2 py-1 text-right text-gray-700">{smp.toLocaleString()}</td>
                          <td className="px-2 py-1 text-right text-gray-700">{r.svk.toLocaleString()}</td>
                          <td className="px-2 py-1 text-right font-medium text-gray-800">{grand.toLocaleString()}</td>
                          <td className="px-2 py-1">
                            {ok ? (
                              <span className="text-green-600">✓</span>
                            ) : (
                              <span
                                className="text-red-600 cursor-help underline decoration-dotted"
                                title={r.errors.join('\n')}
                              >
                                {r.errors.length} error{r.errors.length > 1 ? 's' : ''}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Error details */}
              {invalidRows.length > 0 && (
                <div className="p-3 bg-red-50 rounded-lg border border-red-200 space-y-1">
                  <p className="text-[10px] font-semibold text-red-700">Rows with errors (will be skipped):</p>
                  {invalidRows.map((r) => (
                    <p key={r.rowIndex} className="text-[10px] text-red-600">
                      Row {r.rowIndex}: {r.errors.join(' · ')}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Import progress */}
          {importing && (
            <div className="space-y-2">
              <p className="text-xs text-gray-600">
                Importing {importProgress} / {validRows.length}…
              </p>
              <div className="w-full bg-gray-200 rounded-full h-1.5">
                <div
                  className="bg-blue-500 h-1.5 rounded-full transition-all duration-200"
                  style={{ width: `${(importProgress / validRows.length) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Import results */}
          {importResults && (
            <div className="space-y-3">
              <div className={`p-4 rounded-lg border ${importResults.failed === 0 ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
                <p className="text-sm font-semibold text-gray-800 mb-1">Import complete</p>
                {importResults.success > 0 && (
                  <p className="text-xs text-green-700">
                    ✓ {importResults.success} structure{importResults.success > 1 ? 's' : ''} imported successfully
                  </p>
                )}
                {importResults.failed > 0 && (
                  <p className="text-xs text-red-600 mt-0.5">
                    ✗ {importResults.failed} failed
                  </p>
                )}
              </div>
              {importResults.errors.length > 0 && (
                <div className="p-3 bg-red-50 rounded-lg border border-red-200 space-y-1">
                  {importResults.errors.map((e, i) => (
                    <p key={i} className="text-[10px] text-red-600">{e}</p>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-200 shrink-0">
          <button
            onClick={onClose}
            disabled={importing}
            className="px-3 py-1.5 text-xs rounded border border-gray-300 bg-white hover:bg-gray-50 cursor-pointer disabled:opacity-40 transition-colors"
          >
            {importResults ? 'Close' : 'Cancel'}
          </button>

          {parsedRows && !importResults && (
            <button
              onClick={() => void handleImport()}
              disabled={importing || validRows.length === 0}
              className="px-4 py-1.5 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-700 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {importing
                ? `Importing… (${importProgress}/${validRows.length})`
                : `Import ${validRows.length} structure${validRows.length !== 1 ? 's' : ''}`}
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
