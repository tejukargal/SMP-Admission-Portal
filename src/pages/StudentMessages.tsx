import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../hooks/useSettings';
import { useStudents } from '../hooks/useStudents';
import { useFeeRecords } from '../hooks/useFeeRecords';
import { useFeeOverrides } from '../hooks/useFeeOverrides';
import { getFeeStructuresByAcademicYear } from '../services/feeStructureService';
import { subscribeToNotices, updateNotice, deleteNotice, publishNotice, unpublishNotice, markNoticeInactive, markNoticeActive, pinNotice, unpinNotice, generateNoticeDraft } from '../services/noticeService';
import type { CircularAiProvider, CircularAiLanguage } from '../services/circularService';
import { createNoticeWithAttachments } from '../services/noticeAttachmentService';
import { RichTextEditor } from '../components/circulars/RichTextEditor';
import { stripHtml, noticeBodyToHtml } from '../utils/htmlContent';
import {
  getAllStudentMessages,
  resolveStudentMessage,
  deleteStudentMessage,
  bulkResolveStudentMessages,
  bulkDeleteStudentMessages,
} from '../services/studentMessageService';
import { subscribeToStudentLoginActivity } from '../services/studentLoginActivityService';
import {
  CYAN, CYAN_INK, HAIRLINE, BAND, MINT, CORAL, AMBER, MUTED, PAGE_BG,
  BTN_CYAN, TEXT_INPUT, FIELD_OVERRIDE, SELECT_PILL, MsgIcon,
  PillButton, FieldLabel, StatusPill, CountChip, SearchPill, Segmented, KebabButton, EmptyState, MsgModal,
} from '../components/messages/messagesUi';
import { Input } from '../components/common/Input';
import { Select } from '../components/common/Select';
import { MultiSelectFilterDropdown } from '../components/common/MultiSelectFilterDropdown';
import { StudentPickerTable } from '../components/messages/StudentPickerTable';
import type { PickerRow, FeeStatusValue } from '../components/messages/StudentPickerTable';
import { ActiveUsersModal } from '../components/messages/ActiveUsersModal';
import { AdminCircularsTab } from '../components/circulars/AdminCircularsTab';
import { AttachmentDropzone } from '../components/circulars/AttachmentDropzone';
import { CardContextMenu } from '../components/common/CardContextMenu';
import { CardWatermark } from '../components/common/CardWatermark';
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

// Own keys (not the circular form's) so the admin's preferred provider/language
// for notices is remembered independently.
const AI_PROVIDER_KEY = 'smp-admissions:notice-ai-provider';
const AI_LANGUAGE_KEY = 'smp-admissions:notice-ai-language';

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
  const [tab, setTab] = useState<'compose' | 'sent' | 'inbox' | 'circulars'>('circulars');

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
  const [courseFilter, setCourseFilter] = useState<Course[]>([]);
  const [yearFilter, setYearFilter] = useState<Year[]>([]);
  const [genderFilter, setGenderFilter] = useState<Gender[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<Category[]>([]);
  const [admTypeFilter, setAdmTypeFilter] = useState<AdmType[]>([]);
  const [admCatFilter, setAdmCatFilter] = useState<AdmCat[]>([]);
  const [feeStatusFilter, setFeeStatusFilter] = useState<FeeStatusValue[]>([]);
  const [pickerSearch, setPickerSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const filteredRows = useMemo(() => {
    let rows = allRows.filter((r) => r.student.admissionStatus === 'CONFIRMED');
    if (courseFilter.length)     rows = rows.filter((r) => courseFilter.includes(r.student.course));
    if (yearFilter.length)       rows = rows.filter((r) => yearFilter.includes(r.student.year));
    if (genderFilter.length)     rows = rows.filter((r) => genderFilter.includes(r.student.gender));
    if (categoryFilter.length)   rows = rows.filter((r) => categoryFilter.includes(r.student.category));
    if (admTypeFilter.length)    rows = rows.filter((r) => admTypeFilter.includes(r.student.admType));
    if (admCatFilter.length)     rows = rows.filter((r) => admCatFilter.includes(r.student.admCat));
    if (feeStatusFilter.length)  rows = rows.filter((r) => feeStatusFilter.some((f) => matchesFeeFilter(r, f)));
    if (pickerSearch.trim()) {
      const q = pickerSearch.trim().toUpperCase();
      rows = rows.filter((r) =>
        r.student.studentNameSSLC.toUpperCase().includes(q) ||
        r.student.regNumber?.toUpperCase().includes(q) ||
        r.student.studentMobile?.includes(q));
    }
    return rows;
  }, [allRows, courseFilter, yearFilter, genderFilter, categoryFilter, admTypeFilter, admCatFilter, feeStatusFilter, pickerSearch]);

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
    setCourseFilter([]); setYearFilter([]); setGenderFilter([]);
    setCategoryFilter([]); setAdmTypeFilter([]); setAdmCatFilter([]);
    setFeeStatusFilter([]); setPickerSearch(''); setSelected(new Set());
  }

  function buildAudienceLabel(count: number): string {
    const parts: string[] = [];
    if (courseFilter.length) parts.push(courseFilter.join('/'));
    if (yearFilter.length) parts.push(yearFilter.join('/'));
    if (genderFilter.length) parts.push(genderFilter.join('/'));
    if (categoryFilter.length) parts.push(categoryFilter.join('/'));
    if (admTypeFilter.length) parts.push(admTypeFilter.join('/'));
    if (admCatFilter.length) parts.push(admCatFilter.join('/'));
    if (feeStatusFilter.length) {
      parts.push(feeStatusFilter.map((f) => FEE_STATUS_OPTIONS.find((o) => o.value === f)?.label ?? '').join('/'));
    }
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
  const [showComposeModal, setShowComposeModal] = useState(false);
  const [attachFiles, setAttachFiles] = useState<File[]>([]);
  // RichTextEditor only seeds its contentEditable HTML from `value` once, on
  // mount — bumping this key forces a clean remount so an AI-generated body (or
  // a fresh empty editor after Send) actually shows up, not just in `body` state.
  const [bodySeedVersion, setBodySeedVersion] = useState(0);
  const [bodySeed, setBodySeed] = useState('');
  const bodyHasText = stripHtml(body).trim() !== '';

  // ── Compose with AI ──────────────────────────────────────────────────────────
  const [brief, setBrief] = useState('');
  const [keyDates, setKeyDates] = useState('');
  const [aiProvider, setAiProvider] = useState<CircularAiProvider>(
    () => (localStorage.getItem(AI_PROVIDER_KEY) as CircularAiProvider) || 'claude',
  );
  const [aiLanguage, setAiLanguage] = useState<CircularAiLanguage>(
    () => (localStorage.getItem(AI_LANGUAGE_KEY) as CircularAiLanguage) || 'english',
  );
  const [composing, setComposing] = useState(false);
  const [composeError, setComposeError] = useState<string | null>(null);
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);

  function handleProviderChange(next: CircularAiProvider) {
    setAiProvider(next);
    localStorage.setItem(AI_PROVIDER_KEY, next);
  }

  function handleLanguageChange(next: CircularAiLanguage) {
    setAiLanguage(next);
    localStorage.setItem(AI_LANGUAGE_KEY, next);
  }

  async function runCompose() {
    setComposeError(null);
    setComposing(true);
    try {
      const draft = await generateNoticeDraft({
        brief: brief.trim(),
        keyDates: keyDates.trim() || undefined,
        provider: aiProvider,
        language: aiLanguage,
        audience: { count: selectedRows.length, label: buildAudienceLabel(selectedRows.length) },
      });
      setTitle(draft.title);
      if (draft.category) setCategory(draft.category);
      setBodySeed(draft.bodyHtml);
      setBodySeedVersion((v) => v + 1);
      setBody(draft.bodyHtml);
    } catch (e) {
      setComposeError(e instanceof Error ? e.message : 'Could not generate a draft. Please try again.');
    } finally {
      setComposing(false);
    }
  }

  function handleGenerateDraftClick() {
    if (title.trim() !== '' || bodyHasText) {
      setConfirmOverwrite(true);
      return;
    }
    void runCompose();
  }

  function resetComposer() {
    setTitle(''); setBody(''); setAttachFiles([]);
    setBodySeed(''); setBodySeedVersion((v) => v + 1);
    setBrief(''); setKeyDates('');
    setComposeError(null); setConfirmOverwrite(false);
  }

  // Edit an already-sent notice (title/body/category only — audience stays fixed)
  const [editingNotice, setEditingNotice] = useState<Notice | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editBody, setEditBody] = useState('');
  const [editCategory, setEditCategory] = useState<NoticeCategory>('general');
  const [editSaving, setEditSaving] = useState(false);
  // Same remount trick as the composer — a different notice needs a fresh editor.
  const [editSeedVersion, setEditSeedVersion] = useState(0);

  function startEditNotice(n: Notice) {
    setEditingNotice(n);
    setEditTitle(n.title);
    // Older notices are plain text — convert so the editor shows their line breaks.
    setEditBody(noticeBodyToHtml(n.body));
    setEditCategory(n.category);
    setEditSeedVersion((v) => v + 1);
  }

  async function handleSaveEditNotice() {
    if (!editingNotice || !editTitle.trim() || !stripHtml(editBody).trim()) return;
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

  // Pin/Unpin toggle — pinned notices show first in the student portal's Notices tab.
  const [pinningId, setPinningId] = useState<string | null>(null);
  async function handleTogglePin(n: Notice) {
    setPinningId(n.id);
    try {
      if (n.pinned) await unpinNotice(n.id);
      else await pinNotice(n.id);
    } finally {
      setPinningId(null);
    }
  }

  const [noticeMenu, setNoticeMenu] = useState<{ x: number; y: number; notice: Notice } | null>(null);

  // Sent list — Active notices first (newest first within each group, pinned ahead), Inactive below.
  const sortedNotices = useMemo(
    () => [...notices].sort((a, b) => {
      if (!!a.inactiveAt !== !!b.inactiveAt) return a.inactiveAt ? 1 : -1;
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
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
    if (!title.trim() || !bodyHasText || !user || selectedRows.length === 0) return;
    setConfirmSend(false);
    setPosting(true);
    try {
      const targetRegNumbers = selectedRows.map((r) => r.student.regNumber).filter(Boolean);
      await createNoticeWithAttachments({
        title: title.trim(),
        body: body.trim(),
        category,
        scope: 'selected',
        targetRegNumbers,
        audienceLabel: buildAudienceLabel(selectedRows.length),
        createdBy: user.uid,
      }, attachFiles);
      resetComposer();
      setShowComposeModal(false);
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


  const TAB_DEFS: { id: 'circulars' | 'compose' | 'sent' | 'inbox'; label: string; icon: ReactNode; count?: ReactNode }[] = [
    { id: 'circulars', label: 'Circulars', icon: <MsgIcon name="megaphone" /> },
    { id: 'compose', label: 'Compose', icon: <MsgIcon name="pen" /> },
    { id: 'sent', label: 'Sent', icon: <MsgIcon name="send" />, count: notices.length > 0 ? notices.length : null },
    { id: 'inbox', label: 'Inbox', icon: <MsgIcon name="inbox" />, count: openCount > 0 ? openCount : null },
  ];

  return (
    <div
      className="font-wp -m-4 p-4 h-[calc(100%+2rem)] flex flex-col gap-3"
      style={{ background: PAGE_BG, animation: 'page-enter 0.22s ease-out' }}
    >
      {/* Page header */}
      <div className="flex-shrink-0 flex items-end gap-3 flex-wrap min-w-0">
        <div className="shrink-0">
          <p className="text-[9px] font-medium uppercase tracking-[1px] text-[#8A93A3] leading-none">
            SMP Admissions · Student Messages
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            <h2 className="text-[22px] font-bold leading-none tracking-[-0.3px]" style={{ color: CYAN_INK }}>Student Messages</h2>
            {academicYear && (
              <span className="rounded-full border bg-white px-2.5 py-[4px] text-[10.5px] font-medium leading-none tabular-nums" style={{ borderColor: `${CYAN}66`, color: CYAN_INK }}>
                {academicYear}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={() => setShowActiveUsers(true)}
          className="ml-auto shrink-0 inline-flex items-center gap-2 rounded-full border bg-white px-3.5 py-1.5 text-[12px] font-medium transition-all hover:shadow-[0_4px_14px_rgba(15,169,104,0.15)] cursor-pointer"
          style={{ borderColor: `${MINT}55`, color: '#0A7A4B' }}
        >
          <span className="relative flex w-2 h-2">
            <span className="absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping" style={{ background: MINT }} />
            <span className="relative inline-flex w-2 h-2 rounded-full" style={{ background: MINT }} />
          </span>
          Active Users
          {!loginActivityLoading && (
            <span className="rounded-full px-1.5 min-w-[18px] text-center text-[10.5px] font-semibold tabular-nums leading-[17px]" style={{ background: `${MINT}1A` }}>{onlineCount}</span>
          )}
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex-shrink-0 rounded-2xl border bg-white p-1.5" style={{ borderColor: HAIRLINE }}>
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
          {TAB_DEFS.map((t) => {
            const isActive = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-3.5 py-[7px] text-[12.5px] font-medium whitespace-nowrap transition-all duration-150 cursor-pointer active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0891B2]/40 ${
                  isActive ? 'text-white' : 'text-[#5B6371] hover:bg-[#0891B2]/[0.07] hover:text-[#0E6A85]'
                }`}
                style={isActive ? { background: `linear-gradient(135deg, ${CYAN}, ${CYAN_INK})`, boxShadow: `0 3px 10px ${CYAN}40` } : undefined}
              >
                <span className={isActive ? 'opacity-95' : 'opacity-70'}>{t.icon}</span>
                {t.label}
                {t.count != null && <CountChip active={isActive} alert={t.id === 'inbox'}>{t.count}</CountChip>}
              </button>
            );
          })}
        </div>
      </div>

      {tab === 'compose' ? (
        <div className="flex-1 min-h-0 flex flex-col" style={{ animation: 'page-enter 0.2s ease-out' }}>
          {/* Audience filters */}
          <div className="flex-1 min-h-0 bg-white rounded-2xl border p-3 flex flex-col" style={{ borderColor: HAIRLINE }}>
            <div className="flex items-center justify-between gap-2 mb-2.5 shrink-0 px-0.5">
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-xl flex items-center justify-center" style={{ background: `${CYAN}14`, color: CYAN, boxShadow: `inset 0 0 0 1px ${CYAN}26` }}>
                  <MsgIcon name="users" />
                </span>
                <h3 className="text-[14px] font-medium" style={{ color: CYAN_INK }}>Choose Audience</h3>
              </div>
              <button
                onClick={clearAudienceFilters}
                className="shrink-0 inline-flex items-center gap-1 rounded-full bg-[#D97706]/10 px-3 py-1.5 text-[11.5px] font-medium text-[#D97706] hover:bg-[#D97706]/[0.16] transition-colors cursor-pointer"
              >
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1 1l6 6M7 1L1 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
                Clear filters
              </button>
            </div>

              {/* Toolbar */}
              <div className="shrink-0 rounded-2xl border mb-2.5" style={{ borderColor: HAIRLINE, background: '#F7FCFD' }}>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 px-2.5 py-2">
                  <SearchPill value={pickerSearch} onChange={setPickerSearch} placeholder="Search name / reg / mobile…" />

                  <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                    <MultiSelectFilterDropdown<Course> tone="cyan" value={courseFilter} onChange={setCourseFilter} placeholder="Course"
                      options={COURSES.map((c) => ({ value: c, label: c }))} />
                    <MultiSelectFilterDropdown<Year> tone="cyan" value={yearFilter} onChange={setYearFilter} placeholder="Year"
                      options={YEARS.map((y) => ({ value: y, label: y }))} />
                    <MultiSelectFilterDropdown<Gender> tone="cyan" value={genderFilter} onChange={setGenderFilter} placeholder="Gender"
                      options={[{ value: 'BOY', label: 'BOY' }, { value: 'GIRL', label: 'GIRL' }]} />
                    <MultiSelectFilterDropdown<Category> tone="cyan" value={categoryFilter} onChange={setCategoryFilter} placeholder="Cat"
                      options={['GM', 'SC', 'ST', 'C1', '2A', '2B', '3A', '3B'].map((c) => ({ value: c as Category, label: c }))} />
                    <MultiSelectFilterDropdown<AdmType> tone="cyan" value={admTypeFilter} onChange={setAdmTypeFilter} placeholder="Adm Type"
                      options={['REGULAR', 'REPEATER', 'LATERAL', 'EXTERNAL'].map((v) => ({ value: v as AdmType, label: v }))} />
                    <MultiSelectFilterDropdown<AdmCat> tone="cyan" value={admCatFilter} onChange={setAdmCatFilter} placeholder="Adm Cat"
                      options={['GM', 'SNQ', 'OTHERS'].map((v) => ({ value: v as AdmCat, label: v }))} />
                    <MultiSelectFilterDropdown<FeeStatusValue> tone="cyan" value={feeStatusFilter} onChange={setFeeStatusFilter} placeholder="Fee Status"
                      options={FEE_STATUS_OPTIONS} />
                  </div>
                </div>
              </div>

              {studentsLoading ? (
                <EmptyState loading>Loading students…</EmptyState>
              ) : (
                <StudentPickerTable rows={filteredRows} selected={selected} onToggle={toggleRow} onToggleAll={toggleAll} />
              )}

              {/* Footer — selection summary + Compose & Send trigger, bottom-right */}
              <div className="shrink-0 flex items-center justify-between gap-3 mt-2.5 pt-2.5 border-t flex-wrap" style={{ borderColor: BAND }}>
                <p className="text-[12px] text-[#5B6371] flex items-center gap-1.5 flex-wrap">
                  <span className="rounded-full border bg-white px-2 py-[2px] text-[11.5px] font-semibold tabular-nums" style={{ borderColor: `${CYAN}55`, color: CYAN_INK }}>{selectedRows.length}</span>
                  of {filteredRows.length} matched student{filteredRows.length !== 1 ? 's' : ''} selected
                  {allStudents.length > 0 && filteredRows.length !== allStudents.length && (
                    <span className="text-[#8A93A3]"> ({allStudents.length} total in {academicYear})</span>
                  )}
                </p>
                <PillButton
                  onClick={() => setShowComposeModal(true)}
                  disabled={selectedRows.length === 0}
                  className="!px-4 !py-2"
                >
                  <MsgIcon name="send" size={13} />
                  Compose & Send{selectedRows.length > 0 ? ` (${selectedRows.length})` : ''}
                </PillButton>
              </div>
          </div>
        </div>
      ) : tab === 'circulars' ? (
        user ? <AdminCircularsTab user={user} /> : null
      ) : tab === 'sent' ? (
        <div className="flex-1 min-h-0 overflow-y-auto" style={{ animation: 'page-enter 0.2s ease-out' }}>
          {noticesLoading ? (
            <EmptyState loading>Loading…</EmptyState>
          ) : sortedNotices.length === 0 ? (
            <EmptyState>No notices posted yet.</EmptyState>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 pb-1">
              {sortedNotices.map((n) => (
                <AdminNoticeCard
                  key={n.id}
                  notice={n}
                  categoryLabel={CATEGORY_OPTIONS.find((o) => o.value === n.category)?.label}
                  scopeLabel={n.scope === 'selected'
                    ? (n.audienceLabel ?? `${n.targetRegNumbers?.length ?? 0} students`)
                    : `${LEGACY_SCOPE_LABEL[n.scope] ?? n.scope}${n.scopeValue ? `: ${n.scopeValue}` : ''}`}
                  onContextMenu={(x, y) => setNoticeMenu({ x, y, notice: n })}
                />
              ))}
            </div>
          )}

          {noticeMenu && (
            <CardContextMenu
              x={noticeMenu.x}
              y={noticeMenu.y}
              header={{ title: noticeMenu.notice.title }}
              onClose={() => setNoticeMenu(null)}
              actions={[
                { label: 'Edit', onClick: () => startEditNotice(noticeMenu.notice) },
                {
                  label: noticeMenu.notice.pinned ? 'Unpin' : 'Pin to Top',
                  variant: 'accent',
                  disabled: pinningId === noticeMenu.notice.id,
                  onClick: () => void handleTogglePin(noticeMenu.notice),
                },
                {
                  label: noticeMenu.notice.inactiveAt ? 'Mark as Active' : 'Mark as In-Active',
                  variant: 'accent',
                  disabled: togglingActiveId === noticeMenu.notice.id,
                  onClick: () => void handleToggleActive(noticeMenu.notice),
                },
                {
                  label: noticeMenu.notice.archivedAt ? 'Publish' : 'Unpublish',
                  variant: 'accent',
                  disabled: togglingId === noticeMenu.notice.id,
                  onClick: () => void handleTogglePublish(noticeMenu.notice),
                },
                { label: 'Delete', variant: 'danger', onClick: () => void deleteNotice(noticeMenu.notice.id) },
              ]}
            />
          )}
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col gap-2.5" style={{ animation: 'page-enter 0.2s ease-out' }}>
          {/* Inbox toolbar */}
          <div className="flex-shrink-0 rounded-2xl border bg-white px-2.5 py-2 flex flex-wrap items-center gap-2" style={{ borderColor: HAIRLINE }}>
            <Segmented<'all' | 'open' | 'resolved'>
              value={inboxFilter}
              onChange={setInboxFilter}
              options={[
                { value: 'all', label: 'All' },
                { value: 'open', label: 'Open' },
                { value: 'resolved', label: 'Resolved' },
              ]}
            />
            <SearchPill value={inboxSearch} onChange={setInboxSearch} placeholder="Search name / reg no / message…" className="flex-1 min-w-[180px] max-w-md" />
            {filteredMessages.length > 0 && (
              <label className="inline-flex items-center gap-1.5 rounded-full border bg-white px-3 py-1.5 text-[11.5px] font-medium text-[#5B6371] cursor-pointer hover:border-[#0891B2]/40 transition-colors" style={{ borderColor: HAIRLINE }}>
                <input
                  type="checkbox"
                  checked={filteredMessages.length > 0 && filteredMessages.every((m) => inboxSelected.has(m.id))}
                  onChange={toggleInboxAll}
                  className="cursor-pointer accent-[#0891B2]"
                />
                Select all
              </label>
            )}
            {inboxSelected.size > 0 && (
              <div className="flex items-center gap-1.5 ml-auto">
                <span className="rounded-full px-2.5 py-1 text-[11px] font-medium" style={{ background: BAND, color: CYAN_INK }}>{inboxSelected.size} selected</span>
                <PillButton tone="green" disabled={bulkBusy} onClick={() => void handleBulkResolve()}>Mark Resolved</PillButton>
                <PillButton tone="red" disabled={bulkBusy} onClick={() => setConfirmBulkDelete(true)}>Delete</PillButton>
              </div>
            )}
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto space-y-2.5 pb-1">
            {inboxLoading ? (
              <EmptyState loading>Loading…</EmptyState>
            ) : filteredMessages.length === 0 ? (
              <EmptyState>No student messages found.</EmptyState>
            ) : filteredMessages.map((m) => {
              const isSel = inboxSelected.has(m.id);
              const resolved = m.status === 'resolved';
              return (
              <div
                key={m.id}
                className="bg-white rounded-2xl border p-3.5 transition-shadow hover:shadow-[0_6px_20px_rgba(14,106,133,0.07)]"
                style={{ borderColor: isSel ? `${CYAN}80` : HAIRLINE, boxShadow: isSel ? `0 0 0 3px ${CYAN}14` : undefined }}
              >
                <div className="flex items-center gap-2.5">
                  <input type="checkbox" checked={isSel} onChange={() => toggleInboxRow(m.id)} className="cursor-pointer accent-[#0891B2] shrink-0" />
                  <span
                    className="w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-[13px] font-semibold"
                    style={{ background: `${resolved ? MINT : CYAN}14`, color: resolved ? '#0A7A4B' : CYAN_INK, boxShadow: `0 0 0 2px #fff, 0 0 0 3.5px ${resolved ? MINT : CYAN}40` }}
                  >
                    {m.studentName.charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-[#262B35] truncate">
                      {m.studentName} <span className="text-[#8A93A3] font-normal tabular-nums">({m.regNumber})</span>
                    </p>
                    <span className="inline-block mt-0.5 rounded-full px-2 py-[1px] text-[10px] font-medium" style={{ background: BAND, color: CYAN_INK }}>{m.category}</span>
                  </div>
                  <StatusPill color={resolved ? MINT : AMBER}>{resolved ? 'Resolved' : 'Open'}</StatusPill>
                  <button
                    onClick={() => void handleDeleteOne(m.id)}
                    className="shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium text-[#A5173A] hover:bg-[#E11D48]/[0.08] transition-colors cursor-pointer"
                  >
                    <MsgIcon name="trash" size={12} />
                    Delete
                  </button>
                </div>
                <p className="text-[13px] text-[#3F4654] mt-2.5 ml-0 sm:ml-[3.4rem] whitespace-pre-wrap rounded-2xl rounded-tl-md px-3.5 py-2.5 bg-[#F5F8FA] border border-[#EDF1F4]">{m.message}</p>
                {m.status === 'open' ? (
                  <div className="mt-2.5 ml-0 sm:ml-[3.4rem] flex items-center gap-2">
                    <input
                      value={replyDrafts[m.id] ?? ''}
                      onChange={(e) => setReplyDrafts((prev) => ({ ...prev, [m.id]: e.target.value }))}
                      placeholder="Optional reply…"
                      className={`${TEXT_INPUT} flex-1 !rounded-full`}
                    />
                    <PillButton tone="green" onClick={() => void handleResolve(m.id)}>
                      <MsgIcon name="check" size={12} />
                      Mark Resolved
                    </PillButton>
                  </div>
                ) : m.adminReply ? (
                  <div className="mt-2 ml-0 sm:ml-[3.4rem] rounded-2xl rounded-tr-md px-3.5 py-2.5 border" style={{ background: '#F2FAFC', borderColor: HAIRLINE }}>
                    <p className="text-[9.5px] font-medium uppercase tracking-[1px] mb-0.5" style={{ color: CYAN }}>Your Reply</p>
                    <p className="text-[13px] text-[#262B35] whitespace-pre-wrap">{m.adminReply}</p>
                  </div>
                ) : null}
              </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Compose & Send — opened from the audience table's bottom-right button */}
      {showComposeModal && (
        <MsgModal
          title="Compose & Send"
          icon={<MsgIcon name="pen" size={15} />}
          onClose={() => setShowComposeModal(false)}
          subtitle={<>Recipients: <span className="font-semibold" style={{ color: CYAN_INK }}>{selectedRows.length}</span> student{selectedRows.length !== 1 ? 's' : ''} selected</>}
          footer={<>
            <PillButton tone="gray" onClick={() => setShowComposeModal(false)}>Cancel</PillButton>
            <PillButton
              onClick={() => setConfirmSend(true)}
              disabled={!title.trim() || !bodyHasText || selectedRows.length === 0}
            >
              <MsgIcon name="send" size={12} />
              Send to {selectedRows.length} student{selectedRows.length !== 1 ? 's' : ''}
            </PillButton>
          </>}
        >
            {/* Compose with AI — mirrors CircularForm's panel; the audience
                (count + filter summary) is sent along as prompt context. */}
            <div className="flex flex-col gap-2 rounded-2xl border p-3" style={{ borderColor: HAIRLINE, background: 'linear-gradient(160deg, #F2FAFC 0%, #FAFDFE 100%)' }}>
              <label className="inline-flex items-center gap-1.5 text-[11.5px] font-medium" style={{ color: CYAN_INK }}>
                <MsgIcon name="sparkle" size={13} />
                Compose with AI
              </label>
              <textarea
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                rows={3}
                placeholder="e.g. Remind these students to clear their pending fee before the exams, with a fine after the last date"
                className={`${TEXT_INPUT} !bg-white resize-y`}
              />
              <details className="text-[12px]">
                <summary className="cursor-pointer text-[#5B6371] hover:text-[#0E6A85] select-none">Add key dates/amounts (optional)</summary>
                <textarea
                  value={keyDates}
                  onChange={(e) => setKeyDates(e.target.value)}
                  rows={2}
                  placeholder="e.g. Last date: 30 September 2026. Rs.200 fine after that."
                  className={`${TEXT_INPUT} !bg-white mt-1.5 resize-y`}
                />
              </details>
              <div className="flex items-center gap-2 flex-wrap">
                <select
                  value={aiProvider}
                  onChange={(e) => handleProviderChange(e.target.value as CircularAiProvider)}
                  className={SELECT_PILL}
                >
                  <option value="claude">Claude</option>
                  <option value="gemini">Gemini</option>
                </select>
                <select
                  value={aiLanguage}
                  onChange={(e) => handleLanguageChange(e.target.value as CircularAiLanguage)}
                  className={SELECT_PILL}
                >
                  <option value="english">English</option>
                  <option value="kannada">Kannada</option>
                  <option value="both">Both</option>
                </select>
                <button
                  type="button"
                  onClick={handleGenerateDraftClick}
                  disabled={composing || brief.trim() === ''}
                  className={BTN_CYAN}
                >
                  <MsgIcon name="sparkle" size={12} />
                  {composing ? 'Generating…' : 'Generate Draft'}
                </button>
              </div>
              {confirmOverwrite && (
                <div className="flex items-center gap-2 flex-wrap text-[12px] text-[#9A5B00] bg-[#D97706]/[0.07] border border-[#D97706]/30 rounded-xl px-3 py-2">
                  <span>This will replace your current Title and Body.</span>
                  <button
                    type="button"
                    onClick={() => { setConfirmOverwrite(false); void runCompose(); }}
                    className="font-semibold underline cursor-pointer"
                  >
                    Continue
                  </button>
                  <button type="button" onClick={() => setConfirmOverwrite(false)} className="text-[#5B6371] underline cursor-pointer">
                    Cancel
                  </button>
                </div>
              )}
              {composeError && <p className="text-[12px] text-[#A5173A] font-medium">{composeError}</p>}
            </div>

            <div>
              <FieldLabel>Title</FieldLabel>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Pending Fee Reminder" className={FIELD_OVERRIDE} />
            </div>
            <div>
              <FieldLabel>Body</FieldLabel>
              <RichTextEditor
                key={bodySeedVersion}
                value={bodySeed}
                onChange={setBody}
                placeholder="Write the notice…"
              />
            </div>
            <div>
              <FieldLabel>Category</FieldLabel>
              <Select value={category} onChange={(e) => setCategory(e.target.value as NoticeCategory)} options={CATEGORY_OPTIONS} className={`${FIELD_OVERRIDE} cursor-pointer`} />
            </div>
            <div>
              <FieldLabel hint="(optional)">Attachments</FieldLabel>
              <AttachmentDropzone
                files={attachFiles}
                onAdd={(files) => setAttachFiles((prev) => [...prev, ...files])}
                onRemove={(i) => setAttachFiles((prev) => prev.filter((_, idx) => idx !== i))}
              />
            </div>
        </MsgModal>
      )}

      {/* Edit a sent notice */}
      {editingNotice && (
        <MsgModal
          title="Edit Notice"
          icon={<MsgIcon name="pen" size={15} />}
          onClose={() => setEditingNotice(null)}
          subtitle={<>Recipients: {editingNotice.scope === 'selected'
            ? (editingNotice.audienceLabel ?? `${editingNotice.targetRegNumbers?.length ?? 0} students`)
            : `${LEGACY_SCOPE_LABEL[editingNotice.scope] ?? editingNotice.scope}${editingNotice.scopeValue ? `: ${editingNotice.scopeValue}` : ''}`} (unchanged)</>}
          footer={<>
            <PillButton tone="gray" onClick={() => setEditingNotice(null)}>Cancel</PillButton>
            <PillButton loading={editSaving} disabled={!editTitle.trim() || !stripHtml(editBody).trim()} onClick={() => void handleSaveEditNotice()}>Save Changes</PillButton>
          </>}
        >
            <div>
              <FieldLabel>Title</FieldLabel>
              <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className={FIELD_OVERRIDE} />
            </div>
            <div>
              <FieldLabel>Body</FieldLabel>
              <RichTextEditor
                key={editSeedVersion}
                value={editBody}
                onChange={setEditBody}
                placeholder="Write the notice…"
              />
            </div>
            <div>
              <FieldLabel>Category</FieldLabel>
              <Select value={editCategory} onChange={(e) => setEditCategory(e.target.value as NoticeCategory)} options={CATEGORY_OPTIONS} className={`${FIELD_OVERRIDE} cursor-pointer`} />
            </div>
        </MsgModal>
      )}

      {showActiveUsers && (
        <ActiveUsersModal activity={loginActivity} loading={loginActivityLoading} onClose={() => setShowActiveUsers(false)} />
      )}

      {/* Confirm: send notice */}
      {confirmSend && (
        <MsgModal
          title="Confirm Send"
          icon={<MsgIcon name="send" size={15} />}
          size="sm"
          onClose={() => setConfirmSend(false)}
          footer={<>
            <PillButton tone="gray" onClick={() => setConfirmSend(false)} disabled={posting}>Cancel</PillButton>
            <PillButton onClick={() => void handlePostNotice()} disabled={posting}>
              {posting ? 'Sending…' : 'Yes, Send'}
            </PillButton>
          </>}
        >
            <p className="text-[13px] text-[#3F4654]">
              Send this notice to <span className="font-semibold" style={{ color: CYAN_INK }}>{selectedRows.length} student{selectedRows.length !== 1 ? 's' : ''}</span>?
            </p>
            <div className="rounded-xl border px-3.5 py-2.5 text-[12px] text-[#3F4654]" style={{ borderColor: HAIRLINE, background: '#F7FCFD' }}>
              <p className="font-medium text-[#262B35]">{title}</p>
              <p className="mt-1 whitespace-pre-wrap">{stripHtml(body).slice(0, 200)}{stripHtml(body).length > 200 ? '…' : ''}</p>
              {attachFiles.length > 0 && (
                <p className="mt-1.5 inline-flex items-center gap-1 text-[#5B6371]"><MsgIcon name="clip" size={11} /> {attachFiles.length} attachment{attachFiles.length !== 1 ? 's' : ''}</p>
              )}
            </div>
        </MsgModal>
      )}

      {/* Confirm: bulk delete inbox messages */}
      {confirmBulkDelete && (
        <MsgModal
          title="Delete Messages"
          icon={<MsgIcon name="trash" size={15} />}
          tone={CORAL}
          size="sm"
          onClose={() => setConfirmBulkDelete(false)}
          footer={<>
            <PillButton tone="gray" onClick={() => setConfirmBulkDelete(false)}>Cancel</PillButton>
            <PillButton tone="danger" onClick={() => void handleBulkDelete()}>Yes, Delete</PillButton>
          </>}
        >
            <p className="text-[13px] text-[#3F4654]">
              Delete <span className="font-semibold text-[#A5173A]">{inboxSelected.size} message{inboxSelected.size !== 1 ? 's' : ''}</span>? This cannot be undone.
            </p>
        </MsgModal>
      )}
    </div>
  );
}

interface AdminNoticeCardProps {
  notice: Notice;
  categoryLabel: string | undefined;
  scopeLabel: string;
  onContextMenu: (x: number, y: number) => void;
}

function AdminNoticeCard({ notice: n, categoryLabel, scopeLabel, onContextMenu }: AdminNoticeCardProps) {
  const watermarkLabel = n.archivedAt ? 'Unpublished' : n.inactiveAt ? 'Inactive' : null;
  const muted = !!(n.archivedAt || n.inactiveAt);

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border p-3 select-none transition-shadow hover:shadow-[0_6px_20px_rgba(14,106,133,0.08)] ${muted ? 'bg-[#F4F6F8]' : 'bg-white'}`}
      style={{
        borderColor: n.pinned ? `${AMBER}66` : HAIRLINE,
        boxShadow: n.pinned ? `0 0 0 2px ${AMBER}1A` : undefined,
      }}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu(e.clientX, e.clientY); }}
    >
      {/* Accent strip */}
      <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r-full" style={{ background: muted ? '#C7CDD5' : n.pinned ? AMBER : CYAN }} />
      {watermarkLabel && <CardWatermark label={watermarkLabel} />}
      <KebabButton onOpen={onContextMenu} className="absolute top-2 right-2" />
      <div className="relative z-10 pl-1">
        <p className="text-[9.5px] font-medium uppercase tracking-[0.8px] text-[#8A93A3] truncate pr-7">{categoryLabel} · {scopeLabel}</p>
        <div className="flex items-center gap-1 flex-wrap mt-1.5">
          <StatusPill color={n.archivedAt ? MUTED : MINT}>{n.archivedAt ? 'Unpublished' : 'Published'}</StatusPill>
          <StatusPill color={n.inactiveAt ? MUTED : CYAN}>{n.inactiveAt ? 'Inactive' : 'Active'}</StatusPill>
          {n.pinned && (
            <StatusPill color={AMBER} dot={false}>
              <MsgIcon name="pin" />
              Pinned
            </StatusPill>
          )}
        </div>
        <h4 className="text-[13.5px] font-medium text-[#262B35] mt-2 line-clamp-1">{n.title}</h4>
        <p className="text-[12px] text-[#5B6371] mt-0.5 line-clamp-2 leading-snug">{stripHtml(n.body)}</p>
        <div className="flex items-center gap-2 mt-2 text-[10.5px] text-[#8A93A3]">
          <span className="tabular-nums">
            {new Date(n.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            {n.updatedAt && ' · edited'}
          </span>
          {(n.attachments?.length ?? 0) > 0 && (
            <span className="ml-auto inline-flex items-center gap-1 rounded-full px-1.5 py-[1px]" style={{ background: BAND, color: CYAN_INK }}>
              <MsgIcon name="clip" size={11} />
              {n.attachments!.length} attachment{n.attachments!.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
