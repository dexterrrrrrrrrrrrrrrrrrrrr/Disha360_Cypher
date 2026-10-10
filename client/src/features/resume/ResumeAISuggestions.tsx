import { useEffect, useRef, useState } from 'react';
import { useStudentData } from '../../hooks/useStudentData';
import { studentRequest } from '../../services/student';
import { ErrorNotice } from '../../components/StudentUI';
interface Suggestions {
  suggestions: { section: string; suggestion: string; reason: string }[];
  provider: string; resumeVersion: number; disclaimer: string;
}
export function ResumeAISuggestions({ resumeId, jobDescription }: { resumeId: string; jobDescription: string }) {
  const config = useStudentData<{ resumeSuggestionsAvailable: boolean; provider?: string }>('/interviews/config');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Suggestions | null>(null);
  const generation = useRef(0);
  useEffect(() => {
    generation.current++; setConsent(false); setResult(null); setError(''); setBusy(false);
    return () => { generation.current++; };
  }, [resumeId, jobDescription]);
  async function generate() {
    if (!consent || busy) return;
    const current = generation.current;
    setBusy(true); setError(''); setResult(null);
    try {
      const data = await studentRequest<Suggestions>(`/resumes/${resumeId}/ai-suggestions`, {
        method: 'POST', body: { consent: true, jobDescription },
      });
      if (current === generation.current) setResult(data);
    } catch (e) {
      if (current === generation.current) setError(e instanceof Error ? e.message : 'AI suggestions are temporarily unavailable.');
    } finally { if (current === generation.current) setBusy(false); }
  }
  return <section aria-label="Optional AI resume suggestions" className="card space-y-4 break-words">
    <h2 className="font-semibold">Optional AI resume suggestions</h2>
    <p className="text-sm leading-6 text-slate-600">The ATS score above stays rule-based. AI suggestions do not change your score or resume. Review wording and add skills or achievements only if they are true.</p>
    <p id="resume-ai-privacy" className="rounded-lg bg-amber-50 p-4 text-sm leading-6 text-amber-900">If you choose this action, selected saved resume text and the job description are sent to {config.data?.provider || 'the configured AI provider'}. Contact details, links, employers and institutions are omitted; known contact details in text are redacted. Free-form text may still identify you. Review the selected provider's data-use and retention terms (including any cloud Free Tier terms), and avoid confidential or sensitive information.</p>
    {(error || config.error) && <ErrorNotice message={error || config.error} />}
    {config.loading ? <p role="status" className="text-sm">Checking AI availability…</p> : !config.data?.resumeSuggestionsAvailable ? <p className="text-sm text-slate-600">AI suggestions are unavailable until the backend AI provider is configured. ATS analysis and the resume builder remain available.</p> : <>
      <label className="flex items-start gap-3 text-sm leading-6">
        <input type="checkbox" className="mt-1" checked={consent} disabled={busy} aria-describedby="resume-ai-privacy" onChange={e => setConsent(e.target.checked)} />
        <span>I consent to sending this selected resume content and job description to {config.data?.provider || 'the configured AI provider'} for this request.</span>
      </label>
      <button className="btn-primary" disabled={busy || !consent || !resumeId || jobDescription.trim().length < 50} onClick={() => void generate()}>{busy ? 'Preparing AI suggestions…' : 'Get optional AI suggestions'}</button>
    </>}
    {busy && <p role="status" className="text-sm text-brand">Requesting qualitative suggestions; no resume changes will be made.</p>}
    {result && <div role="status" className="space-y-4">
      <p className="text-sm font-semibold text-brand">AI-generated suggestions · {result.provider} · Saved resume version {result.resumeVersion}</p>
      <p className="text-xs leading-6 text-slate-600">{result.disclaimer}</p>
      <ul className="space-y-4">{result.suggestions.map((item, i) => <li key={i} className="rounded-lg border border-slate-200 p-4">
        <h3 className="text-sm font-semibold capitalize">{item.section}</h3>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{item.suggestion}</p>
        <p className="mt-2 text-xs leading-6 text-slate-600">{item.reason}</p>
      </li>)}</ul>
      <p className="text-xs text-slate-600">Suggestions are temporary and disappear on reload. Apply any approved edits yourself in the resume builder.</p>
    </div>}
  </section>;
}
