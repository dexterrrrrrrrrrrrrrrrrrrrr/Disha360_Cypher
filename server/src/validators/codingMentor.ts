import { z } from 'zod';
import { codeInput } from '../features/coding/validation.js';
export const mentorActions = ['explain', 'error', 'hint', 'debug', 'optimize', 'time', 'space', 'approach'] as const;
export const mentorRequest = codeInput.omit({ stdin: true }).extend({
  action: z.enum(mentorActions), hintLevel: z.number().int().min(1).max(3).default(1),
  allowSolution: z.boolean().default(false), problemId: z.string().regex(/^[a-f0-9]{24}$/).optional(),
  error: z.string().max(4000).default(''),
}).strict();
export const mentorContextSchema = mentorRequest.omit({ problemId: true }).extend({
  problem: z.object({ title: z.string().max(150), statement: z.string().max(10000), inputFormat: z.string().max(2000), outputFormat: z.string().max(2000), constraints: z.string().max(2000) }).strict().nullable(),
}).strict();
export type MentorContext = z.infer<typeof mentorContextSchema>;
export const mentorResponseSchema = z.object({ explanation: z.string().trim().min(1).max(8000), nextSteps: z.array(z.string().trim().min(1).max(600)).max(5) }).strict();
export type MentorResponse = z.infer<typeof mentorResponseSchema>;
export const mentorJsonSchema = { type: 'object', properties: { explanation: { type: 'string' }, nextSteps: { type: 'array', maxItems: 5, items: { type: 'string' } } }, required: ['explanation', 'nextSteps'], additionalProperties: false };
