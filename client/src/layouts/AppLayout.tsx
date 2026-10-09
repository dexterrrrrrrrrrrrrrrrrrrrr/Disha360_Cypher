import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BarChart3, BookOpen, BriefcaseBusiness, Code2, FileText, LayoutDashboard, LogOut, Menu, MessageSquare, ShieldCheck, Trophy, Users, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Brand } from '../components/Brand';
import { roleLabels, type Role } from '../types';
import { useAuth } from '../features/auth/AuthProvider';

export function AppLayout({ role, children }: { role: Role; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const auth = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  async function logout() {
    setLoggingOut(true); setLogoutError('');
    try { await auth.logout(); navigate('/login', { replace: true, state: { loggedOut: true } }); }
    catch (err) { setLogoutError(err instanceof Error ? err.message : 'Unable to sign out. Please try again.'); }
    finally { setLoggingOut(false); }
  }
  const student = [['Learning modules', BookOpen], ['Assessments', FileText], ['Coding practice', Code2], ['Resume studio', BriefcaseBusiness], ['Mock interviews', MessageSquare], ['Company preparation', Users], ['Leaderboard', Trophy]] as const;
  const staff = [['Batches & students', Users], ['Learning content', BookOpen], ['Questions & tests', FileText], ['Assignments', BriefcaseBusiness], ['Reports & analytics', BarChart3], ...(role === 'admin' ? [['Accounts & roles', ShieldCheck] as const] : [])] as const;
  return <div className="min-h-screen bg-[#f5f7fb]">{open && <button className="fixed inset-0 z-30 bg-ink/40 lg:hidden" aria-label="Close navigation" onClick={() => setOpen(false)}/>}
    <aside className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-slate-200 bg-white transition-transform lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="flex h-24 items-center justify-between px-7"><Link to="/login" aria-label="Disha360 home"><Brand/></Link><button className="icon-button lg:hidden" onClick={() => setOpen(false)} aria-label="Close navigation"><X size={20}/></button></div>
      <div className="mx-5 rounded-lg border border-indigo-100 bg-indigo-50/60 px-3 py-3"><span className="text-[10px] font-bold uppercase tracking-widest text-brand">Your workspace</span><p className="mt-1 truncate text-sm font-semibold text-ink">{roleLabels[role]}</p></div>
      <nav aria-label="Main navigation" className="mt-7 flex-1 space-y-1 px-4"><p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[.15em] text-slate-400">Workspace</p><Link to={`/dashboard/${role}`} className="flex items-center gap-3 rounded-lg bg-indigo-50 px-3 py-3 text-sm font-semibold text-brand" aria-current="page" onClick={() => setOpen(false)}><LayoutDashboard size={18}/>Overview</Link>{(role === 'student' ? student : staff).map(([label, Icon]) => <button key={label} disabled title="Planned for a later checkpoint" className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm text-slate-400"><Icon size={18}/>{label}</button>)}</nav>
      <div className="m-5 rounded-xl bg-slate-50 p-4"><div className="flex items-center gap-2 text-xs font-semibold text-slate-600"><ShieldCheck size={16}/>Authenticated workspace</div><p className="mt-2 text-xs leading-5 text-slate-500">You’re signed in securely. Learning features will be added in later checkpoints.</p></div>
      <div className="border-t border-slate-100">{logoutError && <p role="alert" className="px-5 pt-3 text-xs text-red-700">{logoutError}</p>}<button onClick={() => void logout()} disabled={loggingOut} className="flex w-full items-center gap-3 px-7 py-5 text-sm font-medium text-slate-600"><LogOut size={17}/>{loggingOut ? 'Signing out…' : 'Sign out'}</button></div>
    </aside>
    <div className="lg:pl-64"><header className="flex min-h-20 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 sm:px-8"><div className="flex items-center gap-3"><button className="icon-button lg:hidden" onClick={() => setOpen(true)} aria-label="Open navigation"><Menu size={22}/></button><span className="text-sm text-slate-500">Workspace <span className="mx-2 text-slate-300">/</span><span className="font-medium text-ink">Overview</span></span></div><div className="flex items-center gap-3"><div className="max-w-44 text-right"><p className="truncate text-xs font-semibold text-ink">{auth.user?.name}</p><p className="mt-1 truncate text-[10px] text-slate-500">{roleLabels[role]}</p></div><span className="hidden h-9 w-9 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-brand sm:flex">{role === 'student' ? 'ST' : role === 'trainer' ? 'TF' : 'AD'}</span></div></header><main id="main-content" className="mx-auto max-w-[1440px] p-4 sm:p-8 lg:p-9">{children}</main><footer className="flex flex-wrap justify-between gap-2 px-4 pb-6 text-xs text-slate-400 sm:px-8"><span>© {new Date().getFullYear()} Disha360</span><span>Placement preparation, one step at a time.</span></footer></div>
  </div>;
}
