import { beforeAll, beforeEach, afterEach, afterAll, it, expect, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { envSchema } from "../src/config/env.js";
import { testDatabase, studentAccount, studentCall } from "./helpers/student.js";
import { CodingProblem } from "../src/models/CodingProblem.js";
import { CodingSubmission } from "../src/models/CodingSubmission.js";
import { BadgeAward } from "../src/models/BadgeAward.js";
import { Activity } from "../src/models/Preparation.js";
import { codingMetrics } from "../src/services/codingJudge.js";
import { seedCoding } from "../src/services/sampleCoding.js";
import { Judge0Provider } from "../src/services/codeExecution.js";
let db: Awaited<ReturnType<typeof testDatabase>>;
beforeAll(async () => { db = await testDatabase(); }, 180000);
beforeEach(async () => { await db.clear(); vi.stubEnv("NODE_ENV", "development"); });
afterEach(() => vi.unstubAllEnvs());
afterAll(async () => db?.close());
const input = { language: "python", source: "raise Exception('Must never execute')", stdin: "private custom input" };
function app(enabled?: boolean, executionProvider?: Judge0Provider) {
  return createApp({ clientOrigin: "http://localhost:5173", databaseConfigured: true, allowDemoAccounts: true, codingDemoMode: enabled, executionProvider });
}
it("is opt-in and cannot activate outside development or in a production app", async () => {
  expect(envSchema.parse({}).CODING_DEMO_MODE).toBe(false);
  expect(envSchema.parse({ CODING_DEMO_MODE: "true" }).CODING_DEMO_MODE).toBe(true);
  for (const NODE_ENV of ["production", "test"])
    expect(envSchema.parse({ NODE_ENV, MONGODB_URI: "mongodb://localhost/test", CODING_DEMO_MODE: "true" }).CODING_DEMO_MODE).toBe(false);
  const s = await studentAccount();
  expect((await studentCall(app(), s.cookie, "get", "/coding/config")).body.data.demoMode).toBe(false);
  expect((await studentCall(app(), s.cookie, "post", "/coding/demo/run", input)).status).toBe(404);
  vi.stubEnv("NODE_ENV", undefined);
  expect((await studentCall(app(true), s.cookie, "post", "/coding/demo/run", input)).status).toBe(200);
  vi.stubEnv("NODE_ENV", "production");
  const prod = app(true);
  expect((await studentCall(prod, s.cookie, "get", "/coding/config")).body.data.demoMode).toBe(false);
  expect((await studentCall(prod, s.cookie, "post", "/coding/demo/run", input)).status).toBe(404);
  expect((await studentCall(prod, s.cookie, "post", "/coding/demo/problems/000000000000000000000000/submissions", input)).status).toBe(404);
});
it("returns only illustrations and receipts without execution, Judge0 requests or achievement effects", async () => {
  await seedCoding("development");
  const p = (await CodingProblem.findOne({ difficulty: "easy" }))!;
  const s = await studentAccount(), other = await studentAccount();
  const fetcher = vi.fn(() => { throw new Error("No third-party request permitted"); });
  const provider = new Judge0Provider("https://judge.example", undefined, fetcher);
  const execute = vi.spyOn(provider, "execute");
  const demo = app(true, provider);
  const engagementBefore = (await studentCall(demo, s.cookie, "get", "/engagement")).body.data;
  const leaderboardBefore = (await studentCall(demo, s.cookie, "get", "/leaderboard")).body.data;
  const metricsBefore = await codingMetrics(s.user.id);
  for (const language of ["python", "java", "cpp", "javascript"]) {
    const r = await studentCall(demo, s.cookie, "post", "/coding/demo/run", { ...input, language });
    expect(r.status).toBe(200);
    expect(r.body.data.demoRun).toEqual({ demo: true, language, illustrativeOutput: "Hello, world!\n", message: "Demo Mode: Code was not executed. This is an illustrative output only." });
    const receipt = await studentCall(demo, s.cookie, "post", `/coding/demo/problems/${p.id}/submissions`, { language, source: input.source });
    expect(receipt.status).toBe(201);
    expect(receipt.body.data.demoReceipt).toMatchObject({ demo: true, problemId: p.id, title: p.title, language, message: "Demo submission only. No code execution or grading occurred." });
    expect(JSON.stringify(receipt.body)).not.toMatch(/hiddenTests|expected|score|verdict|source|studentId/);
  }
  expect(execute).not.toHaveBeenCalled();
  expect(fetcher).not.toHaveBeenCalled();
  expect(await CodingSubmission.countDocuments()).toBe(0);
  expect(await BadgeAward.countDocuments()).toBe(0);
  expect(await Activity.countDocuments()).toBe(0);
  expect(await codingMetrics(s.user.id)).toEqual(metricsBefore);
  expect((await studentCall(demo, s.cookie, "get", "/engagement")).body.data).toEqual(engagementBefore);
  expect((await studentCall(demo, s.cookie, "get", "/leaderboard")).body.data).toEqual(leaderboardBefore);
  expect((await studentCall(demo, other.cookie, "get", "/coding/submissions")).body.data.submissions).toEqual([]);
});
it("preserves Student authentication, role, CSRF, origin and problem visibility protections", async () => {
  const demo = app(true), s = await studentAccount(), staff = await studentAccount("trainer");
  expect((await request(demo).post("/api/v1/student/coding/demo/run").set("X-Disha360-Request", "1").send(input)).status).toBe(401);
  expect((await studentCall(demo, staff.cookie, "post", "/coding/demo/run", input)).status).toBe(403);
  expect((await request(demo).post("/api/v1/student/coding/demo/run").set("Cookie", s.cookie).send(input)).status).toBe(403);
  expect((await request(demo).post("/api/v1/student/coding/demo/run").set("Cookie", s.cookie).set("X-Disha360-Request", "1").set("Origin", "https://evil.example").send(input)).status).toBe(403);
  expect((await studentCall(demo, s.cookie, "post", "/coding/demo/run", { ...input, language: "shell" })).status).toBe(400);
  const submit = { language: "python", source: "x" };
  expect((await studentCall(demo, s.cookie, "post", "/coding/demo/problems/000000000000000000000000/submissions", submit)).status).toBe(404);
  await seedCoding("development");
  const p = (await CodingProblem.findOne())!;
  await CodingProblem.updateOne({ _id: p._id }, { published: false });
  expect((await studentCall(demo, s.cookie, "post", `/coding/demo/problems/${p.id}/submissions`, submit)).status).toBe(404);
  await CodingProblem.updateOne({ _id: p._id }, { published: true, supportedLanguages: ["java"] });
  expect((await studentCall(demo, s.cookie, "post", `/coding/demo/problems/${p.id}/submissions`, submit)).status).toBe(400);
});
