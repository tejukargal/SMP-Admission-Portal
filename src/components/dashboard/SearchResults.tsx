import { useEffect, useRef, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import {
  IdentificationCard, Phone, Cake, Stack, Eye, PencilSimple, MagnifyingGlass, CheckCircle, ArrowDown,
} from '@phosphor-icons/react';
import type { Student, Gender } from '../../types';
import {
  CARD, pastel, PERI, PERI_INK, PERI_BORDER, PERI_DIVIDER, INK, MUTED, FAINT, PAID, DUE,
  MINT, AMBER, CORAL, COURSE_HEX, YEAR_HEX, BOY_HEX, GIRL_HEX, SEARCH_PAGE_SIZE,
} from './dashTokens';

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

const STATUS_HEX = (status: string) =>
  status === 'CONFIRMED' ? MINT : status === 'CANCELLED' ? CORAL : AMBER;

const pill = (c: string): CSSProperties => ({ ...pastel(c), borderWidth: 1 });

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
      <mark key={hit} className="rounded-[3px] px-[1px] text-inherit" style={{ background: `${PERI}38`, color: 'inherit' }}>
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

function FactChip({ icon, children, title }: { icon: ReactNode; children: ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1 h-7 rounded-full border bg-white px-2 text-[11px] font-medium leading-none tabular-nums whitespace-nowrap"
      style={{ borderColor: PERI_BORDER, color: MUTED }}
    >
      <span className="flex" style={{ color: PERI }}>{icon}</span>
      {children}
    </span>
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
      <div className="sr-pop text-center leading-none">
        <p className="text-[18px] font-semibold tabular-nums tracking-[-0.2px]" style={{ color: DUE }}>
          ₹{due.toLocaleString('en-IN')}
        </p>
        <p className="mt-1 text-[9.5px] font-medium uppercase tracking-[0.8px]" style={{ color: FAINT }}>Total due</p>
      </div>
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
  s, isFirst, isLast, groupRegNo, query, isAdmin, feeStatus, ctxActive, onView, onEdit, onCollect, onContextMenu,
}: {
  s: Student; isFirst: boolean; isLast: boolean; groupRegNo: string; query: string; isAdmin: boolean; feeStatus: FeeStatus | null; ctxActive: boolean;
  onView: () => void; onEdit: () => void; onCollect: () => void; onContextMenu: (e: MouseEvent) => void;
}) {
  const dot = STATUS_HEX(s.admissionStatus?.trim() ?? '');
  const courseHex = COURSE_HEX[s.course as keyof typeof COURSE_HEX] ?? PERI;
  const yearHex = YEAR_HEX[s.year as keyof typeof YEAR_HEX] ?? PERI;
  const meta = [s.admType, s.admCat, s.category].filter(Boolean).join(' · ');
  return (
    <div
      className={`group/row relative grid items-center gap-x-3 pl-9 pr-3 py-2 rounded-xl cursor-context-menu select-none transition-colors ${
        ctxActive ? 'row-ctx-active-peri' : 'hover:bg-[#F5F6FF]'
      }`}
      style={{ gridTemplateColumns: '64px 80px 50px minmax(0,1fr) 104px auto' }}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu(e); }}
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
        {isAdmin && (
          feeStatus === null ? (
            <span className="w-[98px] flex justify-center"><Shimmer w={98} h={28} /></span>
          ) : feeStatus === 'no-dues' ? (
            <span className="sr-pop inline-flex items-center justify-center gap-1 w-[98px] h-7 rounded-full border text-[11px] font-medium cursor-default" style={pill(PAID)}>
              <CheckCircle size={12} weight="fill" /> No Dues
            </span>
          ) : (
            <button
              onClick={onCollect}
              className="sr-pop inline-flex items-center justify-center w-[98px] h-7 rounded-full text-[11px] font-medium text-white hover:brightness-95 transition-[filter] cursor-pointer"
              style={{
                background: feeStatus === 'dues' ? AMBER : PERI,
                boxShadow: `0 2px 8px ${feeStatus === 'dues' ? AMBER : PERI}40`,
              }}
            >
              {feeStatus === 'dues' ? 'Collect Dues' : 'Collect Fee'}
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
  feeLoading: boolean;
  isAdmin: boolean;
  activeIdx: number;
  visibleCount: number;
  ctxStudentId: string | null;
  onShowMore: () => void;
  onClear: () => void;
  onView: (s: Student) => void;
  onEdit: (s: Student) => void;
  onCollect: (s: Student) => void;
  onRowContextMenu: (e: MouseEvent, s: Student) => void;
}

export function SearchResults({
  groups, query, feeStatus, groupDue, feeLoading, isAdmin, activeIdx, visibleCount, ctxStudentId,
  onShowMore, onClear, onView, onEdit, onCollect, onRowContextMenu,
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
  let withDues = 0, noDues = 0, other = 0;
  for (const g of groups) {
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
        const avatarHex = group.gender === 'GIRL' ? GIRL_HEX : BOY_HEX;
        const courseHex = COURSE_HEX[latest?.course as keyof typeof COURSE_HEX] ?? PERI;
        const active = idx === activeIdx;
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
              className="flex items-center gap-3 pl-4 pr-5 pt-1.5 pb-[5px]"
              style={{ background: 'linear-gradient(135deg,#F3F4FF 0%,#FFFFFF 70%)' }}
            >
             <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="relative shrink-0">
                <span
                  className="w-10 h-10 rounded-full flex items-center justify-center text-[13px] font-semibold text-white border-2 border-white"
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

              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold leading-tight truncate" style={{ color: PERI_INK }}>
                  <Highlight text={group.nameSSLC} query={query} />
                  {group.fatherName && (
                    <span className="font-normal text-[12.5px]" style={{ color: FAINT }}>
                      {'  '}{group.gender === 'BOY' ? 'S/o' : 'D/o'} {group.fatherName}
                    </span>
                  )}
                </p>
                {group.nameAadhar && group.nameAadhar !== group.nameSSLC && (
                  <p className="text-[11px] leading-tight truncate mt-0.5" style={{ color: FAINT }}>
                    Aadhaar: <Highlight text={group.nameAadhar} query={query} />
                  </p>
                )}
                <div className="mt-1 flex items-end gap-1.5 flex-wrap">
                  {mobile && <FactChip icon={<Phone size={12} weight="bold" />} title="Mobile"><Highlight text={mobile} query={query} /></FactChip>}
                  <FactChip icon={<Cake size={12} weight="bold" />} title="Date of birth">{group.dob || '—'}</FactChip>
                  <FactChip icon={<Stack size={12} weight="bold" />}>
                    {group.records.length} enrollment{group.records.length !== 1 ? 's' : ''}
                  </FactChip>
                  {/* Register No — primary identity: name-style type in a periwinkle pill
                      (same pastel accent as the year/course pills). */}
                  {regNo ? (
                    <span
                      title="Register No"
                      className="inline-flex items-center gap-1.5 h-7 rounded-full border px-2.5 text-[15px] font-semibold leading-none tabular-nums whitespace-nowrap"
                      style={{ ...pill(PERI), color: PERI_INK }}
                    >
                      <IdentificationCard size={14} weight="bold" style={{ color: PERI }} />
                      <Highlight text={regNo} query={query} />
                    </span>
                  ) : (
                    <span
                      className="inline-flex items-center gap-1 h-7 rounded-full border border-dashed bg-white px-2.5 text-[11.5px] font-medium leading-none whitespace-nowrap"
                      style={{ borderColor: `${PERI}66`, color: FAINT }}
                    >
                      <IdentificationCard size={13} weight="bold" /> No Reg No
                    </span>
                  )}
                </div>
              </div>

             </div>

              {/* Same 98px column as the row fee pills, so header and row statuses line up */}
              <div className="shrink-0 min-w-[98px] flex justify-center">
                <FeeSummary due={groupDue.get(group.key)} loading={feeLoading} />
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
                  groupRegNo={regNo}
                  query={query}
                  isAdmin={isAdmin}
                  feeStatus={feeLoading ? null : (feeStatus.get(s.id) ?? 'collect')}
                  ctxActive={ctxStudentId === s.id}
                  onView={() => onView(s)}
                  onEdit={() => onEdit(s)}
                  onCollect={() => onCollect(s)}
                  onContextMenu={(e) => onRowContextMenu(e, s)}
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
