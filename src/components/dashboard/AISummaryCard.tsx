import { useEffect, useState } from 'react';
import { useAISummary } from '../../hooks/useAISummary';
import type { AISummaryPayload } from '../../services/aiSummaryService';

// ─── Full-card overlay cycling: bar chart → insight → insight → … → chart ────
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

    return () => {
      active = false;
      clearTimeout(tid);
      setOverlayOn(false);
      setTextOn(false);
      setIdx(0);
    };
  }, [insights]);

  const insight = insights?.[idx] ?? null;

  return (
    <div
      className="absolute inset-0 flex flex-col px-3 pt-4 pb-2"
      style={{
        background: 'linear-gradient(135deg, #e0f2fe 0%, #f0fdf4 100%)',
        opacity: overlayOn ? 1 : 0,
        transition: 'opacity 0.55s ease',
        pointerEvents: overlayOn ? 'auto' : 'none',
      }}
    >
      <div
        className="flex flex-col h-full"
        style={{ opacity: textOn ? 1 : 0, transition: 'opacity 0.45s ease' }}
      >
        {/* Header */}
        <div className="flex items-center gap-2 shrink-0 mb-2">
          <span className="w-1 h-3.5 rounded-full shrink-0 bg-sky-400" />
          <p className="text-[13px] font-semibold uppercase tracking-wider text-sky-700 leading-none">AI Insight</p>
          {insights && insights.length > 1 && (
            <span className="text-[9px] tabular-nums text-sky-400/60 ml-auto">{idx + 1}/{insights.length}</span>
          )}
        </div>

        {/* Insight text */}
        {insight && (
          <div className="flex-1 overflow-hidden flex flex-col justify-center">
            <p className="text-[12.5px] leading-snug text-sky-900/85 text-justify">{insight}</p>
          </div>
        )}

        {/* Progress dots */}
        {insights && insights.length > 1 && (
          <div className="flex items-center gap-1 mt-auto pt-1 shrink-0">
            {insights.map((_, i) => (
              <span
                key={i}
                className="rounded-full transition-all duration-300"
                style={{
                  width: i === idx ? 14 : 5,
                  height: 3,
                  background: i === idx ? 'rgba(56,189,248,0.8)' : 'rgba(186,230,253,0.9)',
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface Props {
  payload: AISummaryPayload;
  compact?: boolean;
}

function SkeletonLine({ w }: { w: string }) {
  return <div className="h-2 rounded-full bg-emerald-100 animate-pulse" style={{ width: w }} />;
}

export function AISummaryCard({ payload, compact = false }: Props) {
  const { insights, generatedAt, loading, error, generate } = useAISummary();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (payload.total > 0) void generate(payload);
  }, [payload, generate]);

  useEffect(() => {
    setCurrentIndex(0);
    setVisible(true);
  }, [insights]);

  useEffect(() => {
    if (!insights || insights.length <= 1) return;
    const INTERVAL = compact ? 10000 : 8000;
    const FADE_MS  = 400;
    let tid: ReturnType<typeof setTimeout>;
    const timer = setInterval(() => {
      setVisible(false);
      tid = setTimeout(() => {
        setCurrentIndex(i => (i + 1) % insights.length);
        setVisible(true);
      }, FADE_MS);
    }, INTERVAL);
    return () => { clearInterval(timer); clearTimeout(tid); };
  }, [insights, compact]);

  const currentInsight = insights?.[currentIndex] ?? null;
  const timeLabel = generatedAt
    ? new Date(generatedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true })
    : null;

  if (compact) {
    return (
      <div className="mt-3 pt-3 border-t border-emerald-100">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <span className="w-1 h-3 rounded-full shrink-0 bg-emerald-400" />
            <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">AI Insights</p>
            <span className="inline-flex items-center px-1 py-px rounded-full text-[7px] font-bold uppercase tracking-wider bg-emerald-100 border border-emerald-200 text-emerald-600 leading-none">
              Claude
            </span>
          </div>
          <button
            onClick={() => void generate(payload, true)}
            disabled={loading || payload.total === 0}
            className="flex items-center gap-1 group cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            title="Regenerate insights"
          >
            <svg
              width="9" height="9" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              className={`text-emerald-400 group-hover:text-emerald-600 transition-colors ${loading ? 'animate-spin' : ''}`}
            >
              <path d="M21 2v6h-6" /><path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
              <path d="M3 22v-6h6" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
            </svg>
            <span className="text-[9px] font-semibold uppercase tracking-wider text-emerald-500 group-hover:text-emerald-700 transition-colors">
              {loading ? 'Generating' : 'Refresh'}
            </span>
          </button>
        </div>

        {/* Body */}
        <div className="min-h-[38px] flex flex-col justify-center">
          {payload.total === 0 ? (
            <p className="text-[10px] text-gray-400 italic">No data to summarize.</p>
          ) : loading ? (
            <div className="space-y-1.5">
              <SkeletonLine w="90%" />
              <SkeletonLine w="75%" />
            </div>
          ) : error ? (
            <p className="text-[10px] text-rose-500 leading-snug">{error}</p>
          ) : currentInsight ? (
            <p
              key={currentIndex}
              className="insight-text text-[11px] text-gray-600 leading-snug"
            >
              {currentInsight}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div
      className="bg-emerald-50 rounded-2xl border border-emerald-400 p-5 flex flex-col h-full"
      style={{ boxShadow: '0 1px 3px 0 rgba(0,0,0,0.06), 0 4px 16px 0 rgba(0,0,0,0.07)' }}
    >
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-1 h-3.5 rounded-full shrink-0 bg-emerald-400" />
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">AI Insights</p>
        </div>
        <div className="flex items-center gap-2.5">
          {insights && insights.length > 1 && !loading && (
            <span className="text-[9px] text-emerald-400/60 font-medium tabular-nums">
              {currentIndex + 1} / {insights.length}
            </span>
          )}
          {timeLabel && !loading && (
            <span className="text-[9px] text-emerald-400/60 font-medium tabular-nums">{timeLabel}</span>
          )}
          <button
            onClick={() => void generate(payload, true)}
            disabled={loading || payload.total === 0}
            className="flex items-center gap-1 group cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            title="Regenerate insights"
          >
            <svg
              width="10" height="10" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              className={`text-emerald-400 group-hover:text-emerald-600 transition-colors ${loading ? 'animate-spin' : ''}`}
            >
              <path d="M21 2v6h-6" /><path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
              <path d="M3 22v-6h6" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
            </svg>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-500 group-hover:text-emerald-700 transition-colors">
              {loading ? 'Generating' : 'Refresh'}
            </span>
          </button>
        </div>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {payload.total === 0 ? (
          <p className="text-sm text-gray-400 italic">No admission data to summarize.</p>
        ) : loading ? (
          <div className="space-y-3">
            <SkeletonLine w="92%" />
            <SkeletonLine w="100%" />
            <SkeletonLine w="78%" />
            <SkeletonLine w="96%" />
            <SkeletonLine w="60%" />
          </div>
        ) : error ? (
          <div className="space-y-2">
            <p className="text-[12px] text-rose-500 font-medium leading-relaxed">{error}</p>
            <p className="text-[11px] text-gray-400 leading-relaxed">
              Go to Firestore → <code className="font-mono bg-gray-100 px-1 py-px rounded text-gray-500">adminConfig/aiSettings</code> and add the <code className="font-mono bg-gray-100 px-1 py-px rounded text-gray-500">anthropicApiKey</code> field.
            </p>
          </div>
        ) : insights && insights.length > 0 ? (
          <div
            className="flex flex-col divide-y divide-emerald-100"
            style={{ opacity: visible ? 1 : 0, transition: 'opacity 0.4s ease' }}
          >
            {Array.from({ length: Math.min(3, insights.length) }, (_, offset) => (
              <div
                key={(currentIndex + offset) % insights.length}
                className="flex gap-3 py-3 first:pt-0 last:pb-0"
              >
                <span className="w-0.5 shrink-0 self-stretch rounded-full bg-emerald-400" />
                <p className="text-[13px] leading-relaxed text-gray-700 text-justify">
                  {insights[(currentIndex + offset) % insights.length]}
                </p>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
