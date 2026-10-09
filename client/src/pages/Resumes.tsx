import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Plus } from 'lucide-react';
import { AppLayout } from '../layouts/AppLayout';
import { PageHeading, Empty, ErrorNotice, Loading } from '../components/StudentUI';
import { useStudentData } from '../hooks/useStudentData';
import { studentRequest } from '../services/student';
import type { ResumeRecord } from '../features/resume/types';
export function Resumes() {
  const records = useStudentData<{ resumes: ResumeRecord[] }>('/resumes');
  const [deleting, setDeleting] = useState(''); const [error, setError] = useState('');
  async function remove(id: string) { if (!window.confirm('Delete this resume? This cannot be undone.')) return; setDeleting(id); setError(''); try { await studentRequest(`/resumes/${id}`, { method: 'DELETE' }); await records.reload(); } catch (e) { setError(e instanceof Error ? e.message : 'Unable to delete.'); } finally { setDeleting(''); } }
  return <AppLayout role="student"><PageHeading title="Resume studio" detail="Shape your experience into a clear, professional resume. Your drafts are private."/><Link to="/resumes/new" className="btn-primary mb-6 inline-flex items-center gap-2"><Plus size={17}/>Create resume</Link>{(error || records.error) && <ErrorNotice message={error || records.error} retry={() => void records.reload()}/>}{records.loading && !records.data ? <Loading/> : records.data?.resumes.length ? <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{records.data.resumes.map(r => <section className="card" key={r.id}><FileText className="mb-4 text-brand"/><h2 className="font-semibold">{r.title}</h2><p className="mt-2 text-xs capitalize text-slate-500">{r.template} template · version {r.version}</p><p className="mt-2 text-xs text-slate-400">Saved {new Date(r.updatedAt).toLocaleString()}</p><div className="mt-5 flex justify-between gap-3"><Link className="text-sm font-semibold text-brand" to={`/resumes/${r.id}`}>Edit & export</Link><button className="text-sm text-red-700" disabled={!!deleting} onClick={() => void remove(r.id)}>{deleting === r.id ? 'Deleting…' : 'Delete'}</button></div></section>)}</div> : <Empty message="No resumes saved yet. Create your first draft to get started."/>}</AppLayout>;
}
