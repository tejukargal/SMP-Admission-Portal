import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../hooks/useSettings';
import { useStudents } from '../hooks/useStudents';
import { useFeeRecords } from '../hooks/useFeeRecords';
import { useFeeOverrides } from '../hooks/useFeeOverrides';
import { getFeeStructuresByAcademicYear } from '../services/feeStructureService';
import { subscribeToNotices, createNotice, updateNotice, deleteNotice, publishNotice, unpublishNotice, markNoticeInactive, markNoticeActive } from '../services/noticeService';
import {
  getAllStudentMessages,
  resolveStudentMessage,
  deleteStudentMessage,
  bulkResolveStudentMessages,
  bulkDeleteStudentMessages,
} from '../services/studentMessageService';
import { subscribeToStudentLoginActivity } from '../services/studentLoginActivityService';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { Select } from '../components/common/Select';
import { FilterDropdown } from '../components/common/FilterDropdown';
import { StudentPickerTable } from '../components/messages/StudentPickerTable';
import type { PickerRow, FeeStatusValue } from '../components/messages/StudentPickerTable';
import { ActiveUsersModal } from '../components/messages/ActiveUsersModal';
import { SMP_FEE_HEADS } from '../types';
import type {
  Notice, NoticeCategory, StudentMessage, StudentLoginActivity,
  Course, Year, Gender, Category, AdmType, AdmCat, AcademicYear, FeeStructure,
} from '../types';

const CATEGORY_OPTIONS: { value: NoticeCategory; label: string }[] = [
  { value: 'fee', label: 'Fee Reminder' },
  { value: 'document', label: 'Document Submission' },
  { value: 'general', label: 'General' },
];

const LEGACY_SCOPE_LABEL: Record<string, string> = {
  all: 'All Students',
  academicYear: 'Academic Year',
  course: 'Course',
  regNumber: 'One Student (Reg No)',
};

const COURSES: Course[] = ['CE', 'ME', 'EC', 'CS', 'EE'];
const YEARS: Year[] = ['1ST YEAR', '2ND YEAR', '3RD YEAR'];

const FEE_STATUS_OPTIONS: { value: FeeStatusValue; label: string }[] = [
  { value: 'paid', label: 'Paid' },
  { value: 'not-paid', label: 'Not Paid' },
  { value: 'has-dues', label: 'Has Dues' },
  { value: 'no-dues', label: 'No Dues' },
];

function matchesFeeFilter(row: PickerRow, filter: FeeStatusValue | ''): boolean {
  if (!filter) return true;
  if (row.balance === null) return false;
  if (filter === 'paid') return row.paid > 0 && row.balance <= 0;
  if (filter === 'not-paid') return row.paid === 0;
  if (filter === 'has-dues') return row.balance > 0;
  if (filter === 'no-dues') return row.balance <= 0;
  return true;
}

export function StudentMessages() {
  const { user } = useAuth();
  const { settings } = useSettings();
  const academicYear = (settings?.currentAcademicYear ?? null) as AcademicYear | null;
  const [tab, setTab] = useState<'compose' | 'sent' | 'inbox'>('compose');

  // ── Notices tab: recipient data ─────────────────────────────────────────────
  const { students: allStudents, loading: studentsLoading } = useStudents(academicYear);
  const { records: feeRecords } = useFeeRecords(academicYear);
  const { overrides: feeOverrides } = useFeeOverrides(academicYear);
  const [feeStructures, setFeeStructures] = useState<FeeStructure[]>([]);

  useEffect(() => {
    if (!academicYear) { setFeeStructures([]); return; }
    getFeeStructuresByAcademicYear(academicYear).then(setFeeStructures).catch(() => {});
  }, [academicYear]);

  const overrideByStudent = useMemo(
    () => new Map(feeOverrides.map((o) => [o.studentId, o])),
    [feeOverrides],
  );

  const { smpAllottedNoFineByKey, structureFineByKey, svkAllottedByKey } = useMemo(() => {
    const smpNoFineMap = new Map<string, number>();
    const fineMap      = new Map<string, number>();
    const svkMap       = new Map<string, number>();
    for (const s of feeStructures) {
      const key = `${s.course}__${s.year}__${s.admType}__${s.admCat}`;
      smpNoFineMap.set(key, SMP_FEE_HEADS.reduce((t, { key: k }) => t + (k === 'fine' ? 0 : s.smp[k]), 0));
      fineMap.set(key, s.smp.fine);
      svkMap.set(key, s.svk + s.additionalHeads.reduce((t, h) => t + h.amount, 0));
    }
    return { smpAllottedNoFineByKey: smpNoFineMap, structureFineByKey: fineMap, svkAllottedByKey: svkMap };
  }, [feeStructures]);

  const { smpPaidByStudent, svkPaidByStudent, finePaidByStudent } = useMemo(() => {
    const smpMap  = new Map<string, number>();
    const svkMap  = new Map<string, number>();
    const fineMap = new Map<string, number>();
    for (const r of feeRecords) {
      const smpTotal = SMP_FEE_HEADS.reduce((t, { key }) => t + r.smp[key], 0);
      const svkTotal = r.svk + r.additionalPaid.reduce((t, h) => t + h.amount, 0);
      smpMap.set(r.studentId,  (smpMap.get(r.studentId)  ?? 0) + smpTotal);
      svkMap.set(r.studentId,  (svkMap.get(r.studentId)  ?? 0) + svkTotal);
      fineMap.set(r.studentId, (fineMap.get(r.studentId) ?? 0) + r.smp.fine);
    }
    return { smpPaidByStudent: smpMap, svkPaidByStudent: svkMap, finePaidByStudent: fineMap };
  }, [feeRecords]);

  const allRows = useMemo((): PickerRow[] =>
    allStudents.map((s) => {
      const override = overrideByStudent.get(s.id);
      const key      = `${s.course}__${s.year}__${s.admType}__${s.admCat}`;
      const finePaid = finePaidByStudent.get(s.id) ?? 0;

      let smpAllotted: number | null;
      let svkAllotted: number | null;

      if (override) {
        const effFine   = Math.max(override.smp.fine, finePaid);
        const smpNoFine = SMP_FEE_HEADS.reduce((t, { key: k }) => t + (k === 'fine' ? 0 : override.smp[k]), 0);
        smpAllotted = smpNoFine + effFine;
        svkAllotted = override.svk + override.additionalHeads.reduce((t, h) => t + h.amount, 0);
      } else {
        const smpNoFine  = smpAllottedNoFineByKey.has(key) ? smpAllottedNoFineByKey.get(key)! : null;
        const structFine = structureFineByKey.get(key) ?? 0;
        const effFine    = Math.max(structFine, finePaid);
        smpAllotted = smpNoFine !== null ? smpNoFine + effFine : null;
        svkAllotted = svkAllottedByKey.has(key) ? svkAllottedByKey.get(key)! : null;
      }

      const allotted = smpAllotted !== null ? smpAllotted + (svkAllotted ?? 0) : null;
      const paid     = (smpPaidByStudent.get(s.id) ?? 0) + (svkPaidByStudent.get(s.id) ?? 0);
      const balance  = allotted !== null ? allotted - paid : null;
      return { student: s, balance, paid };
    }),
    [allStudents, overrideByStudent, smpAllottedNoFineByKey, structureFineByKey,
     svkAllottedByKey, smpPaidByStudent, svkPaidByStudent, finePaidByStudent],
  );

  // ── Notices tab: filters + search + selection ───────────────────────────────
  const [courseFilter, setCourseFilter] = useState<Course | ''>('');
  const [yearFilter, setYearFilter] = useState<Year | ''>('');
  const [genderFilter, setGenderFilter] = useState<Gender | ''>('');
  const [categoryFilter, setCategoryFilter] = useState<Category | ''>('');
  const [admTypeFilter, setAdmTypeFilter] = useState<AdmType | ''>('');
  const [admCatFilter, setAdmCatFilter] = useState<AdmCat | ''>('');
  const [feeStatusFilter, setFeeStatusFilter] = useState<FeeStatusValue | ''>('');
  const [pickerSearch, setPickerSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const filteredRows = useMemo(() => {
    let rows = allRows.filter((r) => r.student.admissionStatus === 'CONFIRMED');
    if (courseFilter)     rows = rows.filter((r) => r.student.course === courseFilter);
    if (yearFilter)       rows = rows.filter((r) => r.student.year === yearFilter);
    if (genderFilter)     rows = rows.filter((r) => r.student.gender === genderFilter);
    if (categoryFilter)   rows = rows.filter((r) => r.student.category === categoryFilter);
    if (admTypeFilter)    rows = rows.filter((r) => r.student.admType === admTypeFilter);
    if (admCatFilter)     rows = rows.filter((r) => r.student.admCat === admCatFilter);
    if (feeStatusFilter)  rows = rows.filter((r) => matchesFeeFilter(r, feeStatusFilter));
    if (pickerSearch.trim()) {
      const q = pickerSearch.trim().toUpperCase();
      rows = rows.filter((r) =>
        r.student.studentNameSSLC.toUpperCase().includes(q) ||
        r.student.regNumber?.toUpperCase().includes(q) ||
        r.student.studentMobile?.includes(q));
    }
    return rows;
  }, [allRows, courseFilter, yearFilter, genderFilter, categoryFilter, admTypeFilter, admCatFilter, feeStatusFilter, pickerSearch]);

  // Default: everything currently matching filters+search is selected.
  useEffect(() => {
    setSelected(new Set(filteredRows.map((r) => r.student.id)));
  }, [courseFilter, yearFilter, genderFilter, categoryFilter, admTypeFilter, admCatFilter, feeStatusFilter, pickerSearch, academicYear]);

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    const allChecked = filteredRows.length > 0 && filteredRows.every((r) => selected.has(r.student.id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allChecked) filteredRows.forEach((r) => next.delete(r.student.id));
      else filteredRows.forEach((r) => next.add(r.student.id));
      return next;
    });
  }

  const selectedRows = useMemo(
    () => filteredRows.filter((r) => selected.has(r.student.id)),
    [filteredRows, selected],
  );

  function clearAudienceFilters() {
    setCourseFilter(''); setYearFilter(''); setGenderFilter('');
    setCategoryFilter(''); setAdmTypeFilter(''); setAdmCatFilter('');
    setFeeStatusFilter(''); setPickerSearch('');
  }

  function buildAudienceLabel(count: number): string {
    const parts: string[] = [];
    if (courseFilter) parts.push(courseFilter);
    if (yearFilter) parts.push(yearFilter);
    if (genderFilter) parts.push(genderFilter);
    if (categoryFilter) parts.push(categoryFilter);
    if (admTypeFilter) parts.push(admTypeFilter);
    if (admCatFilter) parts.push(admCatFilter);
    if (feeStatusFilter) parts.push(FEE_STATUS_OPTIONS.find((o) => o.value === feeStatusFilter)?.label ?? '');
    const prefix = parts.length > 0 ? parts.join(' · ') : 'All Students';
    return `${prefix} (${count} student${count !== 1 ? 's' : ''})`;
  }

  // ── Notices tab: composer + list ────────────────────────────────────────────
  const [notices, setNotices] = useState<Notice[]>([]);
  const [noticesLoading, setNoticesLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState<NoticeCategory>('general');
  const [posting, setPosting] = useState(false);
  const [confirmSend, setConfirmSend] = useState(false);

  // Edit an already-sent notice (title/body/category only — audience stays fixed)
  const [editingNotice, setEditingNotice] = useState<Notice | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editBody, setEditBody] = useState('');
  const [editCategory, setEditCategory] = useState<NoticeCategory>('general');
  const [editSaving, setEditSaving] = useState(false);

  function startEditNotice(n: Notice) {
    setEditingNotice(n);
    setEditTitle(n.title);
    setEditBody(n.body);
    setEditCategory(n.category);
  }

  async function handleSaveEditNotice() {
    if (!editingNotice || !editTitle.trim() || !editBody.trim()) return;
    setEditSaving(true);
    try {
      await updateNotice(editingNotice.id, { title: editTitle.trim(), body: editBody.trim(), category: editCategory });
      setEditingNotice(null);
    } finally {
      setEditSaving(false);
    }
  }

  // Publish/Unpublish toggle — unpublishing hides the notice from all students but keeps
  // the doc for admin review (not a hard delete); publishing makes it visible again.
  const [togglingId, setTogglingId] = useState<string | null>(null);
  async function handleTogglePublish(n: Notice) {
    setTogglingId(n.id);
    try {
      if (n.archivedAt) await publishNotice(n.id);
      else await unpublishNotice(n.id);
    } finally {
      setTogglingId(null);
    }
  }

  // Active/Inactive toggle — marking a notice "finished" keeps it visible to students
  // (unlike Publish/Unpublish, which hides it) but labels it Inactive and sorts it
  // below Active notices, both here and in the student portal's Notices tab.
  const [togglingActiveId, setTogglingActiveId] = useState<string | null>(null);
  async function handleToggleActive(n: Notice) {
    setTogglingActiveId(n.id);
    try {
      if (n.inactiveAt) await markNoticeActive(n.id);
      else await markNoticeInactive(n.id);
    } finally {
      setTogglingActiveId(null);
    }
  }

  // Sent list — Active notices first (newest first within each group), Inactive below.
  const sortedNotices = useMemo(
    () => [...notices].sort((a, b) => {
      if (!!a.inactiveAt !== !!b.inactiveAt) return a.inactiveAt ? 1 : -1;
      return b.createdAt.localeCompare(a.createdAt);
    }),
    [notices],
  );

  // ── Active Users (live) ─────────────────────────────────────────────────────
  const [loginActivity, setLoginActivity] = useState<StudentLoginActivity[]>([]);
  const [loginActivityLoading, setLoginActivityLoading] = useState(true);
  const [showActiveUsers, setShowActiveUsers] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeToStudentLoginActivity((all) => {
      setLoginActivity(all);
      setLoginActivityLoading(false);
    });
    return unsubscribe;
  }, []);

  const onlineCount = useMemo(
    () => loginActivity.filter((a) => a.online).length,
    [loginActivity],
  );

  async function handlePostNotice() {
    if (!title.trim() || !body.trim() || !user || selectedRows.length === 0) return;
    setConfirmSend(false);
    setPosting(true);
    try {
      const targetRegNumbers = selectedRows.map((r) => r.student.regNumber).filter(Boolean);
      await createNotice({
        title: title.trim(),
        body: body.trim(),
        category,
        scope: 'selected',
        targetRegNumbers,
        audienceLabel: buildAudienceLabel(selectedRows.length),
        createdBy: user.uid,
      });
      setTitle(''); setBody('');
    } finally {
      setPosting(false);
    }
  }

  // ── Inbox tab ────────────────────────────────────────────────────────────────
  const [messages, setMessages] = useState<StudentMessage[]>([]);
  const [inboxLoading, setInboxLoading] = useState(true);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [inboxFilter, setInboxFilter] = useState<'all' | 'open' | 'resolved'>('all');
  const [inboxSearch, setInboxSearch] = useState('');
  const [inboxSelected, setInboxSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

  function loadInbox() {
    setInboxLoading(true);
    getAllStudentMessages().then(setMessages).finally(() => setInboxLoading(false));
  }

  useEffect(() => {
    const unsubscribe = subscribeToNotices((all) => {
      setNotices(all);
      setNoticesLoading(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => { loadInbox(); }, []);

  async function handleResolve(id: string) {
    await resolveStudentMessage(id, replyDrafts[id] ?? '');
    loadInbox();
  }

  async function handleDeleteOne(id: string) {
    await deleteStudentMessage(id);
    loadInbox();
  }

  const filteredMessages = useMemo(() => {
    let rows = messages;
    if (inboxFilter !== 'all') rows = rows.filter((m) => m.status === inboxFilter);
    if (inboxSearch.trim()) {
      const q = inboxSearch.trim().toUpperCase();
      rows = rows.filter((m) =>
        m.studentName.toUpperCase().includes(q) ||
        m.regNumber.toUpperCase().includes(q) ||
        m.message.toUpperCase().includes(q));
    }
    return rows;
  }, [messages, inboxFilter, inboxSearch]);

  function toggleInboxRow(id: string) {
    setInboxSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleInboxAll() {
    const allChecked = filteredMessages.length > 0 && filteredMessages.every((m) => inboxSelected.has(m.id));
    setInboxSelected((prev) => {
      const next = new Set(prev);
      if (allChecked) filteredMessages.forEach((m) => next.delete(m.id));
      else filteredMessages.forEach((m) => next.add(m.id));
      return next;
    });
  }

  async function handleBulkResolve() {
    setBulkBusy(true);
    try {
      await bulkResolveStudentMessages([...inboxSelected]);
      setInboxSelected(new Set());
      loadInbox();
    } finally {
      setBulkBusy(false);
    }
  }
  async function handleBulkDelete() {
    setConfirmBulkDelete(false);
    setBulkBusy(true);
    try {
      await bulkDeleteStudentMessages([...inboxSelected]);
      setInboxSelected(new Set());
      loadInbox();
    } finally {
      setBulkBusy(false);
    }
  }

  const openCount = messages.filter((m) => m.status === 'open').length;

  return (
    <div className="h-full flex flex-col gap-3" style={{ animation: 'page-enter 0.22s ease-out' }}>
      <div className="flex-shrink-0 flex items-center gap-3">
        <h2 className="text-xl font-black text-gray-800 leading-tight tracking-tight">Student Messages</h2>
        <button
          onClick={() => setShowActiveUsers(true)}
          className="flex items-center gap-1.5 rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 transition-colors cursor-pointer"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          Active Users
          {!loginActivityLoading && (
            <span className="rounded-full bg-emerald-100 text-emerald-700 text-[10px] px-1.5">{onlineCount}</span>
          )}
        </button>
        <div className="flex items-center gap-1.5 ml-auto">
          <button
            onClick={() => setTab('compose')}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${tab === 'compose' ? 'bg-emerald-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
          >
            Compose
          </button>
          <button
            onClick={() => setTab('sent')}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${tab === 'sent' ? 'bg-emerald-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
          >
            Sent {notices.length > 0 && <span className="rounded-full bg-gray-200 text-gray-600 text-[10px] px-1.5">{notices.length}</span>}
          </button>
          <button
            onClick={() => setTab('inbox')}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${tab === 'inbox' ? 'bg-emerald-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
          >
            Inbox {openCount > 0 && <span className="rounded-full bg-red-500 text-white text-[10px] px-1.5">{openCount}</span>}
          </button>
        </div>
      </div>

      {tab === 'compose' ? (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="space-y-3">
            {/* Audience filters */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-bold text-gray-900">1 · Choose Audience</h3>
                <button onClick={clearAudienceFilters} className="text-[11px] text-amber-600 hover:text-amber-800 font-semibold cursor-pointer">Clear filters</button>
              </div>

              {/* Toolbar — mirrors Students page filter bar */}
              <div
                className="rounded-2xl border border-emerald-100 overflow-hidden mb-2.5"
                style={{ background: 'linear-gradient(160deg, #f4fdf9 0%, #f8fafc 45%, #f0fdf6 100%)', boxShadow: '0 1px 4px 0 rgba(16,185,129,0.08)' }}
              >
                <div className="flex items-center gap-2 px-3 py-2 flex-wrap">
                  {/* Search — rounded-full with icon + amber clear */}
                  <div className="relative shrink-0 w-52">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-emerald-400 pointer-events-none" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                      <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
                    </svg>
                    <input
                      type="text"
                      placeholder="Search name / reg / mobile…"
                      value={pickerSearch}
                      onChange={(e) => setPickerSearch(e.target.value)}
                      className={`w-full rounded-full border border-emerald-300 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-400/50 focus:border-emerald-500 bg-white shadow-sm text-gray-800 placeholder:text-gray-400 placeholder:font-normal transition-all duration-150 pl-8 ${pickerSearch ? 'pr-8' : 'pr-3'}`}
                    />
                    {pickerSearch && (
                      <button
                        type="button"
                        onClick={() => setPickerSearch('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full bg-amber-400 hover:bg-amber-500 text-white transition-colors duration-150 shrink-0"
                        aria-label="Clear search"
                      >
                        <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                          <path d="M1 1l6 6M7 1L1 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                        </svg>
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                    <FilterDropdown<Course | ''> value={courseFilter} onChange={setCourseFilter} placeholder="Course"
                      options={COURSES.map((c) => ({ value: c, label: c }))} />
                    <FilterDropdown<Year | ''> value={yearFilter} onChange={setYearFilter} placeholder="Year"
                      options={YEARS.map((y) => ({ value: y, label: y }))} />
                    <FilterDropdown<Gender | ''> value={genderFilter} onChange={setGenderFilter} placeholder="Gender"
                      options={[{ value: 'BOY', label: 'BOY' }, { value: 'GIRL', label: 'GIRL' }]} />
                    <FilterDropdown<Category | ''> value={categoryFilter} onChange={setCategoryFilter} placeholder="Cat"
                      options={['GM', 'SC', 'ST', 'C1', '2A', '2B', '3A', '3B'].map((c) => ({ value: c as Category, label: c }))} />
                    <FilterDropdown<AdmType | ''> value={admTypeFilter} onChange={setAdmTypeFilter} placeholder="Adm Type"
                      options={['REGULAR', 'REPEATER', 'LATERAL', 'EXTERNAL'].map((v) => ({ value: v as AdmType, label: v }))} />
                    <FilterDropdown<AdmCat | ''> value={admCatFilter} onChange={setAdmCatFilter} placeholder="Adm Cat"
                      options={['GM', 'SNQ', 'OTHERS'].map((v) => ({ value: v as AdmCat, label: v }))} />
                    <FilterDropdown<FeeStatusValue | ''> value={feeStatusFilter} onChange={setFeeStatusFilter} placeholder="Fee Status"
                      options={FEE_STATUS_OPTIONS} />
                  </div>
                </div>
              </div>

              {studentsLoading ? (
                <div className="text-xs text-gray-400 py-6 text-center">Loading students…</div>
              ) : (
                <>
                  <StudentPickerTable rows={filteredRows} selected={selected} onToggle={toggleRow} onToggleAll={toggleAll} />
                  <p className="mt-2 text-xs text-gray-600">
                    <span className="font-semibold text-emerald-700">{selectedRows.length}</span> of {filteredRows.length} matched student{filteredRows.length !== 1 ? 's' : ''} selected
                    {allStudents.length > 0 && filteredRows.length !== allStudents.length && (
                      <span className="text-gray-400"> ({allStudents.length} total in {academicYear})</span>
                    )}
                  </p>
                </>
              )}
            </div>

            {/* Composer */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 max-w-2xl">
              <h3 className="text-sm font-bold text-gray-900 mb-3">2 · Compose & Send</h3>
              <div className="space-y-3">
                <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Pending Fee Reminder" />
                <div>
                  <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Body</label>
                  <textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    rows={4}
                    className="mt-1 block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 resize-none"
                  />
                </div>
                <Select label="Category" value={category} onChange={(e) => setCategory(e.target.value as NoticeCategory)} options={CATEGORY_OPTIONS} />
                <Button
                  onClick={() => setConfirmSend(true)}
                  loading={posting}
                  disabled={!title.trim() || !body.trim() || selectedRows.length === 0}
                  className="w-full"
                >
                  Send to {selectedRows.length} student{selectedRows.length !== 1 ? 's' : ''}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : tab === 'sent' ? (
        <div className="flex-1 min-h-0 overflow-y-auto space-y-2.5 max-w-3xl">
          {noticesLoading ? (
            <div className="text-sm text-gray-400 text-center py-10">Loading…</div>
          ) : sortedNotices.length === 0 ? (
            <div className="text-sm text-gray-400 text-center py-10">No notices posted yet.</div>
          ) : sortedNotices.map((n) => (
            <div key={n.id} className={`bg-white rounded-2xl border shadow-sm p-4 ${n.archivedAt || n.inactiveAt ? 'border-gray-100 opacity-60' : 'border-gray-100'}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1.5 flex-wrap">
                  {CATEGORY_OPTIONS.find((o) => o.value === n.category)?.label} ·{' '}
                  {n.scope === 'selected'
                    ? (n.audienceLabel ?? `${n.targetRegNumbers?.length ?? 0} students`)
                    : `${LEGACY_SCOPE_LABEL[n.scope] ?? n.scope}${n.scopeValue ? `: ${n.scopeValue}` : ''}`}
                  <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${n.archivedAt ? 'bg-gray-100 text-gray-500' : 'bg-emerald-100 text-emerald-700'}`}>
                    {n.archivedAt ? 'Unpublished' : 'Published'}
                  </span>
                  <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${n.inactiveAt ? 'bg-gray-200 text-gray-500' : 'bg-sky-100 text-sky-700'}`}>
                    {n.inactiveAt ? 'Inactive' : 'Active'}
                  </span>
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => startEditNotice(n)} className="text-xs text-blue-500 hover:text-blue-700 font-semibold cursor-pointer">Edit</button>
                  <button
                    onClick={() => void handleToggleActive(n)}
                    disabled={togglingActiveId === n.id}
                    className={`text-xs font-semibold cursor-pointer disabled:opacity-50 ${n.inactiveAt ? 'text-sky-600 hover:text-sky-800' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    {n.inactiveAt ? 'Mark as Active' : 'Mark as In-Active'}
                  </button>
                  <button
                    onClick={() => void handleTogglePublish(n)}
                    disabled={togglingId === n.id}
                    className={`text-xs font-semibold cursor-pointer disabled:opacity-50 ${n.archivedAt ? 'text-emerald-600 hover:text-emerald-800' : 'text-amber-600 hover:text-amber-800'}`}
                  >
                    {n.archivedAt ? 'Publish' : 'Unpublish'}
                  </button>
                  <button onClick={() => void deleteNotice(n.id)} className="text-xs text-red-500 hover:text-red-700 font-semibold cursor-pointer">Delete</button>
                </div>
              </div>
              <p className="text-[10px] text-gray-400 mt-1">
                {new Date(n.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                {n.updatedAt && ' · edited'}
              </p>
              <h4 className="text-sm font-bold text-gray-900 mt-1">{n.title}</h4>
              <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{n.body}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col gap-2.5">
          {/* Inbox toolbar */}
          <div className="flex-shrink-0 flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1">
              {(['all', 'open', 'resolved'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setInboxFilter(f)}
                  className={`rounded-full px-3 py-1 text-[11px] font-semibold capitalize cursor-pointer transition-colors ${inboxFilter === f ? 'bg-emerald-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                >
                  {f}
                </button>
              ))}
            </div>
            <input
              type="text"
              placeholder="Search name / reg no / message…"
              value={inboxSearch}
              onChange={(e) => setInboxSearch(e.target.value)}
              className="flex-1 min-w-[180px] rounded-lg border border-gray-200 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400"
            />
            {filteredMessages.length > 0 && (
              <label className="flex items-center gap-1.5 text-[11px] text-gray-500 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filteredMessages.length > 0 && filteredMessages.every((m) => inboxSelected.has(m.id))}
                  onChange={toggleInboxAll}
                  className="cursor-pointer"
                />
                Select all
              </label>
            )}
            {inboxSelected.size > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-gray-500">{inboxSelected.size} selected</span>
                <Button size="sm" variant="secondary" disabled={bulkBusy} onClick={() => void handleBulkResolve()}>Mark Resolved</Button>
                <Button size="sm" variant="danger" disabled={bulkBusy} onClick={() => setConfirmBulkDelete(true)}>Delete</Button>
              </div>
            )}
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto space-y-2.5">
            {inboxLoading ? (
              <div className="text-sm text-gray-400 text-center py-10">Loading…</div>
            ) : filteredMessages.length === 0 ? (
              <div className="text-sm text-gray-400 text-center py-10">No student messages found.</div>
            ) : filteredMessages.map((m) => (
              <div key={m.id} className={`bg-white rounded-2xl border shadow-sm p-4 ${inboxSelected.has(m.id) ? 'border-emerald-300' : 'border-gray-100'}`}>
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={inboxSelected.has(m.id)} onChange={() => toggleInboxRow(m.id)} className="cursor-pointer" />
                  <span className="text-sm font-bold text-gray-900">{m.studentName} <span className="text-gray-400 font-normal">({m.regNumber})</span></span>
                  <span className={`ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full ${m.status === 'resolved' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                    {m.status === 'resolved' ? 'Resolved' : 'Open'}
                  </span>
                  <button onClick={() => void handleDeleteOne(m.id)} className="text-[11px] text-red-500 hover:text-red-700 font-semibold cursor-pointer">Delete</button>
                </div>
                <p className="text-xs text-gray-400 mt-0.5 ml-6">{m.category}</p>
                <p className="text-sm text-gray-700 mt-1.5 ml-6 whitespace-pre-wrap">{m.message}</p>
                {m.status === 'open' ? (
                  <div className="mt-2.5 ml-6 flex items-center gap-2">
                    <input
                      value={replyDrafts[m.id] ?? ''}
                      onChange={(e) => setReplyDrafts((prev) => ({ ...prev, [m.id]: e.target.value }))}
                      placeholder="Optional reply…"
                      className="flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                    />
                    <Button size="sm" onClick={() => void handleResolve(m.id)}>Mark Resolved</Button>
                  </div>
                ) : m.adminReply ? (
                  <div className="mt-2 ml-6 pt-2 border-t border-gray-100">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">Your Reply</p>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{m.adminReply}</p>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Edit a sent notice */}
      {editingNotice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setEditingNotice(null)} aria-hidden="true" />
          <div className="relative bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-5 space-y-3">
            <h3 className="text-sm font-semibold text-gray-900">Edit Notice</h3>
            <p className="text-[11px] text-gray-400">
              Recipients: {editingNotice.scope === 'selected'
                ? (editingNotice.audienceLabel ?? `${editingNotice.targetRegNumbers?.length ?? 0} students`)
                : `${LEGACY_SCOPE_LABEL[editingNotice.scope] ?? editingNotice.scope}${editingNotice.scopeValue ? `: ${editingNotice.scopeValue}` : ''}`} (unchanged)
            </p>
            <Input label="Title" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
            <div>
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Body</label>
              <textarea
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
                rows={4}
                className="mt-1 block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 resize-none"
              />
            </div>
            <Select label="Category" value={editCategory} onChange={(e) => setEditCategory(e.target.value as NoticeCategory)} options={CATEGORY_OPTIONS} />
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setEditingNotice(null)} className="px-3 py-1.5 text-xs border border-gray-300 rounded text-gray-700 hover:bg-gray-50 cursor-pointer">Cancel</button>
              <Button size="sm" loading={editSaving} disabled={!editTitle.trim() || !editBody.trim()} onClick={() => void handleSaveEditNotice()}>Save Changes</Button>
            </div>
          </div>
        </div>
      )}

      {showActiveUsers && (
        <ActiveUsersModal activity={loginActivity} loading={loginActivityLoading} onClose={() => setShowActiveUsers(false)} />
      )}

      {/* Confirm: send notice */}
      {confirmSend && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setConfirmSend(false)} aria-hidden="true" />
          <div className="relative bg-white rounded-lg shadow-xl w-full max-w-sm mx-4 p-5 space-y-4">
            <h3 className="text-sm font-semibold text-gray-900">Confirm Send</h3>
            <p className="text-sm text-gray-600">
              Send this notice to <span className="font-semibold text-emerald-700">{selectedRows.length} student{selectedRows.length !== 1 ? 's' : ''}</span>?
            </p>
            <div className="bg-gray-50 rounded border border-gray-200 px-3 py-2 text-xs text-gray-700">
              <p className="font-semibold">{title}</p>
              <p className="mt-1 whitespace-pre-wrap">{body.slice(0, 200)}{body.length > 200 ? '…' : ''}</p>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setConfirmSend(false)} className="px-3 py-1.5 text-xs border border-gray-300 rounded text-gray-700 hover:bg-gray-50 cursor-pointer">Cancel</button>
              <button onClick={() => void handlePostNotice()} className="px-3 py-1.5 text-xs rounded bg-emerald-600 text-white font-semibold hover:bg-emerald-700 cursor-pointer">Yes, Send</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm: bulk delete inbox messages */}
      {confirmBulkDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setConfirmBulkDelete(false)} aria-hidden="true" />
          <div className="relative bg-white rounded-lg shadow-xl w-full max-w-sm mx-4 p-5 space-y-4">
            <h3 className="text-sm font-semibold text-gray-900">Delete Messages</h3>
            <p className="text-sm text-gray-600">
              Delete <span className="font-semibold text-red-600">{inboxSelected.size} message{inboxSelected.size !== 1 ? 's' : ''}</span>? This cannot be undone.
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setConfirmBulkDelete(false)} className="px-3 py-1.5 text-xs border border-gray-300 rounded text-gray-700 hover:bg-gray-50 cursor-pointer">Cancel</button>
              <button onClick={() => void handleBulkDelete()} className="px-3 py-1.5 text-xs rounded bg-red-500 text-white font-semibold hover:bg-red-600 cursor-pointer">Yes, Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
