import { randomBytes } from 'node:crypto';
import type { RequestHandler } from 'express';
import { InterviewSession, interviewDTO } from '../models/InterviewSession.js';
import { interviewSetupSchema, answerSchema, completeSchema, type InterviewMessage } from '../validators/interview.js';
import { objectIdSchema } from '../validators/resume.js';
import { AppError } from '../utils/AppError.js';
import { recordActivity } from '../services/dashboard.js';
import type { InterviewProvider } from '../services/interviewProvider.js';
function configured(provider?: InterviewProvider) { if (!provider) throw new AppError(503, 'AI_SETUP_REQUIRED', 'AI interviews require an OpenAI API key configured on the backend. No demo interview responses are generated.'); return provider; }
async function owned(id: unknown, studentId: string) { const s = await InterviewSession.findOne({ _id: objectIdSchema.parse(id), studentId }); if (!s) throw new AppError(404, 'NOT_FOUND', 'Interview session not found.'); return s; }
const available = () => ({ $or: [{ leaseUntil: null }, { leaseUntil: { $lt: new Date() } }] });
export function interviewControllers(provider?: InterviewProvider) {
  const config: RequestHandler = (_req, res) => res.json({ success: true, data: { configured: !!provider, provider: provider?.name || null, message: provider ? 'Backend AI integration is configured. Availability depends on provider credentials, billing, and model access.' : 'Setup required: set OPENAI_API_KEY in server/.env and restart the backend. There is no simulated AI interview mode.' } });
  const start: RequestHandler = async (req, res) => {
    const setup = interviewSetupSchema.parse(req.body); const ai = configured(provider);
    const question = await ai.question(setup, []);
    const s = await InterviewSession.create({ ...setup, studentId: req.user!._id, provider: ai.name, messages: [{ role: 'interviewer', text: question, at: new Date() }] });
    await recordActivity(req.user!.id as string, 'interview_started', 'Started a mock interview', `interview:${s.id}:start`);
    res.status(201).json({ success: true, data: { session: interviewDTO(s) } });
  };
  const list: RequestHandler = async (req, res) => { const sessions = await InterviewSession.find({ studentId: req.user!._id }).sort({ updatedAt: -1 }).limit(100); res.json({ success: true, data: { sessions: sessions.map(s => { const { messages: _messages, ...summary } = interviewDTO(s); return summary; }) } }); };
  const get: RequestHandler = async (req, res) => res.json({ success: true, data: { session: interviewDTO(await owned(req.params.id, req.user!.id as string)) } });
  const answer: RequestHandler = async (req, res) => {
    const input = answerSchema.parse(req.body); const s = await owned(req.params.id, req.user!.id as string);
    if (s.status !== 'active') throw new AppError(409, 'SESSION_COMPLETED', 'This interview is already complete.');
    const ai = configured(provider); const token = randomBytes(16).toString('hex');
    const locked = await InterviewSession.findOneAndUpdate({ _id: s._id, studentId: req.user!._id, status: 'active', version: input.version, ...available() }, { $set: { leaseToken: token, leaseUntil: new Date(Date.now() + 90000) } }, { new: true });
    if (!locked) throw new AppError(409, 'SESSION_CONFLICT', 'The session changed or another answer is being processed. Reload before retrying.');
    try {
      const messages: InterviewMessage[] = locked.messages.map(m => ({ role: m.role as InterviewMessage['role'], text: m.text, at: m.at }));
      messages.push({ role: 'student', text: input.answer, at: new Date() });
      const completed = messages.filter(m => m.role === 'student').length >= locked.questionLimit;
      if (!completed) { const setup = interviewSetupSchema.parse({ type: locked.type, difficulty: locked.difficulty, targetRole: locked.targetRole, focus: locked.focus, questionLimit: locked.questionLimit }); const question = await ai.question(setup, [...messages]); messages.push({ role: 'interviewer', text: question, at: new Date() }); }
      const saved = await InterviewSession.findOneAndUpdate({ _id: locked._id, studentId: req.user!._id, version: input.version, leaseToken: token, leaseUntil: { $gt: new Date() } }, { $set: { messages, status: completed ? 'completed' : 'active', ...(completed ? { completedAt: new Date() } : {}) }, $inc: { version: 1 }, $unset: { leaseToken: '', leaseUntil: '' } }, { new: true, runValidators: true });
      if (!saved) throw new AppError(409, 'SESSION_CONFLICT', 'The processing window expired. Reload before retrying.');
      await recordActivity(req.user!.id as string, completed ? 'interview_completed' : 'interview_answered', completed ? 'Completed a mock interview' : 'Answered an interview question', `interview:${saved.id}:${saved.version}`);
      res.json({ success: true, data: { session: interviewDTO(saved) } });
    } catch (error) { await InterviewSession.updateOne({ _id: locked._id, studentId: req.user!._id, leaseToken: token }, { $unset: { leaseToken: '', leaseUntil: '' } }); throw error; }
  };
  const complete: RequestHandler = async (req, res) => {
    const input = completeSchema.parse(req.body); const s = await owned(req.params.id, req.user!.id as string);
    const saved = await InterviewSession.findOneAndUpdate({ _id: s._id, studentId: req.user!._id, status: 'active', version: input.version, ...available() }, { $set: { status: 'completed', completedAt: new Date() }, $inc: { version: 1 }, $unset: { leaseToken: '', leaseUntil: '' } }, { new: true, runValidators: true });
    if (!saved) throw new AppError(409, 'SESSION_CONFLICT', 'This session changed, is busy, or has already completed. Reload its latest state.');
    await recordActivity(req.user!.id as string, 'interview_completed', 'Ended a mock interview', `interview:${saved.id}:${saved.version}`);
    res.json({ success: true, data: { session: interviewDTO(saved) } });
  };
  return { config, start, list, get, answer, complete };
}
