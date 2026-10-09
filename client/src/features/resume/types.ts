export interface ResumeContent {
  personal: { fullName: string; email: string; phone: string; location: string; headline: string; summary: string; website: string; linkedin: string; github: string };
  education: { institution: string; degree: string; field: string; startDate: string; endDate: string; grade: string }[];
  skills: string[];
  projects: { name: string; description: string; technologies: string; link: string }[];
  experience: { company: string; role: string; startDate: string; endDate: string; description: string }[];
  certifications: { name: string; issuer: string; year: string; link: string }[];
}
export interface ResumeRecord { id: string; title: string; template: 'classic' | 'modern' | 'compact'; content: ResumeContent; version: number; updatedAt: string }
export type ResumeDraft = Pick<ResumeRecord, 'title' | 'template' | 'content'>;
export function blankResume(name: string, email: string): ResumeDraft {
  return { title: 'My placement resume', template: 'modern', content: { personal: { fullName: name, email, phone: '', location: '', headline: '', summary: '', website: '', linkedin: '', github: '' }, education: [], skills: [], projects: [], experience: [], certifications: [] } };
}
