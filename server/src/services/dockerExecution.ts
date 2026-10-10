import { readFileSync, lstatSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { AppError } from '../utils/AppError.js';
import { codeInput, type CodeInput } from '../features/coding/validation.js';
import type { ExecutionProvider, ExecutionResult } from './codeExecution.js';
export const dockerLimits = { wallSeconds: 5, compileSeconds: 10, memoryKb: 524288, outputBytes: 16384, processes: 64, cpus: 1, cases: 10, concurrency: 1, jobSeconds: 75 } as const;
const resultSchema = z.object({ verdict: z.enum(['Accepted', 'Time Limit Exceeded', 'Memory Limit Exceeded', 'Compilation Error', 'Runtime Error', 'System Error']), stdout: z.string().max(32768), stderr: z.string().max(32768), compileOutput: z.string().max(32768), exception: z.string().max(300).optional(), timeSeconds: z.number().nonnegative().nullable(), memoryKb: z.number().nonnegative().nullable(), exitCode: z.number().int().nullable(), outputTruncated: z.boolean() }).strict();
const unavailable = () => new AppError(503, 'DOCKER_RUNNER_UNAVAILABLE', 'The local Docker worker is unavailable or failed its safety checks. Start npm run runner:dev after building its image. See docs/DOCKER_SANDBOX.md.');
export class DockerExecutionProvider implements ExecutionProvider {
  readonly name = 'Local Docker sandbox';
  private readonly token: string;
  constructor(private url = 'http://127.0.0.1:4010', tokenFile = fileURLToPath(new URL('../../../.disha-local/runner-token', import.meta.url)), private transport: typeof fetch = fetch) {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' || parsed.hostname !== '127.0.0.1' || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) throw unavailable();
    const path = resolve(tokenFile); const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) || stat.uid !== process.getuid?.()) throw unavailable();
    this.token = readFileSync(path, 'utf8').trim(); if (!/^[a-f0-9]{64}$/.test(this.token)) throw unavailable();
    this.url = parsed.origin;
  }
  private async request(path: string, body?: unknown) {
    try {
      const response = await this.transport(`${this.url}${path}`, { method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(body ? 80000 : 5000), headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}` }, ...(body ? { body: JSON.stringify(body) } : {}) });
      if (response.status === 429) throw new AppError(429, 'EXECUTION_LIMITED', 'The local sandbox is busy or rate-limited. Wait for the current job to finish and retry.');
      if (!response.ok || !response.body) throw unavailable();
      const reader = response.body.getReader(); let bytes = 0; const chunks: Uint8Array[] = [];
      try { while (true) { const { done, value } = await reader.read(); if (done) break; bytes += value.byteLength; if (bytes > 500000) throw unavailable(); chunks.push(value); } } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
      return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
    } catch (error) { if (error instanceof AppError) throw error; throw unavailable(); }
  }
  async availability() {
    try { const health = z.object({ ready: z.literal(true), limits: z.object({ network: z.unknown().optional() }).passthrough() }).parse(await this.request('/health')); if (Object.entries(dockerLimits).some(([key, value]) => health.limits[key] !== value)) throw unavailable(); return { available: true, message: 'Local Docker worker is reachable with verified resource controls. This is development-only isolation, not a public multi-tenant security guarantee.' }; }
    catch { return { available: false, message: unavailable().message }; }
  }
  async execute(input: CodeInput): Promise<ExecutionResult> { const validated = codeInput.parse(input); const results = await this.executeBatch({ language: validated.language, source: validated.source }, [validated.stdin]); return results[0]; }
  async executeBatch(input: Omit<CodeInput, 'stdin'>, stdin: string[]): Promise<ExecutionResult[]> {
    codeInput.parse({ ...input, stdin: '' }); z.array(z.string().max(10000)).min(1).max(10).parse(stdin);
    try { const body = z.object({ results: z.array(resultSchema) }).strict().parse(await this.request('/execute', { ...input, stdin })); if (body.results.length !== stdin.length) throw unavailable(); return body.results; }
    catch (error) { if (error instanceof AppError) throw error; throw unavailable(); }
  }
}
