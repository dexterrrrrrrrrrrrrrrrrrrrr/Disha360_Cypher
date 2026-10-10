import { useEffect, useRef, useState } from 'react';
import { useStudentData } from '../../hooks/useStudentData';
import { studentRequest } from '../../services/student';
import { ErrorNotice } from '../../components/StudentUI';
import type { Language } from './templates';
const actions = { explain: 'Explain my code', error: 'Explain this error', hint: 'Give me a hint', debug: 'Help me debug', optimize: 'Suggest optimization', time: 'Explain time complexity', space: 'Explain space complexity', approach: 'Suggest a solution approach' };
interface Advice { explanation: string; nextSteps: string[]; provider: string; disclaimer: string }
export function CodingMentor({ language, source, problemId, executionError = '', disabled = false }: { language: Language; source: string; problemId?: string; executionError?: string; disabled?: boolean }) {
  const config = useStudentData<{ configured: boolean }>('/coding/mentor/config');
  const [action, setAction] = useState<keyof typeof actions>('hint'), [hintLevel, setHintLevel] = useState(1), [allowSolution, setAllowSolution] = useState(false);
  const [consent, setConsent] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [advice, setAdvice] = useState<Advice | null>(null);
  const generation = useRef(0), lock = useRef(false);
  useEffect(() => { generation.current++; setHintLevel(1); setAllowSolution(false); setConsent(false); setAdvice(null); setError(''); }, [language, source, problemId, executionError]);
  useEffect(() => () => { generation.current++; }, []);
  async function ask() {
    if (lock.current || disabled || !consent) return;
    lock.current = true; setBusy(true); setError(''); setAdvice(null); const current = generation.current;
    try {
      const result = await studentRequest<Advice>('/coding/mentor', { method: 'POST', body: { language, source, problemId, action, hintLevel, allowSolution, error: executionError.slice(0, 4000) } });
      if (current === generation.current) { setAdvice(result); if (action === 'hint') setHintLevel(level => Math.min(3, level + 1)); }
    } catch (e) { if (current === generation.current) setError(e instanceof Error ? e.message : 'The coding mentor is unavailable.'); }
    finally { lock.current = false; setBusy(false); }
  }
  return <section className="card min-w-0 space-y-4" aria-label="AI Coding Mentor">
    <h2 className="font-semibold">AI Coding Mentor</h2>
    <p className="text-sm leading-6 text-slate-600">AI-generated guidance is not execution, verified correctness, or grading. Only actual execution and deterministic test comparison determine submission results.</p>
    <p id="mentor-privacy" className="text-xs leading-6 text-slate-600">Your current code, public problem description and displayed error text will be sent to Google Gemini. Remove secrets and personal information. Hidden tests and demo output are never sent. Review Google's current data-use terms before opting in.</p>
    {(error || config.error) && <ErrorNotice message={error || config.error}/>}
    {!config.data?.configured ? <p role="status" className="text-sm">{config.loading ? 'Checking mentor configuration…' : 'The Gemini mentor is not configured. You can still edit and use available execution or demo actions.'}</p> : <>
      <label className="block"><span className="field-label">Mentor action</span><select aria-label="Mentor action" className="input" disabled={busy || disabled} value={action} onChange={e => { setAction(e.target.value as keyof typeof actions); setAdvice(null); }}>{Object.entries(actions).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      {action === 'hint' && <p className="text-sm">Next hint: {hintLevel} of 3 · {['Small conceptual clue', 'Directional clue', 'Detailed approach'][hintLevel - 1]}</p>}
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={allowSolution} disabled={busy || disabled} onChange={e => setAllowSolution(e.target.checked)}/><span>I explicitly request a complete solution if useful. Otherwise give guidance only.</span></label>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={consent} disabled={busy || disabled} aria-describedby="mentor-privacy" onChange={e => setConsent(e.target.checked)}/><span>I consent to sending this code and context to Google Gemini.</span></label>
      <button className="btn-primary" disabled={busy || disabled || !consent || !source.trim()} onClick={() => void ask()}>{busy ? 'Requesting AI advice…' : action === 'hint' ? `Get hint ${hintLevel}` : 'Ask coding mentor'}</button>
    </>}
    {busy && <p role="status" className="text-sm">Preparing guidance…</p>}
    {advice && <div className="space-y-3" role="status"><p className="text-sm font-semibold text-brand">AI-generated · {advice.provider}</p><p className="whitespace-pre-wrap break-words text-sm leading-6">{advice.explanation}</p><ul className="list-disc space-y-2 pl-5 text-sm">{advice.nextSteps.map((step, i) => <li key={i}>{step}</li>)}</ul><p className="text-xs text-slate-500">{advice.disclaimer}</p></div>}
  </section>;
}
