import type { RequestHandler } from 'express';
import { z } from 'zod';
import { Assessment, TestAttempt } from '../models/Assessment.js';
import { objectIdSchema } from '../validators/resume.js';
import { categories, progressSchema, submissionSchema } from '../validators/assessment.js';
import { accrueTime, attemptDTO, expireStudentAttempts, finalizeAttempt, ownAttempt, startAttempt } from '../services/assessments.js';
import { AppError } from '../utils/AppError.js';
const filterSchema = z.object({ category: z.enum(categories).optional(), search: z.string().trim().max(100).optional() }).strict();
function summary(a: InstanceType<typeof Assessment>, attempts: InstanceType<typeof TestAttempt>[]) { return { id: a.id as string, title: a.title, instructions: a.instructions, category: a.category, demo: a.demo, version: a.version, questionCount: a.questionCount, durationSeconds: a.durationSeconds, pointsPerCorrect: a.pointsPerCorrect, penaltyPerIncorrect: a.penaltyPerIncorrect, maxAttempts: a.maxAttempts, attemptsUsed: attempts.filter(v => v.assessmentId.equals(a._id)).length, activeAttemptId: attempts.find(v => v.assessmentId.equals(a._id) && v.status === 'in-progress')?.id || null, opensAt: a.opensAt, closesAt: a.closesAt }; }
export const listAssessments: RequestHandler = async (req, res) => {
  const filter = filterSchema.parse(req.query); await expireStudentAttempts(req.user!.id as string);
  const records = await Assessment.find({ published: true, ...(req.app.locals.allowDemoAccounts ? {} : { demo: false }), ...(filter.category ? { category: filter.category } : {}) }).sort({ title: 1 });
  const attempts = await TestAttempt.find({ studentId: req.user!._id }).select('assessmentId status');
  res.json({ success: true, data: { assessments: records.filter(a => !filter.search || a.title.toLowerCase().includes(filter.search.toLowerCase())).map(a => summary(a, attempts)) } });
};
export const assessmentDetails: RequestHandler = async (req, res) => { const a = await Assessment.findOne({ _id: objectIdSchema.parse(req.params.id), published: true, ...(req.app.locals.allowDemoAccounts ? {} : { demo: false }) }); if (!a) throw new AppError(404, 'NOT_FOUND', 'Assessment not found.'); await expireStudentAttempts(req.user!.id as string); const attempts = await TestAttempt.find({ studentId: req.user!._id, assessmentId: a._id }); res.json({ success: true, data: { assessment: summary(a, attempts) } }); };
export const beginAssessment: RequestHandler = async (req, res) => { z.object({}).strict().parse(req.body ?? {}); const a = await startAttempt(req.params.id, req.user!.id as string, !!req.app.locals.allowDemoAccounts); res.status(201).json({ success: true, data: { attempt: attemptDTO(a) } }); };
export const getAttempt: RequestHandler = async (req, res) => { const a = await ownAttempt(req.params.id, req.user!.id as string); res.json({ success: true, data: { attempt: attemptDTO(await finalizeAttempt(a.id as string, req.user!.id as string)) } }); };
export const listAttempts: RequestHandler = async (req, res) => { await expireStudentAttempts(req.user!.id as string); const attempts = await TestAttempt.find({ studentId: req.user!._id }).sort({ startedAt: -1 }).limit(100); res.json({ success: true, data: { attempts: attempts.map(a => { const { questions: _questions, ...brief } = attemptDTO(a); return brief; }) } }); };
export const saveProgress: RequestHandler = async (req, res) => {
  const input = progressSchema.parse(req.body); const a = await ownAttempt(req.params.id, req.user!.id as string);
  if (a.status === 'submitted') throw new AppError(409, 'ATTEMPT_FINALIZED', 'Submitted answers cannot be changed.');
  if (a.deadlineAt <= new Date()) { await finalizeAttempt(a.id as string, req.user!.id as string); throw new AppError(409, 'ATTEMPT_EXPIRED', 'Time expired. Only previously saved answers were scored. Reload to view the result.'); }
  if (input.version !== a.version) throw new AppError(409, 'ATTEMPT_CONFLICT', 'Your saved attempt changed. Reload before editing.');
  if (!a.questions.some(q => q.questionId === input.currentQuestionId)) throw new AppError(400, 'INVALID_QUESTION', 'Question does not belong to this attempt.');
  if (input.questionId) { const q = a.questions.find(v => v.questionId === input.questionId); if (!q || (input.selectedOptionId !== null && !q.options.some(v => v.id === input.selectedOptionId))) throw new AppError(400, 'INVALID_ANSWER', 'Choose an option belonging to this question.'); q.selectedOptionId = input.selectedOptionId ?? null; }
  accrueTime(a); a.currentQuestionId = input.currentQuestionId;
  const saved = await TestAttempt.findOneAndUpdate({ _id: a._id, studentId: req.user!._id, status: 'in-progress', version: a.version, $expr: { $gt: ['$deadlineAt', '$$NOW'] } }, { $set: { questions: a.questions.toObject(), currentQuestionId: a.currentQuestionId, cursorSince: a.cursorSince }, $inc: { version: 1 } }, { new: true, runValidators: true });
  if (!saved) { await finalizeAttempt(a.id as string, req.user!.id as string); throw new AppError(409, 'ATTEMPT_CONFLICT', 'The attempt changed or expired. Reload the saved attempt.'); }
  res.json({ success: true, data: { attempt: attemptDTO(saved) } });
};
export const submitAttempt: RequestHandler = async (req, res) => { const input = submissionSchema.parse(req.body); const a = await ownAttempt(req.params.id, req.user!.id as string); res.json({ success: true, data: { attempt: attemptDTO(await finalizeAttempt(a.id as string, req.user!.id as string, input.version)) } }); };
