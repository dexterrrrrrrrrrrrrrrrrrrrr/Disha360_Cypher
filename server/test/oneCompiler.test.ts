import { it, expect, vi, afterEach } from 'vitest';
import { OneCompilerProvider, oneCompilerEndpoint, oneCompilerLanguages, oneCompilerLimits, sourceFilename } from '../src/services/oneCompiler.js';
import { configureExecution } from '../src/services/executionProvider.js';
import { envSchema } from '../src/config/env.js';
afterEach(() => vi.useRealTimers());
const input = { language: 'python' as const, source: 'print(input())', stdin: 'hello' };
const raw = { status: 'success', stdout: 'hello\n', stderr: null, exception: null, executionTime: 9, memoryUsed: 9384 };
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
it.each(Object.entries(oneCompilerLanguages))('uses the supplied official direct API contract for %s', async (language, config) => {
  const fetcher = vi.fn().mockResolvedValue(response(raw)); const p = new OneCompilerProvider('fixture-only-key', fetcher);
  const r = await p.execute({ ...input, language: language as keyof typeof oneCompilerLanguages });
  expect(fetcher).toHaveBeenCalledWith(oneCompilerEndpoint, expect.objectContaining({ method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json', 'X-API-Key': 'fixture-only-key' } }));
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ language: config.id, stdin: 'hello', files: [{ name: config.file, content: input.source }] });
  expect(r).toMatchObject({ verdict: 'Accepted', stdout: 'hello\n', timeSeconds: 0.009, memoryKb: 9384 });
});
it('selects OneCompiler explicitly, requires its key, and preserves the Judge0 gate/default', () => {
  const env = envSchema.parse({}); expect(env.ONECOMPILER_ENABLED).toBe(false); expect(env.JUDGE0_SECURITY_CONFIRMED).toBe(false);
  expect(configureExecution({ ...env, JUDGE0_URL: 'https://judge.example' }).provider).toBeUndefined();
  expect(configureExecution({ ...env, ONECOMPILER_ENABLED: true }).message).toContain('credential is missing');
  expect(configureExecution({ ...env, ONECOMPILER_ENABLED: true, ONECOMPILER_API_KEY: 'fixture', JUDGE0_SECURITY_CONFIRMED: true, JUDGE0_URL: 'https://judge.example' }).provider?.name).toBe('OneCompiler');
  expect(configureExecution({ ...env, ONECOMPILER_ENABLED: true, JUDGE0_SECURITY_CONFIRMED: true, JUDGE0_URL: 'https://judge.example' }).provider).toBeUndefined();
  expect(configureExecution({ ...env, JUDGE0_SECURITY_CONFIRMED: true, JUDGE0_URL: 'https://judge.example' }).provider?.name).toContain('Judge0');
  expect(() => new OneCompilerProvider(' ')).toThrow('credential is missing');
});
it('uses a public Java class filename and ignores comments, literals and nested classes', () => {
  expect(sourceFilename({ language: 'java', source: '// public class Fake {}\npublic class Solution { public class Nested {} String s="public class Nope"; }' })).toBe('Solution.java');
  expect(sourceFilename({ language: 'java', source: 'public final class Main {}' })).toBe('Main.java');
  expect(() => sourceFilename({ language: 'java', source: 'public class A {} public class B {}' })).toThrow('one public');
});
it('validates ordered batch results and converts real metrics without exposing echoed stdin', async () => {
  const fetcher = vi.fn().mockResolvedValue(response([{ ...raw, stdin: 'a', stdout: 'a' }, { ...raw, stdin: 'b', stdout: 'b', executionTime: 0 }]));
  const results = await new OneCompilerProvider('fixture', fetcher).executeBatch(input, ['a', 'b']);
  expect(JSON.parse(fetcher.mock.calls[0][1].body).stdin).toEqual(['a', 'b']);
  expect(results.map(r => r.stdout)).toEqual(['a', 'b']); expect(results[1].timeSeconds).toBe(0); expect(JSON.stringify(results)).not.toContain('stdin');
});
it.each(['short', 'reordered', 'no-echo'])('rejects %s batch responses without inventing results', async kind => {
  const batch = kind === 'short' ? [{ ...raw, stdin: 'a' }] : kind === 'no-echo' ? [raw, raw] : [{ ...raw, stdin: 'b' }, { ...raw, stdin: 'a' }];
  await expect(new OneCompilerProvider('fixture', vi.fn().mockResolvedValue(response(batch))).executeBatch(input, ['a', 'b'])).rejects.toMatchObject({ code: 'EXECUTION_UNAVAILABLE' });
});
it.each([['E001', 'EXECUTION_TIMEOUT'], ['E002', 'EXECUTION_QUOTA'], ['E003', 'EXECUTION_CONFIGURATION'], ['E004', 'EXECUTION_CONFIGURATION'], ['E005', 'EXECUTION_INPUT_LIMIT'], ['E006', 'UNSUPPORTED_LANGUAGE']])('handles %s even when API status says success', async (error, code) => {
  const fetcher = vi.fn().mockResolvedValue(response({ status: 'success', error: `${error}: fixture provider details containing fixture-key` }));
  const p = new OneCompilerProvider('fixture-key', fetcher);
  await expect(p.execute(input)).rejects.toMatchObject({ code }); expect(fetcher).toHaveBeenCalledTimes(1);
  try { await p.execute(input); } catch (e) { expect((e as Error).message).not.toContain('fixture-key'); }
});
it.each([[429, 'EXECUTION_LIMITED'], [401, 'EXECUTION_CONFIGURATION'], [503, 'EXECUTION_UNAVAILABLE']])('sanitizes HTTP %i without retries', async (status, code) => {
  const f = vi.fn().mockResolvedValue(response({ ...raw, error: 'private' }, status));
  await expect(new OneCompilerProvider('fixture', f).execute(input)).rejects.toMatchObject({ code }); expect(f).toHaveBeenCalledTimes(1);
});
it.each([['Compilation failed', 'Compilation Error'], ['SyntaxError: invalid syntax', 'Compilation Error'], ['RuntimeError: failure', 'Runtime Error'], ['Time limit exceeded', 'Time Limit Exceeded']])('maps actual %s diagnostics conservatively', async (exception, verdict) => {
  const r = await new OneCompilerProvider('fixture', vi.fn().mockResolvedValue(response({ ...raw, exception }))).execute(input);
  expect(r.verdict).toBe(verdict); expect(verdict === 'Compilation Error' ? r.compileOutput : r.exception).toContain(exception);
});
it('accepts empty stdout but never regards nonempty stderr or missing stdout as verified success', async () => {
  const make = (value: unknown) => new OneCompilerProvider('fixture', vi.fn().mockResolvedValue(response(value)));
  expect((await make({ ...raw, stdout: '' }).execute(input)).verdict).toBe('Accepted');
  expect((await make({ ...raw, stderr: 'a diagnostic' }).execute(input)).verdict).toBe('Runtime Error');
  await expect(make({ status: 'success' }).execute(input)).rejects.toThrow();
});
it('bounds outputs and sanitizes any accidental credential echo', async () => {
  const p = new OneCompilerProvider('fixture-key', vi.fn().mockResolvedValue(response({ ...raw, stdout: 'fixture-key' + 'x'.repeat(20000) })));
  const r = await p.execute(input); expect(r.outputTruncated).toBe(true); expect(r.verdict).toBe('Runtime Error'); expect(Buffer.byteLength(r.stdout)).toBeLessThanOrEqual(16384); expect(r.stdout).not.toContain('fixture-key');
  const unicode = await new OneCompilerProvider('fixture', vi.fn().mockResolvedValue(response({ ...raw, stdout: '€'.repeat(6000) }))).execute(input);
  expect(Buffer.byteLength(unicode.stdout)).toBeLessThanOrEqual(16384); expect(unicode.outputTruncated).toBe(true);
});
it('validates source/input sizes and languages before any provider request', async () => {
  const f = vi.fn(), p = new OneCompilerProvider('fixture', f);
  await expect(p.execute({ ...input, language: 'bash' } as unknown as typeof input)).rejects.toThrow();
  await expect(p.execute({ ...input, stdin: 'x'.repeat(10001) })).rejects.toThrow();
  await expect(p.executeBatch(input, Array(11).fill('x'))).rejects.toThrow();
  await expect(p.executeBatch({ language: 'python', source: 'x'.repeat(25000) }, ['a'.repeat(6000), '😀'.repeat(5000)])).rejects.toThrow();
  expect(f).not.toHaveBeenCalled();
});
it('enforces a no-retry deadline, aborts the request and returns no invented execution', async () => {
  vi.useFakeTimers(); const f = vi.fn<(url: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(() => new Promise<Response>(() => {})); const p = new OneCompilerProvider('fixture', f);
  const pending = expect(p.execute(input)).rejects.toMatchObject({ code: 'EXECUTION_TIMEOUT' });
  await vi.advanceTimersByTimeAsync(oneCompilerLimits.timeoutMs); await pending;
  expect(f.mock.calls[0][1]!.signal!.aborted).toBe(true); expect(f).toHaveBeenCalledTimes(1);
});
it('bounds daily testcase attempts and stops when either documented remaining-credit field is zero', async () => {
  const f = vi.fn().mockImplementation(async () => response(raw)); const p = new OneCompilerProvider('fixture', f, 1);
  await p.execute(input); await expect(p.execute(input)).rejects.toMatchObject({ code: 'EXECUTION_QUOTA' }); expect(f).toHaveBeenCalledTimes(1);
  for (const field of ['limitRemaining', 'limitPerMonthRemaining']) {
    const f2 = vi.fn().mockImplementation(async () => response({ ...raw, [field]: 0 })); const p2 = new OneCompilerProvider('fixture', f2);
    await p2.execute(input); await expect(p2.execute(input)).rejects.toMatchObject({ code: 'EXECUTION_QUOTA' }); expect(f2).toHaveBeenCalledTimes(1);
  }
});
it.each(['invalid-json', 'network', 'huge-response'])('fails safely on %s', async kind => {
  const f = kind === 'network' ? vi.fn().mockRejectedValue(new Error('fixture-key')) : vi.fn().mockResolvedValue(new Response(kind === 'invalid-json' ? 'bad' : 'x'.repeat(250001)));
  await expect(new OneCompilerProvider('fixture-key', f).execute(input)).rejects.toMatchObject({ code: 'EXECUTION_UNAVAILABLE' });
});
it('splits large legitimate test sets into conservative ordered batches without retries', async () => {
  const f = vi.fn().mockImplementation(async (_url: string, options: RequestInit) => new Response(JSON.stringify(JSON.parse(options.body as string).stdin.map((stdin: string) => ({ ...raw, stdin })))));
  const result = await new OneCompilerProvider('fixture', f).executeBatch(input, ['x'.repeat(6000), 'y'.repeat(6000)]);
  expect(result).toHaveLength(2); expect(f).toHaveBeenCalledTimes(2); expect(JSON.parse(f.mock.calls[0][1].body as string).stdin).toHaveLength(1);
});
it('shares request and concurrency limits across single runs and batch execution', async () => {
  let release!: (r: Response) => void;
  const pending = new Promise<Response>(resolve => { release = resolve; });
  const f = vi.fn().mockReturnValueOnce(pending).mockImplementation(async () => response(raw));
  const p = new OneCompilerProvider('fixture', f);
  const first = p.execute(input); await p.execute(input);
  for (let i = 2; i < 10; i++) await p.execute(input);
  await expect(p.execute(input)).rejects.toMatchObject({ code: 'EXECUTION_LIMITED' }); release(response(raw)); await first; expect(f).toHaveBeenCalledTimes(10);
  const hold = vi.fn(() => new Promise<Response>(() => {})); const capped = new OneCompilerProvider('fixture', hold);
  vi.useFakeTimers(); const a = expect(capped.execute(input)).rejects.toMatchObject({ code: 'EXECUTION_TIMEOUT' }); const b = expect(capped.execute(input)).rejects.toMatchObject({ code: 'EXECUTION_TIMEOUT' });
  await expect(capped.executeBatch(input, ['test'])).rejects.toMatchObject({ code: 'EXECUTION_LIMITED' });
  await vi.advanceTimersByTimeAsync(oneCompilerLimits.timeoutMs); await Promise.all([a,b]); expect(hold).toHaveBeenCalledTimes(2);
});
