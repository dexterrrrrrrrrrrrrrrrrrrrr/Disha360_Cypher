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

it('requires explicit provider hardening and safe backend URLs',()=>{expect(envSchema.parse({JUDGE0_URL:'https://judge.example'}).JUDGE0_SECURITY_CONFIRMED).toBe(false);for(const url of ['ftp://example.com','http://example.com','https://user:secret@example.com','https://example.com?key=secret'])expect(envSchema.safeParse({JUDGE0_URL:url}).success).toBe(false);expect(envSchema.safeParse({JUDGE0_URL:'http://127.0.0.1:2358',JUDGE0_SECURITY_CONFIRMED:'true'}).success).toBe(true);});
