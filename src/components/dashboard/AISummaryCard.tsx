import { useEffect, useState } from 'react';
import { useAISummary } from '../../hooks/useAISummary';
import type { AISummaryPayload } from '../../services/aiSummaryService';
import type { Insight } from '../../services/aiSummaryService';

// ─── Colour palette — one entry per slot, cycles across insights ──────────────
const PALETTE = [
  { bg: '#ecfdf5', border: '#6ee7b7', divider: '#a7f3d0', accent: '#059669', title: '#064e3b', body: '#065f46', dot: '#10b981', dotDim: '#a7f3d0' },
  { bg: '#f0f9ff', border: '#7dd3fc', divider: '#bae6fd', accent: '#0284c7', title: '#0c4a6e', body: '#075985', dot: '#0ea5e9', dotDim: '#bae6fd' },
  { bg: '#f5f3ff', border: '#c4b5fd', divider: '#ddd6fe', accent: '#7c3aed', title: '#3b0764', body: '#4c1d95', dot: '#8b5cf6', dotDim: '#ddd6fe' },
  { bg: '#fff1f2', border: '#fda4af', divider: '#fecdd3', accent: '#e11d48', title: '#881337', body: '#9f1239', dot: '#f43f5e', dotDim: '#fecdd3' },
  { bg: '#fffbeb', border: '#fcd34d', divider: '#fde68a', accent: '#d97706', title: '#451a03', body: '#78350f', dot: '#f59e0b', dotDim: '#fde68a' },
  { bg: '#f0fdfa', border: '#5eead4', divider: '#99f6e4', accent: '#0d9488', title: '#134e4a', body: '#115e59', dot: '#14b8a6', dotDim: '#99f6e4' },
] as const;

// ─── Refresh icon ─────────────────────────────────────────────────────────────
function RefreshIcon({ spinning, color }: { spinning: boolean; color: string }) {
  return (
    <svg
      width="10" height="10" viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      className={spinning ? 'animate-spin' : ''}
    >
      <path d="M21 2v6h-6" /><path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M3 22v-6h6" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
    </svg>
  );
}

// ─── Full-card overlay cycling (compact intake bar) ───────────────────────────
export function CompactAIInsight({ payload }: { payload: AISummaryPayload }) {
  const { insights, generate } = useAISummary();
  const [overlayOn, setOverlayOn] = useState(false);
  const [textOn, setTextOn]       = useState(false);
  const [idx, setIdx]             = useState(0);

  useEffect(() => {
    if (payload.total > 0) void generate(payload);
  }, [payload, generate]);

  useEffect(() => {
    if (!insights || insights.length === 0) return;
    const list = insights;
    let active = true;
    let tid: ReturnType<typeof setTimeout>;

    const CHART_MS   = 5500;
    const INSIGHT_MS = 8000;
    const FADE_MS    = 500;

    function showInsight(i: number) {
      setIdx(i);
      setOverlayOn(true);
      tid = setTimeout(() => {
        if (!active) return;
        setTextOn(true);
        tid = setTimeout(() => {
          if (!active) return;
          if (i + 1 < list.length) {
            setTextOn(false);
            tid = setTimeout(() => { if (active) showInsight(i + 1); }, FADE_MS);
          } else {
            setTextOn(false);
            tid = setTimeout(() => {
              if (!active) return;
              setOverlayOn(false);
              tid = setTimeout(() => { if (active) showInsight(0); }, CHART_MS);
            }, FADE_MS);
          }
        }, INSIGHT_MS);
      }, 80);
    }

    tid = setTimeout(() => { if (active) showInsight(0); }, CHART_MS);
    return () => { active = false; clearTimeout(tid); setOverlayOn(false); setTextOn(false); setIdx(0); };
  }, [insights]);

  const insight: Insight | null = insights?.[idx] ?? null;
  const p = PALETTE[idx % PALETTE.length];

  return (
    <div
      className="absolute inset-0 flex flex-col px-3 pt-4 pb-2 rounded-2xl"
      style={{
        backgroundColor: p.bg,
        opacity: overlayOn ? 1 : 0,
        transition: 'opacity 0.55s ease, background-color 0.55s ease',
        pointerEvents: overlayOn ? 'auto' : 'none',
      }}
    >
      <div className="flex flex-col h-full" style={{ opacity: textOn ? 1 : 0, transition: 'opacity 0.45s ease' }}>
        <div className="flex items-center gap-1.5 shrink-0 mb-2">
          <span className="font-black text-xs leading-none tracking-tighter select-none" style={{ color: p.accent }}>//</span>
          <p className="text-[11px] font-semibold uppercase tracking-wider leading-none" style={{ color: p.title }}>
            {insight?.title ?? 'AI Insight'}
          </p>
          {insights && insights.length > 1 && (
            <span className="text-[9px] tabular-nums ml-auto" style={{ color: p.dot + '99' }}>{idx + 1}/{insights.length}</span>
          )}
        </div>
        {insight && (
          <div className="flex-1 overflow-hidden flex flex-col justify-center">
            <p className="text-[12px] leading-snug" style={{ color: p.body }}>{insight.en}</p>
          </div>
        )}
        {insights && insights.length > 1 && (
          <div className="flex items-center gap-1 mt-auto pt-1 shrink-0">
            {insights.map((_, i) => (
              <span key={i} className="rounded-full transition-all duration-300"
                style={{ width: i === idx ? 14 : 5, height: 3, backgroundColor: i === idx ? p.dot : p.dotDim }} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Dedicated AI Insights card ───────────────────────────────────────────────
interface Props { payload: AISummaryPayload; compact?: boolean }

export function AISummaryCard({ payload, compact = false }: Props) {
  const { insights, generatedAt, loading, error, generate } = useAISummary();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => { if (payload.total > 0) void generate(payload); }, [payload, generate]);
  useEffect(() => { setCurrentIndex(0); setVisible(true); }, [insights]);

  useEffect(() => {
    if (!insights || insights.length <= 1) return;
    const FADE_MS = 450;
    let tid: ReturnType<typeof setTimeout>;
    const timer = setInterval(() => {
      setVisible(false);
      tid = setTimeout(() => {
        setCurrentIndex(i => (i + 1) % insights.length);
        setVisible(true);
      }, FADE_MS);
    }, 10000);
    return () => { clearInterval(timer); clearTimeout(tid); };
  }, [insights]);

  const insightCount = insights?.length ?? 0;
  const currentInsight: Insight | null = insights?.[currentIndex] ?? null;
  const timeLabel = generatedAt
    ? new Date(generatedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true })
    : null;

  const p = PALETTE[currentIndex % PALETTE.length];

  // ── Compact branch ────────────────────────────────────────────────────────
  if (compact) {
    return (
      <div className="mt-3 pt-3 border-t" style={{ borderColor: p.divider, transition: 'border-color 600ms ease' }}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <span className="font-black text-xs leading-none tracking-tighter select-none" style={{ color: p.accent }}>//</span>
            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: p.title }}>AI Insights</p>
            <span className="inline-flex items-center px-1.5 py-px rounded-full text-[7px] font-bold uppercase tracking-wider border leading-none"
              style={{ backgroundColor: p.dotDim + '80', borderColor: p.dot, color: p.accent }}>Claude</span>
          </div>
          <button onClick={() => void generate(payload, true)} disabled={loading || payload.total === 0}
            className="flex items-center gap-1 group cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
            <RefreshIcon spinning={loading} color={p.accent} />
            <span className="text-[9px] font-semibold uppercase tracking-wider transition-colors" style={{ color: p.accent }}>
              {loading ? 'Generating' : 'Refresh'}
            </span>
          </button>
        </div>
        <div className="min-h-[44px] flex flex-col justify-center">
          {payload.total === 0 ? (
            <p className="text-[10px] text-gray-400 italic">No data to summarize.</p>
          ) : loading ? (
            <div className="space-y-1.5">
              {[90, 75].map((w, i) => (
                <div key={i} className="h-2 rounded-full animate-pulse" style={{ width: `${w}%`, backgroundColor: p.dotDim }} />
              ))}
            </div>
          ) : error ? (
            <p className="text-[10px] leading-snug" style={{ color: p.accent }}>{error}</p>
          ) : currentInsight ? (
            <div key={currentIndex}>
              <p className="text-[10px] font-bold uppercase tracking-wide mb-0.5" style={{ color: p.accent }}>
                {currentInsight.title}
              </p>
              <p className="text-[11px] leading-snug" style={{ color: p.body }}>{currentInsight.en}</p>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  // ── Full card ─────────────────────────────────────────────────────────────
  return (
    <div
      className="rounded-2xl border p-5 flex flex-col h-full relative overflow-hidden"
      style={{
        backgroundColor: p.bg,
        borderColor: p.border,
        boxShadow: '0 2px 8px 0 rgba(0,0,0,0.08), 0 1px 3px -1px rgba(0,0,0,0.05)',
        transition: 'background-color 700ms ease, border-color 700ms ease',
      }}
    >
      {/* Decorative watermark */}
      <span
        aria-hidden="true"
        className="absolute -bottom-4 -right-2 text-9xl font-black leading-none select-none pointer-events-none"
        style={{ color: p.accent, opacity: 0.06 }}
      >"</span>

      {/* Header */}
      <div className="flex items-center justify-between mb-3 shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="font-black text-sm leading-none tracking-tighter select-none" style={{ color: p.accent }}>//</span>
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: p.title }}>AI Insights</p>
          <span className="inline-flex items-center px-1.5 py-px rounded-full text-[7px] font-bold uppercase tracking-wider border leading-none"
            style={{ backgroundColor: p.dotDim + '80', borderColor: p.dot, color: p.accent }}>Claude</span>
        </div>
        <button
          onClick={() => void generate(payload, true)}
          disabled={loading || payload.total === 0}
          className="flex items-center gap-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          title="Regenerate insights"
        >
          <RefreshIcon spinning={loading} color={p.accent} />
          <span className="text-[10px] font-semibold uppercase tracking-wider transition-colors" style={{ color: p.accent }}>
            {loading ? 'Generating' : 'Refresh'}
          </span>
        </button>
      </div>

      {/* Body — starts immediately below the header */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {payload.total === 0 ? (
          <p className="text-sm italic" style={{ color: p.body + '80' }}>No admission data to summarize.</p>
        ) : loading ? (
          <div className="grid grid-cols-2 gap-0">
            <div className="pr-4 space-y-2">
              {[55, 100, 82, 74, 90, 60].map((w, i) => (
                <div key={i} className="h-2 rounded-full animate-pulse" style={{ width: `${w}%`, backgroundColor: p.dotDim }} />
              ))}
            </div>
            <div className="pl-4 border-l space-y-2" style={{ borderColor: p.divider }}>
              {[60, 95, 78, 85, 68, 55].map((w, i) => (
                <div key={i} className="h-2 rounded-full animate-pulse" style={{ width: `${w}%`, backgroundColor: p.dotDim }} />
              ))}
            </div>
          </div>
        ) : error ? (
          <div className="flex flex-col gap-2">
            <p className="text-[12px] leading-relaxed" style={{ color: p.accent }}>{error}</p>
            {(error.includes('not configured') || error.includes('API key')) && (
              <p className="text-[11px] leading-relaxed text-gray-400">
                Go to Firestore → <code className="font-mono bg-gray-100 px-1 py-px rounded text-gray-500">adminConfig/aiSettings</code> and add the <code className="font-mono bg-gray-100 px-1 py-px rounded text-gray-500">anthropicApiKey</code> field.
              </p>
            )}
          </div>
        ) : currentInsight ? (
          <div
            className="grid grid-cols-2 gap-0 mt-3"
            style={{ opacity: visible ? 1 : 0, transition: 'opacity 0.45s ease' }}
          >
            {/* English column */}
            <div className="pr-4 flex flex-col gap-2.5">
              <p
                className="text-[11px] font-bold uppercase tracking-widest leading-none"
                style={{ color: p.accent }}
              >
                {currentInsight.title}
              </p>
              <div className="h-px rounded-full" style={{ backgroundColor: p.divider }} />
              <p
                className="text-[14px] leading-relaxed font-normal text-justify"
                style={{ color: p.body }}
              >
                {currentInsight.en}
              </p>
            </div>

            {/* Kannada column */}
            <div
              className="pl-4 border-l flex flex-col gap-2.5"
              style={{ borderColor: p.divider }}
            >
              <p
                className="text-[11px] font-bold leading-none"
                style={{ color: p.accent + 'cc', fontFamily: "'Noto Sans Kannada', 'Arial Unicode MS', sans-serif" }}
              >
                {currentInsight.titleKn}
              </p>
              <div className="h-px rounded-full" style={{ backgroundColor: p.divider }} />
              <p
                className="text-[14px] leading-relaxed font-normal text-justify"
                style={{ color: p.body + 'bb', fontFamily: "'Noto Sans Kannada', 'Arial Unicode MS', sans-serif" }}
              >
                {currentInsight.kn}
              </p>
            </div>
          </div>
        ) : null}
      </div>

      {/* Footer */}
      {insightCount > 0 && !loading && (
        <>
          <div className="mt-4 border-t shrink-0" style={{ borderColor: p.divider, transition: 'border-color 700ms ease' }} />
          <div className="mt-2.5 flex items-center justify-between shrink-0">
            {/* Dot pagination — one dot per insight */}
            <div className="flex items-center gap-1">
              {Array.from({ length: insightCount }, (_, i) => (
                <span
                  key={i}
                  className="rounded-full transition-all duration-300"
                  style={{
                    width: i === currentIndex ? 16 : 5,
                    height: 3,
                    backgroundColor: i === currentIndex ? p.dot : p.dotDim,
                  }}
                />
              ))}
            </div>
            {/* Counter + timestamp */}
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[9px] font-medium tabular-nums" style={{ color: p.accent + 'bb' }}>
                {currentIndex + 1} / {insightCount}
              </span>
              {timeLabel && (
                <span className="text-[9px] font-medium tabular-nums" style={{ color: p.accent + '80' }}>{timeLabel}</span>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
