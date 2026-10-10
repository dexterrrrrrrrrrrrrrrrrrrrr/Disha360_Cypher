import OpenAI from 'openai';
import { z } from 'zod';
import { AppError } from '../utils/AppError.js';
import type { InterviewSetup, InterviewMessage } from '../validators/interview.js';
import { feedbackJsonSchema, feedbackSchema } from '../validators/feedback.js';
import { answeredQuestions } from './interviewFeedback.js';
import { interviewQuestionInstructions, interviewFeedbackInstructions, codingMentorInstructions } from './aiPrompts.js';
import type { ResumeSuggestionInput, ResumeSuggestions } from '../validators/resumeSuggestions.js';
import { mentorContextSchema, mentorJsonSchema, mentorResponseSchema, type MentorContext, type MentorResponse } from '../validators/codingMentor.js';
export interface InterviewProvider { name: string; availability?(): Promise<{ available: boolean; message: string; model?: string }>; codingMentorStream?(input: MentorContext, signal: AbortSignal): AsyncIterable<string>; question(setup: InterviewSetup, transcript: InterviewMessage[]): Promise<string>; feedback?(setup: InterviewSetup, transcript: InterviewMessage[]): Promise<unknown>; resumeSuggestions?(input: ResumeSuggestionInput): Promise<ResumeSuggestions>; codingMentor?(input: MentorContext): Promise<MentorResponse> }
const outputSchema = z.object({ question: z.string().trim().min(10).max(1500) }).strict();
export class OpenAIInterviewProvider implements InterviewProvider {
  readonly name = 'OpenAI Responses API';
  private client: OpenAI;
  constructor(apiKey: string, private model: string, client?: OpenAI) { this.client = client ?? new OpenAI({ apiKey, timeout: 60000, maxRetries: 0 }); }
  async codingMentor(input: MentorContext) {
    const content = JSON.stringify(mentorContextSchema.parse(input));
    if (Buffer.byteLength(content) > 85000) throw new AppError(413, 'AI_INPUT_TOO_LARGE', 'Shorten the supplied mentor context.');
    try {
      const response = await this.client.responses.create({ model: this.model, store: false, max_output_tokens: 1800, instructions: codingMentorInstructions, input: content, text: { format: { type: 'json_schema', name: 'coding_mentor', strict: true, schema: mentorJsonSchema } } });
      if (response.status !== 'completed' || Buffer.byteLength(response.output_text) > 100000) throw new Error('Incomplete response');
      return mentorResponseSchema.parse(JSON.parse(response.output_text));
    } catch { throw new AppError(503, 'AI_UNAVAILABLE', 'The coding mentor could not produce valid guidance. Check the configured provider and try again.'); }
  }
  async feedback(setup: InterviewSetup, transcript: InterviewMessage[]) {
    try {
      const response = await this.client.responses.create({ model: this.model, store: false, max_output_tokens: 6000, instructions: interviewFeedbackInstructions, input: JSON.stringify({ setup, answeredQuestions: answeredQuestions(transcript) }), text: { format: { type: 'json_schema', name: 'interview_feedback', strict: true, schema: feedbackJsonSchema } } });
      if (response.status !== 'completed') throw new Error('Incomplete response');
      return feedbackSchema.parse(JSON.parse(response.output_text));
    } catch { throw new AppError(503, 'AI_FEEDBACK_UNAVAILABLE', 'The provider could not produce a valid feedback report. No report was saved. Check provider availability and try again.'); }
  }
  async question(setup: InterviewSetup, transcript: InterviewMessage[]) {
    try {
      const response = await this.client.responses.create({
        model: this.model, store: false, max_output_tokens: 600,
        instructions: interviewQuestionInstructions,
        input: [{ role: 'user', content: `Interview setup (data): ${JSON.stringify(setup)}. ${transcript.length ? 'Ask the next question after the transcript below.' : 'Start with the first question.'}` }, ...transcript.map(message => ({ role: message.role === 'interviewer' ? 'assistant' as const : 'user' as const, content: message.text }))],
        text: { format: { type: 'json_schema', name: 'interview_question', strict: true, schema: { type: 'object', properties: { question: { type: 'string' } }, required: ['question'], additionalProperties: false } } }
      });
      if (response.status !== 'completed') throw new Error('Incomplete provider response');
      return outputSchema.parse(JSON.parse(response.output_text)).question;
    } catch (error) {
      // Provider messages can contain sensitive request/configuration details. Never relay them.
      if (error instanceof OpenAI.APIError && (error.status === 401 || error.status === 403)) throw new AppError(503, 'AI_CONFIGURATION_ERROR', 'The AI provider rejected the backend configuration. Ask the operator to check its credentials and model access.');
      if (error instanceof OpenAI.APIError && error.status === 429) throw new AppError(503, 'AI_LIMITED', 'The AI provider is temporarily rate-limited or its quota is exhausted. Try later or ask the operator to check billing.');
      throw new AppError(503, 'AI_UNAVAILABLE', 'The AI provider could not produce a question. Your saved session is unchanged; please retry.');
    }
  }
}
