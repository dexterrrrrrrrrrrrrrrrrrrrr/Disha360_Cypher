import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true });

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  CLIENT_ORIGIN: z.string().url().default('http://localhost:5173'),
  TRUST_PROXY: z.enum(['true', 'false']).default('false').transform(value => value === 'true'),
  OPENAI_API_KEY: z.preprocess(value => typeof value === 'string' && !value.trim() ? undefined : value, z.string().trim().min(1).optional()),
  OPENAI_MODEL: z.string().trim().min(1).max(100).default('gpt-4.1-mini'),
  MONGODB_URI: z.preprocess(value => value === '' ? undefined : value, z.string().regex(/^mongodb(?:\+srv)?:\/\//, 'Use a MongoDB connection URI').optional())
}).superRefine((value, ctx) => {
  if (value.NODE_ENV === 'production' && !value.MONGODB_URI) ctx.addIssue({ code: 'custom', path: ['MONGODB_URI'], message: 'Required in production' });
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  // Report field names only: configuration values may contain credentials.
  throw new Error(`Invalid environment configuration: ${parsed.error.issues.map(issue => issue.path.join('.')).join(', ')}`);
}
export const env = parsed.data;
