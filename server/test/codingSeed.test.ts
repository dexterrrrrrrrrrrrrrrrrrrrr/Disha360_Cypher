import { beforeAll, beforeEach, afterAll, it, expect } from "vitest";
import mongoose from "mongoose";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  testDatabase,
  studentAccount,
  studentCall,
} from "./helpers/student.js";
import { CodingProblem } from "../src/models/CodingProblem.js";
import { CodingSubmission } from "../src/models/CodingSubmission.js";
import { seedCoding, codingSamples } from "../src/services/sampleCoding.js";
import { assertCodingSeedTarget } from "../src/services/codingSeedSafety.js";
import { languages } from "../src/features/coding/validation.js";
import { createApp } from "../src/app.js";
const run = promisify(execFile),
  root = fileURLToPath(new URL("../../", import.meta.url));
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
it("registers both npm commands and includes the operator entry point", async () => {
  const rootManifest = JSON.parse(
    await readFile(root + "package.json", "utf8"),
  );
  const serverManifest = JSON.parse(
    await readFile(root + "server/package.json", "utf8"),
  );
  expect(rootManifest.scripts["seed:coding"]).toBe(
    "npm run seed:coding -w server",
  );
  expect(serverManifest.scripts["seed:coding"]).toBe(
    "tsx src/utils/seedCoding.ts",
  );
  expect(
    await readFile(root + "server/src/utils/seedCoding.ts", "utf8"),
  ).toContain("assertCodingSeedTarget");
});
it("requires an acknowledged development destination before connecting", () => {
  expect(
    assertCodingSeedTarget(
      "development",
      "mongodb://example.invalid/disha360_dev",
      "disha360_dev",
    ),
  ).toBe("disha360_dev");
  for (const mode of ["production", "test"])
    expect(() =>
      assertCodingSeedTarget(
        mode,
        "mongodb://example.invalid/disha360_dev",
        "disha360_dev",
      ),
    ).toThrow();
  for (const [uri, target] of [
    ["mongodb://example.invalid/production", "production"],
    ["mongodb://example.invalid/disha360_dev", undefined],
    ["mongodb://example.invalid/live", "disha360_dev"],
    ["mongodb://example.invalid/", "disha360_dev"],
  ])
    expect(() => assertCodingSeedTarget("development", uri, target)).toThrow();
});
it("checks every sample example and hidden expected output against independent reference calculations", () => {
  for (const sample of codingSamples)
    for (const test of [
      ...sample.examples.map((e) => ({ input: e.input, expected: e.output })),
      ...sample.hiddenTests,
    ]) {
      let actual: string;
      if (sample.key === "sample-coding-sum")
        actual = String(
          test.input
            .trim()
            .split(/\s+/)
            .map(Number)
            .reduce((a, b) => a + b, 0),
        );
      else if (sample.key === "sample-coding-reverse")
        actual = [...test.input.trim()].reverse().join("");
      else {
        const [n, ...values] = test.input.trim().split(/\s+/).map(Number);
        expect(values).toHaveLength(n);
        // Independent quadratic reference checks fixture data, never submitted code.
        const lengths = values.map(() => 1);
        for (let i = 0; i < values.length; i++)
          for (let j = 0; j < i; j++)
            if (values[j] < values[i])
              lengths[i] = Math.max(lengths[i], lengths[j] + 1);
        actual = String(Math.max(...lengths));
      }
      expect(actual + "\n").toBe(test.expected);
    }
});
it("seeds all three difficulty levels and four supported languages without keys in student APIs", async () => {
  expect(await seedCoding("development")).toEqual({ inserted: 3, samples: 3 });
  const records = await CodingProblem.find().select("+hiddenTests");
  expect(records.map((r) => r.difficulty).sort()).toEqual([
    "easy",
    "hard",
    "medium",
  ]);
  for (const r of records) {
    expect(r.demo).toBe(true);
    expect(r.title).toMatch(/^\[SAMPLE\]/);
    expect([...r.supportedLanguages]).toEqual([...languages]);
    expect(r.hiddenTests.length).toBeGreaterThan(0);
    for (const example of r.examples) expect(example.output).toBeTruthy();
    for (const t of r.hiddenTests)
      expect(t.input.length).toBeLessThanOrEqual(10000);
  }
  const s = await studentAccount();
  const app = createApp({
    clientOrigin: "http://localhost:5173",
    databaseConfigured: true,
    allowDemoAccounts: true,
  });
  for (const path of [
    "/coding/problems",
    ...records.map((r) => `/coding/problems/${r.id}`),
  ]) {
    const response = await studentCall(app, s.cookie, "get", path);
    expect(response.status).toBe(200);
    expect(JSON.stringify(response.body)).not.toMatch(
      /hiddenTests|"expected"|"correctOptionId"/,
    );
  }
  expect(
    (await studentCall(app, s.cookie, "get", "/coding/config")).body.data
      .configured,
  ).toBe(false);
});
it("is repeatable and concurrency safe while preserving existing problems and submissions", async () => {
  await seedCoding("development");
  const p = (await CodingProblem.findOne({ difficulty: "easy" }))!;
  await CodingProblem.updateOne(
    { _id: p._id },
    { $set: { title: "Custom preserved sample title", published: false } },
  );
  const s = await studentAccount();
  const submission = await CodingSubmission.create({
    studentId: s.user._id,
    problemId: p._id,
    problemVersion: 1,
    title: p.title,
    language: "python",
    source: "private fixture source",
    requestId: crypto.randomUUID(),
    processingUntil: new Date(),
    status: "completed",
    verdict: "Wrong Answer",
    total: 3,
    score: 0,
  });
  const before = await CodingSubmission.findById(submission._id)
    .select("+source")
    .lean();
  await Promise.all([seedCoding("development"), seedCoding("development")]);
  expect(await CodingProblem.countDocuments()).toBe(3);
  expect((await CodingProblem.findById(p._id))?.title).toBe(
    "Custom preserved sample title",
  );
  expect((await CodingProblem.findById(p._id))?.published).toBe(false);
  expect(
    await CodingSubmission.findById(submission._id).select("+source").lean(),
  ).toEqual(before);
});
it("refuses non-demo collisions without inserting or overwriting anything", async () => {
  await CodingProblem.create({
    ...codingSamples[1],
    published: true,
    demo: false,
    version: 1,
  });
  await expect(seedCoding("development")).rejects.toThrow("Non-demo");
  expect(await CodingProblem.countDocuments()).toBe(1);
  expect((await CodingProblem.findOne())?.demo).toBe(false);
});
it("runs the actual root and server npm commands safely and idempotently", async () => {
  const uri = `mongodb://${mongoose.connection.host}:${mongoose.connection.port}/disha360_seed_dev`;
  const env = {
    ...process.env,
    NODE_ENV: "development",
    MONGODB_URI: uri,
    CODING_SEED_DATABASE: "disha360_seed_dev",
    OPENAI_API_KEY: "",
    JUDGE0_URL: "",
    JUDGE0_API_KEY: "",
  };
  const connection = await mongoose.createConnection(uri).asPromise();
  try {
    await connection.db!.dropDatabase();
    const first = await run("npm", ["run", "seed:coding"], {
      cwd: root,
      env,
      timeout: 20000,
    });
    expect(first.stdout).toContain("3 inserted");
    const second = await run("npm", ["run", "seed:coding"], {
      cwd: root + "server",
      env,
      timeout: 20000,
    });
    expect(second.stdout).toContain("0 inserted");
    expect(
      await connection.db!.collection("codingproblems").countDocuments(),
    ).toBe(3);
  } finally {
    await connection.db!.dropDatabase();
    await connection.close();
  }
}, 45000);
it("production npm invocation fails before touching the unreachable destination and omits credentials", async () => {
  try {
    await run("npm", ["run", "seed:coding"], {
      cwd: root,
      env: {
        ...process.env,
        NODE_ENV: "production", CLIENT_ORIGIN: "https://frontend.example.test",
        MONGODB_URI:
          "mongodb://fixture-user:fixture-sensitive-password@127.0.0.1:1/production",
        CODING_SEED_DATABASE: "production",
        OPENAI_API_KEY: "",
        JUDGE0_URL: "",
      },
      timeout: 10000,
    });
    throw new Error("Unexpected success");
  } catch (e) {
    const error = e as { code: number; stderr: string; stdout: string };
    expect(error.code).not.toBe(0);
    expect(error.stderr).toContain("NODE_ENV=development");
    expect((error.stderr || "") + (error.stdout || "")).not.toContain(
      "fixture-sensitive-password",
    );
  }
});
