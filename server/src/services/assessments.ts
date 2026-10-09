import { createHash, randomInt } from 'node:crypto';
import { Assessment, Question, TestAttempt, type AttemptDocument } from '../models/Assessment.js';
import { objectIdSchema } from '../validators/resume.js';
import { AppError } from '../utils/AppError.js';
import { recordActivity } from './activity.js';
export function shuffle<T>(values: readonly T[], draw: (maximum: number) => number = randomInt): T[] { const result = [...values]; for (let i = result.length - 1; i > 0; i--) { const j = draw(i + 1); [result[i], result[j]] = [result[j], result[i]]; } return result; }
export async function ownAttempt(id: unknown, studentId: string) { const attempt = await TestAttempt.findOne({ _id: objectIdSchema.parse(id), studentId }); if (!attempt) throw new AppError(404, 'NOT_FOUND', 'Attempt not found.'); return attempt; }
export function accrueTime(a: AttemptDocument, now = new Date()) { const until = Math.min(now.getTime(), a.deadlineAt.getTime()); const q = a.questions.find(v => v.questionId === a.currentQuestionId); if (q) q.timeSpentMs += Math.max(0, until - a.cursorSince.getTime()); a.cursorSince = new Date(until); }
export function scoreAttempt(a: Pick<AttemptDocument, 'questions' | 'pointsPerCorrect' | 'penaltyPerIncorrect'>) {
  const correct = a.questions.filter(q => q.selectedOptionId === q.correctOptionId).length;
  const unanswered = a.questions.filter(q => q.selectedOptionId === null).length; const incorrect = a.questions.length - correct - unanswered;
  const score = Math.round((correct * a.pointsPerCorrect - incorrect * a.penaltyPerIncorrect) * 100) / 100; const maximum = a.questions.length * a.pointsPerCorrect;
  return { correct, incorrect, unanswered, total: a.questions.length, score, maximum, percentage: Math.round(Math.max(0, score) / maximum * 100), accuracy: Math.round(correct / a.questions.length * 100), scoringExplanation: `+${a.pointsPerCorrect} per correct answer; -${a.penaltyPerIncorrect} per incorrect answer; 0 for unanswered. Raw scores may be negative; score percentages have a zero floor.` };
}
export function attemptDTO(a: AttemptDocument) {
  const final = a.status === 'submitted';
  return { id: a.id as string, assessmentId: a.assessmentId.toString(), assessmentVersion: a.assessmentVersion, attemptNumber: a.attemptNumber, title: a.title, category: a.category, demo: a.demo, status: a.status, startedAt: a.startedAt, deadlineAt: a.deadlineAt, finalizedAt: a.finalizedAt, finishReason: a.finishReason, currentQuestionId: a.currentQuestionId, version: a.version, pointsPerCorrect: a.pointsPerCorrect, penaltyPerIncorrect: a.penaltyPerIncorrect, result: final ? a.result : null, serverNow: new Date(), questions: a.questions.map(q => ({ questionId: q.questionId, prompt: q.prompt, options: q.options.map(o => ({ id: o.id, text: o.text })), topic: q.topic, difficulty: q.difficulty, selectedOptionId: q.selectedOptionId, timeSpentMs: q.timeSpentMs, ...(final ? { correctOptionId: q.correctOptionId, explanation: q.explanation, correct: q.selectedOptionId === q.correctOptionId } : {}) })) };
}
export async function finalizeAttempt(id: string, studentId: string, manualVersion?: number) {
  for (let retry = 0; retry < 4; retry++) {
    const a = await ownAttempt(id, studentId); if (a.status === 'submitted') return a;
    const now = new Date(); const expired = a.deadlineAt <= now;
    if (!expired && manualVersion === undefined) return a;
    if (!expired && manualVersion !== a.version) throw new AppError(409, 'ATTEMPT_CONFLICT', 'Your attempt changed in another tab. Reload before submitting.');
    accrueTime(a, now); const result = scoreAttempt(a);
    const saved = await TestAttempt.findOneAndUpdate({ _id: a._id, studentId, status: 'in-progress', version: a.version, ...(!expired ? { $expr: { $gt: ['$deadlineAt', '$$NOW'] } } : {}) }, { $set: { status: 'submitted', questions: a.questions.toObject(), cursorSince: a.cursorSince, finalizedAt: expired ? a.deadlineAt : now, finishReason: expired ? 'expired' : 'manual', result }, $inc: { version: 1 } }, { new: true, runValidators: true });
    if (saved) { await recordActivity(studentId, 'assessment_completed', `Completed ${a.title}`, `attempt:${a.id}:completed`); return saved; }
  }
  throw new AppError(409, 'ATTEMPT_CONFLICT', 'The attempt is being updated. Reload its saved state.');
}
export async function expireStudentAttempts(studentId: string) { const ids = await TestAttempt.find({ studentId, status: 'in-progress', deadlineAt: { $lte: new Date() } }).select('_id'); for (const a of ids) await finalizeAttempt(a.id as string, studentId); }
export async function sweepExpiredAttempts() { const records = await TestAttempt.find({ status: 'in-progress', deadlineAt: { $lte: new Date() } }).select('studentId').limit(100); for (const a of records) await finalizeAttempt(a.id as string, a.studentId.toString()); }
export async function startAttempt(id: unknown, studentId: string, allowDemo: boolean) {
  const assessment = await Assessment.findOne({ _id: objectIdSchema.parse(id), published: true, ...(allowDemo ? {} : { demo: false }) });
  if (!assessment) throw new AppError(404, 'NOT_FOUND', 'Assessment not found.');
  await expireStudentAttempts(studentId);
  const existing = await TestAttempt.findOne({ studentId, assessmentId: assessment._id, status: 'in-progress' }); if (existing) return existing;
  const now = new Date(); if ((assessment.opensAt && assessment.opensAt > now) || (assessment.closesAt && assessment.closesAt <= now)) throw new AppError(409, 'ASSESSMENT_CLOSED', 'This assessment is outside its availability window.');
  const latest = await TestAttempt.findOne({ studentId, assessmentId: assessment._id }).sort({ attemptNumber: -1 }); const number = (latest?.attemptNumber || 0) + 1;
  if (number > assessment.maxAttempts) throw new AppError(409, 'ATTEMPT_LIMIT', 'You have used all permitted attempts.');
  const pool = await Question.find({ _id: { $in: assessment.questionIds }, published: true, category: assessment.category, ...(allowDemo ? {} : { demo: false }) });
  if (pool.length < assessment.questionCount) throw new AppError(409, 'ASSESSMENT_NOT_READY', 'Not enough published questions are available. Ask your trainer to review the assessment.');
  const questions = shuffle(pool).slice(0, assessment.questionCount).map(q => ({ questionId: q.id as string, questionVersion: q.version, prompt: q.prompt, options: (q.shuffleOptions ? shuffle(q.options) : q.options).map(v => ({ id: v.id, text: v.text })), correctOptionId: q.correctOptionId, explanation: q.explanation, category: q.category, topic: q.topic, difficulty: q.difficulty, expectedSeconds: q.expectedSeconds, selectedOptionId: null, timeSpentMs: 0 }));
  const signature = createHash('sha256').update(JSON.stringify({ assessmentVersion: assessment.version, points: assessment.pointsPerCorrect, penalty: assessment.penaltyPerIncorrect, duration: assessment.durationSeconds, questions: [...questions].sort((a, b) => a.questionId.localeCompare(b.questionId)).map(q => ({ ...q, options: [...q.options].sort((a, b) => a.id.localeCompare(b.id)) })) })).digest('hex');
  try {
    const a = await TestAttempt.create({ studentId, assessmentId: assessment._id, assessmentVersion: assessment.version, attemptNumber: number, title: assessment.title, category: assessment.category, demo: assessment.demo, startedAt: now, deadlineAt: new Date(Math.min(now.getTime() + assessment.durationSeconds * 1000, assessment.closesAt?.getTime() ?? Infinity)), cursorSince: now, currentQuestionId: questions[0].questionId, questions, pointsPerCorrect: assessment.pointsPerCorrect, penaltyPerIncorrect: assessment.penaltyPerIncorrect, setSignature: signature });
    await recordActivity(studentId, 'assessment_started', `Started ${assessment.title}`, `attempt:${a.id}:started`); return a;
  } catch (error) { if (typeof error === 'object' && error && 'code' in error && error.code === 11000) { const current = await TestAttempt.findOne({ studentId, assessmentId: assessment._id, status: 'in-progress' }); if (current) return current; throw new AppError(409, 'ATTEMPT_CONFLICT', 'An attempt was just created. Reload before starting again.'); } throw error; }
}
