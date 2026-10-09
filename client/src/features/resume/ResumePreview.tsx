import type { ResumeDraft } from './types';
export function ResumePreview({ draft }: { draft: ResumeDraft }) {
  const c = draft.content;
  return <article aria-label="Live resume preview" className={`min-h-[680px] break-words border border-slate-200 bg-white p-7 shadow-sm sm:p-10 ${draft.template === 'classic' ? 'font-serif' : 'font-sans'} ${draft.template === 'compact' ? 'text-xs leading-5' : 'text-sm leading-6'}`}>
    <h2 className={`text-2xl font-bold ${draft.template === 'modern' ? 'text-brand' : 'text-ink'}`}>{c.personal.fullName || 'Your name'}</h2><p>{c.personal.headline}</p><p className="mt-2 text-xs text-slate-500">{[c.personal.email, c.personal.phone, c.personal.location].filter(Boolean).join(' · ')}</p><p className="text-xs text-slate-500">{[c.personal.website, c.personal.linkedin, c.personal.github].filter(Boolean).join(' · ')}</p>
    {c.personal.summary && <PreviewSection title="Profile"><p className="whitespace-pre-wrap">{c.personal.summary}</p></PreviewSection>}
    {c.education.length > 0 && <PreviewSection title="Education">{c.education.map((e, i) => <div key={i} className="mb-3"><p className="font-semibold">{e.institution}</p><p>{[e.degree, e.field].filter(Boolean).join(' · ')}</p><p className="text-xs text-slate-500">{[e.startDate && `${e.startDate} – ${e.endDate || 'Present'}`, e.grade].filter(Boolean).join(' · ')}</p></div>)}</PreviewSection>}
    {c.skills.filter(Boolean).length > 0 && <PreviewSection title="Skills"><p>{c.skills.filter(Boolean).join(' · ')}</p></PreviewSection>}
    {c.projects.length > 0 && <PreviewSection title="Projects">{c.projects.map((p, i) => <div key={i} className="mb-3"><p className="font-semibold">{p.name}</p><p className="whitespace-pre-wrap">{p.description}</p><p className="text-xs text-slate-500">{[p.technologies, p.link].filter(Boolean).join(' · ')}</p></div>)}</PreviewSection>}
    {c.experience.length > 0 && <PreviewSection title="Experience">{c.experience.map((e, i) => <div key={i} className="mb-3"><p className="font-semibold">{[e.role, e.company].filter(Boolean).join(' · ')}</p><p className="text-xs text-slate-500">{e.startDate && `${e.startDate} – ${e.endDate || 'Present'}`}</p><p className="whitespace-pre-wrap">{e.description}</p></div>)}</PreviewSection>}
    {c.certifications.length > 0 && <PreviewSection title="Certifications">{c.certifications.map((c, i) => <p key={i}>{[c.name, c.issuer, c.year, c.link].filter(Boolean).join(' · ')}</p>)}</PreviewSection>}
  </article>;
}
function PreviewSection({ title, children }: { title: string; children: React.ReactNode }) { return <section className="mt-5"><h3 className="mb-2 border-b border-slate-200 pb-1 text-xs font-bold uppercase tracking-widest">{title}</h3>{children}</section>; }
