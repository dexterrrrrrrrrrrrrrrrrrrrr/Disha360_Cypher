import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchHealth } from '../services/api';
import type { Health } from '../types';

export function useHealth() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const controller = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setLoading(true); setError('');
    try { const data = await fetchHealth(current.signal); if (!current.signal.aborted) setHealth(data); }
    catch (err) { if (!current.signal.aborted) { setHealth(null); setError(err instanceof Error ? err.message : 'Unable to check the API.'); } }
    finally { if (!current.signal.aborted) setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); return () => controller.current?.abort(); }, [refresh]);
  return { health, error, loading, refresh };
}
