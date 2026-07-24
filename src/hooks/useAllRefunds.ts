import { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';
import type { RefundRecord } from '../services/refundService';

interface UseAllRefundsResult {
  refunds: RefundRecord[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

// Module-level cache — survives component unmount/remount (navigation).
let _refundCache: RefundRecord[] | null = null;

/** All refund records across every academic year — powers the Refund Students List report. */
export function useAllRefunds(): UseAllRefundsResult {
  const [refunds, setRefunds] = useState<RefundRecord[]>(() => _refundCache ?? []);
  const [loading, setLoading] = useState(_refundCache === null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (_refundCache === null) setLoading(true);
    setError(null);

    const unsubscribe = onSnapshot(
      collection(db, 'refunds'),
      (snap) => {
        _refundCache = snap.docs.map((d) => ({ id: d.id, ...d.data() } as RefundRecord));
        setRefunds(_refundCache);
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [tick]);

  function refetch() {
    _refundCache = null;
    setTick((t) => t + 1);
  }

  return { refunds, loading, error, refetch };
}
