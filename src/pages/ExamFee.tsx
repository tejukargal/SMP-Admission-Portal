import { useState, useMemo, useEffect } from 'react';
import { useSettings } from '../hooks/useSettings';
import { useStudents } from '../hooks/useStudents';
import { useExamFee } from '../hooks/useExamFee';
import { saveExamFeeRecords } from '../services/examFeeService';
import { exportExamFeePdf } from '../utils/examFeePdf';
import type { Student, Course, Year, Gender, AcademicYear, AdmType, AdmCat, Category } from '../types';

const COURSES: Course[] = ['CE', 'ME', 'EC', 'CS', 'EE'];
const YEARS: Year[] = ['1ST YEAR', '2ND YEAR', '3RD YEAR'];
const YEAR_ORDER: Record<string, number> = { '1ST YEAR': 1, '2ND YEAR': 2, '3RD YEAR': 3 };

const fs = 'rounded border border-gray-300 px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 cursor-pointer';

function AnimNum({ value }: { value: number }) {
  return (
    <span
      key={value}
      className="font-bold tabular-nums"
      style={{ display: 'inline-block', animation: 'stat-pop 0.28s ease-out' }}
    >
      {value}
    </span>
  );
}

const PASSKEY = 'smpexam@anni';

function PasskeyGate({ onUnlock }: { onUnlock: () => void }) {
  const [input, setInput] = useState('');
  const [error, setError] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (input === PASSKEY) {
      onUnlock();
    } else {
      setError(true);
      setInput('');
    }
  }

  return (
    <div className="h-full flex items-center justify-center" style={{ animation: 'page-enter 0.22s ease-out' }}>
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm px-8 py-7 w-80">
        <h2 className="text-sm font-semibold text-gray-900 mb-1">Exam Fee</h2>
        <p className="text-xs text-gray-400 mb-5">Enter the passkey to continue.</p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="password"
            autoFocus
            placeholder="Passkey"
            value={input}
            onChange={(e) => { setInput(e.target.value); setError(false); }}
            className={`w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-1 ${
              error
                ? 'border-red-400 focus:ring-red-400 bg-red-50'
                : 'border-gray-300 focus:ring-blue-500 focus:border-blue-500'
            }`}
          />
          {error && (
            <p className="text-xs text-red-500 -mt-1">Incorrect passkey. Try again.</p>
          )}
          <button
            type="submit"
            className="w-full rounded-md bg-blue-600 text-white text-sm font-medium py-2 hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 cursor-pointer"
          >
            Unlock
          </button>
        </form>
      </div>
    </div>
  );
}

export function ExamFee() {
  const [unlocked, setUnlocked] = useState(false);

  const { settings, loading: settingsLoading } = useSettings();
  const academicYear = (settings?.currentAcademicYear ?? null) as AcademicYear | null;

  // Filters — local state (independent from Students page filters)
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [courseFilter, setCourseFilter] = useState<Course | ''>('');
  const [yearFilter, setYearFilter] = useState<Year | ''>('');
  const [genderFilter, setGenderFilter] = useState<Gender | ''>('');
  const [categoryFilter, setCategoryFilter] = useState<Category | ''>('');
  const [admTypeFilter, setAdmTypeFilter] = useState<AdmType | ''>('');
  const [admCatFilter, setAdmCatFilter] = useState<AdmCat | ''>('');
  const [admStatusFilter, setAdmStatusFilter] = useState('');
  const [paidFilter, setPaidFilter] = useState<'all' | 'paid' | 'unpaid'>('all');

  // Data fetching
  const { students: allStudents, loading: studentsLoading, error: studentsError } = useStudents(academicYear);
  const { records, loading: examFeeLoading } = useExamFee(academicYear);

  // Paid state: paidMap = current local state, savedMap = last persisted state
  const [paidMap, setPaidMap] = useState<Record<string, boolean>>({});
  const [savedMap, setSavedMap] = useState<Record<string, boolean>>({});

  // Initialise / re-sync when Firestore records load
  useEffect(() => {
    const map: Record<string, boolean> = {};
    for (const r of records) {
      map[r.studentId] = r.paid;
    }
    setPaidMap(map);
    setSavedMap({ ...map });
  }, [records]);

  // Save state
  const [saving, setSaving] = useState(false);
  const [saveToast, setSaveToast] = useState('');
  const [savingPdf, setSavingPdf] = useState(false);

  useEffect(() => {
    if (!saveToast) return;
    const t = setTimeout(() => setSaveToast(''), 3000);
    return () => clearTimeout(t);
  }, [saveToast]);

  const isDirty = useMemo(() => {
    const allIds = new Set([...Object.keys(paidMap), ...Object.keys(savedMap)]);
    for (const id of allIds) {
      if ((paidMap[id] ?? false) !== (savedMap[id] ?? false)) return true;
    }
    return false;
  }, [paidMap, savedMap]);

  async function handleSave() {
    if (!academicYear || !isDirty || saving) return;
    setSaving(true);
    try {
      const allIds = new Set([...Object.keys(paidMap), ...Object.keys(savedMap)]);
      const updates: Array<{ studentId: string; academicYear: AcademicYear; paid: boolean }> = [];
      for (const studentId of allIds) {
        const current = paidMap[studentId] ?? false;
        const saved = savedMap[studentId] ?? false;
        if (current !== saved) {
          updates.push({ studentId, academicYear, paid: current });
        }
      }
      await saveExamFeeRecords(updates);
      setSavedMap({ ...paidMap });
      setSaveToast('Saved successfully!');
    } catch (err) {
      console.error('Exam fee save error:', err);
      setSaveToast('Save failed. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  function handleSavePdf() {
    setSavingPdf(true);
    setTimeout(() => {
      try {
        exportExamFeePdf(filteredStudents, paidMap, {
          academicYear,
          courseFilter,
          yearFilter,
          genderFilter,
          categoryFilter,
          admTypeFilter,
          admCatFilter,
          admStatusFilter,
          paidFilter,
          searchTerm: debouncedSearch,
        });
      } finally {
        setSavingPdf(false);
      }
    }, 0);
  }

  function togglePaid(studentId: string) {
    setPaidMap((prev) => ({ ...prev, [studentId]: !(prev[studentId] ?? false) }));
  }

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  // Client-side filtering (same logic as Students page + paid filter)
  const filteredStudents = useMemo(() => {
    let result = allStudents;
    if (courseFilter)    result = result.filter((s) => s.course === courseFilter);
    if (yearFilter)      result = result.filter((s) => s.year === yearFilter);
    if (genderFilter)    result = result.filter((s) => s.gender === genderFilter);
    if (categoryFilter)  result = result.filter((s) => s.category === categoryFilter);
    if (admTypeFilter)   result = result.filter((s) => s.admType === admTypeFilter);
    if (admCatFilter)    result = result.filter((s) => s.admCat === admCatFilter);
    if (admStatusFilter) result = result.filter((s) =>
      admStatusFilter === 'PENDING'
        ? !['PROVISIONAL', 'CONFIRMED', 'CANCELLED'].includes(s.admissionStatus?.trim() ?? '')
        : s.admissionStatus === admStatusFilter
    );
    if (paidFilter === 'paid')   result = result.filter((s) =>  (paidMap[s.id] ?? false));
    if (paidFilter === 'unpaid') result = result.filter((s) => !(paidMap[s.id] ?? false));
    if (debouncedSearch) {
      const search = debouncedSearch.trim().toUpperCase();
      result = result.filter((s) => {
        const matchName =
          s.studentNameSSLC.toUpperCase().includes(search) ||
          s.studentNameAadhar.toUpperCase().includes(search);
        const matchMobile =
          s.fatherMobile?.includes(search) || s.studentMobile?.includes(search);
        const matchReg = s.regNumber?.toUpperCase().includes(search);
        return matchName || matchMobile || matchReg;
      });
    }
    return result.slice().sort((a, b) => {
      const y = (YEAR_ORDER[a.year] ?? 9) - (YEAR_ORDER[b.year] ?? 9);
      if (y !== 0) return y;
      const c = a.course.localeCompare(b.course);
      if (c !== 0) return c;
      return a.studentNameSSLC.localeCompare(b.studentNameSSLC);
    });
  }, [allStudents, courseFilter, yearFilter, genderFilter, categoryFilter, admTypeFilter, admCatFilter, admStatusFilter, paidFilter, debouncedSearch, paidMap]);

  // Stats from unfiltered data (live — updates as user checks/unchecks)
  const stats = useMemo(() => {
    if (!allStudents.length) return null;
    const yearCount: Record<string, number> = {};
    const courseCount: Record<string, number> = {};
    let paidCount = 0;
    for (const s of allStudents) {
      yearCount[s.year] = (yearCount[s.year] ?? 0) + 1;
      courseCount[s.course] = (courseCount[s.course] ?? 0) + 1;
      if (paidMap[s.id] ?? false) paidCount++;
    }
    return { yearCount, courseCount, total: allStudents.length, paidCount, unpaidCount: allStudents.length - paidCount };
  }, [allStudents, paidMap]);

  const hasActiveFilters =
    !!searchTerm || !!courseFilter || !!yearFilter || !!genderFilter ||
    !!categoryFilter || !!admTypeFilter || !!admCatFilter || !!admStatusFilter || paidFilter !== 'all';

  function clearFilters() {
    setSearchTerm('');
    setDebouncedSearch('');
    setCourseFilter('');
    setYearFilter('');
    setGenderFilter('');
    setCategoryFilter('');
    setAdmTypeFilter('');
    setAdmCatFilter('');
    setAdmStatusFilter('');
    setPaidFilter('all');
  }

  // Select-all for currently filtered rows
  const allFilteredPaid = filteredStudents.length > 0 && filteredStudents.every((s) => paidMap[s.id] ?? false);
  const someFilteredPaid = filteredStudents.some((s) => paidMap[s.id] ?? false);

  function toggleSelectAll() {
    const markAs = !allFilteredPaid;
    setPaidMap((prev) => {
      const next = { ...prev };
      for (const s of filteredStudents) next[s.id] = markAs;
      return next;
    });
  }

  const isLoading = settingsLoading || studentsLoading || examFeeLoading;

  if (!unlocked) {
    return <PasskeyGate onUnlock={() => setUnlocked(true)} />;
  }

  return (
    <div className="h-full flex flex-col gap-3" style={{ animation: 'page-enter 0.22s ease-out' }}>

      {/* Page header + stats chips */}
      <div className="flex-shrink-0 flex items-center gap-3 min-w-0 relative">
        <div className="shrink-0">
          <h2 className="text-base font-semibold text-gray-900 leading-tight">Exam Fee</h2>
          {academicYear && (
            <p className="text-[10px] text-gray-400 leading-tight">{academicYear}</p>
          )}
        </div>

        {!isLoading && stats && (
          <>
            <span className="text-gray-200 text-sm select-none shrink-0">|</span>
            <div className="flex items-center gap-1.5 overflow-x-auto min-w-0 pb-0.5">

              {/* Total */}
              <div className="flex items-center gap-1 bg-white border border-gray-200 rounded px-2 py-1 text-xs shadow-sm whitespace-nowrap shrink-0">
                <span className="text-gray-400 font-medium">Total</span>
                <AnimNum value={stats.total} />
              </div>

              {/* Paid chip */}
              <button
                onClick={() => setPaidFilter(paidFilter === 'paid' ? 'all' : 'paid')}
                className={`flex items-center gap-1 border rounded px-2 py-1 text-xs shadow-sm whitespace-nowrap shrink-0 transition-colors duration-150 cursor-pointer ${
                  paidFilter === 'paid'
                    ? 'bg-green-50 border-green-300'
                    : 'bg-white border-gray-200 hover:border-gray-300'
                }`}
              >
                <span className={`font-medium ${paidFilter === 'paid' ? 'text-green-700' : 'text-gray-500'}`}>Paid</span>
                <span className={paidFilter === 'paid' ? 'text-green-800' : 'text-gray-800'}>
                  <AnimNum value={stats.paidCount} />
                </span>
              </button>

              {/* Unpaid chip */}
              <button
                onClick={() => setPaidFilter(paidFilter === 'unpaid' ? 'all' : 'unpaid')}
                className={`flex items-center gap-1 border rounded px-2 py-1 text-xs shadow-sm whitespace-nowrap shrink-0 transition-colors duration-150 cursor-pointer ${
                  paidFilter === 'unpaid'
                    ? 'bg-red-50 border-red-300'
                    : 'bg-white border-gray-200 hover:border-gray-300'
                }`}
              >
                <span className={`font-medium ${paidFilter === 'unpaid' ? 'text-red-700' : 'text-gray-500'}`}>Unpaid</span>
                <span className={paidFilter === 'unpaid' ? 'text-red-800' : 'text-gray-800'}>
                  <AnimNum value={stats.unpaidCount} />
                </span>
              </button>

              <span className="text-gray-200 text-xs select-none shrink-0">·</span>

              {/* Study-year chips */}
              {YEARS.map((yr) => {
                const count = stats.yearCount[yr] ?? 0;
                const isSelected = yearFilter === yr;
                const isDimmed = (!!yearFilter && !isSelected) || count === 0;
                const label = yr === '1ST YEAR' ? '1st' : yr === '2ND YEAR' ? '2nd' : '3rd';
                return (
                  <button
                    key={yr}
                    onClick={() => setYearFilter(isSelected ? '' : yr)}
                    className={`flex items-center gap-1 border rounded px-2 py-1 text-xs shadow-sm whitespace-nowrap shrink-0 transition-colors duration-150 cursor-pointer ${
                      isSelected
                        ? 'bg-blue-50 border-blue-300'
                        : isDimmed
                        ? 'bg-white border-gray-100'
                        : 'bg-white border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <span className={`font-medium ${isSelected ? 'text-blue-700' : isDimmed ? 'text-gray-300' : 'text-gray-500'}`}>
                      {label}
                    </span>
                    <span className={isSelected ? 'text-blue-800' : isDimmed ? 'text-gray-300' : 'text-gray-800'}>
                      <AnimNum value={count} />
                    </span>
                  </button>
                );
              })}

              <span className="text-gray-200 text-xs select-none shrink-0">·</span>

              {/* Course chips */}
              {COURSES.map((c) => {
                const count = stats.courseCount[c] ?? 0;
                const isSelected = courseFilter === c;
                const isDimmed = (!!courseFilter && !isSelected) || count === 0;
                return (
                  <button
                    key={c}
                    onClick={() => setCourseFilter(isSelected ? '' : c)}
                    className={`flex items-center gap-1 border rounded px-2 py-1 text-xs shadow-sm whitespace-nowrap shrink-0 transition-colors duration-150 cursor-pointer ${
                      isSelected
                        ? 'bg-blue-50 border-blue-300'
                        : isDimmed
                        ? 'bg-white border-gray-100'
                        : 'bg-white border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <span className={`font-medium ${isSelected ? 'text-blue-700' : isDimmed ? 'text-gray-300' : 'text-gray-500'}`}>
                      {c}
                    </span>
                    <span className={isSelected ? 'text-blue-800' : isDimmed ? 'text-gray-300' : 'text-gray-800'}>
                      <AnimNum value={count} />
                    </span>
                  </button>
                );
              })}

              {/* Filtered count */}
              {hasActiveFilters && (
                <>
                  <span className="text-gray-200 text-xs select-none shrink-0">·</span>
                  <div className="flex items-center gap-1 bg-blue-50 border border-blue-200 rounded px-2 py-1 text-xs shadow-sm whitespace-nowrap shrink-0">
                    <span className="text-blue-500 font-medium">Filtered</span>
                    <AnimNum value={filteredStudents.length} />
                  </div>
                </>
              )}
            </div>
          </>
        )}

        {/* Save toast — centred in header bar */}
        {saveToast && (
          <div
            className={`absolute left-1/2 -translate-x-1/2 flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full shadow-sm whitespace-nowrap pointer-events-auto border ${
              saveToast.includes('failed')
                ? 'bg-red-50 border-red-200 text-red-800'
                : 'bg-green-50 border-green-200 text-green-800'
            }`}
            style={{ animation: 'toast-in 0.2s ease-out' }}
          >
            <span className={saveToast.includes('failed') ? 'text-red-500' : 'text-green-500'}>
              {saveToast.includes('failed') ? '✕' : '✓'}
            </span>
            {saveToast}
          </div>
        )}

        {/* Save button */}
        <button
          onClick={() => void handleSave()}
          disabled={!isDirty || saving}
          className="ml-auto shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-500 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer bg-blue-600 text-white hover:bg-blue-700 disabled:hover:bg-blue-600"
        >
          {saving ? 'Saving…' : isDirty ? 'Save Changes' : 'Saved'}
        </button>
      </div>

      {/* Filters */}
      <div className="flex-shrink-0 bg-white rounded-lg border border-gray-200 shadow-sm px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            placeholder="Search name / reg / mobile…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-44 rounded border border-gray-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          />
          <select className={fs} value={courseFilter} onChange={(e) => setCourseFilter(e.target.value as Course | '')}>
            <option value="">All Courses</option>
            <option value="CE">CE</option>
            <option value="ME">ME</option>
            <option value="EC">EC</option>
            <option value="CS">CS</option>
            <option value="EE">EE</option>
          </select>
          <select className={fs} value={yearFilter} onChange={(e) => setYearFilter(e.target.value as Year | '')}>
            <option value="">All Years</option>
            <option value="1ST YEAR">1ST YEAR</option>
            <option value="2ND YEAR">2ND YEAR</option>
            <option value="3RD YEAR">3RD YEAR</option>
          </select>
          <select className={fs} value={genderFilter} onChange={(e) => setGenderFilter(e.target.value as Gender | '')}>
            <option value="">All Genders</option>
            <option value="BOY">BOY</option>
            <option value="GIRL">GIRL</option>
          </select>
          <select className={fs} value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value as Category | '')}>
            <option value="">All Cats</option>
            <option value="GM">GM</option>
            <option value="SC">SC</option>
            <option value="ST">ST</option>
            <option value="C1">C1</option>
            <option value="2A">2A</option>
            <option value="2B">2B</option>
            <option value="3A">3A</option>
            <option value="3B">3B</option>
          </select>
          <select className={fs} value={admTypeFilter} onChange={(e) => setAdmTypeFilter(e.target.value as AdmType | '')}>
            <option value="">All Adm Types</option>
            <option value="REGULAR">REGULAR</option>
            <option value="REPEATER">REPEATER</option>
            <option value="LATERAL">LATERAL</option>
            <option value="EXTERNAL">EXTERNAL</option>
            <option value="SNQ">SNQ</option>
          </select>
          <select className={fs} value={admCatFilter} onChange={(e) => setAdmCatFilter(e.target.value as AdmCat | '')}>
            <option value="">All Adm Cats</option>
            <option value="GM">GM</option>
            <option value="SNQ">SNQ</option>
            <option value="OTHERS">OTHERS</option>
          </select>
          <select className={fs} value={admStatusFilter} onChange={(e) => setAdmStatusFilter(e.target.value)}>
            <option value="">All Statuses</option>
            <option value="PROVISIONAL">PROVISIONAL</option>
            <option value="CONFIRMED">CONFIRMED</option>
            <option value="CANCELLED">CANCELLED</option>
            <option value="PENDING">PENDING</option>
          </select>
          <select
            className={`${fs} ${paidFilter !== 'all' ? 'border-blue-400 bg-blue-50 text-blue-700' : ''}`}
            value={paidFilter}
            onChange={(e) => setPaidFilter(e.target.value as 'all' | 'paid' | 'unpaid')}
          >
            <option value="all">All Fee Status</option>
            <option value="paid">Paid</option>
            <option value="unpaid">Unpaid</option>
          </select>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="rounded border border-orange-400 px-2 py-1.5 text-xs text-orange-700 bg-orange-50 hover:bg-orange-100 hover:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-400 cursor-pointer transition-colors font-medium"
            >
              Clear Filters
            </button>
          )}
          {!isLoading && filteredStudents.length > 0 && (
            <button
              onClick={handleSavePdf}
              disabled={savingPdf}
              className="rounded border border-gray-300 px-2 py-1.5 text-xs text-gray-600 bg-white hover:bg-gray-50 hover:border-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
            >
              {savingPdf ? 'Generating…' : 'Save PDF'}
            </button>
          )}
        </div>
      </div>

      {/* Table area */}
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center text-sm text-gray-500">Loading…</div>
      ) : studentsError ? (
        <div className="flex-1 flex items-center justify-center text-sm text-red-500">{studentsError}</div>
      ) : !academicYear ? (
        <div className="flex-1 flex items-center justify-center text-sm text-gray-500">
          Please configure an academic year in Settings first.
        </div>
      ) : filteredStudents.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-sm text-gray-400">No students found.</div>
      ) : (
        <div className="flex-1 min-h-0 bg-white rounded-lg border border-gray-200 shadow-sm overflow-auto flex flex-col">
          <table className="min-w-full divide-y divide-gray-200 text-xs">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap w-8">#</th>
                <th className="px-3 py-2 text-center font-semibold text-gray-600 whitespace-nowrap w-14">
                  <div className="flex items-center justify-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={allFilteredPaid}
                      ref={(el) => { if (el) el.indeterminate = !allFilteredPaid && someFilteredPaid; }}
                      onChange={toggleSelectAll}
                      className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 cursor-pointer focus:ring-blue-500"
                      title="Toggle all filtered"
                    />
                    <span>Paid</span>
                  </div>
                </th>
                <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">Name (SSLC)</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap w-24">Reg No</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap w-14">Course</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap w-20">Year</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap w-14">Gender</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap w-20">Adm Type</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap w-16">Adm Cat</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap w-24">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredStudents.map((student: Student, idx) => {
                const isPaid = paidMap[student.id] ?? false;
                const isSavedDifferent = (savedMap[student.id] ?? false) !== isPaid;
                return (
                  <tr
                    key={student.id}
                    className={`transition-colors cursor-pointer select-none ${
                      isPaid
                        ? 'bg-green-50 hover:bg-green-100'
                        : isSavedDifferent
                        ? 'bg-orange-50 hover:bg-orange-100'
                        : 'hover:bg-gray-50'
                    }`}
                    onClick={() => togglePaid(student.id)}
                  >
                    <td className="px-3 py-2 text-gray-400 whitespace-nowrap">{idx + 1}</td>
                    <td className="px-3 py-2 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isPaid}
                        onChange={() => togglePaid(student.id)}
                        className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 cursor-pointer focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">
                      {student.studentNameSSLC}
                      {isSavedDifferent && (
                        <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-orange-400 align-middle" title="Unsaved change" />
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{student.regNumber || '—'}</td>
                    <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{student.course}</td>
                    <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{student.year}</td>
                    <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{student.gender}</td>
                    <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{student.admType || '—'}</td>
                    <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{student.admCat || '—'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                          student.admissionStatus === 'CONFIRMED'
                            ? 'bg-green-100 text-green-700'
                            : student.admissionStatus === 'CANCELLED'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-yellow-100 text-yellow-700'
                        }`}
                      >
                        {student.admissionStatus || '—'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="px-3 py-2 border-t border-gray-100 text-xs text-gray-500 mt-auto flex items-center justify-between">
            <span>
              {filteredStudents.length} student{filteredStudents.length !== 1 ? 's' : ''}
              {filteredStudents.length < allStudents.length && (
                <span className="text-gray-400"> (filtered from {allStudents.length} total)</span>
              )}
            </span>
            {isDirty && (
              <span className="text-orange-500 font-medium">Unsaved changes — click Save Changes to persist</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
