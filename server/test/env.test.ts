import { describe, expect, it } from 'vitest';
import { envSchema } from '../src/config/env.js';

describe('environment validation', () => {
  it('allows a foundation preview without MongoDB in development', () => {
    expect(envSchema.parse({ MONGODB_URI: '' })).toMatchObject({ NODE_ENV: 'development', PORT: 4000, MONGODB_URI: undefined });
  });
  it('requires a database URI for production', () => {
    expect(envSchema.safeParse({ NODE_ENV: 'production' }).success).toBe(false);
  });
  it('accepts an Atlas URI', () => {
    expect(envSchema.safeParse({ MONGODB_URI: 'mongodb+srv://example.invalid/cypher' }).success).toBe(true);
  });
  it('rejects invalid ports and non-MongoDB connection protocols', () => {
    expect(envSchema.safeParse({ PORT: 'bad' }).success).toBe(false);
    expect(envSchema.safeParse({ PORT: 70000 }).success).toBe(false);
    expect(envSchema.safeParse({ MONGODB_URI: 'https://example.invalid' }).success).toBe(false);
  });
});
