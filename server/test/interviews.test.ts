import { beforeAll, beforeEach, afterAll, it, expect, vi } from 'vitest';
import { testDatabase, studentAccount, testApp, studentCall } from './helpers/student.js';
import { createApp } from '../src/app.js';
import type { InterviewProvider } from '../src/services/interviewProvider.js';
import { InterviewSession } from '../src/models/InterviewSession.js';
import { Activity } from '../src/models/Preparation.js';
import { AppError } from '../src/utils/AppError.js';
const setup = { type: 'technical', difficulty: 'intermediate', targetRole: 'Frontend developer', focus: 'React and TypeScript', questionLimit: 3 };
const provider = () => ({ name: 'Explicit test double (not real AI)', question: vi.fn<InterviewProvider['question']>().mockResolvedValue('How would you design a reliable React component?') });
const withProvider = (p: InterviewProvider) => createApp({ clientOrigin: 'http://localhost:5173', databaseConfigured: true, interviewProvider: p });
let db: Awaited<ReturnType<typeof testDatabase>>;
beforeAll(async () => { db = await testDatabase(); }, 180000);
beforeEach(async () => { await db.clear(); });
afterAll(async () => { if (db) await db.close(); });
it('shows setup-required without credentials and never creates a simulated interview', async () => {
  const s = await studentAccount(); const app = testApp();
  const config = await studentCall(app, s.cookie, 'get', '/interviews/config'); expect(config.body.data.configured).toBe(false); expect(config.body.data.message).toContain('selected backend AI provider');
  const start = await studentCall(app, s.cookie, 'post', '/interviews', setup); expect(start.status).toBe(503); expect(start.body.error.code).toBe('AI_SETUP_REQUIRED'); expect(await InterviewSession.countDocuments()).toBe(0);
});
it('validates setup, answers, IDs and rejects owner/provider injection', async () => {
  const s = await studentAccount(); const p = provider(); const app = withProvider(p);
  for (const input of [{ ...setup, studentId: s.user.id }, { ...setup, provider: 'fake' }, { ...setup, questionLimit: 50 }, { ...setup, type: 'unsupported' }, { ...setup, targetRole: '' }]) expect((await studentCall(app, s.cookie, 'post', '/interviews', input)).status).toBe(400);
  expect(p.question).not.toHaveBeenCalled();
  const start = await studentCall(app, s.cookie, 'post', '/interviews', setup); const id = start.body.data.session.id;
  expect((await studentCall(app, s.cookie, 'post', `/interviews/${id}/answers`, { answer: '', version: 1 })).status).toBe(400);
  expect((await studentCall(app, s.cookie, 'get', '/interviews/bad-id')).status).toBe(400);
});
it('persists the first generated question and adapts using the actual transcript', async () => {
  const s = await studentAccount(); const p = provider(); const app = withProvider(p);
  const start = await studentCall(app, s.cookie, 'post', '/interviews', setup); expect(start.status).toBe(201); expect(p.question).toHaveBeenCalledWith(setup, []);
  const id = start.body.data.session.id; p.question.mockResolvedValueOnce('How would you test the error boundary you mentioned?');
  const answer = await studentCall(app, s.cookie, 'post', `/interviews/${id}/answers`, { answer: 'I would use an error boundary and unit tests.', version: 1 });
  expect(answer.status).toBe(200); expect(answer.body.data.session.version).toBe(2); expect(answer.body.data.session.messages).toHaveLength(3);
  const transcript = p.question.mock.calls[1][1]; expect(transcript.map(m => m.role)).toEqual(['interviewer', 'student']); expect(transcript[1].text).toContain('error boundary');
  const reloaded = await studentCall(withProvider(p), s.cookie, 'get', `/interviews/${id}`); expect(reloaded.body.data.session).toEqual(answer.body.data.session);
  expect(JSON.stringify(reloaded.body)).not.toMatch(/leaseToken|leaseUntil|studentId|password/i);
  expect((await studentCall(app, s.cookie, 'get', '/interviews')).body.data.sessions[0]).not.toHaveProperty('messages');
});
it('automatically completes after the requested answers without generating feedback or extra questions', async () => {
  const s = await studentAccount(); const p = provider(); const app = withProvider(p); const start = await studentCall(app, s.cookie, 'post', '/interviews', setup); const id = start.body.data.session.id;
  for (let version = 1; version <= 3; version++) { const result = await studentCall(app, s.cookie, 'post', `/interviews/${id}/answers`, { answer: `My concrete example ${version}.`, version }); expect(result.status).toBe(200); if (version === 3) { expect(result.body.data.session.status).toBe('completed'); expect(result.body.data.session.answerCount).toBe(3); expect(result.body.data.session.messages).toHaveLength(6); expect(result.body.data.session).not.toHaveProperty('feedback'); } }
  expect(p.question).toHaveBeenCalledTimes(3);
  expect((await studentCall(app, s.cookie, 'post', `/interviews/${id}/answers`, { answer: 'Extra', version: 4 })).status).toBe(409);
  expect(await Activity.countDocuments({ kind: 'interview_completed' })).toBe(1);
});
it('permits ending early and reading old transcripts after provider configuration is removed', async () => {
  const s = await studentAccount(); const start = await studentCall(withProvider(provider()), s.cookie, 'post', '/interviews', setup); const id = start.body.data.session.id; const app = testApp();
  expect((await studentCall(app, s.cookie, 'get', `/interviews/${id}`)).status).toBe(200);
  const result = await studentCall(app, s.cookie, 'post', `/interviews/${id}/complete`, { version: 1 }); expect(result.body.data.session.status).toBe('completed'); expect(result.body.data.session.answerCount).toBe(0);
  expect((await studentCall(app, s.cookie, 'post', `/interviews/${id}/complete`, { version: 1 })).status).toBe(409);
});
it('blocks other students and staff from private transcripts and mutations', async () => {
  const s = await studentAccount(); const other = await studentAccount(); const trainer = await studentAccount('trainer'); const p = provider(); const app = withProvider(p); const start = await studentCall(app, s.cookie, 'post', '/interviews', setup); const id = start.body.data.session.id;
  expect((await studentCall(app, other.cookie, 'get', '/interviews')).body.data.sessions).toEqual([]);
  expect((await studentCall(app, other.cookie, 'get', `/interviews/${id}`)).status).toBe(404);
  expect((await studentCall(app, other.cookie, 'post', `/interviews/${id}/answers`, { answer: 'Attack', version: 1 })).status).toBe(404);
  expect((await studentCall(app, other.cookie, 'post', `/interviews/${id}/complete`, { version: 1 })).status).toBe(404);
  expect((await studentCall(app, trainer.cookie, 'get', '/interviews')).status).toBe(403); expect(p.question).toHaveBeenCalledTimes(1);
});
it('preserves the session on provider failure and releases its lock for a safe retry', async () => {
  const s = await studentAccount(); const p = provider(); const app = withProvider(p);
  p.question.mockRejectedValueOnce(new AppError(503, 'AI_UNAVAILABLE', 'Provider unavailable.'));
  expect((await studentCall(app, s.cookie, 'post', '/interviews', setup)).status).toBe(503); expect(await InterviewSession.countDocuments()).toBe(0);
  const start = await studentCall(app, s.cookie, 'post', '/interviews', setup); const id = start.body.data.session.id;
  p.question.mockRejectedValueOnce(new AppError(503, 'AI_UNAVAILABLE', 'Provider unavailable.'));
  const input = { answer: 'My real answer', version: 1 }; expect((await studentCall(app, s.cookie, 'post', `/interviews/${id}/answers`, input)).status).toBe(503);
  const saved = await InterviewSession.findById(id); expect(saved?.messages).toHaveLength(1); expect(saved?.version).toBe(1); expect(saved?.leaseToken).toBeUndefined();
  expect((await studentCall(app, s.cookie, 'post', `/interviews/${id}/answers`, input)).status).toBe(200);
});
it('rejects simultaneous submissions and stale versions instead of duplicating answers', async () => {
  const s = await studentAccount(); const p = provider(); const app = withProvider(p); const start = await studentCall(app, s.cookie, 'post', '/interviews', setup); const id = start.body.data.session.id;
  let resolve!: (question: string) => void; let began!: () => void; const started = new Promise<void>(r => { began = r; });
  p.question.mockImplementationOnce(() => { began(); return new Promise<string>(r => { resolve = r; }); });
  const first = studentCall(app, s.cookie, 'post', `/interviews/${id}/answers`, { answer: 'First answer', version: 1 }).then(r => r);
  await started;
  const second = await studentCall(app, s.cookie, 'post', `/interviews/${id}/answers`, { answer: 'Duplicate', version: 1 }); expect(second.status).toBe(409);
  expect((await studentCall(app, s.cookie, 'post', `/interviews/${id}/complete`, { version: 1 })).status).toBe(409);
  resolve('Can you expand on your first answer?'); expect((await first).status).toBe(200);
  expect((await studentCall(app, s.cookie, 'post', `/interviews/${id}/answers`, { answer: 'Stale', version: 1 })).status).toBe(409);
  const saved = await InterviewSession.findById(id); expect(saved?.messages.filter(m => m.role === 'student')).toHaveLength(1); expect(p.question).toHaveBeenCalledTimes(2);
});
it('recovers an expired processing lease after an interrupted server operation', async () => {
  const s = await studentAccount(); const p = provider(); const app = withProvider(p); const start = await studentCall(app, s.cookie, 'post', '/interviews', setup); const id = start.body.data.session.id;
  await InterviewSession.updateOne({ _id: id }, { $set: { leaseToken: 'interrupted', leaseUntil: new Date(Date.now() - 1000) } });
  expect((await studentCall(app, s.cookie, 'post', `/interviews/${id}/answers`, { answer: 'Recovered answer', version: 1 })).status).toBe(200);
});
