import { assessmentFixture } from "./helpers/assessment.js";
import { startAttempt, finalizeAttempt } from "../src/services/assessments.js";
import { CodingSubmission } from "../src/models/CodingSubmission.js";
import { CodeDraft } from "../src/models/CodeDraft.js";
import { Company, CompanyProgress } from "../src/models/Company.js";
import { companySamples } from "../src/services/sampleCompanies.js";
import { User } from "../src/models/User.js";
import { beforeAll, beforeEach, afterAll, it, expect } from "vitest";
import request from "supertest";
import { testDatabase, studentAccount } from "./helpers/student.js";
import { createApp } from "../src/app.js";
import { Batch, Enrollment } from "../src/models/Batch.js";
import { Activity, LearningProgress } from "../src/models/Preparation.js";
import { LearningModule } from "../src/models/LearningModule.js";
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
const app = () =>
  createApp({
    clientOrigin: "http://localhost:5173",
    databaseConfigured: true,
    allowDemoAccounts: true,
  });
export function staffCall(
  cookie: string,
  method: "get" | "post" | "put",
  path: string,
  body?: object,
) {
  const r = request(app())
    [method]("/api/v1/staff" + path)
    .set("Cookie", cookie)
    .set("Origin", "http://localhost:5173")
    .set("X-Disha360-Request", "1");
  return body ? r.send(body) : r;
}
it("denies students and anonymous staff dashboard access", async () => {
  const student = await studentAccount();
  expect((await request(app()).get("/api/v1/staff/dashboard")).status).toBe(
    401,
  );
  expect((await staffCall(student.cookie, "get", "/dashboard")).status).toBe(
    403,
  );
});
it("returns real zero statistics and unavailable completion evidence for a trainer without assigned records", async () => {
  const trainer = await studentAccount("trainer");
  const result = await staffCall(trainer.cookie, "get", "/dashboard");
  expect(result.status).toBe(200);
  expect(result.body.data.metrics).toMatchObject({
    students: 0,
    batches: 0,
    publishedModules: 0,
    assignedAssessments: 0,
    assignmentRecords: 0,
  });
  expect(result.body.data.learning.percent).toBeNull();
  expect(result.body.data.recentActivity).toEqual([]);
  expect(result.headers["cache-control"]).toBe("no-store");
});
it("deduplicates assigned students across batches, excludes archived/unrelated memberships and private activity", async () => {
  const trainer = await studentAccount("trainer");
  const student = await studentAccount();
  const other = await studentAccount();
  const first = await Batch.create({
    name: "First",
    trainerIds: [trainer.user._id],
  });
  const second = await Batch.create({
    name: "Second",
    trainerIds: [trainer.user._id],
  });
  const unrelated = await Batch.create({ name: "Unrelated" });
  await Batch.create({
    name: "Archived",
    active: false,
    trainerIds: [trainer.user._id],
  });
  await Enrollment.create([
    { batchId: first._id, studentId: student.user._id },
    { batchId: second._id, studentId: student.user._id },
    { batchId: unrelated._id, studentId: other.user._id },
  ]);
  await Activity.create([
    {
      studentId: student.user._id,
      key: "visit",
      kind: "dashboard_visit",
      title: "Scoped real activity",
      day: "2026-10-10",
    },
    {
      studentId: student.user._id,
      key: "resume",
      kind: "resume_saved",
      title: "Private resume marker",
      day: "2026-10-10",
    },
    {
      studentId: other.user._id,
      key: "visit",
      kind: "dashboard_visit",
      title: "Unrelated student marker",
      day: "2026-10-10",
    },
  ]);
  const r = await staffCall(
    trainer.cookie,
    "get",
    `/dashboard?studentId=${other.user.id}`,
  );
  expect(r.body.data.metrics).toMatchObject({ students: 1, batches: 2 });
  expect(r.body.data.recentActivity).toHaveLength(1);
  expect(JSON.stringify(r.body)).not.toMatch(
    /Private resume marker|Unrelated student marker|passwordHash|tokenHash/,
  );
});
it("computes learning statistics from valid current lessons rather than stale cached counts", async () => {
  const trainer = await studentAccount("trainer");
  const student = await studentAccount();
  const b = await Batch.create({
    name: "Scoped",
    trainerIds: [trainer.user._id],
  });
  await Enrollment.create({ batchId: b._id, studentId: student.user._id });
  const module = await LearningModule.create({
    ownerId: trainer.user._id,
    title: "Live learning",
    subject: "Algorithms",
    topic: "Arrays",
    published: true,
    lessons: [
      { title: "Lesson A", kind: "text", body: "First lesson" },
      { title: "Lesson B", kind: "text", body: "Second lesson" },
    ],
  });
  await LearningProgress.create({
    studentId: student.user._id,
    moduleId: module._id,
    moduleKey: module.id,
    title: module.title,
    completedLessons: 2,
    totalLessons: 2,
    completedLessonIds: [module.lessons[0]._id],
  });
  const r = await staffCall(trainer.cookie, "get", "/dashboard");
  expect(r.body.data.learning).toMatchObject({
    completedLessons: 1,
    totalLessons: 2,
    percent: 50,
    completedModules: 0,
  });
  expect(r.body.data.metrics.publishedModules).toBe(1);
  await LearningModule.updateOne(
    { _id: module._id },
    { $set: { published: false } },
  );
  expect(
    (await staffCall(trainer.cookie, "get", "/dashboard")).body.data.learning
      .percent,
  ).toBeNull();
});
it("admin institution totals come from actual records and trainer access never implies institutional access", async () => {
  const admin = await studentAccount("admin");
  await studentAccount("student");
  await studentAccount("student");
  const trainer = await studentAccount("trainer");
  await studentAccount("trainer");
  await Batch.create([{ name: "Active" }, { name: "Archived", active: false }]);
  const result = await staffCall(admin.cookie, "get", "/dashboard");
  expect(result.body.data.metrics).toMatchObject({
    students: 2,
    trainers: 2,
    batches: 2,
    activeBatches: 1,
    modules: 0,
    assessments: 0,
  });
  expect(
    (await staffCall(trainer.cookie, "get", "/dashboard")).body.data.metrics
      .students,
  ).toBe(0);
});
it("admin creates batches, assigns trainers, manages idempotent student membership and preserves removed records", async () => {
  const admin = await studentAccount("admin"),
    trainer = await studentAccount("trainer"),
    student = await studentAccount();
  const created = await staffCall(admin.cookie, "post", "/batches", {
    name: "Placement 2026",
    description: "Final-year preparation\nPractice together",
    trainerIds: [trainer.user.id],
  });
  expect(created.status).toBe(201);
  expect(created.body.data.description).toBe(
    "Final-year preparation\nPractice together",
  );
  const id = created.body.data.id;
  for (let i = 0; i < 2; i++)
    expect(
      (
        await staffCall(
          admin.cookie,
          "put",
          `/batches/${id}/members/${student.user.id}`,
          { active: true },
        )
      ).status,
    ).toBe(200);
  expect(await Enrollment.countDocuments()).toBe(1);
  expect(
    (await staffCall(trainer.cookie, "get", `/batches/${id}`)).body.data
      .students[0],
  ).toMatchObject({ id: student.user.id, name: student.user.name });
  expect(
    (await staffCall(trainer.cookie, "get", "/dashboard")).body.data.metrics
      .students,
  ).toBe(1);
  expect(
    (
      await staffCall(
        admin.cookie,
        "put",
        `/batches/${id}/members/${student.user.id}`,
        { active: false },
      )
    ).status,
  ).toBe(200);
  expect(await Enrollment.countDocuments()).toBe(1);
  expect(
    (await staffCall(trainer.cookie, "get", `/batches/${id}`)).body.data
      .students,
  ).toEqual([]);
});
it("rejects duplicate trainer IDs, incorrect user roles, malformed data and privileged student writes", async () => {
  const admin = await studentAccount("admin"),
    student = await studentAccount(),
    trainer = await studentAccount("trainer");
  const body = {
    name: "Safe batch",
    description: "",
    trainerIds: [trainer.user.id],
  };
  expect(
    (
      await staffCall(admin.cookie, "post", "/batches", {
        ...body,
        trainerIds: [trainer.user.id, trainer.user.id],
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await staffCall(admin.cookie, "post", "/batches", {
        ...body,
        trainerIds: [student.user.id],
      })
    ).status,
  ).toBe(400);
  expect(
    (await staffCall(student.cookie, "post", "/batches", body)).status,
  ).toBe(403);
  expect(
    (await staffCall(trainer.cookie, "post", "/batches", body)).status,
  ).toBe(403);
  expect(
    (
      await staffCall(admin.cookie, "post", "/batches", {
        ...body,
        ownerId: student.user.id,
      })
    ).status,
  ).toBe(400);
  const b = await Batch.create(body);
  expect(
    (
      await staffCall(
        admin.cookie,
        "put",
        `/batches/${b.id}/members/${trainer.user.id}`,
        { active: true },
      )
    ).status,
  ).toBe(400);
  expect(
    (await staffCall(admin.cookie, "get", "/batches/not-an-id")).status,
  ).toBe(400);
});
it("trainer batch reads are isolated, edits are admin-only, and archive or reassignment immediately revokes access", async () => {
  const admin = await studentAccount("admin"),
    trainer = await studentAccount("trainer"),
    other = await studentAccount("trainer");
  const owned = await Batch.create({
      name: "Assigned",
      trainerIds: [trainer.user._id],
    }),
    unrelated = await Batch.create({
      name: "Unrelated",
      trainerIds: [other.user._id],
    });
  expect(
    (await staffCall(trainer.cookie, "get", "/batches")).body.data.map(
      (b: { id: string }) => b.id,
    ),
  ).toEqual([owned.id]);
  expect(
    (await staffCall(trainer.cookie, "get", `/batches/${unrelated.id}`)).status,
  ).toBe(404);
  const edit = {
    name: "Changed name",
    description: "Real description",
    trainerIds: [trainer.user.id],
    active: true,
    version: 1,
  };
  expect(
    (await staffCall(trainer.cookie, "put", `/batches/${owned.id}`, edit))
      .status,
  ).toBe(403);
  expect(
    (await staffCall(admin.cookie, "put", `/batches/${owned.id}`, edit)).body
      .data.version,
  ).toBe(2);
  expect(
    (await staffCall(admin.cookie, "put", `/batches/${owned.id}`, edit)).status,
  ).toBe(409);
  expect(
    (
      await staffCall(admin.cookie, "put", `/batches/${owned.id}`, {
        ...edit,
        version: 2,
        trainerIds: [other.user.id],
      })
    ).status,
  ).toBe(200);
  expect(
    (await staffCall(trainer.cookie, "get", `/batches/${owned.id}`)).status,
  ).toBe(404);
  expect(
    (
      await staffCall(admin.cookie, "put", `/batches/${owned.id}`, {
        ...edit,
        version: 3,
        active: false,
      })
    ).status,
  ).toBe(200);
  expect(
    (await staffCall(trainer.cookie, "get", `/batches/${owned.id}`)).status,
  ).toBe(404);
  expect(
    (await staffCall(admin.cookie, "get", `/batches/${owned.id}`)).status,
  ).toBe(200);
  const student = await studentAccount();
  expect(
    (
      await staffCall(
        admin.cookie,
        "put",
        `/batches/${owned.id}/members/${student.user.id}`,
        { active: true },
      )
    ).status,
  ).toBe(409);
});
it("staff account selectors are admin-only, search is literal and no secrets are serialized", async () => {
  const admin = await studentAccount("admin"),
    trainer = await studentAccount("trainer");
  await studentAccount();
  expect(
    (await staffCall(trainer.cookie, "get", "/people?role=student")).status,
  ).toBe(403);
  const r = await staffCall(admin.cookie, "get", "/people?role=trainer");
  expect(r.body.data.people).toHaveLength(1);
  expect(JSON.stringify(r.body)).not.toMatch(/passwordHash|isDemo|tokenHash/);
  expect(
    (await staffCall(admin.cookie, "get", "/people?role=student&search=%5B"))
      .status,
  ).toBe(200);
  expect(
    (await staffCall(admin.cookie, "get", "/people?role=admin")).status,
  ).toBe(400);
});
it("updates pre-existing batches without a version field without losing conflict protection", async () => {
  const admin = await studentAccount("admin");
  const b = await Batch.create({ name: "Legacy batch" });
  await Batch.collection.updateOne(
    { _id: b._id },
    { $unset: { version: 1, trainerIds: 1, description: 1 } },
  );
  const body = {
    name: "Updated legacy",
    description: "",
    trainerIds: [],
    active: true,
    version: 1,
  };
  expect(
    (await staffCall(admin.cookie, "put", `/batches/${b.id}`, body)).body.data
      .version,
  ).toBe(2);
  expect(
    (await staffCall(admin.cookie, "put", `/batches/${b.id}`, body)).status,
  ).toBe(409);
});
it("student directory search and batch filters cannot broaden trainer scope or reveal unrelated batch memberships", async () => {
  const trainer = await studentAccount("trainer"),
    otherTrainer = await studentAccount("trainer"),
    student = await studentAccount(),
    other = await studentAccount();
  const own = await Batch.create({
      name: "Owned batch",
      trainerIds: [trainer.user._id],
    }),
    unrelated = await Batch.create({
      name: "Private other batch",
      trainerIds: [otherTrainer.user._id],
    });
  await Enrollment.create([
    { batchId: own._id, studentId: student.user._id },
    { batchId: unrelated._id, studentId: student.user._id },
    { batchId: unrelated._id, studentId: other.user._id },
  ]);
  const r = await staffCall(trainer.cookie, "get", "/students");
  expect(r.status).toBe(200);
  expect(r.body.data.total).toBe(1);
  expect(
    r.body.data.students[0].batches.map((b: { id: string }) => b.id),
  ).toEqual([own.id]);
  expect(JSON.stringify(r.body)).not.toContain("Private other batch");
  expect(
    (
      await staffCall(
        trainer.cookie,
        "get",
        `/students?batchId=${unrelated.id}`,
      )
    ).status,
  ).toBe(404);
  expect(
    (
      await staffCall(
        trainer.cookie,
        "get",
        `/students?search=${encodeURIComponent(other.user.email)}`,
      )
    ).body.data.total,
  ).toBe(0);
  expect(
    (await staffCall(trainer.cookie, "get", "/students?department=Physics"))
      .body.data.total,
  ).toBe(0);
  expect(
    (await staffCall(trainer.cookie, "get", "/students?page=0")).status,
  ).toBe(400);
  expect(
    (await staffCall(trainer.cookie, "get", "/students?role=admin")).status,
  ).toBe(400);
  expect((await staffCall(student.cookie, "get", "/students")).status).toBe(
    403,
  );
  expect(
    (await staffCall(student.cookie, "get", `/students/${student.user.id}`))
      .status,
  ).toBe(403);
});
it("trainer cannot access an unrelated student profile, while admin can view unbatched and archived memberships", async () => {
  const trainer = await studentAccount("trainer"),
    student = await studentAccount(),
    admin = await studentAccount("admin");
  expect(
    (await staffCall(trainer.cookie, "get", `/students/${student.user.id}`))
      .status,
  ).toBe(404);
  const b = await Batch.create({
    name: "Archived history",
    active: false,
    trainerIds: [trainer.user._id],
  });
  await Enrollment.create({ studentId: student.user._id, batchId: b._id });
  const r = await staffCall(
    admin.cookie,
    "get",
    `/students/${student.user.id}`,
  );
  expect(r.status).toBe(200);
  expect(r.body.data.student.id).toBe(student.user.id);
  expect(r.body.data.batches[0]).toMatchObject({ id: b.id, active: false });
  expect(
    (await staffCall(trainer.cookie, "get", `/students/${student.user.id}`))
      .status,
  ).toBe(404);
  expect(
    (await staffCall(admin.cookie, "get", `/students?batchId=${b.id}`)).body
      .data.total,
  ).toBe(1);
});
it("student summaries distinguish missing evidence from zero performance", async () => {
  const admin = await studentAccount("admin"),
    student = await studentAccount();
  const r = await staffCall(
    admin.cookie,
    "get",
    `/students/${student.user.id}`,
  );
  expect(r.body.data.assessments.overview).toMatchObject({
    completedAttempts: 0,
    averageScore: null,
    evidence: "no-data",
  });
  expect(r.body.data.coding).toMatchObject({
    judged: 0,
    attempted: 0,
    solved: 0,
    solveRate: null,
  });
  expect(r.body.data.learning).toMatchObject({
    completedLessons: 0,
    totalLessons: 0,
    percent: null,
    records: [],
  });
  expect(r.body.data.companies).toEqual([]);
  expect(JSON.stringify(r.body)).not.toMatch(
    /passwordHash|tokenHash|correctOptionId|"questions":\[/,
  );
});
it("student performance uses real finalized assessment, coding and current learning records without returning private payloads", async () => {
  const admin = await studentAccount("admin"),
    trainer = await studentAccount("trainer"),
    student = await studentAccount(),
    other = await studentAccount();
  const batch = await Batch.create({
    name: "Assigned",
    trainerIds: [trainer.user._id],
  });
  await Enrollment.create({ studentId: student.user._id, batchId: batch._id });
  const bank = await assessmentFixture();
  const attempt = await startAttempt(bank.assessment.id, student.user.id, true);
  for (const q of attempt.questions) q.selectedOptionId = q.correctOptionId;
  await attempt.save();
  await finalizeAttempt(attempt.id, student.user.id, attempt.version);
  const active = await startAttempt(bank.assessment.id, student.user.id, true);
  const coding = {
    studentId: student.user._id,
    problemId: bank.assessment._id,
    problemVersion: 1,
    title: "Saved coding result",
    language: "python",
    source: "PRIVATE_STUDENT_SOURCE",
    requestId: "saved-success",
    status: "completed",
    processingUntil: new Date(),
    verdict: "Accepted",
    total: 2,
    passed: 2,
    score: 100,
    finishedAt: new Date(),
  };
  await CodingSubmission.create([
    coding,
    {
      ...coding,
      requestId: "saved-failure",
      verdict: "System Error",
      score: null,
    },
    { ...coding, requestId: "different-student", studentId: other.user._id },
  ]);
  await CodeDraft.create({
    studentId: student.user._id,
    scope: "workspace",
    language: "python",
    source: "PRIVATE_DRAFT_SOURCE",
  });
  const m = await LearningModule.create({
    ownerId: trainer.user._id,
    title: "Published module",
    subject: "Algorithms",
    topic: "Arrays",
    published: true,
    lessons: [{ title: "One lesson", kind: "text", body: "Learn arrays" }],
  });
  await LearningProgress.create({
    studentId: student.user._id,
    moduleId: m._id,
    moduleKey: m.id,
    title: m.title,
    completedLessons: 0,
    totalLessons: 1,
    completedLessonIds: [m.lessons[0]._id],
  });
  const r = await staffCall(
    trainer.cookie,
    "get",
    `/students/${student.user.id}`,
  );
  expect(r.status).toBe(200);
  expect(r.body.data.assessments.overview).toMatchObject({
    completedAttempts: 1,
    averageScore: 100,
  });
  expect(r.body.data.coding).toMatchObject({
    judged: 1,
    attempted: 1,
    solved: 1,
    solveRate: 100,
  });
  expect(r.body.data.coding.history).toHaveLength(2);
  expect(r.body.data.learning).toMatchObject({
    completedLessons: 1,
    totalLessons: 1,
    percent: 100,
  });
  expect(r.body.data.companies).toBeNull();
  expect(JSON.stringify(r.body)).not.toMatch(
    /PRIVATE_STUDENT_SOURCE|PRIVATE_DRAFT_SOURCE|correctOptionId|explanation|hiddenTests|selectedOptionId/,
  );
  expect(
    r.body.data.assessments.history.some(
      (a: { id: string }) => a.id === active.id,
    ),
  ).toBe(false);
  expect(
    (await staffCall(admin.cookie, "get", `/students/${student.user.id}`)).body
      .data.assessments.overview.averageScore,
  ).toBe(100);
});
it("admin company summaries use current valid checklist keys and never mix student progress", async () => {
  const admin = await studentAccount("admin"),
    student = await studentAccount(),
    other = await studentAccount();
  const company = await Company.create(companySamples[0]);
  await CompanyProgress.create([
    {
      studentId: student.user._id,
      companyId: company._id,
      completedItemKeys: ["coding", "removed-key", "coding"],
    },
    {
      studentId: other.user._id,
      companyId: company._id,
      completedItemKeys: company.checklist.map((i) => i.key),
    },
  ]);
  const r = await staffCall(
    admin.cookie,
    "get",
    `/students/${student.user.id}`,
  );
  expect(r.body.data.companies).toHaveLength(1);
  expect(r.body.data.companies[0]).toMatchObject({
    id: company.id,
    completed: 1,
    total: 5,
    percent: 20,
    recorded: true,
  });
});
it("membership removal immediately revokes profile access and archived students do not remain in trainer directory", async () => {
  const admin = await studentAccount("admin"),
    trainer = await studentAccount("trainer"),
    student = await studentAccount();
  const b = await Batch.create({
    name: "Assigned",
    trainerIds: [trainer.user._id],
  });
  await Enrollment.create({ batchId: b._id, studentId: student.user._id });
  expect(
    (await staffCall(trainer.cookie, "get", `/students/${student.user.id}`))
      .status,
  ).toBe(200);
  await staffCall(
    admin.cookie,
    "put",
    `/batches/${b.id}/members/${student.user.id}`,
    { active: false },
  );
  expect(
    (await staffCall(trainer.cookie, "get", `/students/${student.user.id}`))
      .status,
  ).toBe(404);
  expect(
    (await staffCall(trainer.cookie, "get", "/students")).body.data.total,
  ).toBe(0);
});
it("non-development staff visibility excludes demo students and their memberships and activity", async () => {
  const admin = await studentAccount("admin"),
    student = await studentAccount();
  await User.updateOne({ _id: student.user._id }, { $set: { isDemo: true } });
  const productionLike = createApp({
    clientOrigin: "http://localhost:5173",
    databaseConfigured: true,
    allowDemoAccounts: false,
  });
  expect(
    (
      await request(productionLike)
        .get("/api/v1/staff/students")
        .set("Cookie", admin.cookie)
    ).body.data.total,
  ).toBe(0);
  expect(
    (
      await request(productionLike)
        .get(`/api/v1/staff/students/${student.user.id}`)
        .set("Cookie", admin.cookie)
    ).status,
  ).toBe(404);
  expect(
    (
      await request(productionLike)
        .get("/api/v1/staff/dashboard")
        .set("Cookie", admin.cookie)
    ).body.data.metrics.students,
  ).toBe(0);
});
it("staff mutations require the existing origin/header protection and database outages return a safe unavailable response", async () => {
  const admin = await studentAccount("admin");
  const body = { name: "Secure batch", description: "", trainerIds: [] };
  expect(
    (
      await request(app())
        .post("/api/v1/staff/batches")
        .set("Cookie", admin.cookie)
        .send(body)
    ).status,
  ).toBe(403);
  expect(
    (
      await request(app())
        .post("/api/v1/staff/batches")
        .set("Cookie", admin.cookie)
        .set("X-Disha360-Request", "1")
        .set("Origin", "https://untrusted.example")
        .send(body)
    ).status,
  ).toBe(403);
  expect(await Batch.countDocuments()).toBe(0);
  const disconnected = createApp({
    clientOrigin: "http://localhost:5173",
    databaseConfigured: true,
    status: () => "disconnected",
  });
  const r = await request(disconnected)
    .get("/api/v1/staff/dashboard")
    .set("Cookie", admin.cookie);
  expect(r.status).toBe(503);
  expect(r.body.error.code).toBe("DATABASE_UNAVAILABLE");
  expect(r.headers["cache-control"]).toBe("no-store");
});
it("concurrent membership additions create only a single enrollment", async () => {
  const admin = await studentAccount("admin"),
    student = await studentAccount();
  const b = await Batch.create({ name: "Concurrent batch" });
  const results = await Promise.all(
    Array.from({ length: 4 }, () =>
      staffCall(
        admin.cookie,
        "put",
        `/batches/${b.id}/members/${student.user.id}`,
        { active: true },
      ),
    ),
  );
  expect(results.every((r) => r.status === 200)).toBe(true);
  expect(
    await Enrollment.countDocuments({
      batchId: b._id,
      studentId: student.user._id,
    }),
  ).toBe(1);
});
