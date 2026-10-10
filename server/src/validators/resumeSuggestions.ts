import { z } from 'zod';
import type { ResumeContent } from './resume.js';

export const resumeSuggestionRequest = z.object({
  consent: z.literal(true),
  jobDescription: z.string().trim().min(50).max(12000),
}).strict();
export const resumeSuggestionsSchema = z.object({
  suggestions: z.array(z.object({
    section: z.enum(['summary', 'skills', 'projects', 'experience', 'formatting', 'alignment']),
    suggestion: z.string().trim().min(1).max(1000),
    reason: z.string().trim().min(1).max(600),
  }).strict()).min(1).max(8),
}).strict();
export type ResumeSuggestions = z.infer<typeof resumeSuggestionsSchema>;
export const resumeSuggestionsJsonSchema = {
  type: 'object', properties: { suggestions: { type: 'array', minItems: 1, maxItems: 8,
    items: { type: 'object', properties: {
      section: { type: 'string', enum: ['summary', 'skills', 'projects', 'experience', 'formatting', 'alignment'] },
      suggestion: { type: 'string' }, reason: { type: 'string' },
    }, required: ['section', 'suggestion', 'reason'], additionalProperties: false },
  } }, required: ['suggestions'], additionalProperties: false,
};

// Minimize data: omit contact details, links, institutions, employers, dates and IDs.
// Best-effort redaction is not a guarantee of anonymity in free-form text.
export function prepareResumeSuggestions(content: ResumeContent, jobDescription: string) {
  const identifiers = Object.entries(content.personal)
    .filter(([key, value]) => !['headline', 'summary'].includes(key) && value.trim())
    .map(([, value]) => value);
  const redact = (text: string) => {
    let result = text;
    for (const value of identifiers) {
      const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      result = result.replace(new RegExp(escaped, 'gi'), '[redacted]');
    }
    return result.replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[email removed]')
      .replace(/https?:\/\/\S+/gi, '[link removed]')
      .replace(/(?:\+?\d[\d ()-]{7,}\d)/g, '[phone removed]');
  };
  return {
    jobDescription: redact(jobDescription),
    resume: {
      headline: redact(content.personal.headline), summary: redact(content.personal.summary.slice(0, 2000)),
      skills: content.skills.slice(0, 40).map(redact),
      education: content.education.slice(0, 3).map(e => ({ degree: redact(e.degree), field: redact(e.field) })),
      projects: content.projects.slice(0, 5).map(p => ({ description: redact(p.description.slice(0, 1500)), technologies: redact(p.technologies) })),
      experience: content.experience.slice(0, 5).map(e => ({ role: redact(e.role), description: redact(e.description.slice(0, 1500)) })),
    },
  };
}
const preparedText = z.string().max(85000);
export const resumeSuggestionInputSchema = z.object({
  jobDescription: preparedText.min(1),
  resume: z.object({
    headline: preparedText, summary: preparedText,
    skills: z.array(preparedText).max(40),
    education: z.array(z.object({ degree: preparedText, field: preparedText }).strict()).max(3),
    projects: z.array(z.object({ description: preparedText, technologies: preparedText }).strict()).max(5),
    experience: z.array(z.object({ role: preparedText, description: preparedText }).strict()).max(5),
  }).strict(),
}).strict();
export type ResumeSuggestionInput = z.infer<typeof resumeSuggestionInputSchema>;
