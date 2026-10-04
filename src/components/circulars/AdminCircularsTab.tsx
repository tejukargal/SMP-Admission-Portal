import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { User } from 'firebase/auth';
import type { Circular, Department } from '../../types';
import {
  subscribeToCirculars, createCircular, updateCircular, deleteCircular, bulkDeleteCirculars,
  setCircularStatus, bulkSetCircularStatus, setCircularPinned, moveCircularToFirst, fetchCircularSeenCounts, sendCircularReminder,
  generateCircularBackground, setCircularBackground, type PendingBackground, type CircularTarget,
} from '../../services/circularService';
import { departmentMeta } from '../../utils/departments';
import { stripHtml, formatCircularDate } from '../../utils/htmlContent';
import {
  circularStatus, STATUS_META, expiryLabel, formatPublishAt, byPinOrder, type CircularStatus,
} from '../../utils/circularStatus';
import {
  HAIRLINE, BAND, CYAN, CYAN_INK, MINT, CORAL, AMBER, VIOLET, MsgIcon, Ico, TEXT_INPUT, FIELD_OVERRIDE, FieldLabel,
  PillButton, StatusPill, Segmented, SearchPill, KebabButton, EmptyState, MsgModal,
} from '../messages/messagesUi';
import { CardContextMenu, type CardContextMenuAction } from '../common/CardContextMenu';
import { CardWatermark } from '../common/CardWatermark';
import { DepartmentFilterChips } from './DepartmentFilterChips';
import { CircularForm, type CircularFormResult } from './CircularForm';
import { CircularModal } from './CircularModal';

interface AdminCircularsTabProps {
  user: User;
}

/** The mobile Home carousel shows every pinned circular — more than this gets crowded. */
const PIN_SOFT_LIMIT = 3;

const VIEWS: CircularStatus[] = ['live', 'scheduled', 'draft', 'expired'];
const VIEW_LABEL: Record<CircularStatus, string> = { live: 'Live', scheduled: 'Scheduled', draft: 'Drafts', expired: 'Expired' };
const EMPTY_TEXT: Record<CircularStatus, string> = {
  live: 'Nothing is live right now. Publish a draft or click "New Circular".',
  scheduled: 'No scheduled circulars. Choose "Schedule for later" when creating one.',
  draft: 'No drafts. Use "Save as Draft" to prepare a circular before students see it.',
  expired: 'No expired circulars. Set a "Valid until" date and circulars move here on their own.',
};

type FormState = { mode: 'new' } | { mode: 'edit'; circular: Circular } | { mode: 'duplicate'; circular: Circular };

const StarIcon = ({ filled }: { filled: boolean }) => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
);
const EyeIcon = () => <Ico size={11}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></Ico>;
const ClockIcon = () => <Ico size={11}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></Ico>;
const BellIcon = ({ size = 13 }: { size?: number }) => <Ico size={size}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></Ico>;
const HelpIcon = () => <Ico size={13}><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></Ico>;

/** Admin circular management — the "Circulars" tab of the Student Messages page.
 *  One lifecycle: Draft → Live (★ optional pin) → Expired, plus Scheduled
 *  (a Draft that auto-publishes). Search, department filter, bulk actions,
 *  duplicate, seen-by counts and an in-app "How it works" guide. */
export function AdminCircularsTab({ user }: AdminCircularsTabProps) {
  const [circulars, setCirculars] = useState<Circular[]>([]);
  const [loading, setLoading] = useState(true);
  const [seen, setSeen] = useState<Map<string, number> | null>(null);
  const [view, setView] = useState<CircularStatus>('live');
  const [search, setSearch] = useState('');
  const [dept, setDept] = useState<Department>('All');
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [form, setForm] = useState<FormState | null>(null);
  const [preview, setPreview] = useState<Circular | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Circular[] | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [publishTargets, setPublishTargets] = useState<Circular[] | null>(null);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<{ x: number; y: number; circular: Circular; statusOnly: boolean } | null>(null);
  const [bgTarget, setBgTarget] = useState<Circular | null>(null);
  const [showGuide, setShowGuide] = useState(false);
  const [reminderTarget, setReminderTarget] = useState<Circular | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeToCirculars((all) => {
      setCirculars(all);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const loadSeen = useCallback(() => {
    fetchCircularSeenCounts().then(setSeen).catch(() => setSeen(null));
  }, []);
  useEffect(() => { loadSeen(); }, [loadSeen]);

  // Changing view resets the selection — bulk actions differ per status.
  function changeView(v: CircularStatus) {
    setView(v);
    setSelected(new Set());
  }

  async function run(ids: string[], action: () => Promise<void>) {
    setActionError(null);
    setBusyIds((prev) => new Set([...prev, ...ids]));
    try {
      await action();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setBusyIds((prev) => { const next = new Set(prev); ids.forEach((id) => next.delete(id)); return next; });
    }
  }

  function moveTo(list: Circular[], to: CircularTarget) {
    const ids = list.map((c) => c.id);
    void run(ids, async () => {
      if (ids.length === 1) await setCircularStatus(ids[0], to);
      else await bulkSetCircularStatus(ids, to);
      setSelected(new Set());
    });
  }

  function togglePin(c: Circular, notify = false) {
    void run([c.id], () => setCircularPinned(c.id, !c.pinned, notify));
  }

  function moveToFirst(c: Circular) {
    void run([c.id], () => moveCircularToFirst(c.id));
  }

  async function handleFormSubmit(r: CircularFormResult) {
    if (form?.mode === 'edit') {
      const status = circularStatus(form.circular);
      const hidden = status === 'draft' || status === 'scheduled';
      await updateCircular(
        form.circular.id, r.values, r.keptAttachments, r.newFiles, r.removedPaths,
        { expiresOn: r.expiresOn, publishAt: hidden ? (r.publishAt ?? null) : undefined, notify: hidden ? r.notify : undefined },
        r.pendingBackground,
      );
      return;
    }
    await createCircular(
      { ...r.values, createdBy: user.uid },
      r.newFiles,
      { draft: r.draft, publishAt: r.publishAt ?? undefined, expiresOn: r.expiresOn ?? undefined, notify: r.notify },
      r.pendingBackground,
      r.existingBackgroundUrl,
    );
    // Land on the view the new circular went to.
    changeView(r.publishAt ? 'scheduled' : r.draft ? 'draft' : 'live');
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      if (confirmDelete.length === 1) await deleteCircular(confirmDelete[0]);
      else await bulkDeleteCirculars(confirmDelete);
      setSelected(new Set());
      setConfirmDelete(null);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not delete. Please try again.');
    } finally {
      setDeleting(false);
    }
  }

  const counts = useMemo(() => {
    const m: Record<CircularStatus, number> = { live: 0, scheduled: 0, draft: 0, expired: 0 };
    for (const c of circulars) m[circularStatus(c)]++;
    return m;
  }, [circulars]);
  // Pin positions (1 = first for students) across ALL live pinned circulars, whatever the search/filter.
  const pinRank = useMemo(() => {
    const ranked = circulars.filter((c) => c.pinned && circularStatus(c) === 'live').sort(byPinOrder);
    return new Map(ranked.map((c, i) => [c.id, i + 1]));
  }, [circulars]);
  const pinnedCount = pinRank.size;

  const inView = useMemo(() => {
    const q = search.trim().toLowerCase();
    return circulars.filter((c) => circularStatus(c) === view && (
      !q || c.title.toLowerCase().includes(q) || c.subject.toLowerCase().includes(q) || stripHtml(c.body).toLowerCase().includes(q)
    ));
  }, [circulars, view, search]);

  const deptCounts = useMemo(() => {
    const m: Partial<Record<Department, number>> = { All: inView.length };
    for (const c of inView) if (c.department !== 'All') m[c.department] = (m[c.department] ?? 0) + 1;
    return m;
  }, [inView]);

  const shown = useMemo(() => {
    const list = inView.filter((c) => dept === 'All' || c.department === dept || c.department === 'All');
    if (view === 'live') {
      return [...list].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (a.pinned && b.pinned ? byPinOrder(a, b) : 0));
    }
    if (view === 'scheduled') return [...list].sort((a, b) => (a.publishAt ?? '').localeCompare(b.publishAt ?? ''));
    return list;
  }, [inView, dept, view]);

  const selectedList = shown.filter((c) => selected.has(c.id));
  const allSelected = shown.length > 0 && selectedList.length === shown.length;

  function toggleSelect(id: string) {
    setSelected((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }

  /** Allowed status moves for one circular — shared by the status chip and the ⋮ menu. */
  function statusActions(c: Circular): CardContextMenuAction[] {
    const busy = busyIds.has(c.id);
    switch (circularStatus(c)) {
      case 'draft':
        return [
          { label: 'Publish now…', variant: 'accent', disabled: busy, onClick: () => setPublishTargets([c]) },
          { label: 'Schedule for later…', onClick: () => setForm({ mode: 'edit', circular: c }) },
        ];
      case 'scheduled':
        return [
          { label: 'Publish now…', variant: 'accent', disabled: busy, onClick: () => setPublishTargets([c]) },
          { label: 'Change schedule…', onClick: () => setForm({ mode: 'edit', circular: c }) },
          { label: 'Cancel schedule (keep as Draft)', disabled: busy, onClick: () => moveTo([c], 'draft') },
        ];
      case 'live':
        return [
          { label: 'Send Reminder…', variant: 'accent', onClick: () => setReminderTarget(c) },
          { label: 'Mark as Expired', variant: 'accent', disabled: busy, onClick: () => moveTo([c], 'expired') },
          { label: 'Move to Draft (hide)', disabled: busy, onClick: () => moveTo([c], 'draft') },
        ];
      case 'expired':
        return [
          { label: 'Make Live again', variant: 'accent', disabled: busy, onClick: () => moveTo([c], 'live') },
          { label: 'Move to Draft (hide)', disabled: busy, onClick: () => moveTo([c], 'draft') },
        ];
    }
  }

  function menuActions(c: Circular, statusOnly: boolean): CardContextMenuAction[] {
    if (statusOnly) return statusActions(c);
    const live = circularStatus(c) === 'live';
    return [
      { label: 'Preview', onClick: () => setPreview(c) },
      { label: 'Edit', onClick: () => setForm({ mode: 'edit', circular: c }) },
      { label: 'Duplicate', onClick: () => setForm({ mode: 'duplicate', circular: c }) },
      ...statusActions(c),
      ...(live ? (c.pinned
        ? [
          ...((pinRank.get(c.id) ?? 1) > 1 ? [{ label: 'Move to first', variant: 'accent' as const, disabled: busyIds.has(c.id), onClick: () => moveToFirst(c) }] : []),
          { label: 'Unpin', disabled: busyIds.has(c.id), onClick: () => togglePin(c) },
        ]
        : [
          { label: 'Pin to top', disabled: busyIds.has(c.id), onClick: () => togglePin(c) },
          { label: 'Pin & notify students', disabled: busyIds.has(c.id), onClick: () => togglePin(c, true) },
        ]) : []),
      { label: c.backgroundImageUrl ? 'Regenerate AI Background' : 'Generate AI Background', onClick: () => setBgTarget(c) },
      { label: 'Delete', variant: 'danger', onClick: () => setConfirmDelete([c]) },
    ];
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-2.5" style={{ animation: 'page-enter 0.2s ease-out' }}>
      {/* Toolbar */}
      <div className="shrink-0 rounded-2xl border bg-white px-2.5 py-2 flex flex-col gap-2" style={{ borderColor: HAIRLINE }}>
        <div className="flex flex-col lg:flex-row lg:items-center gap-2">
          <div className="overflow-x-auto no-scrollbar">
            <Segmented<CircularStatus>
              value={view}
              onChange={changeView}
              options={VIEWS.map((v) => ({ value: v, label: VIEW_LABEL[v], count: counts[v] }))}
            />
          </div>
          <SearchPill value={search} onChange={setSearch} placeholder="Search title, subject, text…" className="w-full lg:w-60" />
          <div className="flex items-center gap-1.5 lg:ml-auto flex-wrap">
            <PillButton tone="gray" onClick={() => setShowGuide(true)} className="!px-3">
              <HelpIcon />
              How it works
            </PillButton>
            <PillButton
              tone={selectMode ? 'cyan' : 'gray'}
              onClick={() => { setSelectMode((s) => !s); setSelected(new Set()); }}
              disabled={shown.length === 0 && !selectMode}
              className="!px-3"
            >
              <MsgIcon name="check" size={12} />
              {selectMode ? 'Done' : 'Select'}
            </PillButton>
            <PillButton onClick={() => setForm({ mode: 'new' })} className="!px-4">
              <MsgIcon name="plus" size={13} />
              New Circular
            </PillButton>
          </div>
        </div>
        {inView.length > 0 && <DepartmentFilterChips counts={deptCounts} active={dept} onChange={setDept} />}
        <p className="text-[11.5px] text-[#5B6371] px-0.5">
          <span className="font-medium" style={{ color: STATUS_META[view].color }}>{VIEW_LABEL[view]}:</span>{' '}
          {view === 'live' && <>visible to <span className="rounded-full px-1.5 py-[1px] font-medium" style={{ background: BAND, color: CYAN_INK }}>all students</span> — department is a label only. ★ pins a circular to the top (no notification); the newest pin, or the one you "Move to first", is shown first.</>}
          {view === 'scheduled' && <>hidden until the set time, then published automatically (with a push notification if you chose one).</>}
          {view === 'draft' && <>hidden from students. Publish when ready — you choose whether to notify.</>}
          {view === 'expired' && <>students see these only under their "Expired" tab. Make Live again or delete when no longer needed.</>}
          {view === 'live' && pinnedCount > PIN_SOFT_LIMIT && (
            <span className="ml-1 font-medium" style={{ color: AMBER }}>{pinnedCount} pinned — keep it to {PIN_SOFT_LIMIT} or fewer so the important ones stand out.</span>
          )}
        </p>
      </div>

      {/* Bulk action bar */}
      {selectMode && (
        <div className="shrink-0 rounded-2xl border px-3 py-2 flex items-center gap-2 flex-wrap" style={{ borderColor: `${CYAN}55`, background: '#F2FAFC' }}>
          <label className="inline-flex items-center gap-2 text-[12px] font-medium cursor-pointer select-none" style={{ color: CYAN_INK }}>
            <input
              type="checkbox"
              checked={allSelected}
              onChange={() => setSelected(allSelected ? new Set() : new Set(shown.map((c) => c.id)))}
              className="w-4 h-4 accent-[#0891B2] cursor-pointer"
            />
            {selectedList.length > 0 ? `${selectedList.length} selected` : 'Select all'}
          </label>
          <div className="flex items-center gap-1.5 ml-auto flex-wrap">
            {(view === 'draft' || view === 'scheduled') && (
              <PillButton tone="green" disabled={selectedList.length === 0} onClick={() => setPublishTargets(selectedList)}>Publish</PillButton>
            )}
            {view === 'expired' && (
              <PillButton tone="green" disabled={selectedList.length === 0} onClick={() => moveTo(selectedList, 'live')}>Make Live</PillButton>
            )}
            {view === 'live' && (
              <PillButton tone="cyan" disabled={selectedList.length === 0} onClick={() => moveTo(selectedList, 'expired')}>Mark Expired</PillButton>
            )}
            {view !== 'draft' && (
              <PillButton tone="gray" disabled={selectedList.length === 0} onClick={() => moveTo(selectedList, 'draft')}>Move to Draft</PillButton>
            )}
            <PillButton tone="red" disabled={selectedList.length === 0} onClick={() => setConfirmDelete(selectedList)}>Delete</PillButton>
          </div>
        </div>
      )}

      {actionError && (
        <p className="shrink-0 rounded-xl border px-3 py-2 text-[12px] font-medium text-[#A5173A]" style={{ borderColor: `${CORAL}40`, background: `${CORAL}0D` }}>
          {actionError}
        </p>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto">
        {loading ? (
          <EmptyState loading>Loading…</EmptyState>
        ) : circulars.length === 0 ? (
          <EmptyState>No circulars posted yet. Click "New Circular" to write the first one.</EmptyState>
        ) : shown.length === 0 ? (
          <EmptyState>{search || dept !== 'All' ? 'No circulars match your search/filter.' : EMPTY_TEXT[view]}</EmptyState>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pb-1">
            {shown.map((c) => (
              <AdminCircularCard
                key={c.id}
                circular={c}
                seenCount={seen ? (seen.get(c.id) ?? 0) : undefined}
                pinRank={pinnedCount > 1 ? pinRank.get(c.id) : undefined}
                onMoveToFirst={() => moveToFirst(c)}
                busy={busyIds.has(c.id)}
                selectMode={selectMode}
                selected={selected.has(c.id)}
                onToggleSelect={() => toggleSelect(c.id)}
                onOpen={() => setPreview(c)}
                onEdit={() => setForm({ mode: 'edit', circular: c })}
                onTogglePin={() => togglePin(c)}
                onRemind={() => setReminderTarget(c)}
                onStatusMenu={(x, y) => setMenu({ x, y, circular: c, statusOnly: true })}
                onContextMenu={(x, y) => setMenu({ x, y, circular: c, statusOnly: false })}
              />
            ))}
          </div>
        )}
      </div>

      {menu && (
        <CardContextMenu
          x={menu.x}
          y={menu.y}
          header={{
            title: menu.circular.title,
            subtitle: `${STATUS_META[circularStatus(menu.circular)].label} · ${STATUS_META[circularStatus(menu.circular)].hint}`,
          }}
          onClose={() => setMenu(null)}
          actions={menuActions(menu.circular, menu.statusOnly)}
        />
      )}

      {form && (
        <CircularForm
          initial={form.mode === 'edit' ? form.circular : undefined}
          duplicateFrom={form.mode === 'duplicate' ? form.circular : undefined}
          onSubmit={handleFormSubmit}
          onClose={() => setForm(null)}
        />
      )}

      {preview && <CircularModal circular={preview} onClose={() => setPreview(null)} />}

      {bgTarget && <BackgroundGenerateModal circular={bgTarget} onClose={() => setBgTarget(null)} />}

      {publishTargets && (
        <PublishDialog
          targets={publishTargets}
          onClose={() => setPublishTargets(null)}
          onConfirm={async (notify, pin) => {
            const ids = publishTargets.map((c) => c.id);
            if (ids.length === 1) await setCircularStatus(ids[0], 'live', { notify, pin });
            else await bulkSetCircularStatus(ids, 'live', { notify, pin });
            setSelected(new Set());
            setPublishTargets(null);
            changeView('live');
          }}
        />
      )}

      {reminderTarget && (
        <ReminderDialog
          circular={reminderTarget}
          onClose={() => setReminderTarget(null)}
          onSent={() => loadSeen()}
        />
      )}

      {showGuide && <CircularsGuide onClose={() => setShowGuide(false)} />}

      {confirmDelete && (
        <MsgModal
          title={confirmDelete.length === 1 ? 'Delete Circular' : `Delete ${confirmDelete.length} Circulars`}
          icon={<MsgIcon name="trash" size={15} />}
          tone={CORAL}
          size="sm"
          onClose={() => setConfirmDelete(null)}
          footer={<>
            <PillButton tone="gray" onClick={() => setConfirmDelete(null)} disabled={deleting}>Cancel</PillButton>
            <PillButton tone="danger" onClick={() => void handleDelete()} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Yes, Delete'}
            </PillButton>
          </>}
        >
          <p className="text-[13px] text-[#3F4654]">
            {confirmDelete.length === 1 ? (
              <>Delete <span className="font-semibold text-[#A5173A]">"{confirmDelete[0].title}"</span>
                {(confirmDelete[0].attachments?.length ?? 0) > 0 && ` and its ${confirmDelete[0].attachments.length} attachment${confirmDelete[0].attachments.length !== 1 ? 's' : ''}`}?</>
            ) : (
              <>Delete <span className="font-semibold text-[#A5173A]">{confirmDelete.length} circulars</span> and all their attachments?</>
            )}
            {' '}Students will no longer see {confirmDelete.length === 1 ? 'it' : 'them'}, and this cannot be undone.
          </p>
          <p className="text-[11.5px] text-[#8A93A3]">Tip: to keep a record, use "Mark as Expired" or "Move to Draft" instead.</p>
        </MsgModal>
      )}
    </div>
  );
}

interface AdminCircularCardProps {
  circular: Circular;
  seenCount?: number;
  /** 1-based position among pinned circulars (only when 2+ are pinned). */
  pinRank?: number;
  onMoveToFirst: () => void;
  busy: boolean;
  selectMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onOpen: () => void;
  onEdit: () => void;
  onTogglePin: () => void;
  onRemind: () => void;
  onStatusMenu: (x: number, y: number) => void;
  onContextMenu: (x: number, y: number) => void;
}

function AdminCircularCard({
  circular: c, seenCount, pinRank, onMoveToFirst, busy, selectMode, selected, onToggleSelect, onOpen, onEdit, onTogglePin, onRemind, onStatusMenu, onContextMenu,
}: AdminCircularCardProps) {
  const meta = departmentMeta(c.department);
  const previewText = stripHtml(c.body);
  const initials = c.department.slice(0, 2).toUpperCase();
  const status = circularStatus(c);
  const sm = STATUS_META[status];
  const expiry = expiryLabel(c);
  const muted = status !== 'live';

  return (
    <div
      className={`relative flex gap-2.5 overflow-hidden rounded-2xl border p-2 select-none cursor-pointer transition-shadow hover:shadow-[0_6px_20px_rgba(14,106,133,0.08)] ${status === 'draft' || status === 'scheduled' ? 'bg-[#F4F6F8]' : status === 'expired' ? 'bg-[#F8FAFB]' : 'bg-white'} ${busy ? 'opacity-60 pointer-events-none' : ''}`}
      style={{
        borderColor: selected ? CYAN : c.pinned ? `${AMBER}66` : HAIRLINE,
        boxShadow: selected ? `0 0 0 2px ${CYAN}33` : c.pinned ? `0 0 0 2px ${AMBER}1A` : undefined,
      }}
      onClick={selectMode ? onToggleSelect : onOpen}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu(e.clientX, e.clientY); }}
    >
      {/* Background — 30% column */}
      <div className={`w-[30%] shrink-0 relative rounded-xl overflow-hidden bg-gray-100 ${muted ? 'opacity-70 grayscale-[35%]' : ''}`}>
        {c.backgroundImageUrl ? (
          <img src={c.backgroundImageUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className={`absolute inset-0 flex items-center justify-center ${meta.cardBg}`}>
            <span className={`text-base font-semibold ${meta.text} opacity-50`}>{initials}</span>
          </div>
        )}
        {selectMode && (
          <span className={`absolute top-1.5 left-1.5 w-5 h-5 rounded-md border-2 flex items-center justify-center ${selected ? 'bg-[#0891B2] border-[#0891B2] text-white' : 'bg-white/90 border-[#CBE8F0]'}`}>
            {selected && <MsgIcon name="check" size={11} />}
          </span>
        )}
      </div>

      {/* Details — 70% column */}
      <div className="flex-1 min-w-0 relative py-0.5 flex flex-col">
        {status === 'draft' ? <CardWatermark label="Draft" /> : status === 'scheduled' ? <CardWatermark label="Scheduled" /> : status === 'expired' ? <CardWatermark label="Expired" /> : null}
        {!selectMode && <KebabButton onOpen={onContextMenu} className="absolute -top-0.5 -right-0.5" />}
        <div className="relative z-10 pr-6 flex-1">
          <span className="flex items-center gap-1 flex-wrap min-w-0">
            <button
              type="button"
              disabled={selectMode}
              title="Change status"
              onClick={(e) => {
                e.stopPropagation();
                const r = e.currentTarget.getBoundingClientRect();
                onStatusMenu(r.left, r.bottom + 4);
              }}
              className="inline-flex items-center gap-1 rounded-full border bg-white px-2 py-[2px] text-[10px] font-semibold leading-tight cursor-pointer hover:brightness-95 disabled:cursor-default"
              style={{ borderColor: `${sm.color}66`, color: sm.color }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: sm.color }} />
              {sm.label}
              {!selectMode && <svg width="8" height="8" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true"><path d="M1 3l4 4 4-4z" /></svg>}
            </button>
            {c.pinned && status === 'live' && (
              <StatusPill color={AMBER} dot={false}>
                <MsgIcon name="pin" />
                {pinRank ? `Pinned #${pinRank}` : 'Pinned'}
              </StatusPill>
            )}
            <span className={`inline-flex items-center rounded-full border px-1.5 py-[1px] text-[9.5px] font-medium ${meta.pill}`}>{c.department}</span>
            {(c.attachments?.length ?? 0) > 0 && (
              <span className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-[1px] text-[10px]" style={{ background: BAND, color: CYAN_INK }}>
                <MsgIcon name="clip" size={11} />
                {c.attachments.length}
              </span>
            )}
          </span>
          <h4 className="text-[13px] font-medium text-[#262B35] mt-1.5 leading-snug line-clamp-1">{c.title}</h4>
          <p className={`text-[10.5px] font-medium ${meta.text} mt-0.5 line-clamp-1`}>
            {c.subject} <span className="text-[#8A93A3] font-normal">· {formatCircularDate(c.date)}</span>
          </p>
          {previewText && <p className="text-[11.5px] text-[#5B6371] mt-0.5 line-clamp-2 leading-snug">{previewText}</p>}
        </div>

        {/* Meta + quick actions */}
        <div className="relative z-10 mt-1.5 flex items-center gap-1.5 flex-wrap">
          {status === 'scheduled' && c.publishAt && (
            <StatusPill color={VIOLET} dot={false}><ClockIcon />Publishes {formatPublishAt(c.publishAt)}</StatusPill>
          )}
          {expiry && <StatusPill color={expiry.soon ? AMBER : MINT} dot={false}><ClockIcon />{expiry.text}</StatusPill>}
          {(status === 'live' || status === 'expired') && seenCount !== undefined && (
            <span className="inline-flex items-center gap-1 text-[10px] text-[#5B6371]" title="Students who opened this circular">
              <EyeIcon />Seen by {seenCount}
            </span>
          )}
          {status === 'live' && (c.reminderCount ?? 0) > 0 && (
            <span
              className="inline-flex items-center gap-1 text-[10px] text-[#5B6371]"
              title={c.lastReminderAt ? `Last reminder ${formatPublishAt(c.lastReminderAt)}` : undefined}
            >
              <BellIcon size={11} />Reminded {c.reminderCount}×
            </span>
          )}
          {!selectMode && (
            <span className="ml-auto flex items-center gap-0.5">
              {status === 'live' && c.pinned && (pinRank ?? 1) > 1 && (
                <button
                  type="button"
                  title="Move to first — show this ahead of the other pinned circulars"
                  onClick={(e) => { e.stopPropagation(); onMoveToFirst(); }}
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[#8A93A3] hover:text-[#D97706] hover:bg-[#D97706]/10 transition-colors cursor-pointer"
                >
                  <Ico size={13}><polyline points="17 11 12 6 7 11" /><line x1="12" y1="6" x2="12" y2="18" /><line x1="6" y1="3" x2="18" y2="3" /></Ico>
                </button>
              )}
              {status === 'live' && (
                <button
                  type="button"
                  title="Send a reminder notification"
                  onClick={(e) => { e.stopPropagation(); onRemind(); }}
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[#8A93A3] hover:text-[#0FA968] hover:bg-[#0FA968]/10 transition-colors cursor-pointer"
                >
                  <BellIcon />
                </button>
              )}
              {status === 'live' && (
                <button
                  type="button"
                  title={c.pinned ? 'Unpin' : 'Pin to top (no notification)'}
                  onClick={(e) => { e.stopPropagation(); onTogglePin(); }}
                  className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors cursor-pointer ${c.pinned ? 'text-[#D97706] bg-[#D97706]/10 hover:bg-[#D97706]/20' : 'text-[#8A93A3] hover:text-[#D97706] hover:bg-[#D97706]/10'}`}
                >
                  <StarIcon filled={!!c.pinned} />
                </button>
              )}
              <button
                type="button"
                title="Edit"
                onClick={(e) => { e.stopPropagation(); onEdit(); }}
                className="w-6 h-6 rounded-full flex items-center justify-center text-[#8A93A3] hover:text-[#0E6A85] hover:bg-[#0891B2]/10 transition-colors cursor-pointer"
              >
                <MsgIcon name="pen" size={12} />
              </button>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

interface PublishDialogProps {
  targets: Circular[];
  onClose: () => void;
  onConfirm: (notify: boolean, pin: boolean) => Promise<void>;
}

/** Draft/Scheduled → Live, single or bulk — the one place a push is chosen. */
function PublishDialog({ targets, onClose, onConfirm }: PublishDialogProps) {
  const single = targets.length === 1 ? targets[0] : null;
  const [notify, setNotify] = useState(single?.notify ?? true);
  const [pin, setPin] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setSaving(true);
    setError(null);
    try {
      await onConfirm(notify, pin);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not publish. Please try again.');
      setSaving(false);
    }
  }

  return (
    <MsgModal
      title={single ? 'Publish Circular' : `Publish ${targets.length} Circulars`}
      icon={<MsgIcon name="send" size={15} />}
      tone={MINT}
      size="sm"
      onClose={onClose}
      footer={<>
        <PillButton tone="gray" onClick={onClose} disabled={saving}>Cancel</PillButton>
        <PillButton loading={saving} onClick={() => void confirm()}>Publish Now</PillButton>
      </>}
    >
      <p className="text-[13px] text-[#3F4654]">
        {single ? <>"<span className="font-medium">{single.title}</span>" will become visible to all students.</> : <>These {targets.length} circulars will become visible to all students.</>}
      </p>
      <label className="flex items-start gap-2 text-[12.5px] text-[#3F4654] cursor-pointer select-none">
        <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[#0891B2] cursor-pointer" />
        <span>Send a push notification to all students{!single && ' (one per circular)'}</span>
      </label>
      <label className="flex items-start gap-2 text-[12.5px] text-[#3F4654] cursor-pointer select-none">
        <input type="checkbox" checked={pin} onChange={(e) => setPin(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[#D97706] cursor-pointer" />
        <span>Pin to top</span>
      </label>
      {error && <p className="text-[12px] text-[#A5173A] font-medium">{error}</p>}
    </MsgModal>
  );
}

function GuideStep({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span className="w-5 h-5 shrink-0 rounded-full flex items-center justify-center text-[10.5px] font-semibold text-white" style={{ background: CYAN }}>{n}</span>
      <span className="text-[12.5px] text-[#3F4654] leading-relaxed">{children}</span>
    </li>
  );
}

type ReminderTemplate = 'reminder' | 'deadline' | 'updated' | 'custom';

function reminderText(c: Circular, t: ReminderTemplate): { title: string; body: string } {
  const lastDate = c.expiresOn
    ? new Date(`${c.expiresOn}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
    : '';
  switch (t) {
    case 'reminder': return { title: `🔔 Reminder: ${c.title}`, body: c.subject };
    case 'deadline': return { title: `⏰ Last date ${lastDate}: ${c.title}`, body: `Don't miss it. ${c.subject}` };
    case 'updated': return { title: `Updated: ${c.title}`, body: 'This circular has been updated. Please check the latest details.' };
    case 'custom': return { title: c.title, body: '' };
  }
}

interface ReminderDialogProps {
  circular: Circular;
  onClose: () => void;
  onSent: () => void;
}

/** "Send Reminder" for a Live circular — editable push text, quick templates,
 *  and the audience (everyone, or only students who haven't opened it). The
 *  recipient count is a dry run of the same Cloud Function. */
function ReminderDialog({ circular: c, onClose, onSent }: ReminderDialogProps) {
  const templates: { id: ReminderTemplate; label: string }[] = [
    { id: 'reminder', label: 'Reminder' },
    ...(c.expiresOn ? [{ id: 'deadline' as const, label: 'Last date' }] : []),
    { id: 'updated', label: 'Updated' },
    { id: 'custom', label: 'Custom' },
  ];
  const [template, setTemplate] = useState<ReminderTemplate>(c.expiresOn ? 'deadline' : 'reminder');
  const [title, setTitle] = useState(() => reminderText(c, c.expiresOn ? 'deadline' : 'reminder').title);
  const [body, setBody] = useState(() => reminderText(c, c.expiresOn ? 'deadline' : 'reminder').body);
  const [audience, setAudience] = useState<'unseen' | 'all'>('unseen');
  const [reach, setReach] = useState<{ students: number; devices: number } | null>(null);
  const [counting, setCounting] = useState(true);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<{ students: number; devices: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setCounting(true);
    sendCircularReminder({ circularId: c.id, title: '', body: '', audience, dryRun: true })
      .then((r) => { if (!cancelled) setReach(r); })
      .catch(() => { if (!cancelled) setReach(null); })
      .finally(() => { if (!cancelled) setCounting(false); });
    return () => { cancelled = true; };
  }, [c.id, audience]);

  function pickTemplate(t: ReminderTemplate) {
    setTemplate(t);
    const text = reminderText(c, t);
    setTitle(text.title);
    setBody(text.body);
  }

  async function send() {
    setSending(true);
    setError(null);
    try {
      const r = await sendCircularReminder({ circularId: c.id, title: title.trim(), body: body.trim(), audience });
      setSent(r);
      onSent();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the reminder. Please try again.');
    } finally {
      setSending(false);
    }
  }

  const recentlyReminded = c.lastReminderAt && Date.now() - Date.parse(c.lastReminderAt) < 6 * 3600_000;
  const noOne = !counting && reach !== null && reach.devices === 0;

  return (
    <MsgModal
      portal
      title="Send Reminder"
      subtitle={c.title}
      icon={<BellIcon size={15} />}
      tone={MINT}
      size="md"
      onClose={onClose}
      footer={sent ? (
        <PillButton onClick={onClose}>Done</PillButton>
      ) : (<>
        <PillButton tone="gray" onClick={onClose} disabled={sending}>Cancel</PillButton>
        <PillButton loading={sending} disabled={!title.trim() || counting || noOne} onClick={() => void send()}>
          <BellIcon size={12} />
          Send to {counting ? '…' : `${reach?.students ?? 0} student${reach?.students === 1 ? '' : 's'}`}
        </PillButton>
      </>)}
    >
      {sent ? (
        <div className="flex flex-col items-center gap-2 py-4 text-center">
          <span className="w-10 h-10 rounded-full flex items-center justify-center text-white" style={{ background: MINT }}><MsgIcon name="check" size={18} /></span>
          <p className="text-[13px] text-[#3F4654]">Reminder sent to <b>{sent.students}</b> student{sent.students === 1 ? '' : 's'} ({sent.devices} device{sent.devices === 1 ? '' : 's'}).</p>
        </div>
      ) : (<>
        <div>
          <FieldLabel>Message</FieldLabel>
          <div className="flex items-center gap-1.5 flex-wrap mb-2">
            {templates.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => pickTemplate(t.id)}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer ${template === t.id ? 'bg-[#0891B2] border-[#0891B2] text-white' : 'bg-white border-[#CBE8F0] text-[#5B6371] hover:text-[#0E6A85]'}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <input
            value={title}
            maxLength={80}
            onChange={(e) => { setTitle(e.target.value); setTemplate('custom'); }}
            placeholder="Notification title"
            className={`${TEXT_INPUT} ${FIELD_OVERRIDE}`}
          />
          <textarea
            value={body}
            maxLength={200}
            rows={2}
            onChange={(e) => { setBody(e.target.value); setTemplate('custom'); }}
            placeholder="Short message (optional)"
            className={`${TEXT_INPUT} mt-2 resize-y`}
          />
          <p className="mt-1 text-[10.5px] text-[#8A93A3] text-right tabular-nums">{title.length}/80 · {body.length}/200</p>
        </div>

        <div>
          <FieldLabel>Send to</FieldLabel>
          <Segmented<'unseen' | 'all'>
            value={audience}
            onChange={setAudience}
            options={[
              { value: 'unseen', label: 'Not opened yet' },
              { value: 'all', label: 'All students' },
            ]}
          />
          <p className="mt-1.5 text-[11.5px] text-[#5B6371]">
            {counting ? 'Counting recipients…' : reach === null ? 'Could not count recipients.' : noOne
              ? (audience === 'unseen' ? 'Every student with the app has already opened this circular.' : 'No student devices are registered for notifications.')
              : <>{reach.students} student{reach.students === 1 ? '' : 's'} with the app ({reach.devices} device{reach.devices === 1 ? '' : 's'}). Tapping it opens this circular.</>}
          </p>
        </div>

        {/* Phone-style preview */}
        <div className="rounded-xl border px-3 py-2.5 flex gap-2.5 items-start" style={{ borderColor: HAIRLINE, background: '#F7F9FB' }}>
          <span className="w-7 h-7 shrink-0 rounded-lg flex items-center justify-center text-white" style={{ background: CYAN }}><BellIcon size={13} /></span>
          <div className="min-w-0">
            <p className="text-[12.5px] font-semibold text-[#262B35] leading-snug break-words">{title || 'Notification title'}</p>
            {body && <p className="text-[11.5px] text-[#5B6371] leading-snug break-words">{body}</p>}
          </div>
        </div>

        {recentlyReminded && (
          <p className="text-[11.5px] font-medium" style={{ color: AMBER }}>
            A reminder was already sent {formatPublishAt(c.lastReminderAt!)}. Sending too often makes students ignore notifications.
          </p>
        )}
        {error && <p className="text-[12px] text-[#A5173A] font-medium">{error}</p>}
      </>)}
    </MsgModal>
  );
}

/** In-app SOP — what each state means, what notifies students, and the routine. */
function CircularsGuide({ onClose }: { onClose: () => void }) {
  const flow: { s: CircularStatus; note: string }[] = [
    { s: 'draft', note: 'Being prepared. Students cannot see it.' },
    { s: 'scheduled', note: 'A draft with a publish time. Goes live by itself.' },
    { s: 'live', note: 'All students see it. ★ pins it to the top.' },
    { s: 'expired', note: 'Over. Students see it only in their Expired tab.' },
  ];

  return (
    <MsgModal title="How Circulars Work" subtitle="Standard routine for posting and managing circulars" icon={<HelpIcon />} size="xl" onClose={onClose}
      footer={<PillButton onClick={onClose}>Got it</PillButton>}
    >
      <section className="space-y-2">
        <h4 className="text-[12.5px] font-semibold" style={{ color: CYAN_INK }}>1 · Every circular has one status</h4>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
          {flow.map(({ s, note }, i) => (
            <div key={s} className="relative rounded-xl border p-2.5" style={{ borderColor: `${STATUS_META[s].color}55`, background: `${STATUS_META[s].color}0D` }}>
              <span className="text-[12px] font-semibold" style={{ color: STATUS_META[s].color }}>{STATUS_META[s].label}</span>
              <p className="mt-0.5 text-[11.5px] text-[#5B6371] leading-snug">{note}</p>
              {i < flow.length - 1 && <span className="hidden sm:block absolute -right-2 top-1/2 -translate-y-1/2 text-[#8A93A3] text-[13px]">→</span>}
            </div>
          ))}
        </div>
        <p className="text-[11.5px] text-[#5B6371]">Click the coloured status chip on any card to move it. Expired circulars can be made Live again; anything can be moved back to Draft to hide it.</p>
      </section>

      <section className="space-y-2">
        <h4 className="text-[12.5px] font-semibold" style={{ color: CYAN_INK }}>2 · Posting a circular</h4>
        <ol className="space-y-1.5">
          <GuideStep n={1}>Click <b>New Circular</b>. Optionally use <b>Compose with AI</b> to get a draft, then check every date and name.</GuideStep>
          <GuideStep n={2}>Fill Title, Date, Department (a label only — every student sees every circular), Subject and Body. Attach PDF/images if needed (max 5 MB each).</GuideStep>
          <GuideStep n={3}>Set <b>Valid until</b> for anything with a deadline, so it moves to Expired on its own.</GuideStep>
          <GuideStep n={4}>Choose <b>Publish Now</b>, <b>Schedule</b> for a later time, or <b>Save as Draft</b> to review later (or get it checked by someone).</GuideStep>
          <GuideStep n={5}>Use the eye icon count (<b>Seen by</b>) to check how many students have opened it.</GuideStep>
        </ol>
      </section>

      <section className="space-y-2">
        <h4 className="text-[12.5px] font-semibold" style={{ color: CYAN_INK }}>3 · When do students get a phone notification?</h4>
        <ul className="text-[12.5px] text-[#3F4654] space-y-1 list-disc pl-5">
          <li>Only when a circular <b>goes live</b> (now, scheduled, or from Draft) <b>and</b> "Send a push notification" is ticked.</li>
          <li>Pinning with ★ is silent. Use <b>⋮ → Pin & notify students</b> only for something urgent.</li>
          <li>To nudge students about a Live circular (e.g. the last date is near), click the <b>🔔 bell</b> on its card. Choose a ready message or write your own, and send it to everyone or only to students who <b>haven't opened it yet</b>.</li>
          <li>Editing a live circular never notifies; students see an "Updated" badge in the app instead.</li>
          <li>Expiring, moving to Draft and deleting never notify.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h4 className="text-[12.5px] font-semibold" style={{ color: CYAN_INK }}>4 · Good habits</h4>
        <ul className="text-[12.5px] text-[#3F4654] space-y-1 list-disc pl-5">
          <li>Send reminders sparingly (once or twice per circular). Too many and students start ignoring them. Prefer "Not opened yet".</li>
          <li>To show one circular <b>first</b> for students: click its ★ to pin it (a new pin always goes first). If it is already pinned, click the <b>⤒ arrow</b> on its card (or ⋮ → Move to first). Cards show "Pinned #1, #2…" in the order students see them.</li>
          <li>Keep {PIN_SOFT_LIMIT} or fewer circulars pinned, otherwise nothing stands out.</li>
          <li>For a repeating circular (exam time table, fee last date), use <b>⋮ → Duplicate</b> and update the dates. Re-attach files.</li>
          <li>Prefer <b>Mark as Expired</b> over Delete. Delete removes the circular and its files permanently.</li>
          <li>Use <b>Select</b> to expire or delete many old circulars at once, for example at the end of a semester.</li>
          <li>Right-click (or ⋮) on a card for every action. Click a card to preview exactly what students see.</li>
        </ul>
      </section>
    </MsgModal>
  );
}

interface BackgroundGenerateModalProps {
  circular: Circular;
  onClose: () => void;
}

/** Generate/Regenerate Background action from the admin list's context menu —
 *  generates immediately on open, previews the result, and only writes to
 *  Storage/Firestore (via setCircularBackground) once the admin accepts it. */
function BackgroundGenerateModal({ circular, onClose }: BackgroundGenerateModalProps) {
  const [generating, setGenerating] = useState(true);
  const [pending, setPending] = useState<PendingBackground | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setError(null);
    setGenerating(true);
    try {
      const result = await generateCircularBackground({
        title: circular.title,
        subject: circular.subject,
        department: circular.department,
        bodySnippet: stripHtml(circular.body).trim().slice(0, 400),
      });
      setPending(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not generate a background. Please try again.');
    } finally {
      setGenerating(false);
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void generate(); }, []);

  async function handleAccept() {
    if (!pending) return;
    setSaving(true);
    try {
      await setCircularBackground(circular.id, pending);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the background. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <MsgModal
      portal
      title={`AI Background — ${circular.title}`}
      icon={<MsgIcon name="image" size={15} />}
      size="md"
      onClose={onClose}
      footer={<>
        <PillButton tone="gray" onClick={onClose} disabled={saving}>
          Cancel
        </PillButton>
        <PillButton
          tone="cyan"
          onClick={() => void generate()}
          disabled={generating || saving}
        >
          <MsgIcon name="sparkle" size={12} />
          {generating ? 'Generating…' : 'Regenerate'}
        </PillButton>
        <PillButton loading={saving} disabled={!pending || generating} onClick={() => void handleAccept()}>
          Use this Background
        </PillButton>
      </>}
    >
        <div className="w-full aspect-video rounded-xl border flex items-center justify-center overflow-hidden" style={{ borderColor: HAIRLINE, background: '#F2FAFC' }}>
          {generating ? (
            <span className="flex flex-col items-center gap-2 text-[12px] text-[#8A93A3]">
              <span className="w-5 h-5 rounded-full border-2 border-[#CBE8F0] border-t-[#0891B2] animate-spin" />
              Generating…
            </span>
          ) : pending ? (
            <img
              src={`data:${pending.mimeType};base64,${pending.base64}`}
              alt="Generated background preview"
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="text-[12px] text-[#8A93A3]">No preview yet.</span>
          )}
        </div>

        {error && <p className="text-[12px] text-[#A5173A] font-medium">{error}</p>}
    </MsgModal>
  );
}
