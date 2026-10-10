import { useEffect, useRef, useState } from 'react';
import { Sparkles, Send, MessageSquare, Square } from 'lucide-react';
import { useStudentData } from '../../hooks/useStudentData';
import { studentRequest } from '../../services/student';
import { streamMentor } from '../../services/mentorStream';
import { ErrorNotice } from '../../components/StudentUI';
import { MentorMarkdown } from './MentorMarkdown';
import type { Language } from './templates';
const actions = { explain: 'Explain my code', error: 'Explain this error', hint: 'Give me a hint', debug: 'Help me debug', optimize: 'Suggest optimization', time: 'Explain time complexity', space: 'Explain space complexity', approach: 'Suggest a solution approach', practice: 'Generate practice questions', algorithm: 'Explain an algorithm' };
interface Advice { explanation: string; nextSteps: string[]; provider: string; disclaimer: string }
interface ChatMessage { role: 'user' | 'assistant'; text: string; incomplete?: boolean }
export function CodingMentor({ language, source, problemId, executionError = '', disabled = false }: { language: Language; source: string; problemId?: string; executionError?: string; disabled?: boolean }) {
  const config = useStudentData<{ configured: boolean; provider?: string; streaming?: boolean; message?: string; model?: string }>('/coding/mentor/config');
  const [action, setAction] = useState<keyof typeof actions>('hint'), [hintLevel, setHintLevel] = useState(1), [allowSolution, setAllowSolution] = useState(false);
  const [consent, setConsent] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [prompt, setPrompt] = useState(''), [messages, setMessages] = useState<ChatMessage[]>([]);
  const generation = useRef(0), lock = useRef(false), controller = useRef<AbortController | null>(null);
  useEffect(() => { generation.current++; controller.current?.abort(); setHintLevel(1); setAllowSolution(false); setConsent(false); setMessages([]); setError(''); }, [language, source, problemId, executionError]);
  useEffect(() => () => { generation.current++; controller.current?.abort(); }, []);
  async function ask(requestedAction: keyof typeof actions = action) {
    if (lock.current || disabled || !consent || !config.data?.configured) return;
    setAction(requestedAction);
    lock.current = true; setBusy(true); setError(''); const current = generation.current;
    const abort = new AbortController(); controller.current = abort;
    const question = `${actions[requestedAction]}${requestedAction === 'hint' ? ` · Level ${hintLevel}` : ''}${prompt ? `: ${prompt}` : ''}`;
    const previous = messages.slice(-6).map(({ role, text }) => ({ role, text: text.slice(0, 2000) }));
    setMessages(m => [...m.slice(-18), { role: 'user', text: question }, { role: 'assistant', text: '', incomplete: true }]);
    const update = (text: string, incomplete: boolean) => { if (generation.current === current) setMessages(m => [...m.slice(0, -1), { role: 'assistant', text, incomplete }]); };
    let partial = '';
    try {
      const body = { language, source, problemId, action: requestedAction, hintLevel, allowSolution, prompt, conversation: previous, error: executionError.slice(0, 4000) };
      if (config.data?.streaming) { partial = await streamMentor(body, abort.signal, text => { partial = text; update(text, true); }); update(partial, false); }
      else { const result = await studentRequest<Advice>('/coding/mentor', { method: 'POST', body, signal: abort.signal }); update(result.explanation + (result.nextSteps.length ? '\n\n### Next steps\n' + result.nextSteps.map(s => `- ${s}`).join('\n') : ''), false); }
      if (current === generation.current) { setPrompt(''); if (requestedAction === 'hint') setHintLevel(level => Math.min(3, level + 1)); }
    } catch (e) { if (current === generation.current) { update(partial || 'No complete guidance was received.', true); setError(abort.signal.aborted ? 'Request stopped. Partial guidance is incomplete.' : e instanceof Error ? e.message : 'The coding mentor is unavailable.'); } }
    finally { lock.current = false; setBusy(false); controller.current = null; }
  }
  return <section className="min-w-0 overflow-hidden rounded-2xl border border-violet-200 bg-white shadow-sm" aria-label="AI Coding Mentor">
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-violet-100 bg-gradient-to-r from-violet-50 to-indigo-50 p-5"><div className="flex items-center gap-3"><span className="rounded-xl bg-brand p-3 text-white"><Sparkles size={20}/></span><div><h2 className="font-semibold">AI Coding Mentor</h2><p className="mt-1 text-xs text-slate-600">Learn the reasoning. Build your confidence.</p></div></div><span className="rounded-full border border-violet-200 bg-white px-3 py-1 text-xs font-semibold text-brand">{config.data?.provider || 'Provider setup'}</span></header>
    <div className="space-y-4 p-5"><p className="text-xs leading-6 text-slate-600">AI-generated guidance is not execution, verified correctness, or grading. Only actual execution and deterministic test comparison determine submission results.</p>
    <details className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-6"><summary className="cursor-pointer font-semibold">AI provider settings & privacy</summary><p className="mt-2">Provider and model are configured by the backend operator. {config.data?.model && `Model: ${config.data.model}.`} {config.data?.message}</p><p id="mentor-privacy">Your code, public problem description, conversation and displayed errors are sent to {config.data?.provider || 'the configured AI provider'}. Ollama uses the operator-configured server; a local loopback server needs no cloud key. Remove secrets and personal information. Hidden tests and demo output are never sent. Cloud provider data-use terms apply when selected.</p></details>
    {(error || config.error) && <ErrorNotice message={error || config.error}/>}
    {!config.data?.configured ? <div role="status" className="rounded-xl border border-violet-100 bg-violet-50 p-5 text-sm leading-7"><p className="font-semibold">{config.loading ? 'Checking mentor configuration…' : 'Your mentor needs a running AI provider'}</p><p>{config.data?.message || 'Start ollama serve and choose an installed OLLAMA_MODEL. See docs/LOCAL_DEVELOPMENT.md.'}</p><p>You can still edit and use available execution or demo actions.</p><button type="button" className="btn-secondary mt-3" disabled={config.loading} onClick={() => void config.reload()}>Check availability</button></div> : <>
    <div className="max-h-[32rem] space-y-4 overflow-y-auto rounded-xl bg-slate-50 p-4" role="log" aria-live="polite" aria-relevant="additions" aria-label="Mentor conversation" aria-busy={busy}>{!messages.length ? <div className="py-8 text-center"><MessageSquare className="mx-auto mb-3 text-brand"/><p className="font-semibold">A little guidance goes a long way</p><p className="mt-2 text-xs text-slate-600">Ask for a hint, explore an algorithm, or understand an error.</p></div> : messages.map((message, i) => <article key={i} className={`rounded-xl p-4 ${message.role === 'user' ? 'ml-4 bg-brand text-white sm:ml-12' : 'mr-2 border border-violet-100 bg-white shadow-sm'}`}><p className="mb-2 text-xs font-semibold">{message.role === 'user' ? 'You' : `AI-generated · ${config.data?.provider}`}</p>{message.role === 'user' ? <p className="whitespace-pre-wrap break-words text-sm">{message.text}</p> : <><MentorMarkdown text={message.text || 'Preparing guidance…'}/>{message.incomplete && <p className="mt-3 text-xs text-slate-600">{busy && i === messages.length - 1 ? 'Generating · guidance is incomplete until finished' : 'Incomplete response · please retry'}</p>}</>}</article>)}</div>
    <div className="flex flex-wrap gap-2">{([["error", "Explain Error"], ["hint", "Get Hint"], ["explain", "Explain My Code"]] as const).map(([key, label]) => <button key={key} type="button" className="btn-secondary transition-colors" disabled={busy || disabled || !consent || !source.trim()} onClick={() => void ask(key)}>{label}</button>)}</div>
    <label className="block"><span className="field-label">Mentor action</span><select aria-label="Mentor action" className="input" disabled={busy || disabled} value={action} onChange={e => setAction(e.target.value as keyof typeof actions)}>{Object.entries(actions).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    {action === 'hint' && <div className="flex items-center gap-2" aria-label={`Next hint ${hintLevel} of 3`}>{[1, 2, 3].map(n => <span key={n} className={`rounded-full px-3 py-1 text-xs ${n === hintLevel ? 'bg-brand text-white' : 'bg-slate-100 text-slate-600'}`}>Hint {n}</span>)}<span className="text-xs text-slate-600">{['Concept', 'Direction', 'Approach'][hintLevel - 1]}</span></div>}
    <label className="block"><span className="field-label">Follow-up or focus (optional)</span><textarea className="input min-h-20" maxLength={1000} value={prompt} disabled={busy || disabled} onChange={e => setPrompt(e.target.value)} placeholder="What would you like to understand better?"/></label>
    <label className="flex items-start gap-2 text-xs leading-6"><input type="checkbox" checked={allowSolution} disabled={busy || disabled} onChange={e => setAllowSolution(e.target.checked)}/><span>I explicitly request a complete solution if useful. Otherwise give guidance only.</span></label>
    <label className="flex items-start gap-2 text-xs leading-6"><input type="checkbox" checked={consent} disabled={busy || disabled} aria-describedby="mentor-privacy" onChange={e => setConsent(e.target.checked)}/><span>I consent to sending this code and context to the selected AI provider.</span></label>
    <div className="flex flex-wrap items-center gap-3"><button className="btn-primary" disabled={busy || disabled || !consent || !source.trim()} onClick={() => void ask()}>{busy ? 'Requesting AI advice…' : action === 'hint' ? `Get hint ${hintLevel}` : 'Ask coding mentor'} <Send size={14} className="ml-2 inline" aria-hidden="true"/></button>{busy && <button type="button" className="btn-secondary" onClick={() => controller.current?.abort()}><Square size={14} className="mr-2 inline"/>Stop</button>}</div>
    </>}
    {busy && <p role="status" className="text-xs text-brand">Preparing AI-generated guidance…</p>}
    </div></section>;
}
