import { beforeAll, beforeEach, afterAll, it, expect, vi } from 'vitest';
import { testDatabase, studentAccount, studentCall, testApp } from './helpers/student.js';
import { InterviewSession } from '../src/models/InterviewSession.js';
import { InterviewFeedback } from '../src/models/InterviewFeedback.js';
import { createApp } from '../src/app.js';
import { validateFeedback } from '../src/services/interviewFeedback.js';
import { competencyNames } from '../src/validators/feedback.js';
import { Activity } from '../src/models/Preparation.js';
const answer = 'I built an error boundary and tested its fallback rendering.';
const messages = [{ role: 'interviewer' as const, text: 'Describe your React project.', at: new Date() }, { role: 'student' as const, text: answer, at: new Date() }];
function evaluation() { return { competencies: Object.fromEntries(competencyNames.map(key => [key, { score: key === 'technicalAccuracy' ? null : 70, rationale: 'Uses a concrete example; limited detail on trade-offs.', evidence: [{ questionNumber: 1, quote: 'I built an error boundary' }] }])), strengths: [{ questionNumber: 1, quote: 'tested its fallback rendering', observation: 'Mentions testing a concrete feature.' }], improvements: [{ questionNumber: 1, quote: answer, observation: 'Explain why this design was chosen.' }], questions: [{ questionNumber: 1, score: 70, quote: answer, assessment: 'Relevant example with limited design explanation.', suggestions: ['Describe the failure case and a design trade-off.'] }], nextSteps: ['Practise explaining one design trade-off from this project.'] }; }
let db: Awaited<ReturnType<typeof testDatabase>>;
beforeAll(async () => { db = await testDatabase(); }, 180000); beforeEach(async () => { await db.clear(); }); afterAll(async () => { if (db) await db.close(); });
async function session(studentId: unknown, status = 'completed', withAnswer = true) { return InterviewSession.create({ studentId, type: 'technical', difficulty: 'beginner', targetRole: 'Developer', focus: '', questionLimit: 3, status, provider: 'Explicit test fixture', messages: withAnswer ? messages : [messages[0]] }); }
function configured(raw: unknown = evaluation()) { const feedback = vi.fn().mockResolvedValue(raw); const app = createApp({ clientOrigin: 'http://localhost:5173', databaseConfigured: true, interviewProvider: { name: 'Explicit feedback test fixture', question: async () => 'Test question?', feedback } }); return { app, feedback }; }
it('evaluates actual owned transcripts, persists one report and reuses it without extra AI calls', async () => {
  const s = await studentAccount(); const interview = await session(s.user._id); const { app, feedback } = configured(); const path = `/interviews/${interview.id}/feedback`;
  const result = await studentCall(app, s.cookie, 'post', path, {}); expect(result.status).toBe(200); expect(result.body.data.report.overallScore).toBe(70); expect(result.body.data.report.confidence.score).toBeNull();
  expect(feedback.mock.calls[0][1][1].text).toBe(answer); expect(result.body.data.report.disclaimer).toContain('not an objectively');
  expect((await studentCall(testApp(), s.cookie, 'get', path)).body.data.report).toEqual(result.body.data.report);
  await studentCall(app, s.cookie, 'post', path, {}); expect(feedback).toHaveBeenCalledTimes(1); expect(await InterviewFeedback.countDocuments()).toBe(1); expect(await Activity.countDocuments({ kind: 'interview_feedback' })).toBe(1);
});
it('checks transcript ownership and student role on report reads and generation', async () => {
  const s = await studentAccount(); const other = await studentAccount(); const admin = await studentAccount('admin'); const interview = await session(s.user._id); const { app, feedback } = configured();
  for (const method of ['get', 'post'] as const) expect((await studentCall(app, other.cookie, method, `/interviews/${interview.id}/feedback`, method === 'post' ? {} : undefined)).status).toBe(404);
  expect((await studentCall(app, admin.cookie, 'get', `/interviews/${interview.id}/feedback`)).status).toBe(403); expect(feedback).not.toHaveBeenCalled();
});
it('does not fabricate feedback without a provider, answers, or a completed interview', async () => {
  const s = await studentAccount(); const completed = await session(s.user._id); const active = await session(s.user._id, 'active'); const empty = await session(s.user._id, 'completed', false); const { app, feedback } = configured();
  const state = await studentCall(testApp(), s.cookie, 'get', `/interviews/${completed.id}/feedback`); expect(state.body.data.available).toBe(false); expect(state.body.data.report).toBeNull();
  expect((await studentCall(testApp(), s.cookie, 'post', `/interviews/${completed.id}/feedback`, {})).status).toBe(503);
  expect((await studentCall(app, s.cookie, 'post', `/interviews/${active.id}/feedback`, {})).status).toBe(409);
  expect((await studentCall(app, s.cookie, 'post', `/interviews/${empty.id}/feedback`, {})).status).toBe(422); expect(feedback).not.toHaveBeenCalled(); expect(await InterviewFeedback.countDocuments()).toBe(0);
});
it('rejects malformed provider output and invented quotations without saving an evaluation', async () => {
  const s = await studentAccount(); const interview = await session(s.user._id); const wrong = evaluation(); wrong.questions[0].quote = 'Invented performance evidence'; const { app, feedback } = configured(wrong);
  expect((await studentCall(app, s.cookie, 'post', `/interviews/${interview.id}/feedback`, {})).status).toBe(503); expect(await InterviewFeedback.countDocuments()).toBe(0); expect((await InterviewSession.findById(interview.id))?.feedbackToken).toBeUndefined();
  feedback.mockResolvedValueOnce({ score: 99 }); expect((await studentCall(app, s.cookie, 'post', `/interviews/${interview.id}/feedback`, {})).status).toBe(503);
  const duplicate = evaluation(); duplicate.questions.push(duplicate.questions[0]); expect(() => validateFeedback(duplicate, messages)).toThrow();
  const unscored = evaluation(); Object.values(unscored.competencies).forEach(c => { c.score = null; }); expect(() => validateFeedback(unscored, messages)).toThrow();
});
it('prevents simultaneous report generation and releases the reservation after failure', async () => {
  const s = await studentAccount(); const interview = await session(s.user._id); const { app, feedback } = configured(); let resolve!: (v: unknown) => void; let began!: () => void; const started = new Promise<void>(r => { began = r; });
  feedback.mockImplementationOnce(() => { began(); return new Promise(r => { resolve = r; }); }); const path = `/interviews/${interview.id}/feedback`;
  const first = studentCall(app, s.cookie, 'post', path, {}).then(r => r); await started; expect((await studentCall(app, s.cookie, 'post', path, {})).status).toBe(409); resolve(evaluation()); expect((await first).status).toBe(200); expect(feedback).toHaveBeenCalledTimes(1);
});

it('rejects client-provided scores or evaluation data before calling the provider', async () => {
  const s = await studentAccount(); const interview = await session(s.user._id); const { app, feedback } = configured();
  const result = await studentCall(app, s.cookie, 'post', `/interviews/${interview.id}/feedback`, { overallScore: 100 });
  expect(result.status).toBe(400); expect(feedback).not.toHaveBeenCalled(); expect(await InterviewFeedback.countDocuments()).toBe(0);
});
