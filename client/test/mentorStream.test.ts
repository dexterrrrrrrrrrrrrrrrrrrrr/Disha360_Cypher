import { afterEach, expect, it, vi } from 'vitest';
import { streamMentor } from '../src/services/mentorStream';
afterEach(() => vi.unstubAllGlobals());
const response = (text: string) => new Response(text, { headers: { 'Content-Type': 'application/x-ndjson' } });
it('streams only authenticated CSRF-protected backend chunks and requires completion', async () => {
  const transport = vi.fn().mockResolvedValue(response('{"type":"chunk","text":"First "}\n{"type":"chunk","text":"hint"}\n{"type":"done","provider":"Ollama"}\n')); vi.stubGlobal('fetch', transport);
  const chunks: string[] = []; expect(await streamMentor({ action: 'hint' }, new AbortController().signal, t => chunks.push(t))).toBe('First hint'); expect(chunks).toEqual(['First ', 'First hint']);
  expect(transport.mock.calls[0][0]).toContain('/api/v1/student/coding/mentor/stream'); expect(transport.mock.calls[0][1]).toMatchObject({ credentials: 'include', headers: { 'X-Disha360-Request': '1' } });
});
it.each(['{"type":"chunk","text":"partial"}\n', '{"type":"error","message":"SECRET"}\n', '{"type":"unknown"}\n'])('rejects incomplete/error/malformed streams rather than claiming success', async text => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(text)));
  await expect(streamMentor({}, new AbortController().signal, () => {})).rejects.toThrow();
});
it('handles safe backend errors before streaming starts', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: { message: 'Start Ollama.' } }, { status: 503 })));
  await expect(streamMentor({}, new AbortController().signal, () => {})).rejects.toThrow('Start Ollama.');
});
