import { useEffect, useState } from 'react';
import { useAISummary } from '../../hooks/useAISummary';
import type { AISummaryPayload } from '../../services/aiSummaryService';

interface Props {
  payload: AISummaryPayload;
  compact?: boolean;
}

function SkeletonLine({ w }: { w: string }) {
  return <div className="h-2 rounded-full bg-emerald-100 animate-pulse" style={{ width: w }} />;
}

export function AISummaryCard({ payload, compact = false }: Props) {
  const { insights, loading, error, generate } = useAISummary();
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (payload.total > 0) void generate(payload);
  }, [payload, generate]);

  useEffect(() => {
    setCurrentIndex(0);
  }, [insights]);

  // Compact: 10 s cycle; standalone: 4 s
  useEffect(() => {
    if (!insights || insights.length <= 1) return;
    const ms = compact ? 10000 : 4000;
    const timer = setInterval(() => {
      setCurrentIndex(i => (i + 1) % insights.length);
    }, ms);
    return () => clearInterval(timer);
  }, [insights, compact]);

  const currentInsight = insights?.[currentIndex] ?? null;

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
      className="bg-emerald-50 rounded-2xl border border-emerald-400 p-5 flex flex-col"
      style={{ boxShadow: '0 1px 3px 0 rgba(0,0,0,0.06), 0 4px 16px 0 rgba(0,0,0,0.07)' }}
    >
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-1 h-3.5 rounded-full shrink-0 bg-emerald-400" />
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">AI Insights</p>
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-wider bg-emerald-100 border border-emerald-200 text-emerald-600 leading-none">
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

      {/* ── Body ───────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col justify-center min-h-[120px]">
        {payload.total === 0 ? (
          <p className="text-xs text-gray-400 italic">No admission data to summarize.</p>
        ) : loading ? (
          <div className="space-y-2.5">
            <SkeletonLine w="88%" />
            <SkeletonLine w="100%" />
            <SkeletonLine w="72%" />
            <SkeletonLine w="94%" />
            <SkeletonLine w="58%" />
          </div>
        ) : error ? (
          <div className="space-y-2">
            <p className="text-[11px] text-rose-500 font-medium leading-relaxed">{error}</p>
            <p className="text-[10px] text-gray-400 leading-relaxed">
              Go to Firestore → <code className="font-mono bg-gray-100 px-1 py-px rounded text-gray-500">adminConfig/aiSettings</code> and add the <code className="font-mono bg-gray-100 px-1 py-px rounded text-gray-500">anthropicApiKey</code> field.
            </p>
          </div>
        ) : currentInsight ? (
          <p key={currentIndex} className="insight-text text-[12.5px] text-gray-700 leading-relaxed">
            {currentInsight}
          </p>
        ) : null}
      </div>
    </div>
  );
}
