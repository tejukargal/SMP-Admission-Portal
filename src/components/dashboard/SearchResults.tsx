import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import {
  IdentificationCard, IdentificationBadge, Phone, Eye, PencilSimple, MagnifyingGlass, CheckCircle, ArrowDown,
  ArrowUp, Check, DotsThree,
} from '@phosphor-icons/react';
import type { Student, Gender, Year, AcademicYear } from '../../types';
import {
  CARD, pastel, PERI, PERI_INK, PERI_BORDER, PERI_DIVIDER, INK, MUTED, FAINT, PAID, DUE,
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

// Working Professional (EXTERNAL) teal — same hue as the EXTERNAL pill in StudentDetailModal.
// WP fee is tracked as manual counts, not feeRecords, so WP enrollments show this
// badge in place of fee pills / dues.
const WP_HEX = '#0F8B8D';
const WP_FEE_TITLE = 'Working Professional — fee tracked separately in WP Fee Distribution';

/** First letters of the first two name words, skipping single-letter initials ("RAVI K M" → "RK"). */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const full = words.filter((w) => w.length > 1);
  const pick = full.length ? full : words;
  return ((pick[0]?.[0] ?? '') + (pick[1]?.[0] ?? '')).toUpperCase() || '?';
}

/** Wraps every case-insensitive occurrence of `query` in a soft periwinkle mark. */
function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q || !text) return <>{text}</>;
  const out: ReactNode[] = [];
  const hay = text.toUpperCase();
  const needle = q.toUpperCase();
  let i = 0;
  let hit = hay.indexOf(needle);
  while (hit !== -1) {
    if (hit > i) out.push(text.slice(i, hit));
    out.push(
      <mark key={hit} className="rounded-[5px] px-[2px] -mx-[1px] text-inherit" style={{ background: `${PERI}1F`, color: 'inherit', boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone' }}>
        {text.slice(hit, hit + needle.length)}
      </mark>,
    );
    i = hit + needle.length;
    hit = hay.indexOf(needle, i);
  }
  if (i < text.length) out.push(text.slice(i));
  return <>{out}</>;
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

function MatchHintChip({ hint, query }: { hint: MatchHint; query: string }) {
  return (
    <span
      title={`Matched on ${HINT_LABEL[hint.kind]}`}
      className="sr-pop inline-flex items-center gap-1 h-6 min-w-0 max-w-[260px] rounded-full border bg-white px-2 text-[10.5px] font-medium leading-none tabular-nums whitespace-nowrap"
      style={{ borderColor: PERI_BORDER, color: MUTED }}
    >
      <span className="flex shrink-0" style={{ color: PERI }}>
        {hint.kind === 'aadhaar' ? <IdentificationBadge size={11} weight="bold" /> : <Phone size={11} weight="bold" />}
      </span>
      <span className="shrink-0" style={{ color: FAINT }}>{HINT_LABEL[hint.kind]}</span>
      <span className="truncate"><Highlight text={hint.text} query={query} /></span>
    </span>
  );
}

/** Register No — the card's primary identity. Click copies it (icon flips to a tick briefly). */
function RegNoPill({ regNo, query }: { regNo: string; query: string }) {
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
      className="shrink-0 inline-flex items-center gap-1.5 h-7 rounded-full border px-2.5 text-[14px] font-semibold leading-none tabular-nums whitespace-nowrap cursor-copy hover:brightness-[0.97] transition-[filter] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6B7CF6]/35"
      style={{ ...pill(PERI), color: PERI_INK }}
    >
      {copied
        ? <Check size={13} weight="bold" className="sr-pop" style={{ color: PAID }} />
        : <IdentificationCard size={14} weight="bold" style={{ color: PERI }} />}
      <Highlight text={regNo} query={query} />
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
      <span className="sr-pop inline-flex items-center h-7 rounded-full border bg-white px-3 text-[11px] font-medium" style={{ borderColor: PERI_BORDER, color: FAINT }}>
        {due === null ? 'Fee structure not set' : 'Fee records unavailable'}
      </span>
    );
  }
  if (due > 0) {
    return (
      <p className="sr-pop flex items-baseline gap-1 leading-none whitespace-nowrap" title="Total due across all enrollments">
        <span className="text-[16px] font-semibold tabular-nums tracking-[-0.2px]" style={{ color: DUE }}>
          ₹{due.toLocaleString('en-IN')}
        </span>
        <span className="text-[9.5px] font-medium uppercase tracking-[0.8px]" style={{ color: FAINT }}>due</span>
      </p>
    );
  }
  return (
    <span className="sr-pop inline-flex items-center justify-center gap-1 w-[98px] h-7 rounded-full border text-[11px] font-medium" style={pill(PAID)}>
      <CheckCircle size={12} weight="fill" /> No Dues
    </span>
  );
}

const ACTION_BTN =
  'inline-flex items-center justify-center gap-1 rounded-full border bg-white h-7 text-[11px] font-medium transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6B7CF6]/35';

function EnrollmentRow({
  s, isFirst, isLast, isCurrent, groupRegNo, query, isAdmin, feeStatus, due, ctxActive, onView, onEdit, onCollect, onContextMenu,
}: {
  s: Student; isFirst: boolean; isLast: boolean; isCurrent: boolean; groupRegNo: string; query: string; isAdmin: boolean;
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
        ctxActive ? 'row-ctx-active-peri' : isCurrent ? 'bg-[#6B7CF6]/[0.045] hover:bg-[#F0F2FE]' : 'hover:bg-[#F5F6FF]'
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
          style={{ background: `${PERI}33`, top: isFirst ? '50%' : 0, bottom: isLast ? '50%' : 0 }}
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
      <span className="min-w-0 truncate text-[11.5px] font-medium" style={{ color: MUTED }} title={meta}>
        {isCurrent && (
          <span
            title="Current academic year"
            className="mr-2 inline-flex items-center gap-1 rounded-full px-1.5 py-[2px] align-[1px] text-[9px] font-semibold uppercase tracking-[0.6px] leading-none"
            style={{ background: `${PERI}1A`, color: PERI_INK }}
          >
            <span className="w-[5px] h-[5px] rounded-full" style={{ background: PERI }} />
            Current
          </span>
        )}
        {meta || '—'}
        {/* Reg no shown per row only when it differs from the profile chip (e.g. re-registered). */}
        {s.regNumber && s.regNumber !== groupRegNo && (
          <span className="ml-2 tabular-nums" style={{ color: FAINT }}>
            · <Highlight text={s.regNumber} query={query} />
          </span>
        )}
      </span>
      <span className="justify-self-start inline-flex items-center justify-center w-[96px] h-7 rounded-full border text-[10.5px] font-medium leading-none tracking-[0.2px]" style={pill(dot)}>
        {s.admissionStatus || 'PENDING'}
      </span>

      <div className="flex items-center gap-1.5 justify-end">
        <button onClick={onView} className={`${ACTION_BTN} px-2.5 hover:bg-[#6B7CF6]/[0.08]`} style={{ borderColor: `${PERI}59`, color: PERI_INK }}>
          <Eye size={13} weight="bold" /> View
        </button>
        {isAdmin && (
          <button
            onClick={onEdit}
            title="Edit student"
            aria-label="Edit student"
            className={`${ACTION_BTN} w-7 hover:bg-[#6B7CF6]/[0.08]`}
            style={{ borderColor: `${PERI}59`, color: PERI_INK }}
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
          className={`${ACTION_BTN} w-7 hover:bg-[#6B7CF6]/[0.08]`}
          style={{ borderColor: `${PERI}59`, color: PERI_INK }}
        >
          <DotsThree size={15} weight="bold" />
        </button>
        {isAdmin && (
          isWPStudent(s) ? (
            <span title={WP_FEE_TITLE} className="inline-flex items-center justify-center w-[98px] h-7 rounded-full border text-[11px] font-medium cursor-default" style={pill(WP_HEX)}>
              WP
            </span>
          ) : feeStatus === null ? (
            <span className="w-[98px] flex justify-center"><Shimmer w={98} h={28} /></span>
          ) : feeStatus === 'no-dues' ? (
            <span className="sr-pop inline-flex items-center justify-center gap-1 w-[98px] h-7 rounded-full border text-[11px] font-medium cursor-default" style={pill(PAID)}>
              <CheckCircle size={12} weight="fill" /> No Dues
            </span>
          ) : (
            <button
              onClick={onCollect}
              title={feeStatus === 'dues' ? (due ? `Collect dues — ₹${due.toLocaleString('en-IN')} outstanding` : 'Collect dues') : 'Collect fee'}
              className="sr-pop inline-flex items-center justify-center w-[98px] h-7 rounded-full text-[11px] font-medium text-white tabular-nums whitespace-nowrap hover:brightness-95 transition-[filter] cursor-pointer"
              style={{
                background: feeStatus === 'dues' ? AMBER : PERI,
                boxShadow: `0 2px 8px ${feeStatus === 'dues' ? AMBER : PERI}40`,
              }}
            >
              {feeStatus === 'dues'
                ? (due ? `₹${due.toLocaleString('en-IN')} due` : 'Collect Dues')
                : 'Collect Fee'}
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

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center sr-card">
        <span className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: `${PERI}14`, color: PERI }}>
          <MagnifyingGlass size={26} weight="bold" />
        </span>
        <p className="mt-4 text-[15px] font-semibold" style={{ color: PERI_INK }}>
          No students match “{query.trim()}”
        </p>
        <p className="mt-1 text-[12px]" style={{ color: FAINT }}>Try a reg no, a mobile number or part of the name.</p>
        <button
          onClick={onClear}
          className="mt-4 rounded-full border bg-white px-3.5 py-1.5 text-[11.5px] font-medium hover:bg-[#6B7CF6]/[0.06] transition-colors cursor-pointer"
          style={{ borderColor: PERI_BORDER, color: PERI_INK }}
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
    <div className="space-y-3 pb-4">
      {/* Summary bar */}
      <div className="flex items-center gap-2 flex-wrap px-1">
        <p className="text-[12.5px] font-medium" style={{ color: MUTED }}>
          <span className="font-semibold tabular-nums" style={{ color: INK }}>{groups.length}</span> student{groups.length !== 1 ? 's' : ''}
          <span className="mx-1.5" style={{ color: FAINT }}>·</span>
          <span className="font-semibold tabular-nums" style={{ color: INK }}>{enrollments}</span> enrollment{enrollments !== 1 ? 's' : ''}
        </p>
        <span className="rounded-full border px-2 py-[3px] text-[10.5px] font-medium leading-none" style={pill(PERI)}>
          for “{query.trim()}”
        </span>
        <div className="flex items-center gap-1.5 ml-1">
          {feeLoading ? (
            <><Shimmer w={70} h={18} /><Shimmer w={70} h={18} /></>
          ) : (
            <>
              {withDues > 0 && (
                <span className="rounded-full border px-2 py-[3px] text-[10.5px] font-medium leading-none tabular-nums sr-pop" style={pill(DUE)}>
                  {withDues} with dues
                </span>
              )}
              {noDues > 0 && (
                <span className="rounded-full border px-2 py-[3px] text-[10.5px] font-medium leading-none tabular-nums sr-pop" style={pill(PAID)}>
                  {noDues} no dues
                </span>
              )}
              {other > 0 && (
                <span className="rounded-full border bg-white px-2 py-[3px] text-[10.5px] font-medium leading-none tabular-nums sr-pop" style={{ borderColor: PERI_BORDER, color: FAINT }}>
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
        <div className="ml-auto hidden md:flex items-center gap-1.5 text-[10px] font-medium" style={{ color: FAINT }}>
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
        return (
          <div
            key={group.key}
            ref={active ? activeRef : undefined}
            className={`${CARD} sr-card overflow-hidden !border-[#C9D0F8]`}
            style={{
              '--i': Math.min(idx % SEARCH_PAGE_SIZE, 8),
              // Hairline border + a thin periwinkle accent line just outside it (white gap
              // between) so adjacent cards read as clearly separate; stronger when active.
              boxShadow: active
                ? `0 0 0 2px #fff, 0 0 0 4px ${PERI}73, 0 8px 22px rgba(63,75,184,0.12)`
                : `0 0 0 2px #fff, 0 0 0 3px ${PERI}26`,
            } as CSSProperties}
          >
            {/* Profile header */}
            {/* pr-5 puts the fee block on the same right edge as the row fee buttons */}
            <div
              className="flex items-center gap-3 pl-4 pr-5 py-2"
              style={{ background: 'linear-gradient(135deg,#F3F4FF 0%,#FFFFFF 70%)' }}
            >
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
                <p className="min-w-0 max-w-full text-[15px] font-semibold leading-tight truncate cursor-default" style={{ color: PERI_INK }} title={nameTitle}>
                  <Highlight text={group.nameSSLC} query={query} />
                  {group.fatherName && (
                    <span className="font-normal text-[12px]" style={{ color: FAINT }}>
                      {'  '}{group.gender === 'BOY' ? 'S/o' : 'D/o'} {group.fatherName}
                    </span>
                  )}
                </p>
                {regNo ? (
                  <RegNoPill regNo={regNo} query={query} />
                ) : (
                  <span
                    className="shrink-0 inline-flex items-center gap-1 h-7 rounded-full border border-dashed bg-white px-2.5 text-[11px] font-medium leading-none whitespace-nowrap"
                    style={{ borderColor: `${PERI}66`, color: FAINT }}
                  >
                    <IdentificationCard size={13} weight="bold" /> No Reg No
                  </span>
                )}
                {hint && <MatchHintChip hint={hint} query={query} />}
                {hasWP && (
                  <span
                    title="Working Professional (Evening College)"
                    className="shrink-0 inline-flex items-center h-6 rounded-full border px-2 text-[10.5px] font-semibold leading-none whitespace-nowrap"
                    style={pill(WP_HEX)}
                  >
                    WP
                  </span>
                )}
              </div>

             </div>

              {next && (
                <button
                  onClick={() => onReEnroll(next)}
                  title={`Enroll for ${next.targetYear.toLowerCase()} in ${next.targetAcademicYear}`}
                  className={`${ACTION_BTN} shrink-0 px-2.5 hover:bg-[#6B7CF6]/[0.08]`}
                  style={{ borderColor: `${PERI}59`, color: PERI_INK }}
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
            <div className="px-2 pb-2 pt-1 border-t" style={{ borderColor: PERI_DIVIDER }}>
              {group.records.map((s, i) => (
                <EnrollmentRow
                  key={s.id}
                  s={s}
                  isFirst={i === 0}
                  isLast={i === group.records.length - 1}
                  isCurrent={!!currentAcademicYear && s.academicYear === currentAcademicYear}
                  groupRegNo={regNo}
                  query={query}
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
          </div>
        );
      })}

      {remaining > 0 && (
        <div className="flex justify-center pt-1">
          <button
            onClick={onShowMore}
            className="inline-flex items-center gap-1.5 rounded-full border bg-white px-4 py-2 text-[12px] font-medium hover:bg-[#6B7CF6]/[0.06] hover:border-[#6B7CF6]/50 transition-colors cursor-pointer"
            style={{ borderColor: PERI_BORDER, color: PERI_INK }}
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
