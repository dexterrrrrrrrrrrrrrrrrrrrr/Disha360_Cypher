import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ArrowRight, Eye, EyeOff, LoaderCircle, UserRound } from 'lucide-react';
import { AuthLayout } from '../layouts/AuthLayout';
import { useAuth } from '../features/auth/AuthProvider';
import { ApiError } from '../services/auth';

export function Register() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  if (!auth.loading && auth.user) return <Navigate to={`/dashboard/${auth.user.role}`} replace/>;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy || auth.loading) return;
    const form = new FormData(event.currentTarget);
    const password = String(form.get('password'));
    setFields({}); setError('');
    if (password !== form.get('confirmPassword')) { setFields({ confirmPassword: 'Passwords do not match.' }); return; }
    setBusy(true);
    try {
      await auth.register({ name: String(form.get('name')), email: String(form.get('email')), password, department: String(form.get('department')), semester: Number(form.get('semester')) });
      navigate('/dashboard/student', { replace: true, state: { registered: true } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed. Please try again.');
      if (err instanceof ApiError) setFields(Object.fromEntries(err.fields.map(field => [field.field, field.message])));
    } finally { setBusy(false); }
  }
  const fieldError = (name: string) => fields[name] ? <p id={`${name}-error`} className="mt-1 text-xs text-red-700">{fields[name]}</p> : null;
  return <AuthLayout>
    <div className="mb-7 flex items-center gap-2 text-xs font-medium text-brand"><UserRound size={18}/>Start your student journey</div>
    <h2 className="text-3xl font-bold tracking-tight text-ink">Create your account</h2><p className="mb-7 mt-3 text-sm leading-6 text-slate-500">Join Disha360 and take the first step toward placement preparation.</p>
    {(error || auth.error) && <p role="alert" className="mb-5 rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-700">{error || auth.error}</p>}
    <form onSubmit={submit} aria-busy={busy}><fieldset disabled={busy || auth.loading} className="space-y-4">
      {[{ name: 'name', label: 'Full name', type: 'text', placeholder: 'Your full name', max: 80, min: 2, auto: 'name' }, { name: 'email', label: 'Email address', type: 'email', placeholder: 'you@college.edu', max: 254, min: undefined, auto: 'email' }, { name: 'department', label: 'Department', type: 'text', placeholder: 'e.g. Computer Science', max: 100, min: 2, auto: 'organization' }].map(field => <div key={field.name}><label htmlFor={field.name} className="field-label">{field.label}</label><input id={field.name} name={field.name} type={field.type} required minLength={field.min} maxLength={field.max} autoComplete={field.auto} placeholder={field.placeholder} className="input" aria-invalid={!!fields[field.name]} aria-describedby={fields[field.name] ? `${field.name}-error` : undefined}/>{fieldError(field.name)}</div>)}
      <div><label htmlFor="semester" className="field-label">Semester</label><select id="semester" name="semester" defaultValue="" required className="input" aria-invalid={!!fields.semester}><option value="" disabled>Select your semester</option>{Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>Semester {i + 1}</option>)}</select>{fieldError('semester')}</div>
      <div><label htmlFor="password" className="field-label">Password</label><div className="relative"><input id="password" name="password" type={showPassword ? 'text' : 'password'} required minLength={12} maxLength={128} pattern="(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9]).{12,128}" autoComplete="new-password" placeholder="Create a strong password" className="input pr-11" aria-invalid={!!fields.password} aria-describedby="password-help"/><button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-3.5 text-slate-400" aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={17}/> : <Eye size={17}/>}</button></div><p id="password-help" className="mt-1.5 text-xs leading-5 text-slate-400">12–128 characters, with uppercase, lowercase, and a number.</p>{fieldError('password')}</div>
      <div><label htmlFor="confirmPassword" className="field-label">Confirm password</label><input id="confirmPassword" name="confirmPassword" type={showPassword ? 'text' : 'password'} required maxLength={128} autoComplete="new-password" placeholder="Re-enter your password" className="input" aria-invalid={!!fields.confirmPassword} aria-describedby={fields.confirmPassword ? 'confirmPassword-error' : undefined}/>{fieldError('confirmPassword')}</div>
      <button className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60" type="submit">{busy || auth.loading ? <><LoaderCircle size={17} className="animate-spin"/>{busy ? 'Creating account…' : 'Checking session…'}</> : <>Create student account <ArrowRight size={16}/></>}</button>
    </fieldset></form>
    <p className="mt-5 text-center text-sm text-slate-500">Already have an account? <Link to="/login" className="font-semibold text-brand hover:underline">Sign in</Link></p><p className="mt-5 text-center text-xs leading-5 text-slate-400">Public registration creates Student accounts only.</p>
  </AuthLayout>;
}
