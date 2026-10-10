import { beforeAll, beforeEach, afterAll, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createServer, type Server } from 'node:http';
import { testDatabase, studentAccount, studentCall } from './helpers/student.js';
import { geminiSetup, geminiAnswer, geminiFeedback } from './helpers/gemini.js';
import { createApp } from '../src/app.js';
import { OllamaAIService } from '../src/services/ollamaAI.js';
import { CodingSubmission } from '../src/models/CodingSubmission.js';
import { CodingProblem } from '../src/models/CodingProblem.js';
import { seedCoding } from '../src/services/sampleCoding.js';
let db: Awaited<ReturnType<typeof testDatabase>>;
beforeAll(async () => { db = await testDatabase(); }, 180000); beforeEach(async () => db.clear()); afterAll(async () => db?.close());
const response = (value: unknown) => Response.json({ done: true, message: { role: 'assistant', content: JSON.stringify(value) } });
const advice = { explanation: 'Consider your input parsing.', nextSteps: ['Review the public example.'] };
function setup() {
  const transport = vi.fn().mockImplementation((url: string) => Promise.resolve(url.endsWith('/api/tags') ? Response.json({ models: [{ name: 'test:local' }] }) : response(advice)));
  const provider = new OllamaAIService('http://127.0.0.1:11434', 'test:local', transport);
  return { transport, app: createApp({ clientOrigin: 'http://localhost:5173', databaseConfigured: true, allowDemoAccounts: true, interviewProvider: provider }) };
}
it.each(['technical', 'hr'] as const)('preserves private %s interview history, answer-based follow-ups and evidence-checked scorecards', async type => {
  const { app, transport } = setup(), s = await studentAccount(), other = await studentAccount();
  expect((await studentCall(app, s.cookie, 'get', '/interviews/config')).body.data).toMatchObject({ configured: true, provider: 'Ollama', model: 'test:local' });
  transport.mockResolvedValueOnce(response({ question: 'Explain how you implemented your project.' }));
  const start = await studentCall(app, s.cookie, 'post', '/interviews', { ...geminiSetup, type }); expect(start.status).toBe(201); const id = start.body.data.session.id;
  transport.mockResolvedValueOnce(response({ question: 'How did you test the fallback behaviour?' }));
  expect((await studentCall(app, s.cookie, 'post', `/interviews/${id}/answers`, { answer: geminiAnswer, version: 1 })).status).toBe(200);
  expect(transport.mock.calls[2][1].body).toContain(geminiAnswer);
  expect((await studentCall(app, s.cookie, 'post', `/interviews/${id}/complete`, { version: 2 })).status).toBe(200);
  transport.mockResolvedValueOnce(response(geminiFeedback())); const report = await studentCall(app, s.cookie, 'post', `/interviews/${id}/feedback`, {});
  expect(report.status).toBe(200); expect(report.body.data.report).toMatchObject({ provider: 'Ollama', overallScore: 70 }); expect(report.body.data.report.disclaimer).toContain('AI-generated');
  expect((await studentCall(app, other.cookie, 'get', `/interviews/${id}`)).status).toBe(404);
  expect((await studentCall(app, other.cookie, 'get', `/interviews/${id}/feedback`)).status).toBe(404);
  expect((await studentCall(app, s.cookie, 'get', '/interviews')).body.data.sessions).toHaveLength(1);
});
it('keeps hidden tests out of mentor context and never creates submissions or grading', async () => {
  const { app, transport } = setup(); await seedCoding('development'); const p = (await CodingProblem.findOne())!, s = await studentAccount();
  for (const hintLevel of [1, 2, 3]) {
    const r = await studentCall(app, s.cookie, 'post', '/coding/mentor', { language: 'java', source: 'class Main {}', problemId: p.id, action: 'hint', hintLevel }); expect(r.status).toBe(200);
    const body = transport.mock.calls[hintLevel - 1][1].body; expect(body).not.toMatch(/hiddenTests|expected|999999/); expect(JSON.parse(JSON.parse(body).messages[1].content)).toMatchObject({ hintLevel, allowSolution: false });
  }
  expect(await CodingSubmission.countDocuments()).toBe(0);
});
it('protects mentor streaming with student authentication, CSRF and origin validation', async () => {
  const { app, transport } = setup(), student = await studentAccount(), trainer = await studentAccount('trainer');
  const input = { language: 'python', source: 'print(1)', action: 'hint' };
  expect((await request(app).post('/api/v1/student/coding/mentor/stream').set('Origin', 'http://localhost:5173').set('X-Disha360-Request', '1').send(input)).status).toBe(401);
  expect((await studentCall(app, trainer.cookie, 'post', '/coding/mentor/stream', input)).status).toBe(403);
  expect((await request(app).post('/api/v1/student/coding/mentor/stream').set('Cookie', student.cookie).set('Origin', 'https://attacker.test').set('X-Disha360-Request', '1').send(input)).status).toBe(403);
  expect((await request(app).post('/api/v1/student/coding/mentor/stream').set('Cookie', student.cookie).set('Origin', 'http://localhost:5173').send(input)).status).toBe(403);
  expect(transport).not.toHaveBeenCalled();
  transport.mockResolvedValueOnce(new Response('{"done":false,"message":{"role":"assistant","content":"Conceptual "}}\n{"done":true,"message":{"role":"assistant","content":"hint"}}\n'));
  const r = await studentCall(app, student.cookie, 'post', '/coding/mentor/stream', input); expect(r.status).toBe(200); expect(r.text).toContain('Conceptual '); expect(r.text).toContain('"type":"done"');
  expect(await CodingSubmission.countDocuments()).toBe(0);
});
it('reports offline availability and fails mentor requests honestly', async () => {
  const { app, transport } = setup(), s = await studentAccount(); transport.mockRejectedValue(new Error('SECRET'));
  expect((await studentCall(app, s.cookie, 'get', '/coding/mentor/config')).body.data.configured).toBe(false);
  const r = await studentCall(app, s.cookie, 'post', '/coding/mentor', { language: 'python', source: 'print(1)', action: 'hint' }); expect(r.status).toBe(503); expect(JSON.stringify(r.body)).not.toContain('SECRET');
});
it('exercises the HTTP Ollama contract against a local fixture server (not a live model)', async () => {
  let server: Server | undefined; let body: Record<string, unknown> = {};
  try {
    server = createServer(async (req, res) => { let data = ''; for await (const chunk of req) data += chunk; if (req.url === '/api/tags') res.end(JSON.stringify({ models: [{ name: 'fixture:local' }] })); else { body = JSON.parse(data); res.end(JSON.stringify({ done: true, message: { role: 'assistant', content: JSON.stringify(advice) } })); } });
    await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve)); const address = server.address(); if (!address || typeof address === 'string') throw new Error('No fixture port');
    const provider = new OllamaAIService(`http://127.0.0.1:${address.port}`, 'fixture:local');
    expect((await provider.availability()).available).toBe(true);
    const app = createApp({ clientOrigin: 'http://localhost:5173', databaseConfigured: true, interviewProvider: provider }), s = await studentAccount();
    expect((await studentCall(app, s.cookie, 'post', '/coding/mentor', { language: 'cpp', source: 'int main() {}', action: 'debug' })).status).toBe(200);
    expect(body).toMatchObject({ model: 'fixture:local', stream: false }); expect(body).not.toHaveProperty('tools');
  } finally { await new Promise<void>(resolve => server ? server.close(() => resolve()) : resolve()); }
});
it('preserves resume consent, ownership and contact redaction with Ollama', async () => {
  const { app, transport } = setup(), s = await studentAccount(), other = await studentAccount();
  const { Resume } = await import('../src/models/Resume.js'); const { resumeFixture } = await import('./helpers/resume.js');
  const resume = await Resume.create({ ...resumeFixture(), studentId: s.user._id });
  const body = { consent: true, jobDescription: 'Seeking a React developer with testing and accessibility knowledge.'.repeat(2) };
  expect((await studentCall(app, s.cookie, 'post', `/resumes/${resume.id}/ai-suggestions`, { ...body, consent: false })).status).toBe(400);
  expect((await studentCall(app, other.cookie, 'post', `/resumes/${resume.id}/ai-suggestions`, body)).status).toBe(404); expect(transport).not.toHaveBeenCalled();
  transport.mockResolvedValueOnce(response({ suggestions: [{ section: 'summary', suggestion: 'Describe your existing project.', reason: 'Be specific without inventing claims.' }] }));
  const r = await studentCall(app, s.cookie, 'post', `/resumes/${resume.id}/ai-suggestions`, body); expect(r.status).toBe(200); expect(r.body.data.provider).toBe('Ollama');
  const prompt = JSON.parse(JSON.parse(transport.mock.calls[0][1].body).messages[1].content);
  expect(prompt.resume).not.toHaveProperty('contact'); expect(prompt.resume).not.toHaveProperty('name'); expect(prompt).not.toHaveProperty('score');
  expect((await Resume.findById(resume.id))!.version).toBe(1);
});
