import { useEffect, useCallback, useRef, useState } from "react";
import { studentRequest } from "../services/student";
import { ApiError } from "../services/auth";
import { useAuth } from "../features/auth/AuthProvider";
export const staffRequest = <T>(
  path: string,
  options: Parameters<typeof studentRequest>[1] = {},
) => studentRequest<T>(path, { ...options, prefix: "/api/v1/staff" });
export function useStaffData<T>(path: string | null, prefix = '/api/v1/staff') {
  const [data, setData] = useState<T | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const auth = useAuth(),
    refresh = useRef(auth.refresh);
  refresh.current = auth.refresh;
  const controller = useRef<AbortController | null>(null);
  const reload = useCallback(async () => {
    controller.current?.abort();
    if (!path) {
      setData(null);
      setLoading(false);
      setError("");
      return;
    }
    const c = new AbortController();
    controller.current = c;
    setLoading(true);
    setError("");
    try {
      const result = await studentRequest<T>(path, { signal: c.signal, prefix });
      if (!c.signal.aborted) setData(result);
    } catch (e) {
      if (!c.signal.aborted) {
        setData(null);
        setError(e instanceof Error ? e.message : "Unable to load records.");
        if (e instanceof ApiError && e.status === 401) void refresh.current();
      }
    } finally {
      if (!c.signal.aborted) setLoading(false);
    }
  }, [path, prefix]);
  useEffect(() => {
    setData(null);
    void reload();
    return () => controller.current?.abort();
  }, [reload]);
  return { data, loading, error, reload };
}
