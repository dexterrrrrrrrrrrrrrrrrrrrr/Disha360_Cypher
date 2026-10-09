import { beforeAll, beforeEach, afterAll, it, expect } from 'vitest';
import { testDatabase, studentAccount, testApp, studentCall } from './helpers/student.js';
import { assessmentFixture } from './helpers/assessment.js';
import { Assessment, Question, TestAttempt } from '../src/models/Assessment.js';
import { Activity } from '../src/models/Preparation.js';
import { shuffle, sweepExpiredAttempts } from '../src/services/assessments.js';
import { seedSampleAssessments } from '../src/services/sampleAssessments.js';
let db: Awaited<ReturnType<typeof testDatabase>>;
beforeAll(async () => { db = await testDatabase(); }, 180000); beforeEach(async () => { await db.clear(); }); afterAll(async () => { if (db) await db.close(); });
async function start(overrides: Record<string, unknown> = {}) { const s = await studentAccount(); const bank = await assessmentFixture(overrides); const app = testApp(); const result = await studentCall(app, s.cookie, 'post', `/assessments/${bank.assessment.id}/attempts`, {}); expect(result.status).toBe(201); return { s, bank, app, attempt: result.body.data.attempt }; }
it('randomizes with Fisher-Yates without mutating the source and preserves a question snapshot on refresh', async () => {
  const original = [1, 2, 3, 4]; expect(shuffle(original, () => 0)).toEqual([2, 3, 4, 1]); expect(original).toEqual([1, 2, 3, 4]);
  const { s, app, attempt, bank } = await start(); expect(attempt.questions).toHaveLength(4); expect(new Set(attempt.questions.map((q: { questionId: string }) => q.questionId)).size).toBe(4);
  for (const q of attempt.questions) expect(q.options.map((o: { id: string }) => o.id).sort()).toEqual(['right', 'wrong-a', 'wrong-b', 'wrong-c']);
  const fresh = await studentCall(app, s.cookie, 'get', `/attempts/${attempt.id}`); expect(fresh.body.data.attempt.questions).toEqual(attempt.questions); expect(fresh.body.data.attempt.deadlineAt).toBe(attempt.deadlineAt);
  await Question.updateMany({ _id: { $in: bank.questions.map(q => q._id) } }, { $set: { prompt: 'A changed bank prompt', published: false } });
  expect((await studentCall(app, s.cookie, 'get', `/attempts/${attempt.id}`)).body.data.attempt.questions).toEqual(attempt.questions);
});
it('hides answer keys before finalization and prohibits client scores or unpublished question access', async () => {
  const { s, app, attempt, bank } = await start(); expect(JSON.stringify(attempt)).not.toMatch(/correctOptionId|explanation|"correct":/); expect(attempt.result).toBeNull();
  const detail = await studentCall(app, s.cookie, 'get', `/assessments/${bank.assessment.id}`); expect(detail.body.data.assessment).not.toHaveProperty('questionIds');
  expect((await studentCall(app, s.cookie, 'post', `/attempts/${attempt.id}/submit`, { version: 1, score: 100 })).status).toBe(400);
  await Assessment.updateOne({ _id: bank.assessment._id }, { $set: { published: false } }); expect((await studentCall(app, s.cookie, 'get', `/assessments/${bank.assessment.id}`)).status).toBe(404);
  expect((await studentCall(app, s.cookie, 'get', '/assessments')).body.data.assessments).toHaveLength(0);
});
it('persists answer/navigation progress, resumes the same attempt and tracks server wall time', async () => {
  const { s, app, attempt, bank } = await start(); const id = attempt.id; const q = attempt.questions[0];
  await TestAttempt.updateOne({ _id: id }, { $set: { cursorSince: new Date(Date.now() - 5000) } });
  const progress = await studentCall(app, s.cookie, 'put', `/attempts/${id}/progress`, { version: 1, currentQuestionId: attempt.questions[1].questionId, questionId: q.questionId, selectedOptionId: 'right' }); expect(progress.status).toBe(200); expect(progress.body.data.attempt.version).toBe(2); expect(progress.body.data.attempt.questions[0].timeSpentMs).toBeGreaterThanOrEqual(5000);
  const resumed = await studentCall(app, s.cookie, 'post', `/assessments/${bank.assessment.id}/attempts`, {}); expect(resumed.body.data.attempt.id).toBe(id); expect(resumed.body.data.attempt.currentQuestionId).toBe(attempt.questions[1].questionId); expect(resumed.body.data.attempt.questions[0].selectedOptionId).toBe('right');
  expect((await studentCall(app, s.cookie, 'put', `/attempts/${id}/progress`, { version: 1, currentQuestionId: q.questionId })).status).toBe(409);
  expect((await studentCall(app, s.cookie, 'put', `/attempts/${id}/progress`, { version: 2, currentQuestionId: q.questionId, timeSpentMs: 1 })).status).toBe(400);
});
it('scores correct, incorrect and unanswered choices with configured negative marking', async () => {
  const { s, app, attempt } = await start(); let version = 1;
  for (const [i, option] of ['right', 'right', 'wrong-a'].entries()) { const q = attempt.questions[i]; const response = await studentCall(app, s.cookie, 'put', `/attempts/${attempt.id}/progress`, { version, currentQuestionId: q.questionId, questionId: q.questionId, selectedOptionId: option }); expect(response.status).toBe(200); version = response.body.data.attempt.version; }
  const response = await studentCall(app, s.cookie, 'post', `/attempts/${attempt.id}/submit`, { version }); expect(response.status).toBe(200); expect(response.body.data.attempt.result).toMatchObject({ correct: 2, incorrect: 1, unanswered: 1, score: 3.5, maximum: 8, percentage: 44, accuracy: 50 });
  expect(response.body.data.attempt.questions[0].correctOptionId).toBe('right'); expect(response.body.data.attempt.questions[0].explanation).toBeTruthy();
});
it('finalizes once under duplicate submissions and rejects edits to finalized answers', async () => {
  const { s, app, attempt } = await start(); const submit = () => studentCall(app, s.cookie, 'post', `/attempts/${attempt.id}/submit`, { version: 1 });
  const responses = await Promise.all([submit(), submit()]); expect(responses.map(v => v.status)).toEqual([200, 200]); expect(responses[0].body.data.attempt.result).toEqual(responses[1].body.data.attempt.result); expect(responses[0].body.data.attempt.version).toBe(responses[1].body.data.attempt.version);
  expect(await Activity.countDocuments({ kind: 'assessment_completed' })).toBe(1);
  expect((await studentCall(app, s.cookie, 'put', `/attempts/${attempt.id}/progress`, { version: 2, currentQuestionId: attempt.questions[0].questionId, questionId: attempt.questions[0].questionId, selectedOptionId: 'right' })).status).toBe(409);
});
it('enforces expiry on the backend and ignores answers arriving after the deadline', async () => {
  const { s, app, attempt } = await start(); await TestAttempt.updateOne({ _id: attempt.id }, { $set: { startedAt: new Date(Date.now() - 30000), cursorSince: new Date(Date.now() - 30000), deadlineAt: new Date(Date.now() - 1000) } });
  expect((await studentCall(app, s.cookie, 'put', `/attempts/${attempt.id}/progress`, { version: 1, currentQuestionId: attempt.questions[0].questionId, questionId: attempt.questions[0].questionId, selectedOptionId: 'right' })).status).toBe(409);
  const result = await studentCall(app, s.cookie, 'get', `/attempts/${attempt.id}`); expect(result.body.data.attempt.status).toBe('submitted'); expect(result.body.data.attempt.finishReason).toBe('expired'); expect(result.body.data.attempt.result.score).toBe(0); expect(result.body.data.attempt.result.unanswered).toBe(4); expect(result.body.data.attempt.questions[0].timeSpentMs).toBeGreaterThan(25000);
});
it('auto-expires interrupted attempts through the worker and remains idempotent on later submissions', async () => {
  const { s, app, attempt } = await start(); await TestAttempt.updateOne({ _id: attempt.id }, { $set: { deadlineAt: new Date(Date.now() - 1) } }); await sweepExpiredAttempts(); await sweepExpiredAttempts();
  expect((await TestAttempt.findById(attempt.id))?.status).toBe('submitted'); expect(await Activity.countDocuments({ kind: 'assessment_completed' })).toBe(1);
  const response = await studentCall(app, s.cookie, 'post', `/attempts/${attempt.id}/submit`, { version: 1 }); expect(response.status).toBe(200); expect(response.body.data.attempt.finishReason).toBe('expired');
});
it('uses atomic attempt limits, disallows invalid choices and isolates student attempts', async () => {
  const { s, app, attempt, bank } = await start({ maxAttempts: 1 }); const other = await studentAccount(); const admin = await studentAccount('admin');
  const repeats = await Promise.all([studentCall(app, s.cookie, 'post', `/assessments/${bank.assessment.id}/attempts`, {}), studentCall(app, s.cookie, 'post', `/assessments/${bank.assessment.id}/attempts`, {})]); expect(repeats.every(r => r.body.data.attempt.id === attempt.id)).toBe(true); expect(await TestAttempt.countDocuments()).toBe(1);
  expect((await studentCall(app, s.cookie, 'put', `/attempts/${attempt.id}/progress`, { version: 1, currentQuestionId: attempt.questions[0].questionId, questionId: attempt.questions[0].questionId, selectedOptionId: 'invalid-option' })).status).toBe(400);
  for (const method of ['get', 'put'] as const) expect((await studentCall(app, other.cookie, method, `/attempts/${attempt.id}${method === 'put' ? '/progress' : ''}`, method === 'put' ? { version: 1, currentQuestionId: attempt.questions[0].questionId } : undefined)).status).toBe(404);
  expect((await studentCall(app, other.cookie, 'post', `/attempts/${attempt.id}/submit`, { version: 1 })).status).toBe(404); expect((await studentCall(app, other.cookie, 'get', '/attempts')).body.data.attempts).toHaveLength(0); expect((await studentCall(app, admin.cookie, 'get', '/assessments')).status).toBe(403);
  await studentCall(app, s.cookie, 'post', `/attempts/${attempt.id}/submit`, { version: 1 }); expect((await studentCall(app, s.cookie, 'post', `/assessments/${bank.assessment.id}/attempts`, {})).status).toBe(409);
});
it('rejects malformed banks and safely seeds only labeled development examples', async () => {
  const { questions, assessment } = await assessmentFixture(); const source = questions[0];
  await expect(Question.create({ ...source.toObject(), _id: undefined, key: 'bad', options: source.options.slice(0, 3) })).rejects.toThrow();
  await expect(Assessment.create({ ...assessment.toObject(), _id: undefined, key: 'bad', questionCount: 200 })).rejects.toThrow();
  await expect(seedSampleAssessments('production')).rejects.toThrow(); expect(await Question.countDocuments({ demo: true })).toBe(0);
  await seedSampleAssessments('development'); await seedSampleAssessments('development'); expect(await Question.countDocuments({ demo: true })).toBe(20); expect(await Assessment.countDocuments({ demo: true })).toBe(4);
  const s = await studentAccount(); expect((await studentCall(testApp(), s.cookie, 'get', '/assessments')).body.data.assessments.every((a: { demo: boolean }) => !a.demo)).toBe(true);
});
it('creates only one active attempt when two start requests arrive concurrently', async () => {
  const s = await studentAccount(); const { assessment } = await assessmentFixture(); const app = testApp();
  const results = await Promise.all([studentCall(app, s.cookie, 'post', `/assessments/${assessment.id}/attempts`, {}), studentCall(app, s.cookie, 'post', `/assessments/${assessment.id}/attempts`, {})]);
  expect(results.every(r => r.status === 201)).toBe(true); expect(results[0].body.data.attempt.id).toBe(results[1].body.data.attempt.id); expect(await TestAttempt.countDocuments()).toBe(1);
});
it('preserves raw negative scores with zero-floor percentages and rejects future edit versions', async () => {
  const { s, app, attempt } = await start(); const first = attempt.questions[0];
  expect((await studentCall(app, s.cookie, 'put', `/attempts/${attempt.id}/progress`, { version: 2, currentQuestionId: first.questionId, questionId: first.questionId, selectedOptionId: 'right' })).status).toBe(409);
  let version = 1; for (const q of attempt.questions) { const r = await studentCall(app, s.cookie, 'put', `/attempts/${attempt.id}/progress`, { version, currentQuestionId: q.questionId, questionId: q.questionId, selectedOptionId: 'wrong-a' }); version = r.body.data.attempt.version; }
  const result = await studentCall(app, s.cookie, 'post', `/attempts/${attempt.id}/submit`, { version }); expect(result.body.data.attempt.result).toMatchObject({ score: -2, percentage: 0, accuracy: 0, incorrect: 4 });
});
