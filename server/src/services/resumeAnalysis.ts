import type { ResumeContent } from '../validators/resume.js';

const stopwords = new Set('a an and are as at be been being by can candidate candidates company degree desired do each experience for from have having in including into is it job knowledge looking must of on or our preferred qualifications required requirements responsibility responsibilities role skills strong that the their this to us using we will with work working years you your ability excellent good team relevant minimum hiring position seeking should need needs well'.split(' '));
const phrases = ['machine learning', 'data structures', 'problem solving', 'rest api', 'unit testing', 'project management', 'communication skills', 'computer science', 'continuous integration'];
const aliases: Record<string, string> = { js: 'javascript', ts: 'typescript', 'node.js': 'nodejs', 'node.js.': 'nodejs', 'node': 'nodejs', 'react.js': 'react', 'reactjs': 'react', 'mongo': 'mongodb', 'postgres': 'postgresql', 'restful': 'rest' };
export function normalize(text: string) { return text.toLowerCase().replace(/\b(node|react)\.js\b/g, '$1js').replace(/\bnode\b/g, 'nodejs').replace(/\breactjs\b/g, 'react').replace(/\bpostgres\b/g, 'postgresql').replace(/\bjs\b/g, 'javascript').replace(/\bts\b/g, 'typescript').replace(/\bmongo\b/g, 'mongodb').replace(/\brestful\b/g, 'rest'); }
export function keywords(description: string) {
  const text = normalize(description); const counts = new Map<string, number>();
  for (const token of text.match(/[a-z][a-z0-9]*(?:\+\+|#)?/g) || []) {
    const word = aliases[token] || token;
    if (!stopwords.has(word) && (word.length > 2 || ['c++', 'c#', 'go', 'r'].includes(word))) counts.set(word, (counts.get(word) || 0) + 1);
  }
  const multiword = phrases.filter(phrase => text.includes(phrase));
  for (const phrase of multiword) for (const word of phrase.split(' ')) counts.delete(word);
  return [...multiword, ...[...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([word]) => word)].slice(0, 30);
}
export function resumeText(content: ResumeContent): string {
  // Include resume content, never the draft title, ownership metadata, or job description.
  return [Object.values(content.personal).join(' '), content.skills.join(' '), ...content.education.map(v => Object.values(v).join(' ')), ...content.projects.map(v => Object.values(v).join(' ')), ...content.experience.map(v => Object.values(v).join(' ')), ...content.certifications.map(v => Object.values(v).join(' '))].join('\n');
}
export function analyzeResume(content: ResumeContent, jobDescription: string) {
  const text = normalize(resumeText(content)); const extracted = keywords(jobDescription);
  const matched = extracted.filter(keyword => {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^a-z0-9+#])${escaped}($|[^a-z0-9+#])`, 'i').test(text);
  });
  const missing = extracted.filter(word => !matched.includes(word));
  const sections = [
    { name: 'Contact details', complete: !!(content.personal.fullName && content.personal.email && content.personal.phone) },
    { name: 'Profile summary', complete: content.personal.summary.trim().length >= 40 },
    { name: 'Education', complete: content.education.some(v => !!(v.institution && v.degree)) },
    { name: 'Skills', complete: content.skills.filter(v => v.trim()).length >= 3 },
    { name: 'Projects or experience', complete: content.projects.some(v => !!v.name && v.description.length >= 40) || content.experience.some(v => !!v.company && !!v.role && v.description.length >= 40) }
  ];
  const descriptions = [...content.projects.map(v => v.description), ...content.experience.map(v => v.description)].join(' ');
  const measured = /\b\d+(?:\.\d+)?(?:%|\b)/.test(descriptions);
  const action = /\b(built|developed|designed|implemented|improved|reduced|led|created|automated|delivered|optimized)\b/i.test(descriptions);
  const keywordPoints = extracted.length ? Math.round(matched.length / extracted.length * 60) : 0;
  const sectionPoints = sections.filter(v => v.complete).length * 6;
  const evidencePoints = (measured ? 5 : 0) + (action ? 5 : 0);
  const suggestions = [
    ...(missing.length ? [`If accurate, demonstrate these requirements in your skills or project descriptions: ${missing.slice(0, 8).join(', ')}. Never add skills you cannot substantiate.`] : []),
    ...sections.filter(v => !v.complete).map(v => `Improve ${v.name.toLowerCase()}: ${v.name === 'Contact details' ? 'include your name, email, and phone.' : v.name === 'Profile summary' ? 'write at least 40 characters about your relevant strengths.' : v.name === 'Education' ? 'include an institution and degree.' : v.name === 'Skills' ? 'list at least three relevant skills.' : 'include a named project or company/role with a description of at least 40 characters.'}`),
    ...(!measured ? ['Add a truthful measurable result to a project or experience description, such as users served, time saved, or test coverage.'] : []),
    ...(!action ? ['Start achievement descriptions with a clear action verb, such as built, implemented, improved, or led.'] : []),
    ...(content.personal.summary.length > 800 ? ['Shorten the profile summary so a recruiter can scan it quickly.'] : []),
    'Keep the resume readable and tailor it to the role; keyword repetition does not increase this score.'
  ];
  return { score: keywordPoints + sectionPoints + evidencePoints, rubricVersion: '1.0', disclaimer: 'This is a deterministic ATS-style heuristic estimate, not an official employer ATS score or a guarantee of selection. It checks text content, not employer parsing rules or PDF layout.', extractedKeywords: extracted, matchedKeywords: matched, missingKeywords: missing, sections, components: [{ name: 'Keyword coverage', earned: keywordPoints, maximum: 60, explanation: `${matched.length}/${extracted.length} extracted job-description terms found; each term counts once.` }, { name: 'Section completeness', earned: sectionPoints, maximum: 30, explanation: 'Five content checks, worth six points each. Certifications and work experience are optional.' }, { name: 'Achievement evidence', earned: evidencePoints, maximum: 10, explanation: 'Five points for a number in project/experience descriptions; five for a recognized action verb. This heuristic cannot verify claims.' }], suggestions };
}
export type AnalysisResult = ReturnType<typeof analyzeResume>;
