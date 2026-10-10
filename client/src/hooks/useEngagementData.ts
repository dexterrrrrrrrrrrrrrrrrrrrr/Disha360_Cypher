import { useEffect, useCallback, useRef, useState } from "react";
import { studentRequest } from "../services/student";
import { ApiError } from "../services/auth";
import { useAuth } from "../features/auth/AuthProvider";
import type { Role } from "../types";
export function useEngagementData<T>(path: string, role: Role) {
  const [data, setData] = useState<T | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const auth = useAuth(),
    refresh = useRef(auth.refresh);
  refresh.current = auth.refresh;
  const controller = useRef<AbortController | null>(null);
  const reload = useCallback(async () => {
    controller.current?.abort();
    const c = new AbortController();
    controller.current = c;
    setLoading(true);
    setError("");
    setData(null);
    try {
      const value = await studentRequest<T>(path, {
        prefix: role === "student" ? "/api/v1/student" : "/api/v1/staff",
        signal: c.signal,
      });
      if (!c.signal.aborted) setData(value);
    } catch (e) {
      if (!c.signal.aborted) {
        setError(
          e instanceof Error ? e.message : "Unable to load engagement records.",
        );
        if (e instanceof ApiError && e.status === 401) void refresh.current();
      }
    } finally {
      if (!c.signal.aborted) setLoading(false);
    }
  }, [path, role]);
  useEffect(() => {
    void reload();
    return () => controller.current?.abort();
  }, [reload]);
  return { data, loading, error, reload };
}
