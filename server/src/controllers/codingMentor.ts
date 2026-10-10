import type { RequestHandler } from 'express';
import type { InterviewProvider } from '../services/interviewProvider.js';
import { CodingProblem } from '../models/CodingProblem.js';
import { mentorRequest, mentorResponseSchema } from '../validators/codingMentor.js';
import { AppError } from '../utils/AppError.js';
export function codingMentorControllers(provider?: InterviewProvider) {
  const config: RequestHandler = (_req, res) => res.json({ success: true, data: { configured: !!provider?.codingMentor, provider: provider?.codingMentor ? provider.name : null } });
  const generate: RequestHandler = async (req, res) => {
    const { problemId, ...input } = mentorRequest.parse(req.body);
    let problem = null;
    if (problemId) {
      // Explicit public-field projection. Hidden tests never enter mentor prompts.
      const p = await CodingProblem.findOne({ _id: problemId, published: true, ...(!req.app.locals.allowDemoAccounts ? { demo: false } : {}) }).select('title statement inputFormat outputFormat constraints supportedLanguages');
      if (!p) throw new AppError(404, 'NOT_FOUND', 'Coding problem not found.');
      if (!p.supportedLanguages.includes(input.language)) throw new AppError(400, 'UNSUPPORTED_LANGUAGE', 'This problem does not support the selected language.');
      problem = { title: p.title, statement: p.statement, inputFormat: p.inputFormat, outputFormat: p.outputFormat, constraints: p.constraints };
    }
    if (!provider?.codingMentor) throw new AppError(503, 'AI_SETUP_REQUIRED', 'The coding mentor requires the configured backend Gemini provider. Editing and deterministic judging are independent of AI.');
    const advice = mentorResponseSchema.parse(await provider.codingMentor({ ...input, problem }));
    res.json({ success: true, data: { ...advice, provider: provider.name, disclaimer: 'AI-generated advice. It was not executed or verified and does not determine submission pass/fail.' } });
  };
  return { config, generate };
}
