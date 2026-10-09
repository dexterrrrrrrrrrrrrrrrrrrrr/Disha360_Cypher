import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { ApiError, authApi } from '../../services/auth';
import type { AuthUser, Registration } from '../../types';

interface AuthContextValue {
  user: AuthUser | null; loading: boolean; error: string; notice: 'registered' | 'loggedOut' | null;
  refresh: () => Promise<void>; login: (email: string, password: string) => Promise<AuthUser>;
  register: (input: Registration) => Promise<AuthUser>; logout: () => Promise<void>;
}
const AuthContext = createContext<AuthContextValue | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<'registered' | 'loggedOut' | null>(null);
  const revision = useRef(0);
  const mutating = useRef(false);
  const refresh = useCallback(async () => {
    if (mutating.current) return;
    const request = ++revision.current;
    setLoading(true); setError('');
    try { const result = await authApi.me(); if (request === revision.current) setUser(result.user); }
    catch (err) {
      if (request !== revision.current) return;
      setUser(null);
      if (!(err instanceof ApiError && err.status === 401)) setError(err instanceof Error ? err.message : 'Unable to check your session.');
    } finally { if (request === revision.current) setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const check = () => { if (document.visibilityState === 'visible' && user) void refresh(); };
    document.addEventListener('visibilitychange', check);
    return () => document.removeEventListener('visibilitychange', check);
  }, [user, refresh]);
  async function mutation<T>(action: () => Promise<T>): Promise<T> {
    mutating.current = true; ++revision.current;
    try { return await action(); }
    finally { mutating.current = false; setLoading(false); }
  }
  async function login(email: string, password: string) { const result = await mutation(() => authApi.login(email, password)); setUser(result.user); setError(''); setNotice(null); return result.user; }
  async function register(input: Registration) { const result = await mutation(() => authApi.register(input)); setUser(result.user); setError(''); setNotice('registered'); return result.user; }
  async function logout() { await mutation(() => authApi.logout()); setUser(null); setError(''); setNotice('loggedOut'); }
  return <AuthContext.Provider value={{ user, loading, error, notice, refresh, login, register, logout }}>{children}</AuthContext.Provider>;
}
export function useAuth() { const context = useContext(AuthContext); if (!context) throw new Error('AuthProvider is required.'); return context; }
