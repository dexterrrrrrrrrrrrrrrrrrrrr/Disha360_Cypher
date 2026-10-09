import { z } from 'zod';
export const interviewSetupSchema = z.object({ type: z.enum(['technical', 'behavioral', 'hr']), difficulty: z.enum(['beginner', 'intermediate', 'advanced']), targetRole: z.string().trim().min(2).max(100), focus: z.string().trim().max(300).default(''), questionLimit: z.number().int().min(3).max(10).default(5) }).strict();
export const answerSchema = z.object({ answer: z.string().trim().min(1).max(5000), version: z.number().int().min(1) }).strict();
export const completeSchema = z.object({ version: z.number().int().min(1) }).strict();
export type InterviewSetup = z.infer<typeof interviewSetupSchema>;
export interface InterviewMessage { role: 'interviewer' | 'student'; text: string; at: Date }
