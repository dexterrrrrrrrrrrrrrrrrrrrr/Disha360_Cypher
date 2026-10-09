import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { LoaderCircle } from 'lucide-react';
import { useAuth } from './AuthProvider';
import type { Role } from '../../types';

export function ProtectedRoute({ role }: { role: Role }) {
  const auth = useAuth();
  const location = useLocation();
  if (auth.loading) return <div className="flex min-h-screen items-center justify-center gap-3 bg-slate-50 text-sm text-slate-600" role="status"><LoaderCircle className="animate-spin" size={20}/>Checking your session…</div>;
  if (auth.error) return <main id="main-content" className="mx-auto mt-24 max-w-md px-6"><div role="alert" className="card"><h1 className="font-semibold">Unable to verify your session</h1><p className="mt-3 text-sm text-slate-600">{auth.error}</p><button onClick={() => void auth.refresh()} className="mt-5 rounded-lg bg-brand px-4 py-2 text-sm text-white">Try again</button></div></main>;
  if (!auth.user) return <Navigate to="/login" replace state={{ from: location.pathname }}/>;
  if (auth.user.role !== role) return <Navigate to={`/dashboard/${auth.user.role}`} replace/>;
  return <Outlet/>;
}
