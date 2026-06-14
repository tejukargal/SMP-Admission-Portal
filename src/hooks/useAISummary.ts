import { useState, useCallback, useRef } from 'react';
import { callGenerateAdmissionSummary } from '../services/aiSummaryService';
import type { AISummaryPayload } from '../services/aiSummaryService';

interface CacheEntry {
  key: string;
  text: string;
  generatedAt: string;
  ts: number;
}

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Persists across hook remounts within the same browser session
const summaryCache = new Map<string, CacheEntry>();

export interface UseAISummaryReturn {
  text: string | null;
  generatedAt: string | null;
  loading: boolean;
  error: string | null;
  generate: (payload: AISummaryPayload, force?: boolean) => Promise<void>;
}

export function useAISummary(): UseAISummaryReturn {
  const [text, setText] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const generate = useCallback(async (payload: AISummaryPayload, force = false) => {
    if (inFlight.current) return;

    const key = JSON.stringify(payload);
    const cached = summaryCache.get(key);

    if (!force && cached && Date.now() - cached.ts < CACHE_TTL) {
      setText(cached.text);
      setGeneratedAt(cached.generatedAt);
      setError(null);
      return;
    }

    inFlight.current = true;
    setLoading(true);
    setError(null);

    try {
      const result = await callGenerateAdmissionSummary(payload);
      summaryCache.set(key, { key, ...result, ts: Date.now() });
      setText(result.text);
      setGeneratedAt(result.generatedAt);
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : 'Failed to generate summary';
      // Strip Firebase error prefix e.g. "functions/failed-precondition: ..."
      setError(raw.replace(/^FirebaseError:\s*/, '').replace(/^functions\/[\w-]+:\s*/, ''));
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, []);

  return { text, generatedAt, loading, error, generate };
}
