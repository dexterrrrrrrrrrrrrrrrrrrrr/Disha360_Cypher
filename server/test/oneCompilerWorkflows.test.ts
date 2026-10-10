import { beforeAll, beforeEach, afterEach, afterAll, it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { testDatabase, studentAccount, studentCall } from './helpers/student.js';
import { createApp } from '../src/app.js';
import { OneCompilerProvider } from '../src/services/oneCompiler.js';
import { seedCoding } from '../src/services/sampleCoding.js';
import { CodingProblem } from '../src/models/CodingProblem.js';
import { CodingSubmission } from '../src/models/CodingSubmission.js';
let db: Awaited<ReturnType<typeof testDatabase>>;
beforeAll(async () => { db = await testDatabase(); }, 180000); beforeEach(async () => db.clear()); afterAll(async () => db?.close());
afterEach(() => vi.unstubAllEnvs());
async function setup() {
  await seedCoding('development'); const p = (await CodingProblem.findOne({ difficulty: 'easy' }).select('+hiddenTests'))!;
  const fetcher = vi.fn().mockImplementation(async (_url: string, options: RequestInit) => {
    const body = JSON.parse(options.body as string);
    return new Response(JSON.stringify(body.stdin.map((stdin: string) => ({ status: 'success', stdin, stdout: String(stdin.trim().split(/\s+/).map(Number).reduce((a, b) => a + b, 0)) + '\n', stderr: null, exception: null, executionTime: 9 }))));
  });
  const provider = new OneCompilerProvider('fixture-only-key', fetcher);
  const app = createApp({ clientOrigin: 'http://localhost:5173', databaseConfigured: true, allowDemoAccounts: true, executionProvider: provider });
  return { app, p, fetcher, s: await studentAccount() };
}
it('batch grades authoritative hidden tests, persists owned history, updates existing metrics and deduplicates', async () => {
  const { app, p, fetcher, s } = await setup(), body = { source: 'fixture program', language: 'python', requestId: randomUUID() };
  const path = `/coding/problems/${p.id}/submissions`; const r = await studentCall(app, s.cookie, 'post', path, body);
  expect(r.status).toBe(201); expect(r.body.data.submission).toMatchObject({ verdict: 'Accepted', passed: 3, total: 3, score: 100 });
  expect(fetcher).toHaveBeenCalledTimes(1); expect(JSON.parse(fetcher.mock.calls[0][1].body).stdin).toEqual(p.hiddenTests.map(t => t.input));
  expect((await studentCall(app, s.cookie, 'post', path, body)).body.data.submission.id).toBe(r.body.data.submission.id); expect(fetcher).toHaveBeenCalledTimes(1);
  expect(await CodingSubmission.countDocuments()).toBe(1);
  expect((await studentCall(app, s.cookie, 'get', '/coding/submissions')).body.data.submissions[0].verdict).toBe('Accepted');
  expect((await studentCall(app, s.cookie, 'get', '/dashboard')).body.data.coding.solved).toBe(1);
  for (const path of ['/coding/problems', `/coding/problems/${p.id}`, '/coding/submissions', `/coding/submissions/${r.body.data.submission.id}`]) {
    const text = JSON.stringify((await studentCall(app, s.cookie, 'get', path)).body); expect(text).not.toMatch(/hiddenTests|expected|fixture-only-key|999999|hidden diagnostic/);
  }
});
it.each(['wrong', 'compilation', 'runtime', 'quota', 'malformed'])('records truthful %s batch results with no hidden diagnostics', async kind => {
  const { app, p, fetcher, s } = await setup();
  fetcher.mockImplementation(async (_url: string, options: RequestInit) => {
    const body = JSON.parse(options.body as string);
    if (kind === 'quota') return new Response(JSON.stringify({ status: 'failed', error: 'E002: private quota details' }));
    return new Response(JSON.stringify(body.stdin.slice(0, kind === 'malformed' ? 1 : undefined).map((stdin: string) => ({ status: 'success', stdin, stdout: '', stderr: null, exception: kind === 'compilation' ? 'Compilation failed hidden diagnostic' : kind === 'runtime' ? 'RuntimeError hidden diagnostic' : null }))));
  });
  const r = await studentCall(app, s.cookie, 'post', `/coding/problems/${p.id}/submissions`, { language: 'cpp', source: 'fixture', requestId: randomUUID() });
  const verdict = kind === 'wrong' ? 'Wrong Answer' : kind === 'compilation' ? 'Compilation Error' : kind === 'runtime' ? 'Runtime Error' : 'System Error';
  expect(r.body.data.submission).toMatchObject({ verdict, passed: 0, score: verdict === 'System Error' ? null : 0 });
  expect(JSON.stringify(r.body)).not.toMatch(/hidden diagnostic|private quota|stdin|expected/);
});
it('requires Student auth, origin protection and request validation before execution', async () => {
  const { app, fetcher, s } = await setup(); const body = { language: 'python', source: 'print(1)', stdin: '' };
  expect((await request(app).post('/api/v1/student/coding/run').set('X-Disha360-Request', '1').send(body)).status).toBe(401);
  expect((await studentCall(app, (await studentAccount('trainer')).cookie, 'post', '/coding/run', body)).status).toBe(403);
  expect((await request(app).post('/api/v1/student/coding/run').set('Cookie', s.cookie).send(body)).status).toBe(403);
  expect((await studentCall(app, s.cookie, 'post', '/coding/run', { ...body, language: 'bash' })).status).toBe(400);
  expect(fetcher).not.toHaveBeenCalled();
});
it('never invokes the real provider for Demo Run or Demo Submit', async () => {
  vi.stubEnv('NODE_ENV', 'development');
  const { p, fetcher, s } = await setup();
  const app = createApp({ clientOrigin: 'http://localhost:5173', databaseConfigured: true, allowDemoAccounts: true, codingDemoMode: true, executionProvider: new OneCompilerProvider('fixture', fetcher) });
  const run = await studentCall(app, s.cookie, 'post', '/coding/demo/run', { language: 'python', source: 'fixture', stdin: 'secret' });
  expect(run.body.data.demoRun.message).toContain('Code was not executed');
  const receipt = await studentCall(app, s.cookie, 'post', `/coding/demo/problems/${p.id}/submissions`, { language: 'python', source: 'fixture' });
  expect(receipt.body.data.demoReceipt.message).toContain('No code execution or grading occurred');
  expect(fetcher).not.toHaveBeenCalled(); expect(await CodingSubmission.countDocuments()).toBe(0);
});
