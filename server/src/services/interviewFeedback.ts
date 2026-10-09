import { competencyNames, feedbackSchema } from '../validators/feedback.js';
import type { InterviewMessage } from '../validators/interview.js';
import { AppError } from '../utils/AppError.js';
export function answeredQuestions(messages: Pick<InterviewMessage, 'role' | 'text'>[]) {
  const pairs: { questionNumber: number; question: string; answer: string }[] = [];
  let question = ''; let number = 0;
  for (const m of messages) { if (m.role === 'interviewer') { question = m.text; number++; } else if (question) pairs.push({ questionNumber: number, question, answer: m.text }); }
  return pairs;
}
export function validateFeedback(raw: unknown, messages: Pick<InterviewMessage, 'role' | 'text'>[]) {
  const parsed = feedbackSchema.safeParse(raw);
  const invalid = () => new AppError(503, 'INVALID_AI_FEEDBACK', 'The provider returned unsupported or invalid feedback. No report was saved. Please retry.');
  if (!parsed.success) throw invalid();
  const data = parsed.data; const pairs = answeredQuestions(messages);
  const supported = (e: { questionNumber: number; quote: string }) => pairs.some(p => p.questionNumber === e.questionNumber && p.answer.includes(e.quote));
  const scores = competencyNames.map(key => data.competencies[key]);
  if (!scores.some(c => c.score !== null) || scores.some(c => (c.score !== null && !c.evidence.length) || c.evidence.some(e => !supported(e)))) throw invalid();
  if ([...data.strengths, ...data.improvements, ...data.questions].some(e => !supported(e))) throw invalid();
  if (data.questions.length !== pairs.length || new Set(data.questions.map(q => q.questionNumber)).size !== pairs.length || pairs.some(p => !data.questions.some(q => q.questionNumber === p.questionNumber))) throw invalid();
  const measured = scores.filter(c => c.score !== null);
  return { ...data, questions: data.questions.sort((a, b) => a.questionNumber - b.questionNumber), overallScore: Math.round(measured.reduce((sum, c) => sum + c.score!, 0) / measured.length), confidence: { score: null, reason: 'Vocal confidence, tone, body language, and delivery cannot be assessed from this text transcript. No confidence score is inferred.' }, answeredCount: pairs.length, disclaimer: 'AI-generated evaluation of saved text answers, not an objectively measured aptitude score or a hiring prediction. Evidence quotes are checked against your transcript, but AI judgments can be incorrect. Overall score is the equal-weight mean of assessable competencies; unsupported competencies are omitted.', rubricVersion: '1.0' };
}
