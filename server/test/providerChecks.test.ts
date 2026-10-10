import { expect, it, vi } from 'vitest';
import { checkProviders } from '../src/services/providerChecks.js';
import { envSchema } from '../src/config/env.js';
const settings = () => ({ ...envSchema.parse({}), GEMINI_API_KEY: 'fixture-primary', GEMINI_API_KEY_BACKUP: 'fixture-backup', GEMINI_MODEL: 'gemini-fixture', ONECOMPILER_API_KEY: 'fixture-execution', ONECOMPILER_ENABLED: true });
it('reports missing selected credentials without making provider calls', async () => {
  const lookup = vi.fn(); const result = await checkProviders(envSchema.parse({}), lookup);
  expect(result.configurationReady).toBe(false); expect(JSON.stringify(result)).toContain('GEMINI_API_KEY'); expect(JSON.stringify(result)).toContain('GEMINI_MODEL'); expect(JSON.stringify(result)).toContain('ONECOMPILER_API_KEY'); expect(lookup).not.toHaveBeenCalled();
});
it.each(['primary', 'backup'] as const)('uses only manually selected %s credential for read-only model verification', async selection => {
  const lookup = vi.fn().mockResolvedValue({ name: 'models/gemini-fixture', supportedActions: ['generateContent'] });
  const result = await checkProviders({ ...settings(), GEMINI_KEY_SELECTION: selection }, lookup);
  expect(result.configurationReady).toBe(true); expect(lookup).toHaveBeenCalledExactlyOnceWith('gemini-fixture', `fixture-${selection}`);
  expect(JSON.stringify(result)).not.toContain(`fixture-${selection}`); expect(result.checks[1].status).toBe('configured'); expect(result.checks[1].message).toContain('execution remain unverified');
});
it('does not fall back from a missing backup to an available primary key', async () => {
  const lookup = vi.fn(); const result = await checkProviders({ ...settings(), GEMINI_KEY_SELECTION: 'backup', GEMINI_API_KEY_BACKUP: '' }, lookup);
  expect(result.configurationReady).toBe(false); expect(result.checks[0].message).toContain('GEMINI_API_KEY_BACKUP'); expect(lookup).not.toHaveBeenCalled();
});
it('sanitizes provider failures without retries or rotation', async () => {
  const lookup = vi.fn().mockRejectedValue(new Error('fixture-primary private provider details'));
  const result = await checkProviders(settings(), lookup);
  expect(result.configurationReady).toBe(false); expect(JSON.stringify(result)).not.toContain('fixture-primary'); expect(lookup).toHaveBeenCalledTimes(1);
});
it('requires an exact model and generation capability; refuses fake model availability', async () => {
  for (const metadata of [{ name: 'models/other', supportedActions: ['generateContent'] }, { name: 'models/gemini-fixture' }]) expect((await checkProviders(settings(), vi.fn().mockResolvedValue(metadata))).configurationReady).toBe(false);
  const lookup = vi.fn(); expect((await checkProviders({ ...settings(), GEMINI_MODEL: '' }, lookup)).configurationReady).toBe(false); expect(lookup).not.toHaveBeenCalled();
});
it('keeps opt-in execution and demo settings explicit', async () => {
  const lookup = vi.fn().mockResolvedValue({ name: 'models/gemini-fixture', supportedActions: ['generateContent'] });
  expect((await checkProviders({ ...settings(), ONECOMPILER_ENABLED: false }, lookup)).configurationReady).toBe(false);
  expect((await checkProviders({ ...settings(), CODING_DEMO_MODE: true }, lookup)).configurationReady).toBe(false);
});
