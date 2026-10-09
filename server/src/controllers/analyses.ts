import type { RequestHandler } from 'express';
import { z } from 'zod';
import { ownedResume } from './resumes.js';
import { ResumeAnalysis } from '../models/ResumeAnalysis.js';
import { objectIdSchema, resumeContentSchema } from '../validators/resume.js';
import { analyzeResume } from '../services/resumeAnalysis.js';
import { recordActivity } from '../services/dashboard.js';
import { AppError } from '../utils/AppError.js';
const inputSchema = z.object({ jobDescription: z.string().trim().min(50).max(12000) }).strict();
export const createAnalysis: RequestHandler = async (req, res) => {
  const input = inputSchema.parse(req.body); const resume = await ownedResume(req.params.id, req.user!.id as string);
  const content = resumeContentSchema.parse(resume.content); const result = analyzeResume(content, input.jobDescription);
  if (!result.extractedKeywords.length) throw new AppError(400, 'NO_KEYWORDS', 'Add a job description with specific role requirements or technologies.');
  const analysis = await ResumeAnalysis.create({ studentId: req.user!._id, resumeId: resume._id, resumeTitle: resume.title, resumeVersion: resume.version, jobDescription: input.jobDescription, resumeSnapshot: content, result });
  await recordActivity(req.user!.id as string, 'resume_analyzed', 'Analyzed a resume against a job description', `analysis:${analysis.id}`);
  res.status(201).json({ success: true, data: { analysis: { id: analysis.id, resumeId: resume.id, resumeTitle: resume.title, resumeVersion: resume.version, jobDescription: input.jobDescription, result, createdAt: analysis.createdAt } } });
};
export const listAnalyses: RequestHandler = async (req, res) => {
  const records = await ResumeAnalysis.find({ studentId: req.user!._id }).sort({ createdAt: -1 }).limit(100).lean();
  res.json({ success: true, data: { analyses: records.map(a => ({ id: a._id.toString(), resumeId: a.resumeId.toString(), resumeTitle: a.resumeTitle, resumeVersion: a.resumeVersion, score: a.result.score as number, createdAt: a.createdAt })) } });
};
export const getAnalysis: RequestHandler = async (req, res) => {
  const analysis = await ResumeAnalysis.findOne({ _id: objectIdSchema.parse(req.params.id), studentId: req.user!._id }).lean();
  if (!analysis) throw new AppError(404, 'NOT_FOUND', 'Analysis not found.');
  res.json({ success: true, data: { analysis: { id: analysis._id.toString(), resumeId: analysis.resumeId.toString(), resumeTitle: analysis.resumeTitle, resumeVersion: analysis.resumeVersion, jobDescription: analysis.jobDescription, result: analysis.result, createdAt: analysis.createdAt } } });
};
