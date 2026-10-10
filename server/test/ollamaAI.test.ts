import { afterEach, expect, it, vi } from 'vitest';
import { OllamaAIService, ollamaLimits } from '../src/services/ollamaAI.js';
import { configureAI } from '../src/services/aiProvider.js';
import { envSchema } from '../src/config/env.js';
import { mentorContextSchema } from '../src/validators/codingMentor.js';
import { geminiSetup, geminiFeedback, geminiAnswer } from './helpers/gemini.js';
const context = () => mentorContextSchema.parse({ language: 'python', source: 'print(input())', action: 'hint', problem: null });
const result = (value: unknown) => Response.json({ done: true, message: { role: 'assistant', content: JSON.stringify(value) } });
afterEach(() => vi.useRealTimers());
it('selects Ollama explicitly without requiring cloud keys or downloading a model', () => {
  const settings = envSchema.parse({ AI_PROVIDER: 'ollama', OLLAMA_MODEL: 'qwen2.5-coder:7b' });
  expect(configureAI(settings).provider?.name).toBe('Ollama');
  expect(configureAI({ ...settings, OLLAMA_MODEL: '' }).provider).toBeUndefined();
  expect(configureAI({ ...settings, AI_PROVIDER: 'openai' }).provider).toBeUndefined();
  expect(settings.JUDGE0_SECURITY_CONFIRMED).toBe(false); expect(settings.CODING_DEMO_MODE).toBe(false);
});
it.each(['http://untrusted.example', 'http://127.0.0.1:11434/private', 'https://user:password@example.test', 'https://example.test/?key=secret'])('rejects an unsafe operator endpoint: %s', url => {
  expect(envSchema.safeParse({ OLLAMA_BASE_URL: url }).success).toBe(false);
  expect(() => new OllamaAIService(url, 'model:tag')).toThrow();
});
it('checks the exact installed model and does not silently choose a different tag', async () => {
  const transport = vi.fn().mockResolvedValue(Response.json({ models: [{ name: 'model:other' }] }));
  const p = new OllamaAIService('http://127.0.0.1:11434', 'model:tag', transport);
  expect((await p.availability()).available).toBe(false);
  transport.mockResolvedValueOnce(Response.json({ models: [{ name: 'model:tag' }] }));
  expect((await p.availability()).available).toBe(true);
  expect(transport.mock.calls[0][0]).toContain('/api/tags'); expect(transport).toHaveBeenCalledTimes(2);
});
it('shows helpful offline setup instructions without raw provider details', async () => {
  const p = new OllamaAIService('http://127.0.0.1:11434', 'model:tag', vi.fn().mockRejectedValue(new Error('SECRET')));
  const status = await p.availability(); expect(status.available).toBe(false); expect(status.message).toContain('ollama serve'); expect(status.message).not.toContain('SECRET');
  await expect(p.question(geminiSetup, [])).rejects.toMatchObject({ code: 'OLLAMA_UNAVAILABLE' });
});
it.each(['python', 'java', 'cpp', 'javascript'] as const)('uses structured coding guidance for %s, never execution or grading', async language => {
  const transport = vi.fn().mockResolvedValue(result({ explanation: 'Read the input carefully.', nextSteps: [] }));
  const p = new OllamaAIService('http://127.0.0.1:11434', 'model:tag', transport);
  expect((await p.codingMentor({ ...context(), language })).explanation).toContain('Read');
  const body = JSON.parse(transport.mock.calls[0][1].body); expect(body.model).toBe('model:tag'); expect(body.stream).toBe(false); expect(body.format.additionalProperties).toBe(false);
  expect(body.options.num_predict).toBe(1800); expect(body.messages[0].content).toContain('Never claim code was executed');
  expect(JSON.parse(body.messages[1].content)).toMatchObject({ language, hintLevel: 1, allowSolution: false });
  expect(transport.mock.calls[0][1].redirect).toBe('error');
});
it('generates answer-based questions and structured scorecard feedback', async () => {
  const transport = vi.fn().mockResolvedValueOnce(result({ question: 'Explain how you tested the component fallback.' })).mockResolvedValueOnce(result(geminiFeedback()));
  const p = new OllamaAIService('http://127.0.0.1:11434', 'model:tag', transport);
  const messages = [{ role: 'interviewer' as const, text: 'Describe your project.', at: new Date() }, { role: 'student' as const, text: geminiAnswer, at: new Date() }];
  expect(await p.question(geminiSetup, messages)).toContain('tested'); expect(await p.feedback(geminiSetup, messages)).toEqual(geminiFeedback());
  expect(transport.mock.calls[0][1].body).toContain(geminiAnswer); expect(transport.mock.calls[1][1].body).toContain('answeredQuestions');
});
it.each([
  { done: false, message: { role: 'assistant', content: '{}' } },
  { done: true, done_reason: 'length', message: { role: 'assistant', content: '{}' } },
  { done: true, message: { role: 'assistant', content: 'not JSON' } },
  { done: true, message: { role: 'assistant', content: '{"explanation":"test","nextSteps":[],"verdict":"Accepted"}' } },
  { done: true, error: 'SECRET', message: { role: 'assistant', content: '{}' } },
])('rejects invalid or fabricated grading responses without fallback', async value => {
  const transport = vi.fn().mockResolvedValue(Response.json(value)); const p = new OllamaAIService('http://127.0.0.1:11434', 'model:tag', transport);
  await expect(p.codingMentor(context())).rejects.toMatchObject({ status: 503 }); expect(transport).toHaveBeenCalledTimes(1);
});
it.each([404, 429, 500])('handles provider HTTP %s safely without retries', async status => {
  const transport = vi.fn().mockResolvedValue(new Response('SECRET', { status }));
  await expect(new OllamaAIService('http://127.0.0.1:11434', 'model:tag', transport).codingMentor(context())).rejects.toMatchObject({ code: 'OLLAMA_UNAVAILABLE' }); expect(transport).toHaveBeenCalledTimes(1);
});
it('enforces a deadline and releases the concurrency slot after timeout', async () => {
  vi.useFakeTimers();
  const timeout = vi.spyOn(AbortSignal, 'timeout').mockImplementation(ms => { const c = new AbortController(); setTimeout(() => c.abort(), ms); return c.signal; });
  try {
    const transport = vi.fn((_url: unknown, options?: RequestInit) => new Promise<Response>((_resolve, reject) => options!.signal!.addEventListener('abort', () => reject(new Error('SECRET')), { once: true })));
    const p = new OllamaAIService('http://127.0.0.1:11434', 'model:tag', transport);
    const promise = p.codingMentor(context()); const assertion = expect(promise).rejects.toMatchObject({ code: 'AI_TIMEOUT' });
    await vi.advanceTimersByTimeAsync(ollamaLimits.timeoutMs); await assertion;
    transport.mockResolvedValueOnce(result({ explanation: 'Try again', nextSteps: [] }));
    expect((await p.codingMentor(context())).explanation).toBe('Try again');
  } finally { timeout.mockRestore(); }
});
it('rejects simultaneous local inference and caps oversized responses', async () => {
  let resolve!: (response: Response) => void; const transport = vi.fn().mockImplementationOnce(() => new Promise<Response>(r => { resolve = r; }));
  const p = new OllamaAIService('http://127.0.0.1:11434', 'model:tag', transport); const first = p.codingMentor(context());
  await expect(p.codingMentor(context())).rejects.toMatchObject({ code: 'AI_LIMITED' }); resolve(result({ explanation: 'Hint', nextSteps: [] })); await first;
  transport.mockResolvedValueOnce(new Response('x'.repeat(100001))); await expect(p.codingMentor(context())).rejects.toMatchObject({ code: 'AI_INVALID_RESPONSE' });
});
it('streams real provider chunks and requires a completion record', async () => {
  const transport = vi.fn().mockResolvedValue(new Response('{"done":false,"message":{"role":"assistant","content":"First "}}\n{"done":true,"message":{"role":"assistant","content":"hint"}}\n'));
  const p = new OllamaAIService('http://127.0.0.1:11434', 'model:tag', transport); const chunks: string[] = [];
  for await (const chunk of p.codingMentorStream(context(), new AbortController().signal)) chunks.push(chunk);
  expect(chunks).toEqual(['First ', 'hint']); expect(JSON.parse(transport.mock.calls[0][1].body).stream).toBe(true);
  transport.mockResolvedValueOnce(new Response('{"done":false,"message":{"role":"assistant","content":"Partial"}}\n'));
  await expect(async () => { for await (const _ of p.codingMentorStream(context(), new AbortController().signal)) { /* consume */ } }).rejects.toMatchObject({ code: 'AI_INVALID_RESPONSE' });
});
it('keeps local code execution disabled in every environment and preserves cloud gates', () => {
  for (const NODE_ENV of ['development', 'test', 'production']) {
    const values = { NODE_ENV, CLIENT_ORIGIN: 'https://frontend.example.test', MONGODB_URI: 'mongodb://localhost/test' };
    expect(envSchema.parse(values).LOCAL_CODE_EXECUTION_ENABLED).toBe('false');
    expect(envSchema.safeParse({ ...values, LOCAL_CODE_EXECUTION_ENABLED: 'true' }).success).toBe(false);
    expect(envSchema.parse(values).JUDGE0_SECURITY_CONFIRMED).toBe(false);
  }
});
