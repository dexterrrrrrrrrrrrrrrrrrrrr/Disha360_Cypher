import { useCallback, useEffect, useRef, useState } from 'react';
import { studentRequest } from '../services/student';
import { ApiError } from '../services/auth';
import { useAuth } from '../features/auth/AuthProvider';

export function useStudentData<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const auth = useAuth();
  const refreshSession = useRef(auth.refresh); refreshSession.current = auth.refresh;
  const controller = useRef<AbortController | null>(null);
  const reload = useCallback(async () => {
    controller.current?.abort(); const request = new AbortController(); controller.current = request;
    setLoading(true); setError('');
    try { const result = await studentRequest<T>(path, { signal: request.signal }); if (!request.signal.aborted) setData(result); }
    catch (err) { if (!request.signal.aborted) { setError(err instanceof Error ? err.message : 'Unable to load data.'); if (err instanceof ApiError && err.status === 401) void refreshSession.current(); } }
    finally { if (!request.signal.aborted) setLoading(false); }
  }, [path]);
  useEffect(() => { setData(null); void reload(); return () => controller.current?.abort(); }, [reload]);
  return { data, loading, error, reload };
}
