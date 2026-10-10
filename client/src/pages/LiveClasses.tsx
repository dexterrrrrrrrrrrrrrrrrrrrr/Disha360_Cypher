import { useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AppLayout } from '../layouts/AppLayout';
import { PageHeading, ErrorNotice, Loading, Empty } from '../components/StudentUI';
import { useStaffData, staffRequest } from '../hooks/useStaffData';
import type { Role } from '../types';
type Attendance = { studentId?: string; status: 'present' | 'absent' | 'excused'; note: string; recordedAt: string };
export interface LiveClassRecord {
  id: string; title: string; description: string; batchId: string; trainerId: string; startsAt: string; durationMinutes: number;
  status: 'Upcoming' | 'Live' | 'Completed' | 'Cancelled'; version: number; meetingUrl?: string | null; notes?: string;
  resources?: { title: string; url: string }[]; attendance?: Attendance[]; students?: { id: string; name: string; email: string }[];
}
interface ClassList { classes: LiveClassRecord[]; truncated: boolean; analytics?: { total: number; completed: number; upcoming: number; live: number; cancelled: number; attendance: Record<string, number> } }
const base = (role: Role) => role === 'student' ? '/live-classes' : `/manage/${role}/live-classes`;
const prefix = (role: Role) => role === 'student' ? '/api/v1/student' : '/api/v1/staff';
function Join({ c, label = 'Join Live Class' }: { c: LiveClassRecord; label?: string }) {
  return c.meetingUrl && (c.status === 'Upcoming' || c.status === 'Live') ? <a className="btn-primary inline-block" href={c.meetingUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{label} ↗</a> : null;
}
function DashboardClass({ c, role }: { c: LiveClassRecord; role: Role }) {
  const detail = useStaffData<LiveClassRecord>(`/live-classes/${c.id}`, prefix(role));
  return <li className="space-y-2 text-sm"><Link className="font-semibold text-brand" to={`${base(role)}/${c.id}`}>{c.title} · {c.status}</Link><p>{new Date(c.startsAt).toLocaleString()} · {c.durationMinutes} minutes</p>
    {detail.error && <ErrorNotice message={detail.error} retry={() => void detail.reload()}/>}
    {detail.data && <Join c={detail.data} label={role === 'student' ? 'Join Live Class' : 'Launch SparkMeet Meeting'}/>}
    <Link className="ml-3 inline-block text-brand" to={`${base(role)}/${c.id}`}>Class details →</Link></li>;
}
export function UpcomingLiveClasses({ role }: { role: Role }) {
  const result = useStaffData<ClassList>('/live-classes?view=upcoming', prefix(role));
  const upcoming = result.data?.classes.filter(c => c.status === 'Upcoming' || c.status === 'Live').sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)).slice(0, 3) || [];
  return <section className="card my-5"><h2 className="font-semibold">Upcoming live classes</h2>{result.error && <ErrorNotice message={result.error} retry={() => void result.reload()}/>} {result.loading ? <Loading/> : upcoming.length ? <ul className="my-4 space-y-3">{upcoming.map(c => <DashboardClass key={c.id} c={c} role={role}/>)}</ul> : <Empty message="No upcoming classes in your authorized batches."/>}<Link className="mt-3 inline-block text-sm font-semibold text-brand" to={base(role)}>{role === 'student' ? 'View classes and attendance history →' : 'Schedule and manage live classes →'}</Link></section>;
}
export function LiveClasses({ role }: { role: Role }) {
  const result = useStaffData<ClassList>('/live-classes', prefix(role));
  const [filter, setFilter] = useState('all'); const records = result.data?.classes.filter(c => filter === 'all' || c.status === filter) || [];
  return <AppLayout role={role}><PageHeading title="SparkMeet live classes" detail="Scheduled meetings for your authorized batches. Attendance is recorded manually, never inferred from opening a link."/>
    {role !== 'student' && <Link className="btn-primary mb-5 inline-block" to={`${base(role)}/new`}>Schedule Live Class</Link>}
    {result.error && <ErrorNotice message={result.error} retry={() => void result.reload()}/>}
    {result.data?.analytics && <section className="card mb-5 text-sm leading-7"><h2 className="font-semibold">Live-class overview</h2><p>Total: {result.data.analytics.total} · Upcoming: {result.data.analytics.upcoming} · Live: {result.data.analytics.live} · Completed: {result.data.analytics.completed} · Cancelled: {result.data.analytics.cancelled}</p><p>Manual attendance records · Present: {result.data.analytics.attendance.present || 0} · Absent: {result.data.analytics.attendance.absent || 0} · Excused: {result.data.analytics.attendance.excused || 0}</p></section>}
    <label className="mb-5 block"><span className="field-label">Class status</span><select aria-label="Class status" className="input max-w-xs" value={filter} onChange={e => setFilter(e.target.value)}>{['all', 'Upcoming', 'Live', 'Completed', 'Cancelled'].map(status => <option key={status} value={status}>{status === 'all' ? 'All classes / attendance history' : status}</option>)}</select></label>
    {result.loading ? <Loading/> : !records.length ? <Empty message="No classes match this status. Only assigned batches appear here."/> : <div className="grid gap-5 md:grid-cols-2">{records.map(c => <section className="card min-w-0" key={c.id}><h2 className="break-words font-semibold">{c.title}</h2><p className="my-2 text-sm text-brand">{c.status} · {new Date(c.startsAt).toLocaleString()} · {c.durationMinutes} min</p><p className="mb-3 whitespace-pre-wrap break-words text-sm text-slate-600">{c.description}</p>{role === 'student' && <p className="mb-3 text-sm">Attendance: {c.attendance?.[0]?.status || 'Not recorded'}</p>}<Link className="text-sm font-semibold text-brand" to={`${base(role)}/${c.id}`}>{role === 'student' ? 'Join / notes / attendance →' : 'Manage / launch / attendance →'}</Link></section>)}</div>}
    {result.data?.truncated && <p className="mt-4 text-sm">Showing the latest 100 classes. Older records remain stored.</p>}
  </AppLayout>;
}
export function LiveClassDetails({ role }: { role: Role }) {
  const { id } = useParams(), navigate = useNavigate();
  const result = useStaffData<LiveClassRecord>(id && id !== 'new' ? `/live-classes/${id}` : null, prefix(role));
  const [editing, setEditing] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''); const lock = useRef(false);
  async function cancel() {
    if (!result.data || lock.current || !window.confirm('Cancel this class? Students will no longer receive its meeting link.')) return;
    lock.current = true; setBusy(true); setError('');
    try { await staffRequest(`/live-classes/${id}/cancel`, { method: 'POST', body: { version: result.data.version } }); await result.reload(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Cancellation failed.'); } finally { lock.current = false; setBusy(false); }
  }
  const c = result.data;
  return <AppLayout role={role}><PageHeading title={id === 'new' ? 'Schedule Live Class' : c?.title || 'Live class details'} detail="SparkMeet opens in a separate tab. Disha360 does not verify video attendance or control access inside SparkMeet."/><Link to={base(role)} className="mb-5 inline-block text-sm text-brand">← All live classes</Link>
    {(error || result.error) && <ErrorNotice message={error || result.error} retry={() => void result.reload()}/>}
    {id === 'new' ? role !== 'student' && <ClassForm role={role} onSaved={saved => navigate(`${base(role)}/${saved.id}`)}/> : result.loading ? <Loading/> : c && <>
      <section className="card mb-5 space-y-4"><p className="font-semibold text-brand">{c.status} · {new Date(c.startsAt).toLocaleString()} · {c.durationMinutes} minutes</p><p className="whitespace-pre-wrap break-words text-sm">{c.description}</p><p className="text-xs leading-6 text-slate-600">Live/Completed reflects the scheduled time window, not proof that a video meeting is running. Opening a link never marks attendance.</p><Join c={c} label={role === 'student' ? 'Join Live Class' : 'Launch SparkMeet Meeting'}/>
        <h2 className="font-semibold">Class notes and resources</h2><p className="whitespace-pre-wrap break-words text-sm">{c.notes || 'No notes shared yet.'}</p><ul className="space-y-2 text-sm">{c.resources?.map((r, i) => <li key={i}><a className="text-brand" href={r.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{r.title} ↗</a></li>)}</ul>
        {role === 'student' ? <p className="text-sm">Your manual attendance: {c.attendance?.[0]?.status || 'Not recorded'} {c.attendance?.[0]?.note && `· ${c.attendance[0].note}`}</p> : c.status !== 'Cancelled' && <div className="flex flex-wrap gap-3"><button className="btn-secondary" disabled={busy} onClick={() => setEditing(v => !v)}>{editing ? 'Close editor' : 'Edit class / notes'}</button>{c.status !== 'Completed' && <button className="btn-secondary" disabled={busy} onClick={() => void cancel()}>{busy ? 'Cancelling…' : 'Cancel class'}</button>}</div>}
      </section>
      {editing && role !== 'student' && <ClassForm key={c.version} role={role} current={c} onSaved={() => { setEditing(false); void result.reload(); }}/>}
      {role !== 'student' && <AttendanceForm key={c.version} c={c} onSaved={() => void result.reload()}/>}
    </>}
  </AppLayout>;
}
function localDate(value: string) { const d = new Date(value); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
function ClassForm({ role, current, onSaved }: { role: 'trainer' | 'admin'; current?: LiveClassRecord; onSaved: (c: LiveClassRecord) => void }) {
  const batches = useStaffData<{ id: string; name: string; trainerIds: string[]; active: boolean }[]>('/batches');
  const trainers = useStaffData<{ people: { id: string; name: string }[] }>(role === 'admin' ? '/people?role=trainer' : null);
  const [title, setTitle] = useState(current?.title || ''), [description, setDescription] = useState(current?.description || ''), [batchId, setBatch] = useState(current?.batchId || ''), [trainerId, setTrainer] = useState(current?.trainerId || '');
  const initialDate = current ? localDate(current.startsAt) : '';
  const [date, setDate] = useState(initialDate), [duration, setDuration] = useState(current?.durationMinutes || 60), [url, setUrl] = useState(current?.meetingUrl || ''), [notes, setNotes] = useState(current?.notes || ''), [resources, setResources] = useState(current?.resources || []);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''); const lock = useRef(false), request = useRef({ fingerprint: '', id: '' });
  async function save(e: FormEvent) {
    e.preventDefault(); if (lock.current) return; lock.current = true; setBusy(true); setError('');
    try {
      const payload = { title, description, batchId, ...(role === 'admin' ? { trainerId } : {}), startsAt: current && date === initialDate ? current.startsAt : new Date(date).toISOString(), durationMinutes: duration, meetingUrl: url, notes, resources };
      const fingerprint = JSON.stringify(payload); if (request.current.fingerprint !== fingerprint) request.current = { fingerprint, id: crypto.randomUUID() };
      const saved = await staffRequest<LiveClassRecord>(current ? `/live-classes/${current.id}` : '/live-classes', { method: current ? 'PUT' : 'POST', body: { ...payload, ...(current ? { version: current.version } : { requestId: request.current.id }) } }); onSaved(saved);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save the class.'); } finally { lock.current = false; setBusy(false); }
  }
  return <form className="card mb-5 space-y-4" onSubmit={e => void save(e)}><h2 className="font-semibold">{current ? 'Edit class' : 'Schedule a SparkMeet class'}</h2>{(error || batches.error || trainers.error) && <ErrorNotice message={error || batches.error || trainers.error}/>}
    <fieldset disabled={busy || batches.loading || trainers.loading} className="space-y-4">
      <label className="block"><span className="field-label">Class title</span><input className="input" value={title} onChange={e => setTitle(e.target.value)} required minLength={3} maxLength={150}/></label>
      <label className="block"><span className="field-label">Description</span><textarea aria-label="Description" className="input" value={description} onChange={e => setDescription(e.target.value)} maxLength={3000}/></label>
      <label className="block"><span className="field-label">Batch</span><select aria-label="Batch" className="input" value={batchId} onChange={e => { setBatch(e.target.value); if (role === 'admin') setTrainer(''); }} required><option value="">Select an assigned batch</option>{batches.data?.filter(b => b.active).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
      {role === 'admin' && <label className="block"><span className="field-label">Assigned trainer</span><select aria-label="Assigned trainer" className="input" required value={trainerId} onChange={e => setTrainer(e.target.value)}><option value="">Select a trainer assigned to this batch</option>{trainers.data?.people.filter(t => batches.data?.find(b => b.id === batchId)?.trainerIds.includes(t.id)).map(t => <option value={t.id} key={t.id}>{t.name}</option>)}</select></label>}
      <div className="grid gap-4 sm:grid-cols-2"><label className="block min-w-0"><span className="field-label">Date and start time (your local timezone)</span><input type="datetime-local" className="input min-w-0" value={date} onChange={e => setDate(e.target.value)} required/></label><label className="block"><span className="field-label">Duration (minutes)</span><input className="input" type="number" min={10} max={480} value={duration} onChange={e => setDuration(Number(e.target.value))} required/></label></div>
      <label className="block"><span className="field-label">SparkMeet meeting link</span><input className="input" type="url" required maxLength={2000} value={url} onChange={e => setUrl(e.target.value)} placeholder="Paste the link supplied by SparkMeet"/></label><p className="text-xs leading-6 text-slate-600">Create or obtain your meeting in SparkMeet separately. Only https://sparkmeet-web.onrender.com links are accepted. Its room creation, access controls and embedding have not been verified; no room URLs or tokens are generated here.</p>
      <label className="block"><span className="field-label">Class notes</span><textarea aria-label="Class notes" className="input min-h-24" maxLength={5000} value={notes} onChange={e => setNotes(e.target.value)}/></label>
      <fieldset className="space-y-3"><legend className="field-label">Optional resources (HTTPS)</legend>{resources.map((r, i) => <div key={i} className="grid gap-2 sm:grid-cols-2"><label><span className="field-label">Resource {i + 1} title</span><input className="input" value={r.title} required maxLength={150} onChange={e => setResources(rows => rows.map((v, j) => j === i ? { ...v, title: e.target.value } : v))}/></label><label><span className="field-label">Resource {i + 1} URL</span><input className="input" type="url" value={r.url} required maxLength={2000} onChange={e => setResources(rows => rows.map((v, j) => j === i ? { ...v, url: e.target.value } : v))}/></label><button className="btn-secondary" type="button" onClick={() => setResources(rows => rows.filter((_, j) => j !== i))}>Remove resource {i + 1}</button></div>)}<button className="btn-secondary" type="button" disabled={resources.length >= 10} onClick={() => setResources(rows => [...rows, { title: '', url: '' }])}>Add resource</button></fieldset>
      <button className="btn-primary" type="submit">{busy ? 'Saving…' : current ? 'Save class changes' : 'Save scheduled class'}</button>
    </fieldset>
  </form>;
}
function AttendanceForm({ c, onSaved }: { c: LiveClassRecord; onSaved: () => void }) {
  const [values, setValues] = useState<Record<string, { status: string; note: string }>>(() => Object.fromEntries((c.students || []).map(s => { const a = c.attendance?.find(a => a.studentId === s.id); return [s.id, { status: a?.status || '', note: a?.note || '' }]; })));
  const [busy, setBusy] = useState(false), [error, setError] = useState(''); const lock = useRef(false);
  async function save(e: FormEvent) {
    e.preventDefault(); if (lock.current) return; lock.current = true; setBusy(true); setError('');
    try { await staffRequest(`/live-classes/${c.id}/attendance`, { method: 'PUT', body: { version: c.version, records: Object.entries(values).filter(([, v]) => v.status).map(([studentId, v]) => ({ studentId, ...v })) } }); onSaved(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to save attendance.'); } finally { lock.current = false; setBusy(false); }
  }
  return <form className="card space-y-4" onSubmit={e => void save(e)}><h2 className="font-semibold">Enrolled students / manual attendance</h2><p className="text-sm text-slate-600">Select each status from your own observation. Unmarked students remain unrecorded; joining SparkMeet never marks them present.</p>{error && <ErrorNotice message={error}/>}
    {!c.students?.length ? <Empty message="No currently enrolled students in this batch."/> : <fieldset disabled={busy || c.status === 'Upcoming' || c.status === 'Cancelled'} className="space-y-4">{c.students.map(s => <div key={s.id} className="rounded-lg border border-slate-200 p-3"><p className="break-words text-sm font-semibold">{s.name} · {s.email}</p><div className="mt-3 grid gap-3 sm:grid-cols-2"><label><span className="field-label">Attendance for {s.name}</span><select aria-label={`Attendance for ${s.name} (${s.email})`} className="input" value={values[s.id]?.status || ''} onChange={e => setValues(rows => ({ ...rows, [s.id]: { ...rows[s.id], status: e.target.value } }))}><option value="" disabled={!!c.attendance?.some(a => a.studentId === s.id)}>Not recorded</option>{['present', 'absent', 'excused'].map(v => <option key={v} value={v}>{v}</option>)}</select></label><label><span className="field-label">Attendance note for {s.name}</span><input aria-label={`Attendance note for ${s.name} (${s.email})`} className="input" maxLength={500} value={values[s.id]?.note || ''} onChange={e => setValues(rows => ({ ...rows, [s.id]: { ...rows[s.id], note: e.target.value } }))}/></label></div></div>)}<button className="btn-primary">{busy ? 'Recording…' : 'Save manual attendance'}</button></fieldset>}
    {!!c.attendance?.length && <section className="space-y-3"><h3 className="font-semibold">Saved attendance records</h3><ul className="space-y-3 text-sm">{c.attendance.map((a, i) => <li key={a.studentId || i} className="break-words rounded-lg bg-slate-50 p-3"><p>{c.students?.find(s => s.id === a.studentId)?.name || `Previously enrolled student (${a.studentId})`} · {a.status} · {new Date(a.recordedAt).toLocaleString()}</p><p>{a.note}</p></li>)}</ul></section>}
    {(c.status === 'Upcoming' || c.status === 'Cancelled') && <p className="text-sm">Attendance cannot be recorded before the start or for cancelled classes.</p>}
  </form>;
}
