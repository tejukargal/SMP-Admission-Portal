import { useMemo, useState } from 'react';
import { buildSummaryTabs, exportSummaryWorkbook, type SummaryInput, type SummaryTable } from '../../utils/summaryReport';

// ─── Dashboard Summary — tabbed report ───────────────────────────────────────
// Overview · Adm Type · Category · Cat & Gender · Year & Gender · Date-wise ·
// Status · Year-on-year · Profile. Scoped to the Dashboard filters (passed in
// pre-filtered). Tables come from buildSummaryTabs(); the same model feeds the
// PDF (current tab) and Excel (every tab) exports.

const TAB_KEY = 'smp_summary_tab';

// Emerald accent, matching the original Summary modal
const LINE = '#9FE3CD';
const SOFT = '#B7EAD9';
const TINT = '#EEFAF6';
const INK = '#096B4B';
const ACCENT = '#0E9D6E';

function readTab(): string {
  try { return localStorage.getItem(TAB_KEY) ?? 'overview'; } catch { return 'overview'; }
}

function SummaryTableView({ table }: { table: SummaryTable }) {
  // "Type Total" / "Gender Total" style columns read as totals within a row
  const totalCols = new Set(table.columns.flatMap((h, i) => (i > 1 && /total$/i.test(h) ? [i] : [])));
  const dense = table.columns.length > 14; // e.g. Cat & Gender's 21 columns
  const px = dense ? 'px-1.5' : 'px-2';
  return (
    <div className="min-w-0">
      <p className="px-1 pb-1 text-[10px] font-medium uppercase tracking-[0.8px]" style={{ color: INK }}>{table.title}</p>
      <div className="overflow-x-auto rounded-xl border" style={{ borderColor: SOFT }}>
        <table className="w-full border-collapse text-[12px]">
          <thead>
            {table.groups && (
              <tr style={{ background: TINT }}>
                {table.groups.map((g, gi) => (
                  <th
                    key={gi}
                    colSpan={g.span}
                    className={`${px} pt-1 pb-0 text-center font-medium whitespace-nowrap uppercase tracking-wide text-[10px] ${gi > 0 ? 'border-l' : ''}`}
                    style={{ color: INK, borderColor: SOFT }}
                  >
                    {g.label}
                  </th>
                ))}
              </tr>
            )}
            <tr className="border-b" style={{ borderColor: LINE, background: TINT }}>
              {table.columns.map((h, i) => (
                <th
                  key={h + i}
                  className={`${totalCols.has(i) ? 'bg-[#E1F6EE]' : ''} ${px} py-1 font-medium whitespace-nowrap uppercase tracking-wide text-[10px] ${i < 2 ? 'text-left' : 'text-right'}`}
                  style={{ color: INK }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((r, ri) => {
              const style =
                r.kind === 'grand' ? { background: '#ECEFFD', color: '#3F4BB8' }
                : r.kind === 'subtotal' || r.kind === 'share' ? { background: `${TINT}cc`, color: INK }
                : undefined;
              return (
                <tr
                  key={ri}
                  className={r.kind === 'row' ? 'border-b border-gray-100 hover:bg-[#EEFAF6]/40 transition-colors' : `font-medium border-y ${r.kind === 'share' ? 'italic' : ''}`}
                  style={{ ...style, borderColor: r.kind === 'grand' ? '#CDD4F7' : r.kind !== 'row' ? SOFT : undefined }}
                >
                  {r.cells.map((c, ci) => (
                    <td
                      key={ci}
                      className={`${px} py-[3px] whitespace-nowrap ${ci < 2 ? 'text-left' : 'text-right tabular-nums'} ${
                        r.kind === 'row' ? (ci === 0 ? 'text-gray-400 text-[11.5px]' : 'text-gray-700') : ''
                      } ${r.kind === 'row' && (ci === 1 || totalCols.has(ci)) ? 'font-medium' : ''}`}
                    >
                      {c}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {table.note && <p className="px-1 pt-1.5 text-[11px] italic text-gray-500">{table.note}</p>}
    </div>
  );
}

export function SummaryModal({ input, filterLabel, initialTab, onClose }: {
  input: SummaryInput;
  /** Active Dashboard filters, e.g. "CE · 1ST YEAR" ('' when none). */
  filterLabel: string;
  /** Open on this tab (stats-pill shortcut); otherwise the last-used tab. */
  initialTab?: string;
  onClose: () => void;
}) {
  const tabs = useMemo(() => buildSummaryTabs(input), [input]);
  const scope = input.year ?? 'All Years';
  const [tabId, setTabId] = useState(() => initialTab ?? readTab());
  const tab = tabs.find((t) => t.id === tabId) ?? tabs[0];
  const [busy, setBusy] = useState<'pdf' | 'xlsx' | null>(null);

  function pick(id: string) {
    setTabId(id);
    try { localStorage.setItem(TAB_KEY, id); } catch { /* storage unavailable */ }
  }

  async function exportPdf() {
    setBusy('pdf');
    try {
      const m = await import('../../utils/dashboardReportPdf');
      m.exportSummaryTabPdf(tab, scope, 'emerald', filterLabel);
    } finally { setBusy(null); }
  }
  async function exportXlsx() {
    setBusy('xlsx');
    try { await exportSummaryWorkbook(tabs, scope, filterLabel); } finally { setBusy(null); }
  }

  const multi = tab.tables.length > 1;
  const actionCls = 'text-[10px] font-medium uppercase tracking-wide transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-wait';

  return (
    <div className="font-wp fixed inset-0 z-50 flex items-center justify-center p-4" style={{ animation: 'backdrop-enter 0.2s ease-out' }}>
      <div className="absolute inset-0 bg-[#1E2340]/30" onClick={onClose} aria-hidden="true" />
      <div
        className="relative flex flex-col rounded-2xl border shadow-[0_24px_60px_rgba(63,75,184,0.18)] w-full max-w-4xl max-h-[78vh] overflow-hidden"
        style={{ borderColor: '#93E0C6', background: TINT, animation: 'modal-enter 0.25s ease-out' }}
      >
        {/* Header */}
        <div className="flex-shrink-0 px-4 py-2.5 flex items-center justify-between gap-3 border-b" style={{ borderColor: LINE }}>
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-1 h-4 rounded-full shrink-0 bg-[#34C494]" />
            <p className="text-xs font-medium uppercase tracking-widest truncate" style={{ color: '#0B825A' }}>Summary</p>
            <span className="shrink-0 rounded-full border bg-white/70 px-2 py-[2px] text-[10.5px] font-medium tabular-nums" style={{ borderColor: LINE, color: INK }}>{scope}</span>
            {filterLabel && (
              <span
                className="min-w-0 truncate rounded-full border px-2 py-[2px] text-[10.5px] font-medium"
                style={{ borderColor: '#F5C77E', background: '#FFF8EB', color: '#9A5B00' }}
                title={`Filtered by the Dashboard filters: ${filterLabel}`}
              >
                Filtered · {filterLabel}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button onClick={() => void exportPdf()} disabled={busy !== null} className={actionCls} style={{ color: ACCENT }} title={`PDF of the ${tab.label} tab`}>
              {busy === 'pdf' ? 'Exporting…' : 'Export PDF'}
            </button>
            <button onClick={() => void exportXlsx()} disabled={busy !== null} className={actionCls} style={{ color: ACCENT }} title="Excel workbook with every tab">
              {busy === 'xlsx' ? 'Exporting…' : 'Export Excel'}
            </button>
            <button onClick={onClose} className="rounded-full w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-white/60 transition-colors text-sm leading-none cursor-pointer" aria-label="Close">×</button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 overflow-x-auto no-scrollbar" role="tablist">
          {tabs.map((t) => {
            const active = t.id === tab.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => pick(t.id)}
                className="shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer hover:bg-white/70"
                style={active ? { borderColor: '#34C494', background: 'white', color: INK } : { borderColor: 'transparent', color: '#4B7F6C' }}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div key={tab.id} className="min-h-0 overflow-y-auto bg-white p-2.5" style={{ animation: 'content-enter 0.18s ease-out' }}>
          <div className={multi ? 'grid grid-cols-1 lg:grid-cols-2 gap-3' : ''}>
            {tab.tables.map((t) => <SummaryTableView key={t.title} table={t} />)}
          </div>
        </div>
      </div>
    </div>
  );
}
