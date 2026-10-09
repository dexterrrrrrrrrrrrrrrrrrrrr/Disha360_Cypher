import { createServer, type Server } from 'node:http';
import { afterEach, it, expect } from 'vitest';
import OpenAI from 'openai';
import { OpenAIInterviewProvider } from '../src/services/interviewProvider.js';
const setup = { type: 'technical' as const, difficulty: 'beginner' as const, targetRole: 'Software engineer', focus: 'React', questionLimit: 3 };
let server: Server | undefined;
afterEach(async () => { if (server) await new Promise<void>(resolve => { server!.close(() => resolve()); }); server = undefined; });
async function endpoint(status: number, body: unknown, inspect?: (data: Record<string, unknown>, path?: string) => void) {
  server = createServer(async (req, res) => { let raw = ''; for await (const chunk of req) raw += String(chunk); inspect?.(JSON.parse(raw), req.url); res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); });
  await new Promise<void>(r => server!.listen(0, '127.0.0.1', r)); const address = server.address(); if (!address || typeof address === 'string') throw new Error('No test port');
  return new OpenAI({ apiKey: 'explicit-local-test-key', baseURL: `http://127.0.0.1:${address.port}/v1`, maxRetries: 0, timeout: 1000 });
}
function response(text: string) { return { id: 'resp_test', object: 'response', created_at: 0, status: 'completed', error: null, incomplete_details: null, output: [{ id: 'msg_test', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text, annotations: [] }] }] }; }
it('uses the real SDK Responses request contract with structured output and actual history', async () => {
  let request: Record<string, unknown> = {}; let path = '';
  const client = await endpoint(200, response(JSON.stringify({ question: 'What testing approach would you use for that component?' })), (body, url) => { request = body; path = url || ''; });
  const provider = new OpenAIInterviewProvider('unused', 'gpt-4.1-mini', client);
  const answer = await provider.question(setup, [{ role: 'interviewer', text: 'Describe your component.', at: new Date() }, { role: 'student', text: 'It has an error boundary.', at: new Date() }]);
  expect(answer).toContain('testing approach'); expect(path).toBe('/v1/responses'); expect(request.store).toBe(false); expect(request.model).toBe('gpt-4.1-mini');
  expect(JSON.stringify(request.input)).toContain('error boundary'); expect(request.text).toMatchObject({ format: { type: 'json_schema', strict: true } }); expect(request.instructions).toMatch(/untrusted data/);
});
it.each([[401, 'AI_CONFIGURATION_ERROR'], [403, 'AI_CONFIGURATION_ERROR'], [429, 'AI_LIMITED'], [500, 'AI_UNAVAILABLE']] as const)('sanitizes provider errors (%s) without exposing raw details', async (status, code) => {
  const client = await endpoint(status, { error: { message: 'SECRET provider credential value', type: 'invalid_request_error', code: 'invalid_api_key' } });
  let failure: unknown; try { await new OpenAIInterviewProvider('unused', 'model', client).question(setup, []); } catch (error) { failure = error; }
  expect(failure).toMatchObject({ status: 503, code }); expect((failure as Error).message).not.toContain('SECRET');
});
it.each(['invalid-json', 'empty-question', 'refusal', 'incomplete'])('rejects %s responses without simulating a question', async (kind) => {
  const payload = kind === 'invalid-json' ? response('not valid json') : kind === 'empty-question' ? response('{"question":""}') : kind === 'incomplete' ? { ...response('{"question":"A question that should not be accepted?"}'), status: 'incomplete' } : { ...response(''), output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'Cannot comply.' }] }] };
  const client = await endpoint(200, payload);
  await expect(new OpenAIInterviewProvider('unused', 'model', client).question(setup, [])).rejects.toMatchObject({ status: 503, code: 'AI_UNAVAILABLE' });
});
