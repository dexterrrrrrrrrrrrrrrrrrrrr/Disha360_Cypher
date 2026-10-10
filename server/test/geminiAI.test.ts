import { it, expect, vi, afterEach } from 'vitest';
import { ApiError, GoogleGenAI, FinishReason } from '@google/genai';
import { createServer } from 'node:http';
import { GeminiAIService, geminiLimits, AI_UNAVAILABLE_MESSAGE } from '../src/services/geminiAI.js';
import { configureAI, type AISettings } from '../src/services/aiProvider.js';
import { envSchema } from '../src/config/env.js';
import { geminiResponse, geminiSetup, geminiFeedback, geminiAnswer, geminiSuggestion } from './helpers/gemini.js';
import { prepareResumeSuggestions } from '../src/validators/resumeSuggestions.js';
import { resumeFixture } from './helpers/resume.js';
afterEach(() => vi.useRealTimers());
const settings: AISettings = { AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'fixture-primary', GEMINI_API_KEY_BACKUP: 'fixture-backup', GEMINI_KEY_SELECTION: 'primary', GEMINI_MODEL: 'gemini-test', OPENAI_MODEL: 'fixture-model' };
function mockService() {
  const generateContent = vi.fn().mockResolvedValue(geminiResponse({ question: 'How would you test that component?' }));
  const create = vi.fn(() => ({ generateContent }));
  return { ai: new GeminiAIService({ primaryKey: 'fixture-primary', backupKey: 'fixture-backup', model: 'gemini-test' }, create), generateContent, create };
}
it('selects Gemini and primary by default, keeping the model explicit and Judge0 safety unchanged', () => {
  const parsed = envSchema.parse({});
  expect(parsed).toMatchObject({ AI_PROVIDER: 'gemini', GEMINI_KEY_SELECTION: 'primary', GEMINI_MODEL: '', JUDGE0_SECURITY_CONFIRMED: false, CODING_DEMO_MODE: false });
  expect(configureAI(parsed).provider).toBeUndefined();
});
it.each(['primary', 'backup'] as const)('creates exactly one SDK client using the selected %s credential', selection => {
  const create = vi.fn(() => ({ generateContent: vi.fn() }));
  const result = configureAI({ ...settings, GEMINI_KEY_SELECTION: selection }, create);
  expect(result.provider?.name).toBe('Google Gemini');
  expect(create).toHaveBeenCalledTimes(1);
  expect(create.mock.calls[0]).toEqual([{ apiKey: selection === 'primary' ? 'fixture-primary' : 'fixture-backup', enterprise: false, vertexai: false, httpOptions: { timeout: 45000, retryOptions: { attempts: 1 } } }]);
});
it.each(['primary', 'backup'] as const)('does not fall back if selected %s key is missing', selection => {
  const create = vi.fn();
  const result = configureAI({ ...settings, GEMINI_KEY_SELECTION: selection, ...(selection === 'primary' ? { GEMINI_API_KEY: '' } : { GEMINI_API_KEY_BACKUP: '' }) }, create);
  expect(result.provider).toBeUndefined(); expect(result.setupMessage).toContain('selected Gemini credential is missing'); expect(create).not.toHaveBeenCalled();
});
it('requires an explicit model and preserves the OpenAI alternative only when selected', () => {
  expect(configureAI({ ...settings, GEMINI_MODEL: '' }).provider).toBeUndefined();
  expect(configureAI({ ...settings, GEMINI_MODEL: 'paid-fallback' }).provider).toBeUndefined();
  expect(configureAI({ ...settings, AI_PROVIDER: 'openai', OPENAI_API_KEY: 'fixture-openai' }).provider?.name).toBe('OpenAI Responses API');
  expect(configureAI({ ...settings, AI_PROVIDER: 'openai' }).provider).toBeUndefined();
  expect(envSchema.safeParse({ AI_PROVIDER: 'automatic' }).success).toBe(false);
  expect(envSchema.safeParse({ GEMINI_KEY_SELECTION: 'automatic' }).success).toBe(false);
});
it('sends validated setup and actual prior answers with bounded JSON generation', async () => {
  const { ai, generateContent } = mockService();
  expect(await ai.question(geminiSetup, [{ role: 'student', text: geminiAnswer, at: new Date() }])).toContain('test');
  expect(generateContent.mock.calls[0][0]).toMatchObject({ model: 'gemini-test', config: { maxOutputTokens: 600, responseMimeType: 'application/json', responseJsonSchema: { type: 'object' }, httpOptions: { retryOptions: { attempts: 1 } } } });
  expect(generateContent.mock.calls[0][0].contents).toContain(geminiAnswer);
  expect(generateContent.mock.calls[0][0].config.systemInstruction).toContain('untrusted data');
  expect(generateContent.mock.calls[0][0].config.tools).toBeUndefined();
});
it.each([[400, 'AI_CONFIGURATION_ERROR'], [401, 'AI_CONFIGURATION_ERROR'], [403, 'AI_CONFIGURATION_ERROR'], [404, 'AI_CONFIGURATION_ERROR'], [429, 'AI_LIMITED'], [503, 'AI_UNAVAILABLE']] as const)('sanitizes status %s without retrying or switching credential', async (status, code) => {
  const { ai, generateContent, create } = mockService();
  generateContent.mockRejectedValue(new ApiError({ status, message: 'PRIVATE KEY AND STUDENT CONTENT' }));
  await expect(ai.question(geminiSetup, [])).rejects.toMatchObject({ code, status: 503 });
  try { await ai.question(geminiSetup, []); } catch (e) { expect((e as Error).message).not.toContain('PRIVATE'); }
  expect(create).toHaveBeenCalledTimes(1); expect(generateContent).toHaveBeenCalledTimes(2);
});
it.each(['invalid-json', 'incomplete', 'blocked', 'invalid-schema', 'empty', 'oversize'])('rejects %s provider output without fabricated results', async kind => {
  const { ai, generateContent } = mockService();
  const result = geminiResponse({ question: 'Valid question that should be rejected?' });
  if (kind === 'invalid-json') result.candidates![0].content!.parts![0].text = 'not-json';
  if (kind === 'incomplete') result.candidates![0].finishReason = FinishReason.MAX_TOKENS;
  if (kind === 'blocked') result.candidates![0].finishReason = FinishReason.SAFETY;
  if (kind === 'invalid-schema') result.candidates![0].content!.parts![0].text = '{"score":100}';
  if (kind === 'empty') result.candidates![0].content!.parts = [];
  if (kind === 'oversize') result.candidates![0].content!.parts![0].text = 'x'.repeat(100001);
  generateContent.mockResolvedValue(result);
  await expect(ai.question(geminiSetup, [])).rejects.toMatchObject({ code: 'AI_UNAVAILABLE' });
});
it('bounds input and validates interview inputs before requesting generation', async () => {
  const { ai, generateContent } = mockService();
  await expect(ai.question({ ...geminiSetup, focus: 'x'.repeat(301) }, [])).rejects.toThrow();
  const prepared = prepareResumeSuggestions(resumeFixture().content, 'React developer requirements '.repeat(3));
  prepared.jobDescription = 'x'.repeat(geminiLimits.inputBytes); // Valid field, but JSON envelope exceeds the shared limit.
  await expect(ai.resumeSuggestions(prepared)).rejects.toMatchObject({ code: 'AI_INPUT_TOO_LARGE' });
  expect(generateContent).not.toHaveBeenCalled();
});
it('times out and aborts exactly one request without retries or failover', async () => {
  vi.useFakeTimers();
  const { ai, generateContent, create } = mockService();
  generateContent.mockImplementation(() => new Promise(() => {}));
  const rejected = expect(ai.question(geminiSetup, [])).rejects.toMatchObject({ code: 'AI_TIMEOUT', message: AI_UNAVAILABLE_MESSAGE });
  await vi.advanceTimersByTimeAsync(geminiLimits.timeoutMs); await rejected;
  expect(generateContent.mock.calls[0][0].config.abortSignal.aborted).toBe(true);
  expect(generateContent).toHaveBeenCalledTimes(1); expect(create).toHaveBeenCalledTimes(1);
});
it('applies shared rate limits across questions, feedback and resume suggestions', async () => {
  const { ai, generateContent } = mockService();
  for (let i = 0; i < geminiLimits.requestsPerMinute; i++) await ai.question(geminiSetup, []);
  await expect(ai.feedback(geminiSetup, [{ role: 'interviewer', text: 'Explain your project.', at: new Date() }, { role: 'student', text: geminiAnswer, at: new Date() }])).rejects.toMatchObject({ code: 'AI_LIMITED' });
  await expect(ai.resumeSuggestions(prepareResumeSuggestions(resumeFixture().content, 'x'.repeat(60)))).rejects.toMatchObject({ code: 'AI_LIMITED' });
  expect(generateContent).toHaveBeenCalledTimes(10);
});
it('uses the existing feedback schema and actual answered pairs', async () => {
  const { ai, generateContent } = mockService(); generateContent.mockResolvedValue(geminiResponse(geminiFeedback()));
  expect(await ai.feedback(geminiSetup, [{ role: 'interviewer', text: 'Explain your project.', at: new Date() }, { role: 'student', text: geminiAnswer, at: new Date() }])).toEqual(geminiFeedback());
  expect(generateContent.mock.calls[0][0].contents).toContain(geminiAnswer);
  expect(generateContent.mock.calls[0][0].config.maxOutputTokens).toBe(6000);
});
it('returns qualitative suggestions without numerical ATS scores', async () => {
  const { ai, generateContent } = mockService(); generateContent.mockResolvedValue(geminiResponse(geminiSuggestion));
  expect(await ai.resumeSuggestions(prepareResumeSuggestions(resumeFixture().content, 'x'.repeat(60)))).toEqual(geminiSuggestion);
  generateContent.mockResolvedValue(geminiResponse({ ...geminiSuggestion, score: 100 }));
  await expect(ai.resumeSuggestions(prepareResumeSuggestions(resumeFixture().content, 'x'.repeat(60)))).rejects.toMatchObject({ code: 'AI_UNAVAILABLE' });
});
it('verifies the maintained SDK request contract over local HTTP, including no 429 retries', async () => {
  let calls = 0;
  const server = createServer(async (req, res) => {
    calls++; let body = ''; for await (const chunk of req) body += chunk;
    const data = JSON.parse(body);
    expect(req.url).toContain('models/gemini-test:generateContent');
    expect(req.headers['x-goog-api-key']).toBe('fixture-key');
    expect(data.generationConfig.responseMimeType).toBe('application/json');
    expect(data.generationConfig.responseJsonSchema.type).toBe('object');
    res.writeHead(429, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: { code: 429, message: 'fixture quota exhausted' } }));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('No local port');
    const ai = new GeminiAIService({ primaryKey: 'fixture-key', model: 'gemini-test' }, options => new GoogleGenAI({ ...options, httpOptions: { ...options.httpOptions, baseUrl: `http://127.0.0.1:${address.port}` } }).models);
    await expect(ai.question(geminiSetup, [])).rejects.toMatchObject({ code: 'AI_LIMITED' }); expect(calls).toBe(1);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
it('bounds concurrent requests across all Gemini operations without an extra upstream call', async () => {
  const { ai, generateContent } = mockService();
  let release!: (value: ReturnType<typeof geminiResponse>) => void;
  const pending = new Promise<ReturnType<typeof geminiResponse>>(resolve => { release = resolve; });
  generateContent.mockReturnValue(pending);
  const first = ai.question(geminiSetup, []); const second = ai.question(geminiSetup, []);
  await expect(ai.resumeSuggestions(prepareResumeSuggestions(resumeFixture().content, 'x'.repeat(60)))).rejects.toMatchObject({ code: 'AI_LIMITED' });
  expect(generateContent).toHaveBeenCalledTimes(2);
  release(geminiResponse({ question: 'What design trade-off would you explain?' }));
  await Promise.all([first, second]);
});

it('rejects unexpected private resume fields at the shared service boundary', async () => {
  const { ai, generateContent } = mockService();
  const input = prepareResumeSuggestions(resumeFixture().content, 'x'.repeat(60));
  await expect(ai.resumeSuggestions({ ...input, privateKey: 'fixture' } as typeof input)).rejects.toThrow();
  expect(generateContent).not.toHaveBeenCalled();
});
