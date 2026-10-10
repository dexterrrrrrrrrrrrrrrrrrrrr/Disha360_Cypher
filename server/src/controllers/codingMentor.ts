import type { RequestHandler } from 'express';
import type { InterviewProvider } from '../services/interviewProvider.js';
import { CodingProblem } from '../models/CodingProblem.js';
import { mentorRequest, mentorResponseSchema } from '../validators/codingMentor.js';
import { AppError } from '../utils/AppError.js';
export function codingMentorControllers(provider?: InterviewProvider) {
  const config: RequestHandler = async (_req, res) => { const status = provider?.availability ? await provider.availability() : undefined; res.json({ success: true, data: { configured: !!provider?.codingMentor && status?.available !== false, provider: provider?.name ?? null, streaming: !!provider?.codingMentorStream, model: status?.model, message: status?.message ?? (provider?.codingMentor ? 'Backend provider configured; live availability is not verified.' : 'Configure AI_PROVIDER=ollama, start ollama serve and select an installed OLLAMA_MODEL. See docs/LOCAL_DEVELOPMENT.md.') } }); };
  const context = async (req: Parameters<RequestHandler>[0]) => {
    const { problemId, ...input } = mentorRequest.parse(req.body);
    let problem = null;
    if (problemId) {
      // Explicit public-field projection. Hidden tests never enter mentor prompts.
      const p = await CodingProblem.findOne({ _id: problemId, published: true, ...(!req.app.locals.allowDemoAccounts ? { demo: false } : {}) }).select('title statement inputFormat outputFormat constraints supportedLanguages');
      if (!p) throw new AppError(404, 'NOT_FOUND', 'Coding problem not found.');
      if (!p.supportedLanguages.includes(input.language)) throw new AppError(400, 'UNSUPPORTED_LANGUAGE', 'This problem does not support the selected language.');
      problem = { title: p.title, statement: p.statement, inputFormat: p.inputFormat, outputFormat: p.outputFormat, constraints: p.constraints };
    }
    if (!provider?.codingMentor) throw new AppError(503, 'AI_SETUP_REQUIRED', 'The coding mentor requires a configured backend AI provider. Editing and deterministic judging are independent of AI.');
    return { ...input, problem };
  };
  const generate: RequestHandler = async (req, res) => {
    const input = await context(req);
    const advice = mentorResponseSchema.parse(await provider!.codingMentor!(input));
    res.json({ success: true, data: { ...advice, provider: provider!.name, disclaimer: 'AI-generated advice. It was not executed or verified and does not determine submission pass/fail.' } });
  };
  const stream: RequestHandler = async (req, res) => {
    const input = await context(req);
    if (!provider?.codingMentorStream) throw new AppError(409, 'STREAMING_UNAVAILABLE', 'This provider supports validated responses through the standard mentor action.');
    const controller = new AbortController();
    const closed = () => controller.abort(); res.once('close', closed);
    try {
      const iterator = provider.codingMentorStream(input, controller.signal)[Symbol.asyncIterator]();
      const first = await iterator.next(); // Early provider failures keep the normal safe JSON error contract.
      res.status(200).set({ 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no', 'X-Content-Type-Options': 'nosniff' });
      const write = async (data: unknown) => { if (controller.signal.aborted) throw new Error('Disconnected'); if (!res.write(JSON.stringify(data) + '\n')) await new Promise<void>((resolve, reject) => { const stop = () => { cleanup(); reject(new Error('Disconnected')); }; const drain = () => { cleanup(); resolve(); }; const cleanup = () => { res.off('drain', drain); controller.signal.removeEventListener('abort', stop); }; res.once('drain', drain); controller.signal.addEventListener('abort', stop, { once: true }); }); };
      try {
        if (!first.done) await write({ type: 'chunk', text: first.value });
        while (!first.done) { const part = await iterator.next(); if (part.done) break; await write({ type: 'chunk', text: part.value }); }
        await write({ type: 'done', provider: provider.name });
      } catch { if (!controller.signal.aborted) res.write(JSON.stringify({ type: 'error', message: 'The AI response was interrupted or invalid. Partial guidance is incomplete and unverified; please retry.' }) + '\n'); }
      finally { await iterator.return?.(); res.end(); }
    } finally { controller.abort(); res.off('close', closed); }
  };
  return { config, generate, stream };
}
