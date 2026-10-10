import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true });

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  CODING_DEMO_MODE: z.enum(['true', 'false']).default('false').transform(v => v === 'true'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  CLIENT_ORIGIN: z.string().url().default('http://localhost:5173'),
  TRUST_PROXY: z.enum(['true', 'false']).default('false').transform(value => value === 'true'),
  OPENAI_API_KEY: z.preprocess(value => typeof value === 'string' && !value.trim() ? undefined : value, z.string().trim().min(1).optional()),
  JUDGE0_URL: z.preprocess(v => v === '' ? undefined : v, z.string().url().refine(v => { const u = new URL(v); return !u.username && !u.password && !u.search && !u.hash && (u.protocol === 'https:' || (u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname))); }, 'Use HTTPS, or loopback HTTP for local provider testing, without embedded credentials.').optional()),
  JUDGE0_API_KEY: z.string().optional(),
  JUDGE0_SECURITY_CONFIRMED: z.enum(['true', 'false']).default('false').transform(v => v === 'true'),
  OPENAI_MODEL: z.string().trim().min(1).max(100).default('gpt-4.1-mini'),
  MONGODB_URI: z.preprocess(value => value === '' ? undefined : value, z.string().regex(/^mongodb(?:\+srv)?:\/\//, 'Use a MongoDB connection URI').optional())
}).superRefine((value, ctx) => {
  if (value.NODE_ENV === 'production' && !value.MONGODB_URI) ctx.addIssue({ code: 'custom', path: ['MONGODB_URI'], message: 'Required in production' });
}).transform(value => ({ ...value, CODING_DEMO_MODE: value.CODING_DEMO_MODE && value.NODE_ENV === 'development' }));

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  // Report field names only: configuration values may contain credentials.
  throw new Error(`Invalid environment configuration: ${parsed.error.issues.map(issue => issue.path.join('.')).join(', ')}`);
}
export const env = parsed.data;
