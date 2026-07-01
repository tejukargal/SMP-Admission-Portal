import { useState, useRef, type ChangeEvent } from 'react';
import { Button } from '../components/common/Button';
import { parseResultPdf, type ParsedResultLedger } from '../utils/resultPdfParser';
import { importExamResults, type ImportResultsSummary } from '../services/resultService';

type PageState = 'idle' | 'preview' | 'importing' | 'done';

export function ImportResults() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pageState, setPageState] = useState<PageState>('idle');
  const [fileName, setFileName] = useState('');
  const [ledger, setLedger] = useState<ParsedResultLedger | null>(null);
  const [parseError, setParseError] = useState('');
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [result, setResult] = useState<ImportResultsSummary | null>(null);

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setParseError('');
    setFileName(file.name);
    setPageState('idle');

    try {
      const parsed = await parseResultPdf(file);
      if (parsed.results.length === 0) {
        setParseError('No student records could be parsed from this PDF. Please check the file format.');
        return;
      }
      setLedger(parsed);
      setPageState('preview');
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Failed to parse PDF');
    }
  }

  async function handleImport() {
    if (!ledger || ledger.results.length === 0) return;
    setPageState('importing');
    setProgress({ current: 0, total: ledger.results.length });

    try {
      const res = await importExamResults(
        {
          course: ledger.course,
          collegeCode: ledger.collegeCode,
          examSession: ledger.examSession,
          results: ledger.results,
        },
        (current, total) => setProgress({ current, total })
      );
      setResult(res);
    } catch (err) {
      setResult({
        success: 0,
        failed: ledger.results.length,
        errors: [{ regNumber: '', message: err instanceof Error ? err.message : 'Import failed' }],
      });
    } finally {
      setPageState('done');
    }
  }

  function handleReset() {
    setPageState('idle');
    setFileName('');
    setLedger(null);
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
        <h2 className="text-xl font-semibold text-gray-900">Import Results</h2>
        <p className="text-sm text-gray-500 mt-1">
          Import a course-wise Result Ledger PDF (Board of Technical Examination). Each student
          is matched to an enrolled student by Register Number.
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
            <div className="text-4xl mb-3">📄</div>
            <p className="text-sm font-medium text-gray-700">
              Click to browse or drag &amp; drop your Result Ledger PDF
            </p>
            <p className="text-xs text-gray-400 mt-1">.pdf format</p>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={(e) => { void handleFileChange(e); }}
          />

          {parseError && (
            <p className="mt-4 text-sm text-red-600 bg-red-50 rounded-md px-4 py-3">
              {parseError}
            </p>
          )}

          <div className="mt-5 text-sm text-gray-500">
            <p className="text-xs text-gray-400">
              Each student is matched to an enrolled student via <strong>Register Number</strong>.
              Unmatched students are still imported using the name/course from the PDF.
            </p>
          </div>
        </section>
      )}

      {/* ── Preview ── */}
      {pageState === 'preview' && ledger && (
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
                <p className="text-3xl font-bold text-blue-600">{ledger.results.length}</p>
                <p className="text-xs text-gray-500 mt-0.5">Total Records</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-gray-700">{ledger.course ?? '—'}</p>
                <p className="text-xs text-gray-500 mt-0.5">Course</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-gray-700">{ledger.examSession || '—'}</p>
                <p className="text-xs text-gray-500 mt-0.5">Exam Session</p>
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
                    <th className="pb-2 pr-4 font-medium">Reg No</th>
                    <th className="pb-2 pr-4 font-medium">Student Name</th>
                    <th className="pb-2 pr-4 font-medium text-right">CGPA</th>
                    <th className="pb-2 font-medium">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.results.slice(0, 5).map((r) => (
                    <tr key={r.regNumber} className="border-b border-gray-50">
                      <td className="py-1.5 pr-4 font-mono text-gray-600">{r.regNumber}</td>
                      <td className="py-1.5 pr-4 text-gray-700">{r.studentName}</td>
                      <td className="py-1.5 pr-4 text-right tabular-nums text-gray-700">
                        {r.cgpa ?? (r.cgpaStatus || '—')}
                      </td>
                      <td className="py-1.5 text-gray-700">{r.overallResult || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="flex gap-3">
            <Button size="lg" onClick={() => { void handleImport(); }}>
              Import {ledger.results.length} Records
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
              All {result.success} results imported successfully.
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
                    {e.regNumber ? `${e.regNumber}: ` : ''}{e.message}
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
