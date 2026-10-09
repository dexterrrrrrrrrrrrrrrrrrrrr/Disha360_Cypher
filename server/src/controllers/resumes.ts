import type { RequestHandler } from 'express';
import { Resume, resumeDTO } from '../models/Resume.js';
import { objectIdSchema, resumeInputSchema, resumeUpdateSchema, resumeContentSchema } from '../validators/resume.js';
import { AppError } from '../utils/AppError.js';
import { recordActivity } from '../services/dashboard.js';
import { resumePdf } from '../services/resumePdf.js';

export async function ownedResume(id: unknown, studentId: string) {
  const resume = await Resume.findOne({ _id: objectIdSchema.parse(id), studentId });
  if (!resume) throw new AppError(404, 'NOT_FOUND', 'Resume not found.');
  return resume;
}
export const listResumes: RequestHandler = async (req, res) => {
  const records = await Resume.find({ studentId: req.user!._id }).sort({ updatedAt: -1 }).limit(100);
  res.json({ success: true, data: { resumes: records.map(resumeDTO) } });
};
export const getResume: RequestHandler = async (req, res) => { res.json({ success: true, data: { resume: resumeDTO(await ownedResume(req.params.id, req.user!.id as string)) } }); };
export const createResume: RequestHandler = async (req, res) => {
  const input = resumeInputSchema.parse(req.body);
  const resume = await Resume.create({ ...input, studentId: req.user!._id });
  await recordActivity(req.user!.id as string, 'resume_saved', 'Created a resume', `resume:${resume.id}:1`);
  res.status(201).json({ success: true, data: { resume: resumeDTO(resume) } });
};
export const updateResume: RequestHandler = async (req, res) => {
  const { version, ...input } = resumeUpdateSchema.parse(req.body);
  const existing = await ownedResume(req.params.id, req.user!.id as string);
  const resume = await Resume.findOneAndUpdate({ _id: existing._id, studentId: req.user!._id, version }, { $set: input, $inc: { version: 1 } }, { new: true, runValidators: true });
  if (!resume) throw new AppError(409, 'EDIT_CONFLICT', 'This resume changed in another tab. Reload it before saving again.');
  await recordActivity(req.user!.id as string, 'resume_saved', 'Updated a resume', `resume:${resume.id}:${resume.version}`);
  res.json({ success: true, data: { resume: resumeDTO(resume) } });
};
export const deleteResume: RequestHandler = async (req, res) => {
  const resume = await ownedResume(req.params.id, req.user!.id as string);
  await Resume.deleteOne({ _id: resume._id, studentId: req.user!._id });
  res.json({ success: true, data: { message: 'Resume deleted.' } });
};
export const exportResume: RequestHandler = async (req, res) => {
  const resume = await ownedResume(req.params.id, req.user!.id as string);
  const document = resumePdf(resumeContentSchema.parse(resume.content), resume.template);
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${resume.title.replace(/[^a-z0-9-]/gi, '-').slice(0, 60) || 'resume'}.pdf"` });
  document.on('error', () => { res.destroy(); });
  document.pipe(res); document.end();
};
