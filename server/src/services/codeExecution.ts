import { z } from "zod";
import { AppError } from "../utils/AppError.js";
import type { CodeInput } from "../features/coding/validation.js";
export const executionLimits = {
  cpuSeconds: 2,
  wallSeconds: 5,
  memoryKb: 262144,
  outputBytes: 16384,
  processes: 32,
} as const;
export interface ExecutionResult {
  verdict:
    | "Accepted"
    | "Time Limit Exceeded"
    | "Memory Limit Exceeded"
    | "Compilation Error"
    | "Runtime Error"
    | "System Error";
  stdout: string;
  stderr: string;
  compileOutput: string;
  exception?: string;
  timeSeconds: number | null;
  memoryKb: number | null;
  outputTruncated: boolean;
}
export interface ExecutionProvider {
  name: string;
  execute(input: CodeInput): Promise<ExecutionResult>;
  executeBatch?(input: Omit<CodeInput, 'stdin'>, stdin: string[]): Promise<ExecutionResult[]>;
}
export const languageIds = {
  python: 71,
  java: 62,
  cpp: 54,
  javascript: 63,
} as const;
const resultSchema = z.object({
  status: z.object({ id: z.number().int() }),
  stdout: z.string().nullable().optional(),
  stderr: z.string().nullable().optional(),
  compile_output: z.string().nullable().optional(),
  time: z.union([z.string(), z.number()]).nullable().optional(),
  memory: z.number().nonnegative().nullable().optional(),
});
// Provider must be operated with patched process isolation, filesystem and egress restrictions.
// This application never starts subprocesses or evaluates student code.
export class Judge0Provider implements ExecutionProvider {
  name = "Judge0 isolated execution";
  constructor(
    private url: string,
    private key?: string,
    private fetcher: typeof fetch = fetch,
  ) {
    const base = new URL(url);
    if (
      base.username ||
      base.password ||
      base.search ||
      base.hash ||
      !["http:", "https:"].includes(base.protocol)
    )
      throw new Error("Invalid execution provider URL");
  }
  private async request(path: string, signal: AbortSignal, body?: unknown) {
    const response = await this.fetcher(
      `${this.url.replace(/\/$/, "")}${path}`,
      {
        method: body ? "POST" : "GET",
        signal,
        redirect: "error",
        headers: {
          "Content-Type": "application/json",
          ...(this.key ? { "X-Auth-Token": this.key } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      },
    );
    if (!response.ok) throw new Error("Execution provider request failed");
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Missing response");
    let bytes = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > 100000) {
        await reader.cancel();
        throw new Error("Provider response too large");
      }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  }
  async execute(input: CodeInput): Promise<ExecutionResult> {
    const signal = AbortSignal.timeout(20000);
    try {
      const encode = (s: string) => Buffer.from(s).toString("base64");
      const job = z
        .object({ token: z.string().regex(/^[a-zA-Z0-9-]{1,100}$/) })
        .parse(
          await this.request(
            "/submissions?base64_encoded=true&wait=false",
            signal,
            {
              language_id: languageIds[input.language],
              source_code: encode(input.source),
              stdin: encode(input.stdin),
              cpu_time_limit: executionLimits.cpuSeconds,
              cpu_extra_time: 0.5,
              wall_time_limit: executionLimits.wallSeconds,
              memory_limit: executionLimits.memoryKb,
              stack_limit: 65536,
              max_processes_and_or_threads: executionLimits.processes,
              enable_per_process_and_thread_time_limit: false,
              enable_per_process_and_thread_memory_limit: false,
              max_file_size: 16,
              number_of_runs: 1,
              enable_network: false,
              redirect_stderr_to_stdout: false,
            },
          ),
        );
      let raw;
      for (let i = 0; i < 40; i++) {
        raw = resultSchema.parse(
          await this.request(
            `/submissions/${job.token}?base64_encoded=true&fields=status,stdout,stderr,compile_output,time,memory`,
            signal,
          ),
        );
        if (raw.status.id > 2) break;
        await new Promise((r) => setTimeout(r, 400));
      }
      if (!raw || raw.status.id < 3)
        throw new Error("Provider job did not finish");
      let truncated = false;
      const decode = (s?: string | null) => {
        const data = Buffer.from(s || "", "base64");
        if (data.length > executionLimits.outputBytes) truncated = true;
        return data.subarray(0, executionLimits.outputBytes).toString("utf8");
      };
      const stdout = decode(raw.stdout),
        stderr = decode(raw.stderr),
        compileOutput = decode(raw.compile_output);
      let verdict: ExecutionResult["verdict"] =
        raw.status.id === 3
          ? "Accepted"
          : raw.status.id === 5
            ? "Time Limit Exceeded"
            : raw.status.id === 6
              ? "Compilation Error"
              : raw.status.id >= 7 && raw.status.id <= 12
                ? "Runtime Error"
                : "System Error";
      // Judge0 does not have a distinct portable MLE status. Only reported memory over the enforced bound supports MLE.
      if (
        raw.memory != null &&
        raw.memory > executionLimits.memoryKb &&
        verdict !== "Compilation Error"
      )
        verdict = "Memory Limit Exceeded";
      if (truncated && verdict === "Accepted") verdict = "Runtime Error";
      const time = raw.time == null ? null : Number(raw.time);
      if (time !== null && (!Number.isFinite(time) || time < 0))
        throw new Error("Invalid runtime");
      return {
        verdict,
        stdout,
        stderr,
        compileOutput,
        timeSeconds: time,
        memoryKb: raw.memory ?? null,
        outputTruncated: truncated,
      };
    } catch {
      throw new AppError(
        503,
        "EXECUTION_UNAVAILABLE",
        "The isolated provider failed or timed out. No successful execution is assumed. Check provider availability and retry.",
      );
    }
  }
}
