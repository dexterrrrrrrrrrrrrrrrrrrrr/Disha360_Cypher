import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
// Text is rendered as React nodes. Raw HTML, images and active links are disabled.
export function HighlightedCode({ code, language = 'text' }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);
  const tokens = code.split(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\b(?:def|return|class|public|static|void|int|float|double|if|else|for|while|const|let|function|import|from|new|try|catch|throw|True|False|None|null|async|await)\b|\b\d+(?:\.\d+)?\b)/g);
  async function copy() { try { await navigator.clipboard.writeText(code); setCopied(true); } catch { setCopied(false); } }
  return <div className="my-4 overflow-hidden rounded-xl border border-slate-700 bg-slate-950 text-slate-100"><div className="flex items-center justify-between gap-4 border-b border-slate-700 px-4 py-2 text-xs"><span>{language}</span><button type="button" onClick={() => void copy()} className="min-h-11 rounded px-3 hover:bg-slate-800" aria-label="Copy code">{copied ? 'Copied' : 'Copy code'}</button></div><pre className="overflow-x-auto p-4 text-xs leading-7"><code>{tokens.map((token, i) => <span key={i} className={/^['"]/.test(token) ? 'text-emerald-300' : /^\d/.test(token) ? 'text-amber-300' : i % 2 ? 'text-violet-300' : ''}>{token}</span>)}</code></pre></div>;
}
export function MentorMarkdown({ text }: { text: string }) {
  return <div className="mentor-markdown min-w-0 break-words text-sm leading-7"><ReactMarkdown components={{
    pre: ({ children }) => <div>{children}</div>,
    code: ({ className, children }) => { const text = String(children); return className || text.includes('\n') ? <HighlightedCode code={text.replace(/\n$/, '')} language={className?.replace('language-', '')}/> : <code className="rounded bg-violet-50 px-1 text-violet-900">{children}</code>; },
    a: ({ children }) => <span>{children}</span>, img: () => null,
  }}>{text}</ReactMarkdown></div>;
}
