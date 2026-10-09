import { beforeAll, beforeEach, afterAll, it, expect } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  testDatabase,
  studentAccount,
  studentCall,
} from "./helpers/student.js";
import { createApp } from "../src/app.js";
import { Company, CompanyProgress } from "../src/models/Company.js";
import {
  seedCompanies,
  companySamples,
} from "../src/services/sampleCompanies.js";
import { preparationProgress } from "../src/services/companyPreparation.js";
import { LearningModule } from "../src/models/LearningModule.js";
import { CodingProblem } from "../src/models/CodingProblem.js";
import { Assessment, Question } from "../src/models/Assessment.js";
import { seedCoding } from "../src/services/sampleCoding.js";
import { seedSampleAssessments } from "../src/services/sampleAssessments.js";
const app = () =>
  createApp({
    clientOrigin: "http://localhost:5173",
    databaseConfigured: true,
    allowDemoAccounts: true,
  });
let db: Awaited<ReturnType<typeof testDatabase>>;
beforeAll(async () => {
  db = await testDatabase();
}, 180000);
beforeEach(async () => {
  await db.clear();
});
afterAll(async () => {
  await db?.close();
});
async function setup() {
  await seedCompanies("development");
  const student = await studentAccount();
  const company = (await Company.findOne({ name: "TCS" }))!;
  return { student, company, app: app() };
}
it("lists all six illustrative companies, supports case-insensitive literal search and filters, and starts at zero", async () => {
  const { student, app } = await setup();
  const result = await studentCall(app, student.cookie, "get", "/companies");
  expect(result.status).toBe(200);
  expect(result.body.data.companies).toHaveLength(6);
  expect(
    result.body.data.companies.map((c: { name: string }) => c.name).sort(),
  ).toEqual(["Accenture", "Capgemini", "Cognizant", "Infosys", "TCS", "Wipro"]);
  for (const c of result.body.data.companies) {
    expect(c.demo).toBe(true);
    expect(c.disclaimer).toMatch(/Illustrative/);
    expect(c.progress).toEqual({
      completedItemKeys: [],
      completed: 0,
      total: 5,
      percent: 0,
    });
  }
  expect(
    (await studentCall(app, student.cookie, "get", "/companies?search=tCs"))
      .body.data.companies,
  ).toHaveLength(1);
  expect(
    (await studentCall(app, student.cookie, "get", "/companies?search=%5B.*"))
      .body.data.companies,
  ).toEqual([]);
  expect(
    (
      await studentCall(
        app,
        student.cookie,
        "get",
        "/companies?industry=Unknown",
      )
    ).body.data.companies,
  ).toEqual([]);
  expect(
    (
      await studentCall(
        app,
        student.cookie,
        "get",
        "/companies?completion=complete",
      )
    ).body.data.companies,
  ).toEqual([]);
});
it("requires student authentication and prevents staff access or student content mutations", async () => {
  const { company, student, app } = await setup();
  expect((await request(app).get("/api/v1/student/companies")).status).toBe(
    401,
  );
  for (const role of ["trainer", "admin"] as const) {
    const staff = await studentAccount(role);
    for (const path of ["/companies", `/companies/${company.id}`])
      expect((await studentCall(app, staff.cookie, "get", path)).status).toBe(
        403,
      );
    expect(
      (
        await studentCall(
          app,
          staff.cookie,
          "put",
          `/companies/${company.id}/progress`,
          { itemKey: "coding", completed: true },
        )
      ).status,
    ).toBe(403);
  }
  expect(
    (
      await studentCall(
        app,
        student.cookie,
        "post",
        "/companies",
        companySamples[0],
      )
    ).status,
  ).toBe(404);
  expect(
    (
      await studentCall(
        app,
        student.cookie,
        "put",
        `/companies/${company.id}`,
        { name: "Changed" },
      )
    ).status,
  ).toBe(404);
  expect((await Company.findById(company._id))?.name).toBe("TCS");
});
it("returns complete profiles and honest empty resource groups without invented scores", async () => {
  const { company, student, app } = await setup();
  const r = await studentCall(
    app,
    student.cookie,
    "get",
    `/companies/${company.id}`,
  );
  expect(r.status).toBe(200);
  expect(r.body.data.company.checklist).toHaveLength(5);
  expect(r.body.data.company.topics.hr.length).toBeGreaterThan(0);
  expect(r.body.data.resources.learning).toEqual([]);
  expect(r.body.data.resources.assessments).toEqual([]);
  expect(r.body.data.resources.coding).toEqual([]);
  expect(r.body.data.resources.interview.href).toBe("/interviews");
  expect(JSON.stringify(r.body)).not.toMatch(
    /studentId|password|score|hiddenTests|correctOptionId/,
  );
});
it("persists complete/incomplete changes, supports refresh, and deduplicates repeated updates", async () => {
  const { company, student, app } = await setup();
  const path = `/companies/${company.id}/progress`;
  for (let i = 0; i < 2; i++)
    expect(
      (
        await studentCall(app, student.cookie, "put", path, {
          itemKey: "coding",
          completed: true,
        })
      ).body.data.company.progress.percent,
    ).toBe(20);
  expect(await CompanyProgress.countDocuments()).toBe(1);
  expect(
    (await studentCall(app, student.cookie, "get", `/companies/${company.id}`))
      .body.data.company.progress.completedItemKeys,
  ).toEqual(["coding"]);
  expect(
    (
      await studentCall(app, student.cookie, "put", path, {
        itemKey: "coding",
        completed: false,
      })
    ).body.data.company.progress.percent,
  ).toBe(0);
  expect(
    (
      await studentCall(
        app,
        student.cookie,
        "get",
        "/companies?completion=not-started",
      )
    ).body.data.companies,
  ).toHaveLength(6);
});
it("supports initial unchecked writes and concurrent distinct completions without duplicate progress or lost items", async () => {
  const { company, student, app } = await setup();
  const path = `/companies/${company.id}/progress`;
  expect(
    (
      await studentCall(app, student.cookie, "put", path, {
        itemKey: "coding",
        completed: false,
      })
    ).status,
  ).toBe(200);
  await CompanyProgress.deleteMany({});
  const responses = await Promise.all(
    company.checklist.map((i) =>
      studentCall(app, student.cookie, "put", path, {
        itemKey: i.key,
        completed: true,
      }),
    ),
  );
  expect(responses.every((r) => r.status === 200)).toBe(true);
  expect(await CompanyProgress.countDocuments()).toBe(1);
  expect(
    (await studentCall(app, student.cookie, "get", `/companies/${company.id}`))
      .body.data.company.progress.percent,
  ).toBe(100);
  expect(
    (
      await studentCall(
        app,
        student.cookie,
        "get",
        "/companies?completion=complete",
      )
    ).body.data.companies,
  ).toHaveLength(1);
});
it("isolates students and companies and rejects supplied ownership/score fields", async () => {
  const { company, student, app } = await setup();
  const other = await studentAccount();
  const second = (await Company.findOne({ name: "Wipro" }))!;
  await studentCall(
    app,
    student.cookie,
    "put",
    `/companies/${company.id}/progress`,
    { itemKey: "aptitude", completed: true },
  );
  expect(
    (await studentCall(app, other.cookie, "get", `/companies/${company.id}`))
      .body.data.company.progress.percent,
  ).toBe(0);
  expect(
    (await studentCall(app, student.cookie, "get", `/companies/${second.id}`))
      .body.data.company.progress.percent,
  ).toBe(0);
  for (const extra of [
    { studentId: student.user.id },
    { companyId: second.id },
    { percent: 100 },
  ])
    expect(
      (
        await studentCall(
          app,
          other.cookie,
          "put",
          `/companies/${company.id}/progress`,
          { itemKey: "coding", completed: true, ...extra },
        )
      ).status,
    ).toBe(400);
  expect(
    (await CompanyProgress.findOne({ studentId: student.user._id }))
      ?.completedItemKeys,
  ).toEqual(["aptitude"]);
});
it("validates item IDs, query parameters and mutation protection without creating progress on failures", async () => {
  const { company, student, app } = await setup();
  for (const body of [
    { itemKey: "missing", completed: true },
    { itemKey: "coding", completed: "true" },
    { completed: true },
  ])
    expect(
      (
        await studentCall(
          app,
          student.cookie,
          "put",
          `/companies/${company.id}/progress`,
          body,
        )
      ).status,
    ).toBe(400);
  expect(
    (
      await studentCall(
        app,
        student.cookie,
        "get",
        "/companies?completion=invalid",
      )
    ).status,
  ).toBe(400);
  expect(
    (await studentCall(app, student.cookie, "get", "/companies/not-an-id"))
      .status,
  ).toBe(400);
  expect(
    (
      await studentCall(
        app,
        student.cookie,
        "get",
        `/companies/${new mongoose.Types.ObjectId()}`,
      )
    ).status,
  ).toBe(404);
  expect(
    (
      await request(app)
        .put(`/api/v1/student/companies/${company.id}/progress`)
        .set("Cookie", student.cookie)
        .send({ itemKey: "coding", completed: true })
    ).status,
  ).toBe(403);
  expect(await CompanyProgress.countDocuments()).toBe(0);
});
it("calculates progress from current unique checklist keys, ignoring stale or duplicate completions", () => {
  expect(preparationProgress(["a", "b", "c"], ["a", "a", "removed"])).toEqual({
    completedItemKeys: ["a"],
    completed: 1,
    total: 3,
    percent: 33,
  });
  expect(preparationProgress([], ["a"]).percent).toBe(0);
  expect(preparationProgress(["a", "b"], ["a", "b"]).percent).toBe(100);
});
it("hides unpublished profiles, disallows their progress updates and hides demo profiles outside development", async () => {
  const { company, student, app } = await setup();
  await Company.updateOne({ _id: company._id }, { $set: { published: false } });
  expect(
    (await studentCall(app, student.cookie, "get", `/companies/${company.id}`))
      .status,
  ).toBe(404);
  expect(
    (
      await studentCall(
        app,
        student.cookie,
        "put",
        `/companies/${company.id}/progress`,
        { itemKey: "coding", completed: true },
      )
    ).status,
  ).toBe(404);
  const production = createApp({
    clientOrigin: "http://localhost:5173",
    databaseConfigured: true,
  });
  expect(
    (await studentCall(production, student.cookie, "get", "/companies")).body
      .data.companies,
  ).toEqual([]);
  const real = await Company.create({
    ...companySamples[0],
    key: "published-profile",
    name: "Published profile",
    demo: false,
  });
  expect(
    (
      await studentCall(
        production,
        student.cookie,
        "get",
        `/companies/${real.id}`,
      )
    ).status,
  ).toBe(200);
});
it("links real matching published resources only and never exposes hidden cases, answer keys or private records", async () => {
  const { company, student, app } = await setup();
  await seedCoding("development");
  await seedSampleAssessments("development");
  const teacher = await studentAccount("trainer");
  const module = await LearningModule.create({
    ownerId: teacher.user._id,
    title: "Database fundamentals",
    subject: "Computer Science",
    topic: "databases",
    published: true,
    lessons: [{ title: "Keys", kind: "text", body: "Learn keys." }],
  });
  await LearningModule.create({
    ownerId: teacher.user._id,
    title: "Private draft",
    subject: "Computer Science",
    topic: "Databases",
    published: false,
  });
  await LearningModule.create({
    ownerId: teacher.user._id,
    title: "Unrelated",
    subject: "Other",
    topic: "Unrelated",
    published: true,
  });
  await CodingProblem.updateOne(
    { difficulty: "easy" },
    { $set: { published: false } },
  );
  const r = await studentCall(
    app,
    student.cookie,
    "get",
    `/companies/${company.id}`,
  );
  expect(
    r.body.data.resources.learning.map((x: { id: string }) => x.id),
  ).toEqual([module.id]);
  expect(r.body.data.resources.coding).toHaveLength(1);
  expect(r.body.data.resources.assessments).toHaveLength(4);
  const serialized = JSON.stringify(r.body);
  expect(serialized).not.toMatch(
    /"(?:hiddenTests|expected|correctOptionId|questionIds|ownerId|studentId|passwordHash)"\s*:/,
  );
  const production = createApp({
    clientOrigin: "http://localhost:5173",
    databaseConfigured: true,
  });
  await Company.updateOne({ _id: company._id }, { $set: { demo: false } });
  const safe = (
    await studentCall(
      production,
      student.cookie,
      "get",
      `/companies/${company.id}`,
    )
  ).body.data.resources;
  expect(safe.coding).toEqual([]);
  expect(safe.assessments).toEqual([]);
});
it("omits closed, not-yet-open and unusable assessments from recommendations", async () => {
  const { company, student, app } = await setup();
  await seedSampleAssessments("development");
  await Assessment.updateOne(
    { category: "quantitative" },
    { $set: { closesAt: new Date(Date.now() - 1000) } },
  );
  await Assessment.updateOne(
    { category: "logical" },
    { $set: { opensAt: new Date(Date.now() + 60000) } },
  );
  await Question.updateMany(
    { category: "technical" },
    { $set: { published: false } },
  );
  const r = await studentCall(
    app,
    student.cookie,
    "get",
    `/companies/${company.id}`,
  );
  expect(
    r.body.data.resources.assessments.map((a: { detail: string }) => a.detail),
  ).toEqual(["verbal"]);
});
it("seeds safely and idempotently while preserving custom records, sample edits and existing progress", async () => {
  await expect(seedCompanies("production")).rejects.toThrow();
  expect(await Company.countDocuments()).toBe(0);
  const { company, student, app } = await setup();
  await Company.updateOne(
    { _id: company._id },
    { $set: { overview: "Preserved custom overview", published: false } },
  );
  await Company.create({
    ...companySamples[0],
    key: "custom-company",
    name: "Custom profile",
    demo: false,
  });
  await CompanyProgress.create({
    studentId: student.user._id,
    companyId: company._id,
    completedItemKeys: ["coding"],
  });
  await Promise.all([
    seedCompanies("development"),
    seedCompanies("development"),
  ]);
  expect(await Company.countDocuments()).toBe(7);
  expect((await Company.findById(company._id))?.overview).toBe(
    "Preserved custom overview",
  );
  expect((await Company.findById(company._id))?.published).toBe(false);
  expect((await CompanyProgress.findOne())?.completedItemKeys).toEqual([
    "coding",
  ]);
  expect(
    (await studentCall(app, student.cookie, "get", "/companies")).status,
  ).toBe(200);
});
it("refuses non-demo seed key conflicts before inserting any samples", async () => {
  await Company.create({ ...companySamples[3], demo: false });
  await expect(seedCompanies("development")).rejects.toThrow("Non-demo");
  expect(await Company.countDocuments()).toBe(1);
});
it("executes both real npm seed entry points, refuses unsafe targets before connection and keeps output private", async () => {
  const run = promisify(execFile);
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const uri = `mongodb://${mongoose.connection.host}:${mongoose.connection.port}/company_seed_dev`;
  const env = {
    ...process.env,
    NODE_ENV: "development",
    MONGODB_URI: uri,
    COMPANY_SEED_DATABASE: "company_seed_dev",
    OPENAI_API_KEY: "",
    JUDGE0_URL: "",
  };
  const connection = await mongoose.createConnection(uri).asPromise();
  try {
    const first = await run("npm", ["run", "seed:companies"], {
      cwd: root,
      env,
      timeout: 20000,
    });
    expect(first.stdout).toContain("6 inserted");
    const repeat = await run("npm", ["run", "seed:companies"], {
      cwd: root + "server",
      env,
      timeout: 20000,
    });
    expect(repeat.stdout).toContain("0 inserted");
    expect(await connection.db!.collection("companies").countDocuments()).toBe(
      6,
    );
  } finally {
    await connection.db!.dropDatabase();
    await connection.close();
  }
  for (const patch of [
    { NODE_ENV: "production" },
    { COMPANY_SEED_DATABASE: "" },
    { COMPANY_SEED_DATABASE: "other_dev" },
  ]) {
    const result = await run("npm", ["run", "seed:companies"], {
      cwd: root,
      env: {
        ...env,
        MONGODB_URI: "mongodb://127.0.0.1:1/unsafe_dev",
        ...patch,
      },
      timeout: 10000,
    }).then(
      () => null,
      (e) => e,
    );
    expect(result).not.toBeNull();
    expect(result.stderr).toContain("Company seed refused");
    expect(result.stderr).not.toContain("mongodb://");
  }
}, 60000);
