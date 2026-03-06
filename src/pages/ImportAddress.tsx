import { useState, useRef, type ChangeEvent } from 'react';
import * as XLSX from 'xlsx';
import { Button } from '../components/common/Button';
import { importAddresses, type AddressRow, type AddressImportResult } from '../services/importAddressService';

type PageState = 'idle' | 'preview' | 'importing' | 'done';

const EXPECTED_COLUMNS = ['Name', 'Reg No', 'Address', 'Academic Year'];

function parseSheet(file: File): Promise<{ rows: AddressRow[]; warnings: string[] }> {
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
        const rows: AddressRow[] = [];

        const firstRow = raw[0] ?? {};
        const keys = Object.keys(firstRow);

        function findCol(target: string): string | undefined {
          return keys.find((k) => k.trim().toLowerCase() === target.trim().toLowerCase());
        }

        const missing = EXPECTED_COLUMNS.filter((c) => !findCol(c));
        if (missing.length > 0) {
          warnings.push(`Missing columns: ${missing.join(', ')}`);
        }

        const colName = findCol('Name') ?? '';
        const colReg = findCol('Reg No') ?? '';
        const colAddress = findCol('Address') ?? '';
        const colYear = findCol('Academic Year') ?? '';

        for (let i = 0; i < raw.length; i++) {
          const r = raw[i];
          const name = String(r[colName] ?? '').trim();
          if (!name) continue;

          // Reg No may be stored as a number in Excel — normalize to string
          const regRaw = String(r[colReg] ?? '').trim().replace(/\.0+$/, '');

          rows.push({
            name,
            regNumber: regRaw.toUpperCase(),
            address: String(r[colAddress] ?? '').trim(),
            academicYear: String(r[colYear] ?? '').trim(),
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

export function ImportAddress() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pageState, setPageState] = useState<PageState>('idle');
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<AddressRow[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [parseError, setParseError] = useState('');
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [result, setResult] = useState<AddressImportResult | null>(null);

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
      const res = await importAddresses(rows, (current, total) => {
        setProgress({ current, total });
      });
      setResult(res);
    } catch (err) {
      setResult({
        updated: 0,
        notFound: 0,
        skipped: 0,
        errors: [{ row: 0, regNumber: '', message: err instanceof Error ? err.message : 'Import failed' }],
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
        <h2 className="text-xl font-semibold text-gray-900">Import Address</h2>
        <p className="text-sm text-gray-500 mt-1">
          Update student address fields in bulk from an Excel file. Students are matched by
          Register Number and Academic Year.
        </p>
      </div>

      {/* Upload section */}
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
                <p className="text-xs text-gray-500 mt-0.5">Total Rows</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold text-gray-700">
                  {rows.filter((r) => r.address).length}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">With Address</p>
              </div>
            </div>

            {warnings.length > 0 && (
              <div className="mb-4 bg-yellow-50 border border-yellow-200 rounded-md px-4 py-3">
                {warnings.map((w, i) => (
                  <p key={i} className="text-xs text-yellow-800">⚠ {w}</p>
                ))}
              </div>
            )}

            {/* Sample rows */}
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Sample rows (first 5)</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-gray-500 border-b border-gray-100">
                      <th className="pb-2 pr-4 font-medium">Name</th>
                      <th className="pb-2 pr-4 font-medium">Reg No</th>
                      <th className="pb-2 pr-4 font-medium">Academic Year</th>
                      <th className="pb-2 font-medium">Address</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 5).map((r, i) => (
                      <tr key={i} className="border-b border-gray-50">
                        <td className="py-1.5 pr-4 text-gray-700">{r.name}</td>
                        <td className="py-1.5 pr-4 font-mono text-gray-600">{r.regNumber}</td>
                        <td className="py-1.5 pr-4 text-gray-500">{r.academicYear}</td>
                        <td className="py-1.5 text-gray-500 max-w-xs truncate">{r.address || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <div className="flex gap-3">
            <Button size="lg" onClick={() => { void handleImport(); }}>
              Update {rows.filter((r) => r.address).length} Addresses
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
          <h3 className="text-base font-semibold text-gray-800 mb-4">Updating addresses...</h3>

          <p className="text-sm text-gray-600 mb-3">
            Processing {progress.current} of {progress.total}
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
              <p className="text-3xl font-bold text-green-600">{result.updated}</p>
              <p className="text-xs text-gray-500 mt-0.5">Updated</p>
            </div>
            {result.notFound > 0 && (
              <div className="text-center">
                <p className="text-3xl font-bold text-red-500">{result.notFound}</p>
                <p className="text-xs text-gray-500 mt-0.5">Not Found</p>
              </div>
            )}
            {result.skipped > 0 && (
              <div className="text-center">
                <p className="text-3xl font-bold text-gray-400">{result.skipped}</p>
                <p className="text-xs text-gray-500 mt-0.5">Skipped (blank)</p>
              </div>
            )}
          </div>

          {result.notFound === 0 && result.updated > 0 && (
            <p className="text-sm text-green-700 bg-green-50 rounded-md px-4 py-3 mb-4">
              All {result.updated} addresses updated successfully.
            </p>
          )}

          {result.errors.length > 0 && (
            <div className="mb-4">
              <p className="text-sm font-medium text-red-600 mb-2">
                Not found ({result.errors.length}):
              </p>
              <div className="bg-red-50 rounded-md px-4 py-3 max-h-48 overflow-y-auto space-y-1">
                {result.errors.map((e, i) => (
                  <p key={i} className="text-xs text-red-700 font-mono">
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
