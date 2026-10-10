import type { RequestHandler } from 'express';
import type { InterviewProvider } from '../services/interviewProvider.js';
import { ownedResume } from './resumes.js';
import { resumeContentSchema } from '../validators/resume.js';
import { prepareResumeSuggestions, resumeSuggestionRequest, resumeSuggestionsSchema } from '../validators/resumeSuggestions.js';
import { AppError } from '../utils/AppError.js';

export function resumeSuggestionController(provider?: InterviewProvider): RequestHandler {
  return async (req, res) => {
    const input = resumeSuggestionRequest.parse(req.body); // Consent required for every request.
    const resume = await ownedResume(req.params.id, req.user!.id as string);
    if (!provider?.resumeSuggestions)
      throw new AppError(503, 'AI_SETUP_REQUIRED', 'Qualitative resume suggestions require a configured Gemini provider. The ATS heuristic remains available.');
    const prepared = prepareResumeSuggestions(resumeContentSchema.parse(resume.content), input.jobDescription);
    const raw = await provider.resumeSuggestions(prepared);
    const result = resumeSuggestionsSchema.safeParse(raw);
    if (!result.success) throw new AppError(503, 'AI_UNAVAILABLE', 'The AI service returned invalid suggestions. No resume changes were made. Please try again later.');
    res.json({ success: true, data: { suggestions: result.data.suggestions, provider: provider.name,
      resumeVersion: resume.version,
      disclaimer: 'AI-generated qualitative suggestions, not an ATS score or hiring decision. Review every suggestion for accuracy. No changes were made to your resume.',
    } });
  };
}
