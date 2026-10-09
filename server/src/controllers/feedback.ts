import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import type { RequestHandler } from 'express';
import { InterviewSession } from '../models/InterviewSession.js';
import { InterviewFeedback } from '../models/InterviewFeedback.js';
import type { InterviewProvider } from '../services/interviewProvider.js';
import { answeredQuestions, validateFeedback } from '../services/interviewFeedback.js';
import { interviewSetupSchema } from '../validators/interview.js';
import { objectIdSchema } from '../validators/resume.js';
import { AppError } from '../utils/AppError.js';
import { recordActivity } from '../services/activity.js';
async function owned(id: unknown, studentId: string) { const s = await InterviewSession.findOne({ _id: objectIdSchema.parse(id), studentId }); if (!s) throw new AppError(404, 'NOT_FOUND', 'Interview session not found.'); return s; }
export function feedbackControllers(provider?: InterviewProvider) {
  const get: RequestHandler = async (req, res) => {
    const s = await owned(req.params.id, req.user!.id as string); const saved = await InterviewFeedback.findOne({ sessionId: s._id, studentId: req.user!._id });
    res.json({ success: true, data: { report: saved ? { id: saved.id, ...saved.report, createdAt: saved.createdAt, provider: saved.provider } : null, available: !!provider?.feedback, answeredCount: answeredQuestions(s.messages as Parameters<typeof answeredQuestions>[0]).length, pending: !!s.feedbackUntil && s.feedbackUntil > new Date() } });
  };
  const generate: RequestHandler = async (req, res) => {
    z.object({}).strict().parse(req.body);
    const s = await owned(req.params.id, req.user!.id as string);
    if (s.status !== 'completed') throw new AppError(409, 'INTERVIEW_NOT_COMPLETE', 'Finish the interview before requesting feedback.');
    const saved = await InterviewFeedback.findOne({ sessionId: s._id, studentId: req.user!._id });
    if (saved) { res.json({ success: true, data: { report: { id: saved.id, ...saved.report, createdAt: saved.createdAt, provider: saved.provider } } }); return; }
    if (!answeredQuestions(s.messages as Parameters<typeof answeredQuestions>[0]).length) throw new AppError(422, 'NO_ANSWERS', 'No saved answers are available to evaluate. Start another interview and answer at least one question.');
    if (!provider?.feedback) throw new AppError(503, 'AI_SETUP_REQUIRED', 'Interview feedback is unavailable. Configure the backend OpenAI provider to generate a report.');
    const token = randomBytes(16).toString('hex');
    const lock = await InterviewSession.findOneAndUpdate({ _id: s._id, studentId: req.user!._id, status: 'completed', $or: [{ feedbackUntil: null }, { feedbackUntil: { $lt: new Date() } }] }, { $set: { feedbackToken: token, feedbackUntil: new Date(Date.now() + 90000) } }, { new: true });
    if (!lock) throw new AppError(409, 'FEEDBACK_BUSY', 'A report is already being generated. Wait and reload the report.');
    try {
      const setup = interviewSetupSchema.parse({ type: s.type, difficulty: s.difficulty, targetRole: s.targetRole, focus: s.focus, questionLimit: s.questionLimit });
      const messages = s.messages.map(m => ({ role: m.role as 'student' | 'interviewer', text: m.text, at: m.at }));
      const report = validateFeedback(await provider.feedback(setup, messages), messages);
      if (!await InterviewSession.exists({ _id: s._id, feedbackToken: token, feedbackUntil: { $gt: new Date() } })) throw new AppError(409, 'FEEDBACK_EXPIRED', 'The generation window expired. Please retry.');
      const result = await InterviewFeedback.findOneAndUpdate({ sessionId: s._id }, { $setOnInsert: { studentId: req.user!._id, sessionId: s._id, sessionVersion: s.version, provider: provider.name, report } }, { upsert: true, new: true, runValidators: true });
      await recordActivity(req.user!.id as string, 'interview_feedback', 'Generated an interview feedback report', `feedback:${s.id}`);
      await InterviewSession.updateOne({ _id: s._id, feedbackToken: token }, { $unset: { feedbackToken: '', feedbackUntil: '' } });
      res.json({ success: true, data: { report: { id: result.id, ...result.report, createdAt: result.createdAt, provider: result.provider } } });
    } catch (error) { await InterviewSession.updateOne({ _id: s._id, feedbackToken: token }, { $unset: { feedbackToken: '', feedbackUntil: '' } }); throw error; }
  };
  return { get, generate };
}
