import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import {
  IdentificationCard, IdentificationBadge, Phone, Eye, PencilSimple, MagnifyingGlass, CheckCircle, ArrowDown,
  ArrowUp, Check, DotsThree, CaretDown, CaretUp,
} from '@phosphor-icons/react';
import type { Student, Gender, Year, AcademicYear } from '../../types';
import {
  CARD, pastel, PERI, V, mix, pastelVar, INK, MUTED, FAINT,
  MINT, AMBER, CORAL, COURSE_HEX, YEAR_HEX, BOY_HEX, GIRL_HEX, SEARCH_PAGE_SIZE,
} from './dashTokens';
import { isWPStudent } from '../../utils/wpStudent';

// Dashboard search results — one profile card per student, with that student's
// enrollments laid out as a year-by-year timeline. Presentation only: grouping,
// fee status and dues are computed by Dashboard.tsx and passed in.

export type FeeStatus = 'collect' | 'dues' | 'no-dues';

export interface StudentGroup {
  key: string;
  nameSSLC: string;
  nameAadhar: string;
  fatherName: string;
  dob: string;
  gender: Gender;
  records: Student[];
}

export type GroupDue = number | null | 'unavailable';

/** A group's next-year enrollment into the current academic year (computed by Dashboard.tsx). */
export interface NextEnroll {
  record: Student;
  targetYear: Year;
  targetAcademicYear: AcademicYear;
}

export type MenuPos = { x: number; y: number };

const NEXT_LABEL: Record<Year, string> = { '1ST YEAR': '1st Yr', '2ND YEAR': '2nd Yr', '3RD YEAR': '3rd Yr' };

const STATUS_HEX = (status: string) =>
  status === 'CONFIRMED' ? MINT : status === 'CANCELLED' ? CORAL : AMBER;

const pill = (c: string): CSSProperties => ({ ...pastel(c), borderWidth: 1 });

// Working Professional (EXTERNAL) olive — the WP Students page accent, kept clear of the
// cyan search-mode accent.
// WP fee is tracked as manual counts, not feeRecords, so WP enrollments show this
// badge in place of fee pills / dues.
const WP_HEX = '#5B9A2F';
const WP_FEE_TITLE = 'Working Professional — fee tracked separately in WP Fee Distribution';

/** First letters of the first two name words, skipping single-letter initials ("RAVI K M" → "RK"). */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const full = words.filter((w) => w.length > 1);
  const pick = full.length ? full : words;
  return ((pick[0]?.[0] ?? '') + (pick[1]?.[0] ?? '')).toUpperCase() || '?';
}

function Shimmer({ w, h = 14 }: { w: number; h?: number }) {
  return <span className="inline-block rounded-full sr-shimmer" style={{ width: w, height: h }} />;
}

type MatchHint = { kind: 'aadhaar' | 'mobile' | 'father'; text: string };

/**
 * The header only shows the SSLC name and Reg No, but search also matches the Aadhaar
 * name and both mobile numbers. When the hit is on one of those hidden fields, return
 * it so the card can say why it matched; null when the visible header already explains it.
 */
function matchHint(group: StudentGroup, query: string): MatchHint | null {
  const q = query.trim().toUpperCase();
  if (!q) return null;
  if (group.nameSSLC.toUpperCase().includes(q)) return null;
  if (group.records.some((r) => r.regNumber?.toUpperCase().includes(q))) return null;
  for (const r of [...group.records].reverse()) {
    if (r.studentMobile?.includes(q)) return { kind: 'mobile', text: r.studentMobile };
    if (r.fatherMobile?.includes(q)) return { kind: 'father', text: r.fatherMobile };
    if (r.studentNameAadhar?.toUpperCase().includes(q)) return { kind: 'aadhaar', text: r.studentNameAadhar };
  }
  return null;
}

const HINT_LABEL: Record<MatchHint['kind'], string> = { mobile: 'Mobile', father: "Father's mobile", aadhaar: 'Aadhaar name' };

function MatchHintChip({ hint }: { hint: MatchHint }) {
  return (
    <span
      title={`Matched on ${HINT_LABEL[hint.kind]}`}
      className="sr-pop inline-flex items-center gap-1 h-6 min-w-0 max-w-[260px] rounded-full border bg-white px-2 text-[10.5px] font-medium leading-none tabular-nums whitespace-nowrap"
      style={{ borderColor: V.border, color: MUTED }}
    >
      <span className="flex shrink-0" style={{ color: V.acc }}>
        {hint.kind === 'aadhaar' ? <IdentificationBadge size={11} weight="bold" /> : <Phone size={11} weight="bold" />}
      </span>
      <span className="shrink-0" style={{ color: FAINT }}>{HINT_LABEL[hint.kind]}</span>
      <span className="truncate">{hint.text}</span>
    </span>
  );
}

/** Register No — the card's primary identity. Click copies it (icon flips to a tick briefly). */
function RegNoPill({ regNo }: { regNo: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  function copy(e: MouseEvent) {
    e.stopPropagation();
    void navigator.clipboard?.writeText(regNo).then(() => {
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 1200);
    }).catch(() => {});
  }
  return (
    <button
      type="button"
      onClick={copy}
      onDoubleClick={(e) => e.stopPropagation()}
      title={copied ? 'Copied' : 'Register No — click to copy'}
      className="shrink-0 inline-flex items-center gap-1.5 h-7 rounded-full border px-2.5 text-[14px] font-semibold leading-none tabular-nums whitespace-nowrap cursor-copy hover:brightness-[0.97] transition-[filter] focus:outline-none focus-visible:ring-2 focus-visible:ring-(--dk-acc)/35"
      style={pastelVar()}
    >
      {copied
        ? <Check size={13} weight="bold" className="sr-pop" style={{ color: V.acc }} />
        : <IdentificationCard size={14} weight="bold" style={{ color: V.acc }} />}
      {regNo}
    </button>
  );
}

function FeeSummary({ due, loading }: { due: GroupDue | undefined; loading: boolean }) {
  if (loading) {
    return (
      <div className="flex flex-col items-end gap-1.5">
        <Shimmer w={96} h={18} />
        <Shimmer w={60} h={8} />
      </div>
    );
  }
  if (due === undefined) return null;
  if (due === 'unavailable' || due === null) {
    return (
      <span className="sr-pop inline-flex items-center h-7 rounded-full border bg-white px-3 text-[11px] font-medium" style={{ borderColor: V.border, color: FAINT }}>
        {due === null ? 'Fee structure not set' : 'Fee records unavailable'}
      </span>
    );
  }
  if (due > 0) {
    return (
      // Outline pastel pill, same family as the CONFIRMED status pill.
      <span
        title="Total due across all enrollments"
        className="sr-pop inline-flex items-center justify-center min-w-[98px] h-7 rounded-full border px-2 text-[11px] font-semibold leading-none tabular-nums whitespace-nowrap cursor-default"
        style={pastelVar(V.ink, V.ink)}
      >
        ₹{due.toLocaleString('en-IN')} due
      </span>
    );
  }
  return (
    <span className="sr-pop inline-flex items-center justify-center gap-1 w-[98px] h-7 rounded-full border text-[11px] font-medium" style={pastelVar()}>
      <CheckCircle size={12} weight="fill" /> No Dues
    </span>
  );
}

// Row status pill (CONFIRMED / PROVISIONAL …) — the fee pills on the same row share it exactly.
const ROW_PILL =
  'inline-flex items-center justify-center w-[96px] h-7 rounded-full border text-[10.5px] font-medium leading-none tracking-[0.2px]';

const ACTION_BTN =
  'inline-flex items-center justify-center gap-1 rounded-full border bg-white h-7 text-[11px] font-medium transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-(--dk-acc)/35';

function EnrollmentRow({
  s, isFirst, isLast, isCurrent, groupRegNo, isAdmin, feeStatus, due, ctxActive, onView, onEdit, onCollect, onContextMenu,
}: {
  s: Student; isFirst: boolean; isLast: boolean; isCurrent: boolean; groupRegNo: string; isAdmin: boolean;
  feeStatus: FeeStatus | null; due: number | undefined; ctxActive: boolean;
  onView: () => void; onEdit: () => void; onCollect: () => void; onContextMenu: (pos: MenuPos) => void;
}) {
  const dot = STATUS_HEX(s.admissionStatus?.trim() ?? '');
  const courseHex = COURSE_HEX[s.course as keyof typeof COURSE_HEX] ?? PERI;
  const yearHex = YEAR_HEX[s.year as keyof typeof YEAR_HEX] ?? PERI;
  const meta = [s.admType, s.admCat, s.category].filter(Boolean).join(' · ');
  return (
    <div
      className={`group/row relative grid items-center gap-x-3 pl-9 pr-3 py-2 rounded-xl cursor-context-menu select-none transition-colors ${
        ctxActive ? 'row-ctx-active-peri' : isCurrent ? 'bg-(--dk-acc)/[0.045] hover:bg-(--dk-tile)' : 'hover:bg-(--dk-tint)'
      }`}
      style={{ gridTemplateColumns: '64px 80px 50px minmax(0,1fr) 104px auto' }}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu({ x: e.clientX, y: e.clientY }); }}
      onDoubleClick={onView}
    >
      {/* Timeline rail + status dot */}
      {!(isFirst && isLast) && (
        <span
          aria-hidden
          className="absolute left-[17px] w-[2px] rounded-full"
          style={{ background: mix(V.acc, 20), top: isFirst ? '50%' : 0, bottom: isLast ? '50%' : 0 }}
        />
      )}
      <span
        aria-hidden
        className="absolute left-[13px] top-1/2 -translate-y-1/2 w-[10px] h-[10px] rounded-full border-2 border-white"
        style={{ background: dot, boxShadow: isLast ? `0 0 0 3px ${dot}2E` : `0 0 0 1px ${dot}40` }}
      />

      <span className="text-[12px] font-semibold tabular-nums" style={{ color: INK }}>{s.academicYear}</span>
      <span className="justify-self-start inline-flex items-center justify-center w-[68px] h-7 rounded-full border text-[11px] font-medium leading-none whitespace-nowrap" style={pill(yearHex)}>
        {s.year?.replace(' YEAR', ' YR') || '—'}
      </span>
      <span className="justify-self-start inline-flex items-center justify-center w-[46px] h-7 rounded-full border text-[11px] font-semibold leading-none" style={pill(courseHex)}>
        {s.course || '—'}
      </span>
      <span className="min-w-0 truncate text-[11.5px] font-medium" style={{ color: MUTED }} title={isCurrent ? `${meta} · CURRENT` : meta}>
        {meta || '—'}
        {/* Current academic year — outline pastel pill like the status pill, set apart from the meta text. */}
        {isCurrent && (
          <span
            title="Current academic year"
            className="ml-4 inline-flex items-center gap-1 h-[22px] rounded-full border px-2 align-middle text-[10px] font-medium leading-none tracking-[0.2px]"
            style={pastelVar()}
          >
            <span className="w-[5px] h-[5px] rounded-full" style={{ background: V.acc }} />
            CURRENT
          </span>
        )}
        {/* Reg no shown per row only when it differs from the profile chip (e.g. re-registered). */}
        {s.regNumber && s.regNumber !== groupRegNo && (
          <span className="ml-2 tabular-nums" style={{ color: FAINT }}>
            · {s.regNumber}
          </span>
        )}
      </span>
      <span className={`${ROW_PILL} justify-self-start`} style={pill(dot)}>
        {s.admissionStatus || 'PENDING'}
      </span>

      <div className="flex items-center gap-1.5 justify-end">
        <button onClick={onView} className={`${ACTION_BTN} px-2.5 hover:bg-(--dk-acc)/[0.08]`} style={{ borderColor: mix(V.acc, 35), color: V.ink }}>
          <Eye size={13} weight="bold" /> View
        </button>
        {isAdmin && (
          <button
            onClick={onEdit}
            title="Edit student"
            aria-label="Edit student"
            className={`${ACTION_BTN} w-7 hover:bg-(--dk-acc)/[0.08]`}
            style={{ borderColor: mix(V.acc, 35), color: V.ink }}
          >
            <PencilSimple size={13} weight="bold" />
          </button>
        )}
        {/* Same menu as right-click — certificates, results, re-enroll — made discoverable. */}
        <button
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            onContextMenu({ x: r.right - 220, y: r.bottom + 6 });
          }}
          onDoubleClick={(e) => e.stopPropagation()}
          title="More actions — certificates, results…"
          aria-label="More actions"
          className={`${ACTION_BTN} w-7 hover:bg-(--dk-acc)/[0.08]`}
          style={{ borderColor: mix(V.acc, 35), color: V.ink }}
        >
          <DotsThree size={15} weight="bold" />
        </button>
        {isAdmin && (
          isWPStudent(s) ? (
            <span title={WP_FEE_TITLE} className={`${ROW_PILL} cursor-default`} style={pill(WP_HEX)}>
              WP
            </span>
          ) : feeStatus === null ? (
            <span className="w-[96px] flex justify-center"><Shimmer w={96} h={28} /></span>
          ) : feeStatus === 'no-dues' ? (
            <span className={`${ROW_PILL} sr-pop gap-1 cursor-default`} style={pastelVar()}>
              <CheckCircle size={12} weight="fill" /> NO DUES
            </span>
          ) : (
            <button
              onClick={onCollect}
              title={feeStatus === 'dues' ? (due ? `Collect dues — ₹${due.toLocaleString('en-IN')} outstanding` : 'Collect dues') : 'Collect fee'}
              className={`${ROW_PILL} sr-pop tabular-nums whitespace-nowrap hover:brightness-95 transition-[filter] cursor-pointer`}
              style={feeStatus === 'dues' ? pill(AMBER) : pastelVar()}
            >
              {feeStatus === 'dues'
                ? (due ? `₹${due.toLocaleString('en-IN')}` : 'COLLECT DUES')
                : 'COLLECT FEE'}
            </button>
          )
        )}
      </div>
    </div>
  );
}

export interface SearchResultsProps {
  groups: StudentGroup[];
  query: string;
  feeStatus: Map<string, FeeStatus>;
  groupDue: Map<string, GroupDue>;
  /** Outstanding balance per enrollment id (only where it's > 0 and computable). */
  studentDue: Map<string, number>;
  feeLoading: boolean;
  isAdmin: boolean;
  currentAcademicYear: string;
  /** Groups eligible for next-year enrollment in the current academic year, by group key. */
  nextEnroll: Map<string, NextEnroll>;
  activeIdx: number;
  visibleCount: number;
  ctxStudentId: string | null;
  onShowMore: () => void;
  onClear: () => void;
  onView: (s: Student) => void;
  onEdit: (s: Student) => void;
  onCollect: (s: Student) => void;
  onReEnroll: (next: NextEnroll) => void;
  onRowContextMenu: (pos: MenuPos, s: Student) => void;
}

export function SearchResults({
  groups, query, feeStatus, groupDue, studentDue, feeLoading, isAdmin, currentAcademicYear, nextEnroll,
  activeIdx, visibleCount, ctxStudentId,
  onShowMore, onClear, onView, onEdit, onCollect, onReEnroll, onRowContextMenu,
}: SearchResultsProps) {
  const activeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeIdx]);

  // Collapse mode: a session-wide default plus per-card flips. The flips are tied to the
  // query they were made under, so a new search starts clean without a reset effect.
  const [allCollapsed, setAllCollapsed] = useState(false);
  const [flips, setFlips] = useState<{ query: string; keys: Set<string> }>({ query: '', keys: new Set() });
  const flipped = flips.query === query ? flips.keys : null;
  function toggleCard(key: string) {
    setFlips((f) => {
      const keys = new Set(f.query === query ? f.keys : []);
      if (keys.has(key)) keys.delete(key); else keys.add(key);
      return { query, keys };
    });
  }
  function toggleAll() {
    setAllCollapsed((c) => !c);
    setFlips({ query, keys: new Set() });
  }

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center sr-card">
        <span className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: mix(V.acc, 8), color: V.acc }}>
          <MagnifyingGlass size={26} weight="bold" />
        </span>
        <p className="mt-4 text-[15px] font-semibold" style={{ color: V.ink }}>
          No students match “{query.trim()}”
        </p>
        <p className="mt-1 text-[12px]" style={{ color: FAINT }}>Try a reg no, a mobile number or part of the name.</p>
        <button
          onClick={onClear}
          className="mt-4 rounded-full border bg-white px-3.5 py-1.5 text-[11.5px] font-medium hover:bg-(--dk-acc)/[0.06] transition-colors cursor-pointer"
          style={{ borderColor: V.border, color: V.ink }}
        >
          Clear search
        </button>
      </div>
    );
  }

  const enrollments = groups.reduce((t, g) => t + g.records.length, 0);
  let withDues = 0, noDues = 0, other = 0, wp = 0;
  for (const g of groups) {
    if (g.records.every(isWPStudent)) { wp++; continue; }
    const d = groupDue.get(g.key);
    if (typeof d === 'number') { if (d > 0) withDues++; else noDues++; } else other++;
  }
  const shown = groups.slice(0, visibleCount);
  const remaining = groups.length - shown.length;

  return (
    <div className="space-y-4 pb-4">
      {/* Summary bar */}
      <div className="flex items-center gap-2 flex-wrap px-1">
        <p className="text-[12.5px] font-medium" style={{ color: MUTED }}>
          <span className="font-semibold tabular-nums" style={{ color: INK }}>{groups.length}</span> student{groups.length !== 1 ? 's' : ''}
          <span className="mx-1.5" style={{ color: FAINT }}>·</span>
          <span className="font-semibold tabular-nums" style={{ color: INK }}>{enrollments}</span> enrollment{enrollments !== 1 ? 's' : ''}
        </p>
        <span className="rounded-full border px-2 py-[3px] text-[10.5px] font-medium leading-none" style={pastelVar()}>
          for “{query.trim()}”
        </span>
        <div className="flex items-center gap-1.5 ml-1">
          {feeLoading ? (
            <><Shimmer w={70} h={18} /><Shimmer w={70} h={18} /></>
          ) : (
            <>
              {withDues > 0 && (
                <span className="rounded-full border px-2 py-[3px] text-[10.5px] font-medium leading-none tabular-nums sr-pop" style={pastelVar(V.ink, V.ink)}>
                  {withDues} with dues
                </span>
              )}
              {noDues > 0 && (
                <span className="rounded-full border px-2 py-[3px] text-[10.5px] font-medium leading-none tabular-nums sr-pop" style={pastelVar()}>
                  {noDues} no dues
                </span>
              )}
              {other > 0 && (
                <span className="rounded-full border bg-white px-2 py-[3px] text-[10.5px] font-medium leading-none tabular-nums sr-pop" style={{ borderColor: V.border, color: FAINT }}>
                  {other} fee data n/a
                </span>
              )}
              {wp > 0 && (
                <span className="rounded-full border px-2 py-[3px] text-[10.5px] font-medium leading-none tabular-nums sr-pop" style={pill(WP_HEX)}>
                  {wp} WP
                </span>
              )}
            </>
          )}
        </div>
        {groups.length > 1 && (
          <button
            onClick={toggleAll}
            className="ml-auto inline-flex items-center gap-1 rounded-full border bg-white px-2.5 py-[5px] text-[11px] font-medium leading-none hover:bg-(--dk-acc)/[0.06] hover:border-(--dk-acc)/50 transition-colors cursor-pointer"
            style={{ borderColor: V.border, color: V.ink }}
          >
            {allCollapsed ? <CaretDown size={11} weight="bold" /> : <CaretUp size={11} weight="bold" />}
            {allCollapsed ? 'Expand all' : 'Collapse all'}
          </button>
        )}
        <div className={`${groups.length > 1 ? 'ml-2' : 'ml-auto'} hidden md:flex items-center gap-1.5 text-[10px] font-medium`} style={{ color: FAINT }}>
          <kbd className="sr-kbd">↑</kbd><kbd className="sr-kbd">↓</kbd> navigate
          <kbd className="sr-kbd ml-1.5">Enter</kbd> details
          <kbd className="sr-kbd ml-1.5">Esc</kbd> clear
        </div>
      </div>

      {shown.map((group, idx) => {
        const latest = group.records[group.records.length - 1];
        const regNo = [...group.records].reverse().find((r) => r.regNumber)?.regNumber ?? '';
        const mobile = [...group.records].reverse().map((r) => r.studentMobile || r.fatherMobile).find(Boolean) ?? '';
        // Details dropped from the header stay one hover away on the name.
        const nameTitle = [
          group.nameSSLC,
          group.nameAadhar && group.nameAadhar !== group.nameSSLC ? `Aadhaar: ${group.nameAadhar}` : '',
          group.dob ? `DOB: ${group.dob}` : '',
          mobile ? `Mobile: ${mobile}` : '',
        ].filter(Boolean).join('\n');
        const hint = matchHint(group, query);
        const next = isAdmin ? nextEnroll.get(group.key) : undefined;
        const avatarHex = group.gender === 'GIRL' ? GIRL_HEX : BOY_HEX;
        const courseHex = COURSE_HEX[latest?.course as keyof typeof COURSE_HEX] ?? PERI;
        const active = idx === activeIdx;
        const groupIsWP = group.records.every(isWPStudent);
        const hasWP = group.records.some(isWPStudent);
        // The keyboard-active card always stays open so ↑/↓ still shows its rows.
        const collapsed = !active && allCollapsed !== (flipped?.has(group.key) ?? false);
        const extra = group.records.length - 1;
        return (
          <div
            key={group.key}
            ref={active ? activeRef : undefined}
            className={`${CARD} sr-card overflow-hidden`}
            style={{
              '--i': Math.min(idx % SEARCH_PAGE_SIZE, 8),
              // Neutral hairline on the card itself; a thin accent line (follows search mode)
              // sits just outside it with a 3px white gap between, so adjacent cards read as
              // clearly separate. Thicker and full-strength when keyboard-active.
              boxShadow: active
                ? `0 0 0 3px #fff, 0 0 0 5px ${V.acc}, 0 8px 22px rgba(63,75,184,0.12)`
                : `0 0 0 3px #fff, 0 0 0 4px ${mix(V.acc, 55)}, 0 2px 6px rgba(63,75,184,0.07)`,
            } as CSSProperties}
          >

            {/* Profile header — solid tinted band so every card clearly starts here.
                Clicking empty space toggles the card; buttons inside keep their own action.
                pr-5 puts the fee block on the same right edge as the row fee buttons. */}
            <div
              className="flex items-center gap-3 pl-4 pr-5 py-2 cursor-pointer select-none"
              style={{ background: V.band }}
              onClick={(e) => { if (!(e.target as HTMLElement).closest('button')) toggleCard(group.key); }}
              title={collapsed ? 'Click to show enrollments' : 'Click to collapse'}
            >
             <span
               aria-hidden
               className="shrink-0 flex transition-transform duration-200"
               style={{ color: V.acc, transform: collapsed ? 'rotate(-90deg)' : 'none' }}
             >
               <CaretDown size={13} weight="bold" />
             </span>
             <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="relative shrink-0">
                <span
                  className="w-9 h-9 rounded-full flex items-center justify-center text-[12.5px] font-semibold text-white border-2 border-white"
                  style={{ background: `linear-gradient(135deg, ${avatarHex}B3 0%, ${avatarHex} 100%)`, boxShadow: `0 2px 8px ${avatarHex}40` }}
                >
                  {initials(group.nameSSLC)}
                </span>
                {latest?.course && (
                  <span
                    className="absolute -right-1 -bottom-1 rounded-full border-2 border-white px-[4px] py-[1px] text-[8px] font-bold leading-none text-white"
                    style={{ background: courseHex }}
                  >
                    {latest.course}
                  </span>
                )}
              </div>

              {/* One line: name (S/o father) · Reg No · why-it-matched hint · WP.
                  DOB / mobile / Aadhaar name live in the name's tooltip. */}
              <div className="min-w-0 flex-1 flex items-center gap-2 flex-wrap gap-y-1">
                <p className="min-w-0 max-w-full text-[15px] font-semibold leading-tight truncate cursor-default" style={{ color: V.ink }} title={nameTitle}>
                  {group.nameSSLC}
                  {group.fatherName && (
                    <span className="font-normal text-[12px]" style={{ color: FAINT }}>
                      {'  '}{group.gender === 'BOY' ? 'S/o' : 'D/o'} {group.fatherName}
                    </span>
                  )}
                </p>
                {regNo ? (
                  <RegNoPill regNo={regNo} />
                ) : (
                  <span
                    className="shrink-0 inline-flex items-center gap-1 h-7 rounded-full border border-dashed bg-white px-2.5 text-[11px] font-medium leading-none whitespace-nowrap"
                    style={{ borderColor: mix(V.acc, 40), color: FAINT }}
                  >
                    <IdentificationCard size={13} weight="bold" /> No Reg No
                  </span>
                )}
                {hint && <MatchHintChip hint={hint} />}
                {hasWP && (
                  <span
                    title="Working Professional (Evening College)"
                    className="shrink-0 inline-flex items-center h-6 rounded-full border px-2 text-[10.5px] font-semibold leading-none whitespace-nowrap"
                    style={pill(WP_HEX)}
                  >
                    WP
                  </span>
                )}
                {/* Collapsed: a one-line peek at the latest enrollment instead of the timeline. */}
                {collapsed && latest && (
                  <span className="sr-fade shrink-0 inline-flex items-center gap-1.5 text-[11px] font-medium whitespace-nowrap tabular-nums" style={{ color: MUTED }}>
                    {[latest.course, latest.year?.replace(' YEAR', ' YR'), latest.academicYear].filter(Boolean).join(' · ')}
                    {extra > 0 && (
                      <span
                        title={`${extra} more enrollment${extra !== 1 ? 's' : ''}`}
                        className="rounded-full border bg-white px-1.5 py-[2px] text-[10px] leading-none"
                        style={{ borderColor: V.bandBorder, color: V.ink }}
                      >
                        +{extra}
                      </span>
                    )}
                  </span>
                )}
              </div>

             </div>

              {next && (
                <button
                  onClick={() => onReEnroll(next)}
                  title={`Enroll for ${next.targetYear.toLowerCase()} in ${next.targetAcademicYear}`}
                  className={`${ACTION_BTN} shrink-0 px-2.5 hover:bg-(--dk-acc)/[0.08]`}
                  style={{ borderColor: mix(V.acc, 35), color: V.ink }}
                >
                  <ArrowUp size={12} weight="bold" />
                  Enroll {NEXT_LABEL[next.targetYear]}
                </button>
              )}

              {/* Same 98px column as the row fee pills, so header and row statuses line up */}
              <div className="shrink-0 min-w-[98px] flex justify-center">
                {groupIsWP ? (
                  <span title={WP_FEE_TITLE} className="inline-flex items-center justify-center w-[98px] h-7 rounded-full border text-[11px] font-medium cursor-default" style={pill(WP_HEX)}>
                    WP Fee
                  </span>
                ) : (
                  <FeeSummary due={groupDue.get(group.key)} loading={feeLoading} />
                )}
              </div>
            </div>

            {/* Enrollment timeline */}
            {!collapsed && (
            <div className="px-2 pb-2 pt-1 border-t" style={{ borderColor: V.bandBorder }}>
              {group.records.map((s, i) => (
                <EnrollmentRow
                  key={s.id}
                  s={s}
                  isFirst={i === 0}
                  isLast={i === group.records.length - 1}
                  isCurrent={!!currentAcademicYear && s.academicYear === currentAcademicYear}
                  groupRegNo={regNo}
                  isAdmin={isAdmin}
                  feeStatus={feeLoading ? null : (feeStatus.get(s.id) ?? 'collect')}
                  due={studentDue.get(s.id)}
                  ctxActive={ctxStudentId === s.id}
                  onView={() => onView(s)}
                  onEdit={() => onEdit(s)}
                  onCollect={() => onCollect(s)}
                  onContextMenu={(pos) => onRowContextMenu(pos, s)}
                />
              ))}
            </div>
            )}
          </div>
        );
      })}

      {remaining > 0 && (
        <div className="flex justify-center pt-1">
          <button
            onClick={onShowMore}
            className="inline-flex items-center gap-1.5 rounded-full border bg-white px-4 py-2 text-[12px] font-medium hover:bg-(--dk-acc)/[0.06] hover:border-(--dk-acc)/50 transition-colors cursor-pointer"
            style={{ borderColor: V.border, color: V.ink }}
          >
            <ArrowDown size={13} weight="bold" />
            Show {Math.min(SEARCH_PAGE_SIZE, remaining)} more
            <span style={{ color: FAINT }}>· {remaining} remaining</span>
          </button>
        </div>
      )}
    </div>
  );
}
