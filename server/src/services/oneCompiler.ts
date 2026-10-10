import { z } from 'zod';
import { codeInput, type CodeInput } from '../features/coding/validation.js';
import { AppError } from '../utils/AppError.js';
import { executionLimits, type ExecutionProvider, type ExecutionResult } from './codeExecution.js';

// Contract supplied from the official OneCompiler direct API documentation.
// Fixed HTTPS origin: credentials never go to a frontend-supplied URL or redirect.
export const oneCompilerEndpoint = 'https://api.onecompiler.com/v1/run';
export const oneCompilerLanguages = {
  python: { id: 'python', file: 'main.py' }, java: { id: 'java', file: 'Main.java' },
  cpp: { id: 'cpp', file: 'main.cpp' }, javascript: { id: 'javascript', file: 'main.js' },
} as const;
export const oneCompilerLimits = { timeoutMs: 20000, inputBytes: 40000, stdinCharacters: 10000, batchSize: 10, responseBytes: 250000, requestsPerMinute: 10, concurrentRequests: 2 } as const;
const rawResult = z.object({
  status: z.enum(['success', 'failed']), stdout: z.string().nullable().optional(), stderr: z.string().nullable().optional(), exception: z.string().nullable().optional(),
  error: z.unknown().optional(), executionTime: z.number().finite().nonnegative().nullable().optional(), memoryUsed: z.number().finite().nonnegative().nullable().optional(),
  limitRemaining: z.number().finite().nonnegative().optional(), limitPerMonthRemaining: z.number().finite().nonnegative().optional(), stdin: z.string().optional(),
});
type RawResult = z.infer<typeof rawResult>;
export function sourceFilename(input: Pick<CodeInput, 'language' | 'source'>) {
  if (input.language !== 'java') return oneCompilerLanguages[input.language].file;
  // Ignore comments and string literals before inspecting a conventional public
  // top-level class name. No evaluation, parsing with a shell, or local execution.
  const text = input.source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, ' ');
  const names = [...text.matchAll(/\bpublic\s+(?:(?:abstract|final|sealed|strictfp)\s+)*(?:class|record|enum|interface)\s+([A-Za-z_$][\w$]*)/g)]
    .filter(m => { let depth = 0; for (const char of text.slice(0, m.index)) { if (char === '{') depth++; else if (char === '}') depth--; } return depth === 0; }).map(m => m[1]);
  if (new Set(names).size > 1) throw new AppError(400, 'JAVA_SOURCE_LAYOUT', 'Use one public top-level Java type in this single-file workspace.');
  return `${names[0] || 'Main'}.java`;
}
export class OneCompilerProvider implements ExecutionProvider {
  readonly name = 'OneCompiler';
  private requests: number[] = []; private active = 0; private dailyCount = 0; private day = ''; private quotaEmpty = false;
  constructor(private key: string, private fetcher: typeof fetch = fetch, private maxDailyExecutions = 100) {
    if (!key.trim()) throw new AppError(503, 'EXECUTION_SETUP_REQUIRED', 'OneCompiler is enabled but its backend credential is missing.');
    if (!Number.isInteger(maxDailyExecutions) || maxDailyExecutions < 1 || maxDailyExecutions > 10000) throw new Error('Invalid execution budget');
  }
  private failure(error: unknown): never {
    const value = typeof error === 'string' ? error : error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
    const code = value.match(/\bE00[1-6]\b/)?.[0];
    if (code === 'E001') throw new AppError(503, 'EXECUTION_TIMEOUT', 'The execution provider timed out. No successful execution or grading is assumed.');
    if (code === 'E002') { this.quotaEmpty = true; throw new AppError(503, 'EXECUTION_QUOTA', 'OneCompiler usage is unavailable or its quota has been reached. Try later; no alternate provider is used.'); }
    if (code === 'E003' || code === 'E004') throw new AppError(503, 'EXECUTION_CONFIGURATION', 'The execution provider rejected its backend credential. Ask the operator to check configuration.');
    if (code === 'E005') throw new AppError(400, 'EXECUTION_INPUT_LIMIT', 'The execution provider rejected the input size. Shorten the input.');
    if (code === 'E006') throw new AppError(400, 'UNSUPPORTED_LANGUAGE', 'The execution provider does not support this language.');
    throw new AppError(503, 'EXECUTION_UNAVAILABLE', 'The execution provider is unavailable. No successful execution or grading is assumed.');
  }
  private normalize(raw: RawResult): ExecutionResult {
    if (raw.error != null && raw.error !== '') this.failure(raw.error);
    if (raw.status !== 'success') this.failure(null);
    if (raw.stdout === undefined && !raw.exception && !raw.stderr) this.failure(null);
    if (raw.limitRemaining === 0 || raw.limitPerMonthRemaining === 0) this.quotaEmpty = true;
    const diagnostics = [raw.exception, raw.stderr].filter(Boolean).join('\n');
    // The direct API contract has no exit code or portable compilation status.
    // Fail conservatively on diagnostics; never infer success from status alone.
    let verdict: ExecutionResult['verdict'] = !diagnostics ? 'Accepted'
      : /compil(?:ation|e|er|ing)|\bjavac\b|(?:\.java:\d+|\.cpp:\d+).*error|SyntaxError/i.test(diagnostics) ? 'Compilation Error'
      : /tim(?:ed? out|e limit)|timeout/i.test(diagnostics) ? 'Time Limit Exceeded' : 'Runtime Error';
    let outputTruncated = false;
    const bounded = (value: string) => {
      const data = Buffer.from(value.split(this.key).join('[credential removed]'), 'utf8');
      if (data.length > executionLimits.outputBytes) outputTruncated = true;
      const text = data.subarray(0, executionLimits.outputBytes).toString('utf8');
      // An incomplete UTF-8 character decodes as a three-byte replacement.
      return Buffer.byteLength(text) > executionLimits.outputBytes ? data.subarray(0, executionLimits.outputBytes - 3).toString('utf8') : text;
    };
    const stdout = bounded(raw.stdout || ''), stderr = bounded(raw.stderr || ''), compileOutput = bounded(verdict === 'Compilation Error' ? diagnostics : ''), exception = bounded(verdict === 'Compilation Error' ? '' : raw.exception || '');
    if (outputTruncated && verdict === 'Accepted') verdict = 'Runtime Error';
    return { verdict, stdout, stderr, compileOutput, exception, timeSeconds: raw.executionTime == null ? null : raw.executionTime / 1000, memoryKb: raw.memoryUsed ?? null, outputTruncated };
  }
  private body(input: Omit<CodeInput, 'stdin'>, inputs: string[], batch: boolean) {
    const validated = codeInput.parse({ ...input, stdin: inputs[0] || '' });
    if (!inputs.length || inputs.length > oneCompilerLimits.batchSize || inputs.some(s => typeof s !== 'string' || s.length > oneCompilerLimits.stdinCharacters) || inputs.reduce((n, s) => n + s.length, 0) > oneCompilerLimits.stdinCharacters)
      throw new AppError(413, 'EXECUTION_INPUT_LIMIT', 'Use at most ten test inputs and 10,000 combined input characters.');
    const body = JSON.stringify({ language: oneCompilerLanguages[validated.language].id, stdin: batch ? inputs : inputs[0], files: [{ name: sourceFilename(validated), content: validated.source }] });
    if (Buffer.byteLength(body) > oneCompilerLimits.inputBytes) throw new AppError(413, 'EXECUTION_INPUT_LIMIT', 'The encoded execution request is too large. Shorten the source or input.');
    return body;
  }
  private async request(input: Omit<CodeInput, 'stdin'>, inputs: string[], batch: boolean): Promise<ExecutionResult[]> {
    const body = this.body(input, inputs, batch);
    const now = Date.now(), day = new Date(now).toISOString().slice(0, 10);
    if (this.day !== day) { this.day = day; this.dailyCount = 0; }
    this.requests = this.requests.filter(t => now - t < 60000);
    if (this.quotaEmpty || this.dailyCount + inputs.length > this.maxDailyExecutions) throw new AppError(503, 'EXECUTION_QUOTA', 'The local execution allowance or provider quota has been reached. No retries or fallback providers are used.');
    if (this.active >= oneCompilerLimits.concurrentRequests || this.requests.length >= oneCompilerLimits.requestsPerMinute) throw new AppError(503, 'EXECUTION_LIMITED', 'Execution is temporarily busy or rate-limited. Please try later.');
    this.requests.push(now); this.dailyCount += inputs.length; this.active++;
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new AppError(503, 'EXECUTION_TIMEOUT', 'The execution provider timed out. No successful execution or grading is assumed.')); }, oneCompilerLimits.timeoutMs); });
      const operation = async () => {
        const response = await this.fetcher(oneCompilerEndpoint, { method: 'POST', redirect: 'error', signal: controller.signal,
          headers: { 'Content-Type': 'application/json', 'X-API-Key': this.key }, body });
        if (response.status === 429) throw new AppError(503, 'EXECUTION_LIMITED', 'The execution provider is rate-limited. Please try later.');
        if (response.status === 401 || response.status === 403) this.failure('E003');
        const reader = response.body?.getReader(); if (!reader) this.failure(null);
        const chunks: Uint8Array[] = []; let bytes = 0;
        while (true) { const { done, value } = await reader.read(); if (done) break; bytes += value.length; if (bytes > oneCompilerLimits.responseBytes) { await reader.cancel(); this.failure(null); } chunks.push(value); }
        const json: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!Array.isArray(json)) {
          const raw = rawResult.parse(json); if (raw.error != null && raw.error !== '') this.failure(raw.error);
          if (!response.ok || batch) this.failure(null); return [this.normalize(raw)];
        }
        if (!response.ok || !batch || json.length !== inputs.length) this.failure(null);
        const parsed = z.array(rawResult).parse(json);
        if (parsed.some((r, i) => r.stdin !== inputs[i])) this.failure(null);
        return parsed.map(raw => this.normalize(raw));
      };
      return await Promise.race([operation(), deadline]);
    } catch (error) { if (error instanceof AppError) throw error; return this.failure(null); }
    finally { if (timer) clearTimeout(timer); this.active--; }
  }
  async execute(input: CodeInput) { return (await this.request({ language: input.language, source: input.source }, [input.stdin], false))[0]; }
  async executeBatch(input: Omit<CodeInput, 'stdin'>, stdin: string[]) {
    if (!stdin.length || stdin.length > oneCompilerLimits.batchSize || stdin.some(s => typeof s !== 'string' || s.length > oneCompilerLimits.stdinCharacters))
      throw new AppError(413, 'EXECUTION_INPUT_LIMIT', 'Use at most ten test inputs, each within 10,000 characters.');
    // Split larger legitimate problem sets rather than sending credit-expanding
    // inputs or pretending an oversized batch was graded. No automatic retries.
    const groups: string[][] = []; let group: string[] = [], length = 0;
    for (const value of stdin) {
      if (group.length && length + value.length > oneCompilerLimits.stdinCharacters) { groups.push(group); group = []; length = 0; }
      group.push(value); length += value.length;
    }
    groups.push(group);
    for (const values of groups) this.body(input, values, true); // Validate every request before spending any attempts.
    const results: ExecutionResult[] = [], started = Date.now();
    for (const values of groups) {
      if (Date.now() - started > 60000) throw new AppError(503, 'EXECUTION_TIMEOUT', 'The submission execution deadline was reached. No complete grading is assumed.');
      results.push(...await this.request(input, values, true));
    }
    return results;
  }
}
