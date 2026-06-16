import { useState, useCallback, useRef } from 'react';
import { callGenerateAdmissionSummary } from '../services/aiSummaryService';
import type { AISummaryPayload, Insight } from '../services/aiSummaryService';

interface CacheEntry {
  key: string;
  insights: Insight[];
  generatedAt: string;
  ts: number;
}

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Persists across hook remounts within the same browser session
const summaryCache = new Map<string, CacheEntry>();

export interface UseAISummaryReturn {
  insights: Insight[] | null;
  generatedAt: string | null;
  loading: boolean;
  error: string | null;
  generate: (payload: AISummaryPayload, force?: boolean) => Promise<void>;
}

export function useAISummary(): UseAISummaryReturn {
  const [insights, setInsights] = useState<Insight[] | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const generate = useCallback(async (payload: AISummaryPayload, force = false) => {
    if (inFlight.current) return;

    const key = JSON.stringify(payload);
    const cached = summaryCache.get(key);

    if (!force && cached && Date.now() - cached.ts < CACHE_TTL) {
      // Guard against stale cache entries from the old string[] format
      const first = cached.insights[0];
      if (first && typeof first === 'object' && 'en' in first) {
        setInsights(cached.insights);
        setGeneratedAt(cached.generatedAt);
        setError(null);
        return;
      }
      summaryCache.delete(key);
    }

    inFlight.current = true;
    setLoading(true);
    setError(null);

    try {
      const result = await callGenerateAdmissionSummary(payload);
      summaryCache.set(key, { key, ...result, ts: Date.now() });
      setInsights(result.insights);
      setGeneratedAt(result.generatedAt);
    } catch (err: unknown) {
      let msg = 'Failed to generate insights. Please try again.';
      if (err instanceof Error) {
        const raw = err.message
          .replace(/^FirebaseError:\s*/i, '')
          .replace(/^functions\/[\w-]+:\s*/i, '')
          .trim();
        // Raw Firebase error codes (no message attached) — replace with friendly text
        if (raw && raw !== 'internal' && raw !== 'INTERNAL' && raw !== 'deadline-exceeded') {
          msg = raw;
        } else if (raw === 'deadline-exceeded') {
          msg = 'Request timed out — the AI took too long. Please try again.';
        }
      }
      setError(msg);
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, []);

  return { insights, generatedAt, loading, error, generate };
}
