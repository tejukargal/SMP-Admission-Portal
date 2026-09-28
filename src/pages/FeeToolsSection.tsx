import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSettings } from '../hooks/useSettings';
import { getAllFeeStructures, deleteAllFeeStructures } from '../services/feeStructureService';
import { exportFeeStructurePDF, exportFeeStructureExcel, exportFeeStructureFormatted } from '../utils/feeStructureExport';
import type { AcademicYear, FeeStructure } from '../types';
import { ACADEMIC_YEARS } from '../types';
import { selectCls } from './feeStructureShared';

type ExportFormat = 'pdf' | 'excel' | 'formatted';

const EXPORTS: { id: ExportFormat; title: string; hint: string; tone: string }[] = [
  { id: 'pdf', title: 'Export PDF', hint: 'Notice-board fee structure', tone: 'border-red-200 hover:bg-red-50 text-red-700' },
  { id: 'excel', title: 'Export Excel', hint: 'Flat data, one row per structure', tone: 'border-green-200 hover:bg-green-50 text-green-700' },
  { id: 'formatted', title: 'Fee Structure Format', hint: 'Formatted Excel: structure, breakup, course-wise, quick reference', tone: 'border-amber-300 hover:bg-amber-50 text-amber-800' },
];

/** Settings › Fee Structure › Export & Tools: exports, import link, and the
 *  delete-all danger zone. */
export function FeeToolsSection() {
  const navigate = useNavigate();
  const { settings, loading: settingsLoading } = useSettings();

  const [selectedYear, setSelectedYear] = useState<AcademicYear | ''>('');
  const [allStructures, setAllStructures] = useState<FeeStructure[]>([]);
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (settings?.currentAcademicYear && !selectedYear) {
      setSelectedYear(settings.currentAcademicYear);
    }
  }, [settings, selectedYear]);

  useEffect(() => {
    getAllFeeStructures().then(setAllStructures).catch(() => {});
  }, []);

  const yearStructures = allStructures.filter((s) => s.academicYear === selectedYear);

  function handleExport(format: ExportFormat) {
    if (!selectedYear || yearStructures.length === 0) return;
    setExporting(format);
    try {
      if (format === 'pdf') exportFeeStructurePDF(yearStructures, selectedYear);
      else if (format === 'excel') exportFeeStructureExcel(yearStructures, selectedYear);
      else exportFeeStructureFormatted(yearStructures, selectedYear);
    } finally {
      setExporting(null);
    }
  }

  async function handleClearAll() {
    setClearing(true);
    setError(null);
    try {
      await deleteAllFeeStructures();
      setAllStructures([]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to clear structures');
    } finally {
      setClearing(false);
      setClearConfirm(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 max-w-3xl">

      <div>
        <h2 className="text-base font-semibold text-gray-900 leading-tight">Export & Tools</h2>
        <p className="text-xs text-gray-500">Download or import fee structures.</p>
      </div>

      {/* Exports */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="text-sm font-semibold text-gray-800">Export</h3>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Academic Year</span>
            <select
              className={selectCls}
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value as AcademicYear | '')}
              disabled={settingsLoading}
            >
              <option value="">Select Year</option>
              {ACADEMIC_YEARS.map((yr) => <option key={yr} value={yr}>{yr}</option>)}
            </select>
            <span className="text-xs text-gray-400">{yearStructures.length} structures</span>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {EXPORTS.map((x) => (
            <button
              key={x.id}
              type="button"
              onClick={() => handleExport(x.id)}
              disabled={exporting !== null || yearStructures.length === 0}
              className={`text-left rounded-lg border bg-white px-3 py-2.5 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${x.tone}`}
            >
              <span className="block text-xs font-semibold">{exporting === x.id ? 'Exporting…' : x.title}</span>
              <span className="block text-[11px] text-gray-500 mt-0.5">{x.hint}</span>
            </button>
          ))}
        </div>
        {selectedYear && yearStructures.length === 0 && (
          <p className="text-[11px] text-gray-400 mt-2">No structures saved for {selectedYear}.</p>
        )}
      </div>

      {/* Import */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm px-4 py-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">Import from Excel</h3>
          <p className="text-[11px] text-gray-500">Bulk-create or update structures from a spreadsheet.</p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/settings?tab=import&section=fee-structure')}
          className="shrink-0 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 cursor-pointer transition-colors shadow-sm"
        >
          Open Import →
        </button>
      </div>

      {/* Danger zone */}
      <div className="rounded-lg border border-red-200 bg-red-50/40 px-4 py-3">
        <h3 className="text-sm font-semibold text-red-700">Danger zone</h3>
        <div className="flex flex-wrap items-center justify-between gap-3 mt-1">
          <p className="text-[11px] text-red-700/80">
            Delete <strong>all {allStructures.length}</strong> saved fee structures across every academic year. This cannot be undone.
          </p>
          {clearConfirm ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-red-700 font-medium">Delete everything?</span>
              <button
                type="button"
                onClick={() => void handleClearAll()}
                disabled={clearing}
                className="px-3 py-1.5 text-xs font-semibold rounded-md bg-red-600 text-white hover:bg-red-700 cursor-pointer disabled:opacity-50 transition-colors"
              >
                {clearing ? 'Deleting…' : 'Yes, delete all'}
              </button>
              <button
                type="button"
                onClick={() => setClearConfirm(false)}
                disabled={clearing}
                className="px-3 py-1.5 text-xs rounded-md border border-gray-300 bg-white hover:bg-gray-50 cursor-pointer disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setClearConfirm(true)}
              disabled={allStructures.length === 0}
              className="px-3 py-1.5 text-xs font-medium rounded-md border border-red-300 text-red-600 bg-white hover:bg-red-50 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Delete all fee structures
            </button>
          )}
        </div>
        {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
      </div>
    </div>
  );
}
