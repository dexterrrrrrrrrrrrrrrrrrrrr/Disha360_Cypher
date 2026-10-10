import { beforeAll, beforeEach, afterAll, it, expect, vi } from 'vitest';
import { testDatabase, studentAccount, studentCall } from './helpers/student.js';
import { GeminiAIService } from '../src/services/geminiAI.js';
import { geminiResponse } from './helpers/gemini.js';
import { createApp } from '../src/app.js';
import { seedCoding } from '../src/services/sampleCoding.js';
import { CodingProblem } from '../src/models/CodingProblem.js';
import { CodingSubmission } from '../src/models/CodingSubmission.js';
import { ApiError } from '@google/genai';
let db: Awaited<ReturnType<typeof testDatabase>>;
beforeAll(async () => { db = await testDatabase(); }, 180000); beforeEach(async () => db.clear()); afterAll(async () => db?.close());
const advice = { explanation: 'Consider reading each number before adding it.', nextSteps: ['Review your input parsing.'] };
const input = { action: 'hint', language: 'python', source: 'print(input())' };
function setup() {
  const generateContent = vi.fn().mockResolvedValue(geminiResponse(advice));
  const provider = new GeminiAIService({ primaryKey: 'fixture-primary', backupKey: 'fixture-backup', model: 'gemini-test' }, () => ({ generateContent }));
  return { generateContent, app: createApp({ clientOrigin: 'http://localhost:5173', databaseConfigured: true, allowDemoAccounts: true, interviewProvider: provider }) };
}
it('uses shared Gemini configuration, public problem context and progressive hint levels without grading', async () => {
  const { app, generateContent } = setup(); await seedCoding('development'); const p = (await CodingProblem.findOne())!, s = await studentAccount();
  for (const hintLevel of [1, 2, 3]) {
    const r = await studentCall(app, s.cookie, 'post', '/coding/mentor', { ...input, problemId: p.id, hintLevel, error: 'Student supplied run error' });
    expect(r.status).toBe(200); expect(r.body.data.disclaimer).toContain('not executed or verified');
    const call = generateContent.mock.calls[hintLevel - 1][0]; expect(JSON.parse(call.contents)).toMatchObject({ hintLevel, allowSolution: false, problem: { title: p.title } });
    expect(call.contents).not.toMatch(/hiddenTests|expected|999999/); expect(call.model).toBe('gemini-test'); expect(call.config.systemInstruction).toContain('level 1');
  }
  expect(await CodingSubmission.countDocuments()).toBe(0);
});
it('requires explicit opt-in for full solutions and rejects fabricated grading fields', async () => {
  const { app, generateContent } = setup(), s = await studentAccount();
  expect((await studentCall(app, s.cookie, 'post', '/coding/mentor', { ...input, allowSolution: true })).status).toBe(200);
  expect(JSON.parse(generateContent.mock.calls[0][0].contents).allowSolution).toBe(true);
  generateContent.mockResolvedValue(geminiResponse({ ...advice, score: 100, verdict: 'Accepted' }));
  expect((await studentCall(app, s.cookie, 'post', '/coding/mentor', input)).status).toBe(503);
  expect(await CodingSubmission.countDocuments()).toBe(0);
});
it('fails clearly with missing configuration and provider errors, without automatic key rotation', async () => {
  const s = await studentAccount(), missing = createApp({ clientOrigin: 'http://localhost:5173', databaseConfigured: true });
  expect((await studentCall(missing, s.cookie, 'post', '/coding/mentor', input)).body.error.code).toBe('AI_SETUP_REQUIRED');
  const { app, generateContent } = setup(); generateContent.mockRejectedValue(new ApiError({ status: 429, message: 'fixture-primary secret' }));
  const r = await studentCall(app, s.cookie, 'post', '/coding/mentor', input); expect(r.body.error.code).toBe('AI_LIMITED'); expect(JSON.stringify(r.body)).not.toContain('fixture-primary'); expect(generateContent).toHaveBeenCalledTimes(1);
});
it('enforces request validation, role authorization and per-student mentor limits', async () => {
  const { app, generateContent } = setup(), s = await studentAccount();
  expect((await studentCall(app, (await studentAccount('admin')).cookie, 'post', '/coding/mentor', input)).status).toBe(403);
  expect((await studentCall(app, s.cookie, 'post', '/coding/mentor', { ...input, hintLevel: 4 })).status).toBe(400);
  expect((await studentCall(app, s.cookie, 'post', '/coding/mentor', { ...input, source: 'x'.repeat(30001) })).status).toBe(400);
  expect(generateContent).not.toHaveBeenCalled();
  for (let i = 0; i < 3; i++) expect((await studentCall(app, s.cookie, 'post', '/coding/mentor', input)).status).toBe(200);
  expect((await studentCall(app, s.cookie, 'post', '/coding/mentor', input)).status).toBe(429);
});
