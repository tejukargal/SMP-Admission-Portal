import { useMemo, useState } from 'react';
import { useAllStudents } from '../hooks/useAllStudents';
import { ACADEMIC_YEARS, type AdmCat, type AdmType, type Course, type Gender, type Student, type Year } from '../types';
import { isConfirmedActive } from '../utils/studentStatus';
import { isWPStudent } from '../utils/wpStudent';
import { STUDENT_COLUMNS, type ColumnKey } from '../utils/studentColumns';
import { MultiSelectFilterDropdown } from '../components/common/MultiSelectFilterDropdown';
import { ColumnPickerDropdown } from '../components/common/ColumnPickerDropdown';
import { Button } from '../components/common/Button';

const COURSES: Course[] = ['CE', 'ME', 'EC', 'CS', 'EE'];
const STUDY_YEARS: Year[] = ['1ST YEAR', '2ND YEAR', '3RD YEAR'];
const GENDERS: { value: Gender; label: string }[] = [{ value: 'BOY', label: 'Boys' }, { value: 'GIRL', label: 'Girls' }];
// EXTERNAL (Working Professional) is excluded from "confirmed" by definition.
const ADM_TYPES: AdmType[] = ['REGULAR', 'REPEATER', 'LATERAL', 'SNQ'];
const ADM_CATS: AdmCat[] = ['GM', 'SNQ', 'OTHERS'];

/** Default ticked columns (personal, admission and contact basics). */
const DEFAULT_SET: ColumnKey[] = [
  'studentNameSSLC', 'studentNameAadhar', 'fatherName', 'motherName', 'dateOfBirth', 'gender', 'religion', 'caste',
  'category', 'course', 'year', 'admType', 'admCat', 'academicYear', 'admissionStatus', 'enrollmentDate',
  'regNumber', 'fatherMobile', 'studentMobile',
];

// The picker offers every column except the synthetic row number (always added).
const PICKABLE = STUDENT_COLUMNS.filter((c) => c.key !== 'slNo');
const STORAGE_KEY = 'yearwiseExport.columns.v2';

function loadColumns(): Set<ColumnKey> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const keys = (JSON.parse(raw) as string[]).filter((k) => PICKABLE.some((c) => c.key === k));
      if (keys.length) return new Set(keys as ColumnKey[]);
    }
  } catch { /* storage unavailable */ }
  return new Set(DEFAULT_SET);
}

function saveColumns(cols: Set<ColumnKey>) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...cols])); } catch { /* ignore */ }
}

function opts<T extends string>(values: T[]) {
  return values.map((v) => ({ value: v, label: v }));
}

function yearLabel(years: string[], allYears: string[]): string {
  if (years.length === 0 || years.length === allYears.length) return 'All years';
  const s = [...years].sort();
  return s.join(', ');
}

const TH = 'px-2.5 py-1.5 text-[11px] font-semibold text-[#075E93] bg-[#EEF6FC] text-right whitespace-nowrap';
const TD = 'px-2.5 py-1 text-xs text-gray-700 text-right tabular-nums';

export function YearwiseExportPanel() {
  const { students, loading, error } = useAllStudents();

  const [years, setYears] = useState<string[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [studyYears, setStudyYears] = useState<Year[]>([]);
  const [genders, setGenders] = useState<Gender[]>([]);
  const [admTypes, setAdmTypes] = useState<AdmType[]>([]);
  const [admCats, setAdmCats] = useState<AdmCat[]>([]);
  const [columns, setColumnsState] = useState<Set<ColumnKey>>(loadColumns);
  const [busy, setBusy] = useState<'excel' | 'pdf' | null>(null);
  const [exportError, setExportError] = useState('');

  function setColumns(next: Set<ColumnKey>) {
    setColumnsState(next);
    saveColumns(next);
  }

  const confirmed = useMemo(() => students.filter((s) => isConfirmedActive(s) && !isWPStudent(s)), [students]);

  // Only offer academic years that actually have confirmed students.
  const availableYears = useMemo(() => {
    const present = new Set(confirmed.map((s) => s.academicYear));
    return [...ACADEMIC_YEARS].reverse().filter((y) => present.has(y));
  }, [confirmed]);

  const filtered = useMemo(() => {
    const yr = new Set(years);
    const match = <T,>(sel: T[], v: T) => sel.length === 0 || sel.includes(v);
    return confirmed.filter((s) =>
      (yr.size === 0 || yr.has(s.academicYear))
      && match(courses, s.course) && match(studyYears, s.year) && match(genders, s.gender)
      && match(admTypes, s.admType) && match(admCats, s.admCat));
  }, [confirmed, years, courses, studyYears, genders, admTypes, admCats]);

  const effectiveYears = years.length ? availableYears.filter((y) => years.includes(y)) : availableYears;
  const chosenColumns = PICKABLE.filter((c) => columns.has(c.key));

  const preview = useMemo(() => {
    const rows = effectiveYears.map((y) => ({ year: y, list: filtered.filter((s) => s.academicYear === y) }));
    return [...rows, { year: 'TOTAL', list: filtered }];
  }, [effectiveYears, filtered]);

  const filterLine = [
    `Years: ${yearLabel(years, availableYears)}`,
    courses.length ? `Course: ${courses.join(', ')}` : '',
    studyYears.length ? `Year: ${studyYears.join(', ')}` : '',
    genders.length ? `Gender: ${genders.join(', ')}` : '',
    admTypes.length ? `Adm Type: ${admTypes.join(', ')}` : '',
    admCats.length ? `Adm Cat: ${admCats.join(', ')}` : '',
  ].filter(Boolean).join('  ·  ');

  const fileBase = (() => {
    if (years.length === 0 || years.length === availableYears.length) return 'Confirmed_Students_All_Years';
    const s = [...years].sort();
    return s.length === 1 ? `Confirmed_Students_${s[0]}` : `Confirmed_Students_${s[0]}_to_${s[s.length - 1]}`;
  })();

  async function handleExcel() {
    setBusy('excel'); setExportError('');
    try {
      const { exportYearwiseStudentsExcel } = await import('../utils/yearwiseStudentsExcel');
      await exportYearwiseStudentsExcel({
        students: filtered,
        columns: chosenColumns,
        years: effectiveYears,
        courses: COURSES.filter((c) => filtered.some((s) => s.course === c)),
        filterLine,
        fileName: fileBase,
      });
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Excel export failed.');
    } finally {
      setBusy(null);
    }
  }

  async function handlePdf() {
    setBusy('pdf'); setExportError('');
    try {
      const [{ exportYearwiseStudentsPdf }, { sortYearwise }] = await Promise.all([
        import('../utils/yearwiseStudentsPdf'),
        import('../utils/yearwiseStudentsExcel'),
      ]);
      const slNo = STUDENT_COLUMNS.find((c) => c.key === 'slNo')!;
      const ay = STUDENT_COLUMNS.find((c) => c.key === 'academicYear')!;
      const multiYear = effectiveYears.length > 1;
      const cols = [slNo, ...(multiYear && !columns.has('academicYear') ? [ay] : []), ...chosenColumns];
      exportYearwiseStudentsPdf({
        students: sortYearwise(filtered),
        columns: cols,
        title: 'SMP Admissions — Confirmed Students (Yearwise)',
        filterLine,
        fileName: fileBase,
      });
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'PDF export failed.');
    } finally {
      setBusy(null);
    }
  }

  const anyFilter = years.length + courses.length + studyYears.length + genders.length + admTypes.length + admCats.length > 0;
  const canExport = filtered.length > 0 && chosenColumns.length > 0 && !busy;
  const count = (list: Student[], pred: (s: Student) => boolean) => list.filter(pred).length || '—';

  return (
    <div className="max-w-4xl space-y-4">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200" style={{ animation: 'page-enter 0.2s ease-out both' }}>
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Yearwise Confirmed Students</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Export confirmed students for one, several or all academic years. Excludes transferred-out and Working Professional students.
          </p>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <MultiSelectFilterDropdown tone="ocean" title="Select Years" placeholder="All Years" value={years} onChange={setYears} options={opts(availableYears)} />
            <MultiSelectFilterDropdown tone="ocean" placeholder="All Courses" value={courses} onChange={setCourses} options={opts(COURSES)} />
            <MultiSelectFilterDropdown tone="ocean" placeholder="All Years of Study" value={studyYears} onChange={setStudyYears} options={opts(STUDY_YEARS)} />
            <MultiSelectFilterDropdown tone="ocean" placeholder="All Genders" value={genders} onChange={setGenders} options={GENDERS} />
            <MultiSelectFilterDropdown tone="ocean" placeholder="All Adm Types" value={admTypes} onChange={setAdmTypes} options={opts(ADM_TYPES)} />
            <MultiSelectFilterDropdown tone="ocean" placeholder="All Adm Cats" value={admCats} onChange={setAdmCats} options={opts(ADM_CATS)} />
            {anyFilter && (
              <button
                className="text-xs text-[#0B7BC0] hover:underline px-1"
                onClick={() => { setYears([]); setCourses([]); setStudyYears([]); setGenders([]); setAdmTypes([]); setAdmCats([]); }}
              >
                Clear filters
              </button>
            )}
          </div>

          {/* Columns */}
          <div className="flex flex-wrap items-center gap-3">
            <ColumnPickerDropdown columns={PICKABLE} selected={columns} onChange={setColumns} />
            <button className="text-xs text-[#0B7BC0] hover:underline" onClick={() => setColumns(new Set(DEFAULT_SET))}>Default set</button>
            <button className="text-xs text-[#0B7BC0] hover:underline" onClick={() => setColumns(new Set(PICKABLE.map((c) => c.key)))}>Select all</button>
            <span className="text-xs text-gray-500">{chosenColumns.length} columns</span>
          </div>

          {/* Preview */}
          {loading ? (
            <p className="text-sm text-gray-400">Loading students…</p>
          ) : error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-gray-100">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className={`${TH} text-left`}>Academic Year</th>
                    <th className={TH}>Total</th>
                    {COURSES.map((c) => <th key={c} className={TH}>{c}</th>)}
                    {STUDY_YEARS.map((y) => <th key={y} className={TH}>{y.replace(' YEAR', ' Yr')}</th>)}
                    <th className={TH}>Boys</th>
                    <th className={TH}>Girls</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map(({ year, list }) => (
                    <tr key={year} className={`border-t border-gray-100 ${year === 'TOTAL' ? 'font-semibold bg-gray-50' : ''}`}>
                      <td className={`${TD} text-left`}>{year}</td>
                      <td className={`${TD} font-semibold text-gray-900`}>{list.length}</td>
                      {COURSES.map((c) => <td key={c} className={TD}>{count(list, (s) => s.course === c)}</td>)}
                      {STUDY_YEARS.map((y) => <td key={y} className={TD}>{count(list, (s) => s.year === y)}</td>)}
                      <td className={TD}>{count(list, (s) => s.gender === 'BOY')}</td>
                      <td className={TD}>{count(list, (s) => s.gender === 'GIRL')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="text-xs text-gray-500">
            {filtered.length.toLocaleString('en-IN')} students · {chosenColumns.length} columns · {effectiveYears.length} academic year{effectiveYears.length !== 1 ? 's' : ''}.
            Excel has a Summary sheet, an All Years sheet and one sheet per year.
          </p>
          {chosenColumns.length === 0 && <p className="text-xs text-amber-700">Select at least one column to export.</p>}
          {exportError && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">{exportError}</p>}

          <div className="flex gap-2">
            <Button onClick={() => { void handleExcel(); }} loading={busy === 'excel'} disabled={!canExport}>
              {busy === 'excel' ? 'Exporting…' : 'Export Excel'}
            </Button>
            <Button variant="secondary" onClick={() => { void handlePdf(); }} loading={busy === 'pdf'} disabled={!canExport}>
              {busy === 'pdf' ? 'Exporting…' : 'Export PDF'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
