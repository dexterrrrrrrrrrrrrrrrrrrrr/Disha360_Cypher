import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true });

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  ONECOMPILER_ENABLED: z.enum(['true', 'false']).default('false').transform(v => v === 'true'),
  ONECOMPILER_API_KEY: z.string().trim().optional(),
  ONECOMPILER_MAX_EXECUTIONS_PER_DAY: z.coerce.number().int().min(1).max(10000).default(100),
  AI_PROVIDER: z.enum(['gemini', 'openai', 'ollama']).default('gemini'),
  OLLAMA_BASE_URL: z.string().url().default('http://127.0.0.1:11434').refine(value => { const u = new URL(value); return !u.username && !u.password && u.pathname === '/' && !u.search && !u.hash && (u.protocol === 'https:' || (u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname))); }, 'Use a loopback HTTP or trusted HTTPS origin without credentials.'),
  OLLAMA_MODEL: z.string().trim().max(100).default(''),
  LOCAL_CODE_EXECUTION_ENABLED: z.enum(['false']).default('false'),
  GEMINI_API_KEY: z.string().trim().optional(),
  GEMINI_API_KEY_BACKUP: z.string().trim().optional(),
  GEMINI_MODEL: z.string().trim().max(100).default(''),
  GEMINI_KEY_SELECTION: z.enum(['primary', 'backup']).default('primary'),
  CODING_DEMO_MODE: z.enum(['true', 'false']).default('false').transform(v => v === 'true'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  CLIENT_ORIGIN: z.string().url().default('http://localhost:5173'),
  COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  TRUST_PROXY: z.enum(['true', 'false']).default('false').transform(value => value === 'true'),
  OPENAI_API_KEY: z.preprocess(value => typeof value === 'string' && !value.trim() ? undefined : value, z.string().trim().min(1).optional()),
  JUDGE0_URL: z.preprocess(v => v === '' ? undefined : v, z.string().url().refine(v => { const u = new URL(v); return !u.username && !u.password && !u.search && !u.hash && (u.protocol === 'https:' || (u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname))); }, 'Use HTTPS, or loopback HTTP for local provider testing, without embedded credentials.').optional()),
  JUDGE0_API_KEY: z.string().optional(),
  JUDGE0_SECURITY_CONFIRMED: z.enum(['true', 'false']).default('false').transform(v => v === 'true'),
  OPENAI_MODEL: z.string().trim().min(1).max(100).default('gpt-4.1-mini'),
  MONGODB_URI: z.preprocess(value => value === '' ? undefined : value, z.string().regex(/^mongodb(?:\+srv)?:\/\//, 'Use a MongoDB connection URI').optional())
}).superRefine((value, ctx) => {
  if (value.NODE_ENV === 'production' && !value.MONGODB_URI) ctx.addIssue({ code: 'custom', path: ['MONGODB_URI'], message: 'Required in production' });
  if (value.COOKIE_SAME_SITE === 'none' && value.NODE_ENV !== 'production') ctx.addIssue({ code: 'custom', path: ['COOKIE_SAME_SITE'], message: 'SameSite=None requires production HTTPS cookies' });
  if (value.NODE_ENV === 'production') {
    try {
      const origin = new URL(value.CLIENT_ORIGIN);
      if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) ctx.addIssue({ code: 'custom', path: ['CLIENT_ORIGIN'], message: 'Use an exact HTTPS frontend origin in production' });
    } catch { /* The field's URL validation reports malformed input. */ }
  }
}).transform(value => ({ ...value, CODING_DEMO_MODE: value.CODING_DEMO_MODE && value.NODE_ENV === 'development' }));

export function configurationErrorMessage(issues: { path: (string | number)[] }[]) {
  const fields = [...new Set(issues.map(issue => issue.path.join('.')))];
  const originHelp = fields.includes('CLIENT_ORIGIN')
    ? ' Set CLIENT_ORIGIN in Render Environment to the exact public HTTPS Vercel frontend origin (for example https://your-project.vercel.app), without quotes, a path, query, fragment or credentials. An unset value defaults to localhost and is invalid in production.'
    : '';
  return `Invalid environment configuration: ${fields.join(', ')}${originHelp}`;
}

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  // Report field names only: configuration values may contain credentials.
  throw new Error(configurationErrorMessage(parsed.error.issues));
}
export const env = parsed.data;
