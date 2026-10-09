import { z } from 'zod';

const short = z.string().trim().max(200);
const paragraph = z.string().trim().max(3000);
const url = z.string().trim().max(500).refine(value => !value || /^https?:\/\//i.test(value), 'Use an http:// or https:// link.').refine(value => { try { return !value || Boolean(new URL(value).host); } catch { return false; } }, 'Enter a valid URL.');
export const resumeContentSchema = z.object({
  personal: z.object({ fullName: short, email: z.string().trim().max(254).email().or(z.literal('')), phone: z.string().trim().max(40), location: short, headline: short, summary: paragraph, website: url, linkedin: url, github: url }).strict(),
  education: z.array(z.object({ institution: short, degree: short, field: short, startDate: short, endDate: short, grade: short }).strict()).max(10),
  skills: z.array(z.string().trim().min(1).max(80)).max(60),
  projects: z.array(z.object({ name: short, description: paragraph, technologies: short, link: url }).strict()).max(15),
  experience: z.array(z.object({ company: short, role: short, startDate: short, endDate: short, description: paragraph }).strict()).max(15),
  certifications: z.array(z.object({ name: short, issuer: short, year: short, link: url }).strict()).max(20)
}).strict();
export const resumeInputSchema = z.object({ title: z.string().trim().min(1).max(100), template: z.enum(['classic', 'modern', 'compact']), content: resumeContentSchema }).strict();
export const resumeUpdateSchema = resumeInputSchema.extend({ version: z.number().int().min(1) });
export const objectIdSchema = z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid record ID.');
export type ResumeContent = z.infer<typeof resumeContentSchema>;
