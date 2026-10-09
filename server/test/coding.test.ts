import { beforeAll, beforeEach, afterAll, it, expect, vi } from "vitest";
import {
  testDatabase,
  studentAccount,
  studentCall,
  testApp,
} from "./helpers/student.js";
import { createApp } from "../src/app.js";
import {
  Judge0Provider,
  languageIds,
  executionLimits,
  type ExecutionResult,
} from "../src/services/codeExecution.js";
let db: Awaited<ReturnType<typeof testDatabase>>;
beforeAll(async () => {
  db = await testDatabase();
}, 180000);
beforeEach(async () => {
  await db.clear();
});
afterAll(async () => {
  await db.close();
});
const fixture: ExecutionResult = {
  verdict: "Accepted",
  stdout: "hello\n",
  stderr: "",
  compileOutput: "",
  timeSeconds: 0.01,
  memoryKb: 1000,
  outputTruncated: false,
};
it("persists and restores owned per-language drafts and rejects stale edits", async () => {
  const s = await studentAccount(),
    other = await studentAccount(),
    app = testApp();
  for (const language of Object.keys(languageIds)) {
    const path = "/coding/drafts/playground";
    const r = await studentCall(app, s.cookie, "put", path, {
      language,
      source: "print(1)",
      stdin: "custom input",
      version: 0,
    });
    expect(r.status).toBe(200);
    expect(
      (await studentCall(app, s.cookie, "get", `${path}?language=${language}`))
        .body.data.draft.stdin,
    ).toBe("custom input");
    expect(
      (
        await studentCall(
          app,
          other.cookie,
          "get",
          `${path}?language=${language}`,
        )
      ).body.data.draft,
    ).toBeNull();
    expect(
      (
        await studentCall(app, s.cookie, "put", path, {
          language,
          source: "stale",
          stdin: "",
          version: 0,
        })
      ).status,
    ).toBe(409);
  }
});
it("shows setup required without fake execution and denies staff/private requests", async () => {
  const s = await studentAccount(),
    staff = await studentAccount("trainer");
  const app = testApp();
  expect(
    (await studentCall(app, s.cookie, "get", "/coding/config")).body.data
      .configured,
  ).toBe(false);
  expect(
    (
      await studentCall(app, s.cookie, "post", "/coding/run", {
        language: "python",
        source: "print(1)",
        stdin: "",
      })
    ).status,
  ).toBe(503);
  expect(
    (await studentCall(app, staff.cookie, "get", "/coding/config")).status,
  ).toBe(403);
  expect(
    (
      await studentCall(app, s.cookie, "post", "/coding/run", {
        language: "shell",
        source: "x",
      })
    ).status,
  ).toBe(400);
});
it("sends custom input and returns genuine configured provider results with per-student rate limits", async () => {
  const execute = vi.fn().mockResolvedValue(fixture);
  const app = createApp({
    clientOrigin: "http://localhost:5173",
    databaseConfigured: true,
    executionRateLimit: 1,
    executionProvider: { name: "Explicit test fixture", execute },
  });
  const s = await studentAccount();
  const input = {
    language: "javascript",
    source: "console.log(1)",
    stdin: "data",
  };
  expect(
    (await studentCall(app, s.cookie, "post", "/coding/run", input)).body.data
      .execution,
  ).toEqual(fixture);
  expect(execute).toHaveBeenCalledWith(input);
  expect(
    (await studentCall(app, s.cookie, "post", "/coding/run", input)).status,
  ).toBe(429);
  const other = await studentAccount();
  expect(
    (await studentCall(app, other.cookie, "post", "/coding/run", input)).status,
  ).toBe(200);
});
it.each(Object.entries(languageIds))(
  "uses isolated limits and base64 I/O for %s",
  async (language, id) => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ token: "fixture-token" })),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: { id: 3 },
            stdout: Buffer.from("output").toString("base64"),
            stderr: Buffer.from("warning").toString("base64"),
            time: "0.02",
            memory: 1000,
          }),
        ),
      );
    const p = new Judge0Provider(
      "https://judge.example",
      "fixture-key",
      fetcher,
    );
    const r = await p.execute({
      language: language as keyof typeof languageIds,
      source: "test source",
      stdin: "custom",
    });
    expect(r.stdout).toBe("output");
    expect(r.stderr).toBe("warning");
    expect(r.timeSeconds).toBe(0.02);
    const request = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(request).toMatchObject({
      language_id: id,
      enable_network: false,
      cpu_time_limit: 2,
      wall_time_limit: 5,
      memory_limit: 262144,
      max_file_size: 16,
      max_processes_and_or_threads: 32,
    });
    expect(Buffer.from(request.stdin, "base64").toString()).toBe("custom");
    expect(fetcher.mock.calls[0][1].redirect).toBe("error");
  },
);
it.each([
  [5, "Time Limit Exceeded"],
  [6, "Compilation Error"],
  [11, "Runtime Error"],
  [13, "System Error"],
])("maps provider status %i safely", async (id, verdict) => {
  const f = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ token: "t" })))
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: { id },
          compile_output: Buffer.from("compile detail").toString("base64"),
        }),
      ),
    );
  expect(
    (
      await new Judge0Provider("https://judge.example", undefined, f).execute({
        language: "java",
        source: "bad",
        stdin: "",
      })
    ).verdict,
  ).toBe(verdict);
});
it("bounds output and rejects upstream failures without leaking credentials", async () => {
  const f = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ token: "t" })))
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: { id: 3 },
          stdout: Buffer.from("x".repeat(20000)).toString("base64"),
        }),
      ),
    );
  const result = await new Judge0Provider(
    "https://judge.example",
    undefined,
    f,
  ).execute({ language: "cpp", source: "x", stdin: "" });
  expect(result.outputTruncated).toBe(true);
  expect(result.verdict).toBe("Runtime Error");
  expect(Buffer.byteLength(result.stdout)).toBe(executionLimits.outputBytes);
  await expect(
    new Judge0Provider(
      "https://judge.example",
      "secret",
      vi.fn().mockRejectedValue(new Error("secret")),
    ).execute({ language: "python", source: "x", stdin: "" }),
  ).rejects.toThrow("isolated provider failed");
});
