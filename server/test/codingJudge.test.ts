import { beforeAll, beforeEach, afterAll, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import {
  testDatabase,
  studentAccount,
  studentCall,
} from "./helpers/student.js";
import { createApp } from "../src/app.js";
import { CodingProblem } from "../src/models/CodingProblem.js";
import { CodingSubmission } from "../src/models/CodingSubmission.js";
import { seedCoding } from "../src/services/sampleCoding.js";
import { normalizeOutput } from "../src/services/codingJudge.js";
import type { ExecutionResult } from "../src/services/codeExecution.js";
const fixture: ExecutionResult = {
  verdict: "Accepted",
  stdout: "",
  stderr: "hidden diagnostic",
  compileOutput: "hidden compiler output",
  timeSeconds: 0.01,
  memoryKb: 1234,
  outputTruncated: false,
};
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
async function setup() {
  await seedCoding("development");
  const p = (await CodingProblem.findOne({ difficulty: "easy" }).select(
    "+hiddenTests",
  ))!;
  const s = await studentAccount();
  const execute = vi
    .fn()
    .mockImplementation(async (input: { stdin: string }) => ({
      ...fixture,
      stdout:
        String(
          input.stdin
            .trim()
            .split(/\s+/)
            .map(Number)
            .reduce((a, b) => a + b, 0),
        ) + "\n",
    }));
  const app = createApp({
    clientOrigin: "http://localhost:5173",
    databaseConfigured: true,
    allowDemoAccounts: true,
    executionProvider: { name: "Explicit isolated-judge fixture", execute },
  });
  return { p, s, execute, app };
}
it("seeds explicitly in development and hides all hidden test data and source from APIs", async () => {
  await expect(seedCoding("production")).rejects.toThrow();
  expect(await CodingProblem.countDocuments()).toBe(0);
  const { app, p, s } = await setup();
  await seedCoding("development");
  expect(await CodingProblem.countDocuments()).toBe(3);
  for (const path of ["/coding/problems", `/coding/problems/${p.id}`]) {
    const r = await studentCall(app, s.cookie, "get", path);
    expect(JSON.stringify(r.body)).not.toMatch(
      /hiddenTests|expected|999999|-7 9/,
    );
  }
  expect(
    (
      await studentCall(
        app,
        s.cookie,
        "get",
        "/coding/problems?difficulty=hard",
      )
    ).body.data.problems,
  ).toHaveLength(1);
  expect(
    (
      await studentCall(
        app,
        s.cookie,
        "get",
        "/coding/problems?topic=Arithmetic",
      )
    ).body.data.problems,
  ).toHaveLength(1);
});
it("accepts a correct solution, scores on backend, retains stable history and avoids duplicate work", async () => {
  const { app, p, s, execute } = await setup();
  const input = {
    language: "python",
    source: "fixture",
    requestId: randomUUID(),
  };
  const path = `/coding/problems/${p.id}/submissions`;
  const r = await studentCall(app, s.cookie, "post", path, input);
  expect(r.status).toBe(201);
  expect(r.body.data.submission).toMatchObject({
    verdict: "Accepted",
    score: 100,
    passed: 3,
    timeSeconds: 0.01,
    memoryKb: 1234,
  });
  const again = await studentCall(app, s.cookie, "post", path, input);
  expect(again.body.data.submission).toEqual(r.body.data.submission);
  expect(execute).toHaveBeenCalledTimes(3);
  expect(JSON.stringify(r.body)).not.toMatch(
    /hidden diagnostic|source|stdin|compileOutput|expected/,
  );
  expect(
    (await studentCall(app, s.cookie, "get", "/coding/submissions")).body.data
      .submissions[0],
  ).toEqual(r.body.data.submission);
  const dash = (await studentCall(app, s.cookie, "get", "/dashboard")).body
    .data;
  expect(dash.coding).toMatchObject({
    solved: 1,
    attempted: 1,
    solveRate: 100,
  });
  expect(dash.readiness.score).toBe(60);
  expect(
    dash.recentActivity.filter(
      (a: { kind: string }) => a.kind === "coding_submitted",
    ),
  ).toHaveLength(1);
});
it.each([
  "Wrong Answer",
  "Time Limit Exceeded",
  "Memory Limit Exceeded",
  "Compilation Error",
  "Runtime Error",
  "System Error",
])("records %s without exposing hidden diagnostics", async (verdict) => {
  const { app, p, s, execute } = await setup();
  execute.mockResolvedValue({
    ...fixture,
    stdout: "wrong",
    verdict: verdict === "Wrong Answer" ? "Accepted" : verdict,
  });
  const r = await studentCall(
    app,
    s.cookie,
    "post",
    `/coding/problems/${p.id}/submissions`,
    { language: "cpp", source: "fixture", requestId: randomUUID() },
  );
  expect(r.body.data.submission.verdict).toBe(verdict);
  expect(r.body.data.submission.score).toBe(
    verdict === "System Error" ? null : 0,
  );
  expect(JSON.stringify(r.body)).not.toContain("hidden diagnostic");
});
it("protects submission ownership, roles, hidden answers and backend score inputs", async () => {
  const { app, p, s } = await setup();
  const r = await studentCall(
    app,
    s.cookie,
    "post",
    `/coding/problems/${p.id}/submissions`,
    { language: "java", source: "fixture", requestId: randomUUID() },
  );
  const other = await studentAccount(),
    staff = await studentAccount("admin");
  expect(
    (
      await studentCall(
        app,
        other.cookie,
        "get",
        `/coding/submissions/${r.body.data.submission.id}`,
      )
    ).status,
  ).toBe(404);
  expect(
    (await studentCall(app, other.cookie, "get", "/coding/submissions")).body
      .data.submissions,
  ).toEqual([]);
  expect(
    (await studentCall(app, staff.cookie, "get", "/coding/problems")).status,
  ).toBe(403);
  expect(
    (
      await studentCall(
        app,
        s.cookie,
        "post",
        `/coding/problems/${p.id}/submissions`,
        {
          language: "python",
          source: "x",
          requestId: randomUUID(),
          score: 100,
        },
      )
    ).status,
  ).toBe(400);
});
it("reserves concurrent duplicate work once and expires abandoned processing safely", async () => {
  const { app, p, s, execute } = await setup();
  let release!: (v: unknown) => void;
  let begin!: () => void;
  const began = new Promise<void>((r) => (begin = r));
  execute.mockImplementationOnce(() => {
    begin();
    return new Promise((r) => (release = r));
  });
  const input = { language: "python", source: "x", requestId: randomUUID() };
  const path = `/coding/problems/${p.id}/submissions`;
  const first = studentCall(app, s.cookie, "post", path, input).then((r) => r);
  await began;
  const duplicate = await studentCall(app, s.cookie, "post", path, input);
  expect(duplicate.body.data.submission.status).toBe("processing");
  release({ ...fixture, stdout: "2" });
  await first;
  expect(await CodingSubmission.countDocuments()).toBe(1);
  await CodingSubmission.updateOne(
    { requestId: input.requestId },
    { $set: { status: "processing", processingUntil: new Date(0) } },
  );
  expect(
    (await studentCall(app, s.cookie, "get", "/coding/submissions")).body.data
      .submissions[0],
  ).toMatchObject({
    verdict: "System Error",
    score: null,
    status: "completed",
  });
});
it("uses documented whitespace rules without accepting interior or case differences", () => {
  expect(normalizeOutput(" a  b \r\n\n")).toBe(" a  b");
  expect(normalizeOutput("a b")).not.toBe(normalizeOutput("a  b"));
  expect(normalizeOutput("A")).not.toBe(normalizeOutput("a"));
});
