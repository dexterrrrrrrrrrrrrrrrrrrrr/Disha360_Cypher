import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Eye, EyeOff, LoaderCircle, LockKeyhole, Mail } from 'lucide-react';
import { AuthLayout } from '../layouts/AuthLayout';
import { useAuth } from '../features/auth/AuthProvider';

export function Login() {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (!auth.loading && auth.user) return <Navigate to={`/dashboard/${auth.user.role}`} replace/>;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy || auth.loading) return;
    const form = new FormData(event.currentTarget);
    setBusy(true); setError('');
    try {
      const user = await auth.login(String(form.get('email')), String(form.get('password')));
      const from = location.state?.from;
      navigate(from === `/dashboard/${user.role}` ? from : `/dashboard/${user.role}`, { replace: true });
    } catch (err) { setError(err instanceof Error ? err.message : 'Sign-in failed. Please try again.'); }
    finally { setBusy(false); }
  }
  return <AuthLayout>
    <div className="mb-7 flex items-center gap-2 text-xs font-medium text-brand"><LockKeyhole size={18}/>Your secure placement workspace</div>
    <h1 className="text-3xl font-bold tracking-tight text-ink">Welcome back</h1>
    <p className="mb-8 mt-3 text-sm leading-6 text-slate-500">Sign in to Disha360 and continue your journey.</p>
    {(location.state?.loggedOut || auth.notice === 'loggedOut') && <p role="status" className="mb-5 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">You’ve been signed out successfully.</p>}
    {(error || auth.error) && <p role="alert" className="mb-5 rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-700">{error || auth.error}</p>}
    <form onSubmit={submit} aria-busy={busy}><fieldset disabled={busy || auth.loading} className="space-y-5">
      <div><label htmlFor="email" className="field-label">Email address</label><div className="relative"><Mail size={17} className="absolute left-3.5 top-3.5 text-slate-400"/><input id="email" name="email" type="email" autoComplete="email" required maxLength={254} placeholder="you@college.edu" className="input pl-11"/></div></div>
      <div><label htmlFor="password" className="field-label">Password</label><div className="relative"><LockKeyhole size={17} className="absolute left-3.5 top-3.5 text-slate-400"/><input id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required maxLength={128} placeholder="Enter your password" className="input px-11"/><button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-0 top-0 flex h-full w-11 items-center justify-center rounded-lg text-slate-600" aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={17}/> : <Eye size={17}/>}</button></div></div>
      <button type="submit" className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">{busy || auth.loading ? <><LoaderCircle size={17} className="animate-spin"/>{busy ? 'Signing in…' : 'Checking session…'}</> : <>Sign in <ArrowRight size={16}/></>}</button>
    </fieldset></form>
    <p className="mt-6 text-center text-sm text-slate-500">New student? <Link to="/register" className="font-semibold text-brand hover:underline">Create an account</Link></p>
    <div className="mt-9 rounded-lg border border-slate-100 bg-slate-50 p-4"><p className="text-xs leading-6 text-slate-500">Students, trainers, and placement officers use the same sign-in. Your account determines your workspace; staff accounts are created by an authorized operator.</p>{import.meta.env.DEV && <p className="mt-2 text-xs leading-5 text-slate-400">Development demo accounts can be created with <code>npm run seed:demo</code>. Ask your project operator for the private demo password.</p>}</div>
  </AuthLayout>;
}
