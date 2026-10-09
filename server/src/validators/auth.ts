import { z } from 'zod';

export const emailSchema = z.string().trim().toLowerCase().email().max(254);
export const passwordSchema = z.string().min(12, 'Use at least 12 characters.').max(128, 'Use at most 128 characters.')
  .regex(/[a-z]/, 'Include a lowercase letter.').regex(/[A-Z]/, 'Include an uppercase letter.').regex(/[0-9]/, 'Include a number.');
export const registrationSchema = z.object({
  name: z.string().trim().min(2).max(80), email: emailSchema, password: passwordSchema,
  department: z.string().trim().min(2).max(100), semester: z.number().int().min(1).max(12)
}).strict();
export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(128) }).strict();
export const provisioningSchema = z.object({ name: z.string().trim().min(2).max(80), email: emailSchema, password: passwordSchema, role: z.enum(['trainer', 'admin']) });
