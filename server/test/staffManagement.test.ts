import { beforeAll, beforeEach, afterAll, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { staffDatabase } from "./helpers/staffDatabase.js";
import { studentAccount, studentCall } from "./helpers/student.js";
import { Assessment, Question, TestAttempt } from "../src/models/Assessment.js";
import { Batch, Enrollment } from "../src/models/Batch.js";
import { BatchAssignment } from "../src/models/BatchAssignment.js";
import { questionCSVTemplate } from "../src/services/questionCSV.js";
import { finalizeAttempt } from "../src/services/assessments.js";
let db: Awaited<ReturnType<typeof staffDatabase>>;
beforeAll(async () => {
  db = await staffDatabase();
}, 180000);
beforeEach(async () => db.clear());
afterAll(async () => db?.close());
const app = () =>
  createApp({
    clientOrigin: "http://localhost:5173",
    databaseConfigured: true,
    allowDemoAccounts: true,
  });
function call(
  cookie: string,
  method: "get" | "post" | "put" | "delete",
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
const config = {
  title: "Placement arithmetic",
  instructions:
    "Choose one option. All timing and scoring are enforced by the backend.",
  category: "quantitative",
  questionCount: 1,
  durationSeconds: 120,
  pointsPerCorrect: 2,
  penaltyPerIncorrect: 0.5,
  maxAttempts: 3,
  opensAt: null,
  closesAt: null,
};
const q = {
  prompt: "What is two plus two?",
  topic: "Arithmetic",
  difficulty: "easy",
  options: [
    { id: "a", text: "4" },
    { id: "b", text: "5" },
    { id: "c", text: "6" },
    { id: "d", text: "7" },
  ],
  correctOptionId: "a",
  explanation: "Two plus two equals four.",
  shuffleOptions: true,
  expectedSeconds: 60,
};
async function draft(role: "trainer" | "admin" = "trainer") {
  const actor = await studentAccount(role),
    r = await call(actor.cookie, "post", "/assessments", config);
  expect(r.status).toBe(201);
  return { actor, id: r.body.data.id };
}
async function state(cookie: string, id: string) {
  const r = await call(cookie, "get", `/assessments/${id}`);
  expect(r.status).toBe(200);
  return r.body.data;
}
async function bank() {
  const { actor, id } = await draft();
  let d = await state(actor.cookie, id);
  expect(
    (
      await call(actor.cookie, "post", `/assessments/${id}/questions`, {
        version: d.assessment.version,
        content: q,
      })
    ).status,
  ).toBe(201);
  d = await state(actor.cookie, id);
  expect(
    (
      await call(actor.cookie, "put", `/assessments/${id}/publish`, {
        version: d.assessment.version,
        published: true,
      })
    ).status,
  ).toBe(200);
  return { actor, id };
}
it("authorizes only staff and enforces assessment ownership, leaving ownerless legacy assessments Admin-only", async () => {
  const student = await studentAccount(),
    other = await studentAccount("trainer"),
    admin = await studentAccount("admin"),
    { actor, id } = await draft();
  expect(
    (await call(student.cookie, "post", "/assessments", config)).status,
  ).toBe(403);
  expect((await call(other.cookie, "get", `/assessments/${id}`)).status).toBe(
    404,
  );
  expect((await call(other.cookie, "get", "/assessments")).body.data).toEqual(
    [],
  );
  expect((await call(admin.cookie, "get", `/assessments/${id}`)).status).toBe(
    200,
  );
  await Assessment.updateOne({ _id: id }, { $set: { ownerId: null } });
  expect((await call(actor.cookie, "get", `/assessments/${id}`)).status).toBe(
    404,
  );
  expect((await call(admin.cookie, "get", `/assessments/${id}`)).status).toBe(
    200,
  );
});
it("supports validated empty drafts, edits, negative marking limits and stale version rejection", async () => {
  const { actor, id } = await draft();
  expect((await state(actor.cookie, id)).questions).toEqual([]);
  expect(
    (
      await call(actor.cookie, "put", `/assessments/${id}`, {
        version: 1,
        content: { ...config, durationSeconds: 240 },
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await call(actor.cookie, "put", `/assessments/${id}`, {
        version: 1,
        content: config,
      })
    ).status,
  ).toBe(409);
  expect(
    (
      await call(actor.cookie, "put", `/assessments/${id}`, {
        version: 2,
        content: { ...config, penaltyPerIncorrect: 3 },
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await call(actor.cookie, "put", `/assessments/${id}/publish`, {
        version: 2,
        published: true,
      })
    ).status,
  ).toBe(400);
});
it("question CRUD is draft-only, protects ownership, rejects duplicates and allows removing the final draft question", async () => {
  const { actor, id } = await draft();
  expect(
    (
      await call(actor.cookie, "post", `/assessments/${id}/questions`, {
        version: 1,
        content: q,
      })
    ).status,
  ).toBe(201);
  let d = await state(actor.cookie, id);
  const qId = d.questions[0].id;
  expect(
    (
      await call(actor.cookie, "post", `/assessments/${id}/questions`, {
        version: 2,
        content: { ...q, prompt: "  What is TWO plus two?  " },
      })
    ).status,
  ).toBe(409);
  expect(
    (
      await call(actor.cookie, "put", `/assessments/${id}/questions/${qId}`, {
        version: 2,
        content: { ...q, prompt: "What is three plus one?" },
      })
    ).status,
  ).toBe(200);
  d = await state(actor.cookie, id);
  expect(d.questions[0].prompt).toBe("What is three plus one?");
  const other = await studentAccount("trainer");
  expect(
    (
      await call(
        other.cookie,
        "delete",
        `/assessments/${id}/questions/${qId}`,
        { version: 3 },
      )
    ).status,
  ).toBe(404);
  expect(
    (
      await call(
        actor.cookie,
        "delete",
        `/assessments/${id}/questions/${qId}`,
        { version: 3 },
      )
    ).status,
  ).toBe(200);
  expect((await state(actor.cookie, id)).questions).toEqual([]);
  expect(await Question.countDocuments()).toBe(0);
});
it("CSV validates every row before writing, rejects malformed/duplicate/oversized imports and provides the template", async () => {
  const { actor, id } = await draft();
  const template = await call(actor.cookie, "get", "/assessments/csv-template");
  expect(template.status).toBe(200);
  expect(template.headers["content-type"]).toContain("text/csv");
  expect(template.text).toBe(questionCSVTemplate);
  const invalid =
    questionCSVTemplate +
    '"Another valid prompt",Arithmetic,easy,1,2,3,4,x,"An explanation",60\n';
  expect(
    (
      await call(actor.cookie, "post", `/assessments/${id}/import`, {
        version: 1,
        csv: invalid,
      })
    ).status,
  ).toBe(400);
  expect(await Question.countDocuments()).toBe(0);
  expect(
    (
      await call(actor.cookie, "post", `/assessments/${id}/import`, {
        version: 1,
        csv: "bad,headers\nvalue,row",
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await call(actor.cookie, "post", `/assessments/${id}/import`, {
        version: 1,
        csv: questionCSVTemplate.replace(
          '"What is 2 + 2?"',
          '"Unclosed question',
        ),
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await call(actor.cookie, "post", `/assessments/${id}/import`, {
        version: 1,
        csv: "x".repeat(50001),
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await call(actor.cookie, "post", `/assessments/${id}/import`, {
        version: 1,
        csv: questionCSVTemplate,
      })
    ).status,
  ).toBe(201);
  expect(await Question.countDocuments()).toBe(1);
  expect(
    (
      await call(actor.cookie, "post", `/assessments/${id}/import`, {
        version: 2,
        csv: questionCSVTemplate,
      })
    ).status,
  ).toBe(409);
  expect(await Question.countDocuments()).toBe(1);
});
it("concurrent imports are atomic and duplicates or stale revisions never leave partial questions", async () => {
  const { actor, id } = await draft();
  const results = await Promise.all([
    call(actor.cookie, "post", `/assessments/${id}/import`, {
      version: 1,
      csv: questionCSVTemplate,
    }),
    call(actor.cookie, "post", `/assessments/${id}/import`, {
      version: 1,
      csv: questionCSVTemplate,
    }),
  ]);
  expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
  expect(await Question.countDocuments()).toBe(1);
  expect((await state(actor.cookie, id)).questions).toHaveLength(1);
});
it("publication preserves existing Student timer, randomization, scoring, answer confidentiality and immutable snapshots", async () => {
  const { actor, id } = await bank(),
    student = await studentAccount(),
    other = await studentAccount();
  const start = await studentCall(
    app(),
    student.cookie,
    "post",
    `/assessments/${id}/attempts`,
    {},
  );
  expect(start.status).toBe(201);
  const a = start.body.data.attempt;
  expect(a.questions).toHaveLength(1);
  expect(JSON.stringify(a)).not.toMatch(/correctOptionId|explanation/);
  expect(
    (new Date(a.deadlineAt).getTime() - new Date(a.startedAt).getTime()) / 1000,
  ).toBe(120);
  const d = await state(actor.cookie, id);
  expect(
    (
      await call(actor.cookie, "post", `/assessments/${id}/questions`, {
        version: d.assessment.version,
        content: q,
      })
    ).status,
  ).toBe(409);
  expect(
    (
      await call(actor.cookie, "put", `/assessments/${id}/publish`, {
        version: d.assessment.version,
        published: false,
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await studentCall(
        app(),
        other.cookie,
        "post",
        `/assessments/${id}/attempts`,
        {},
      )
    ).status,
  ).toBe(404);
  const saved = await TestAttempt.findById(a.id);
  saved!.questions[0].selectedOptionId = "b";
  await saved!.save();
  const done = await finalizeAttempt(a.id, student.user.id, saved!.version);
  expect(done.result).toMatchObject({
    score: -0.5,
    percentage: 0,
    incorrect: 1,
  });
  const d2 = await state(actor.cookie, id);
  expect(
    (
      await call(
        actor.cookie,
        "delete",
        `/assessments/${id}/questions/${d2.questions[0].id}`,
        { version: d2.assessment.version },
      )
    ).status,
  ).toBe(200);
  expect(
    (await studentCall(app(), student.cookie, "get", `/attempts/${a.id}`)).body
      .data.attempt.questions[0].prompt,
  ).toBe(q.prompt);
});
it("batch assignments enforce ownership and active batch permissions, are idempotent, and feed real Student tasks", async () => {
  const { actor, id } = await bank(),
    student = await studentAccount(),
    admin = await studentAccount("admin");
  const own = await Batch.create({
      name: "Owned",
      trainerIds: [actor.user._id],
    }),
    unrelated = await Batch.create({ name: "Unrelated" }),
    archived = await Batch.create({
      name: "Archived",
      active: false,
      trainerIds: [actor.user._id],
    });
  await Enrollment.create({ batchId: own._id, studentId: student.user._id });
  const dueAt = new Date(Date.now() + 86400000).toISOString();
  expect(
    (
      await call(actor.cookie, "post", `/assessments/${id}/assignments`, {
        batchId: unrelated.id,
        dueAt,
      })
    ).status,
  ).toBe(404);
  expect(
    (
      await call(admin.cookie, "post", `/assessments/${id}/assignments`, {
        batchId: archived.id,
        dueAt,
      })
    ).status,
  ).toBe(409);
  for (let i = 0; i < 2; i++)
    expect(
      (
        await call(actor.cookie, "post", `/assessments/${id}/assignments`, {
          batchId: own.id,
          dueAt,
        })
      ).status,
    ).toBe(200);
  expect(await BatchAssignment.countDocuments()).toBe(1);
  const dashboard = await studentCall(
    app(),
    student.cookie,
    "get",
    "/dashboard",
  );
  expect(
    dashboard.body.data.assessments.upcoming.filter(
      (r: { id: string }) => r.id === id,
    ),
  ).toHaveLength(1);
  expect(
    (await call(actor.cookie, "get", "/dashboard")).body.data.metrics
      .assignedAssessments,
  ).toBe(1);
});
it("submission reports exclude answer snapshots and unrelated students and respect batch filters", async () => {
  const { actor, id } = await bank(),
    student = await studentAccount(),
    other = await studentAccount();
  const b = await Batch.create({
      name: "Assigned",
      trainerIds: [actor.user._id],
    }),
    unrelated = await Batch.create({ name: "Unrelated" });
  await Enrollment.create({ batchId: b._id, studentId: student.user._id });
  await studentCall(
    app(),
    student.cookie,
    "post",
    `/assessments/${id}/attempts`,
    {},
  );
  await studentCall(
    app(),
    other.cookie,
    "post",
    `/assessments/${id}/attempts`,
    {},
  );
  const r = await call(actor.cookie, "get", `/assessments/${id}/submissions`);
  expect(r.body.data).toHaveLength(1);
  expect(r.body.data[0]).toMatchObject({
    studentId: student.user.id,
    status: "in-progress",
  });
  expect(r.body.data[0].attempts[0].score).toBeNull();
  expect(JSON.stringify(r.body)).not.toMatch(
    /correctOptionId|selectedOptionId|"questions"|passwordHash/,
  );
  expect(
    (
      await call(
        actor.cookie,
        "get",
        `/assessments/${id}/submissions?batchId=${unrelated.id}`,
      )
    ).status,
  ).toBe(404);
  expect((await call(student.cookie, "get", `/assessments/${id}`)).status).toBe(
    403,
  );
});
it("learning assignment requires module ownership, a published module and an authorized active batch", async () => {
  const { LearningModule } = await import("../src/models/LearningModule.js");
  const trainer = await studentAccount("trainer"),
    other = await studentAccount("trainer"),
    admin = await studentAccount("admin");
  const module = await LearningModule.create({
    ownerId: trainer.user._id,
    title: "Owned learning",
    subject: "Algorithms",
    topic: "Arrays",
    lessons: [
      { title: "First lesson", kind: "text", body: "Learn about arrays" },
    ],
  });
  const own = await Batch.create({
      name: "Own",
      trainerIds: [trainer.user._id],
    }),
    unrelated = await Batch.create({ name: "Other" }),
    archived = await Batch.create({ name: "Archived", active: false });
  expect(
    (
      await call(trainer.cookie, "post", `/learning/${module.id}/assignments`, {
        batchId: own.id,
      })
    ).status,
  ).toBe(409);
  await LearningModule.updateOne(
    { _id: module._id },
    { $set: { published: true } },
  );
  expect(
    (
      await call(other.cookie, "post", `/learning/${module.id}/assignments`, {
        batchId: own.id,
      })
    ).status,
  ).toBe(404);
  expect(
    (
      await call(trainer.cookie, "post", `/learning/${module.id}/assignments`, {
        batchId: unrelated.id,
      })
    ).status,
  ).toBe(404);
  expect(
    (
      await call(admin.cookie, "post", `/learning/${module.id}/assignments`, {
        batchId: archived.id,
      })
    ).status,
  ).toBe(409);
  for (let i = 0; i < 2; i++)
    expect(
      (
        await call(
          trainer.cookie,
          "post",
          `/learning/${module.id}/assignments`,
          { batchId: own.id },
        )
      ).status,
    ).toBe(200);
  expect(await BatchAssignment.countDocuments()).toBe(1);
  expect(
    (await call(admin.cookie, "get", `/learning/${module.id}/assignments`)).body
      .data,
  ).toHaveLength(1);
});
it("assigned lesson completion is deduplicated across batches, uses actual valid lessons and excludes unrelated students", async () => {
  const { LearningModule } = await import("../src/models/LearningModule.js"),
    { LearningProgress } = await import("../src/models/Preparation.js");
  const trainer = await studentAccount("trainer"),
    student = await studentAccount(),
    other = await studentAccount();
  const m = await LearningModule.create({
    ownerId: trainer.user._id,
    title: "Assigned learning",
    subject: "Algorithms",
    topic: "Arrays",
    published: true,
    lessons: [
      { title: "First lesson", kind: "text", body: "Arrays" },
      { title: "Second lesson", kind: "text", body: "More arrays" },
    ],
  });
  const batches = await Batch.create([
    { name: "One", trainerIds: [trainer.user._id] },
    { name: "Two", trainerIds: [trainer.user._id] },
  ]);
  for (const b of batches) {
    await Enrollment.create({ studentId: student.user._id, batchId: b._id });
    await call(trainer.cookie, "post", `/learning/${m.id}/assignments`, {
      batchId: b.id,
    });
  }
  await LearningProgress.create([
    {
      studentId: student.user._id,
      moduleId: m._id,
      moduleKey: `module:${m.id}`,
      title: m.title,
      completedLessonIds: [m.lessons[0]._id],
      completedLessons: 0,
      totalLessons: 2,
    },
    {
      studentId: other.user._id,
      moduleId: m._id,
      moduleKey: `module:${m.id}`,
      title: m.title,
      completedLessonIds: m.lessons.map((l) => l._id),
      completedLessons: 2,
      totalLessons: 2,
    },
  ]);
  const r = await call(trainer.cookie, "get", `/learning/${m.id}/completion`);
  expect(r.body.data.rows).toHaveLength(1);
  expect(r.body.data.rows[0]).toMatchObject({
    studentId: student.user.id,
    completedLessons: 1,
    totalLessons: 2,
    percent: 50,
  });
  const legacy = await request(app())
    .get(`/api/v1/learning/manage/modules/${m.id}/progress`)
    .set("Cookie", trainer.cookie);
  expect(legacy.body.data.progress).toHaveLength(1);
  expect(legacy.body.data.progress[0].student.id).toBe(student.user.id);
  const dash = await studentCall(app(), student.cookie, "get", "/dashboard");
  expect(
    dash.body.data.nextActions.filter(
      (a: { title: string }) => a.title === `Study assigned ${m.title}`,
    ),
  ).toHaveLength(1);
  await Enrollment.updateMany(
    { studentId: student.user._id },
    { $set: { active: false } },
  );
  expect(
    (await call(trainer.cookie, "get", `/learning/${m.id}/completion`)).body
      .data.rows,
  ).toEqual([]);
});
it("unstarted assigned learners show honest zero completion and Student assignment APIs remain forbidden", async () => {
  const { LearningModule } = await import("../src/models/LearningModule.js");
  const trainer = await studentAccount("trainer"),
    student = await studentAccount();
  const b = await Batch.create({
    name: "Assigned",
    trainerIds: [trainer.user._id],
  });
  await Enrollment.create({ batchId: b._id, studentId: student.user._id });
  const m = await LearningModule.create({
    ownerId: trainer.user._id,
    title: "Published module",
    subject: "Algorithms",
    topic: "Arrays",
    published: true,
    lessons: [{ title: "First lesson", kind: "text", body: "Arrays" }],
  });
  await call(trainer.cookie, "post", `/learning/${m.id}/assignments`, {
    batchId: b.id,
  });
  expect(
    (await call(trainer.cookie, "get", `/learning/${m.id}/completion`)).body
      .data.rows[0],
  ).toMatchObject({
    recorded: false,
    percent: 0,
    completedLessons: 0,
    totalLessons: 1,
  });
  expect(
    (
      await call(student.cookie, "post", `/learning/${m.id}/assignments`, {
        batchId: b.id,
      })
    ).status,
  ).toBe(403);
  await call(
    trainer.cookie,
    "delete",
    `/learning/${m.id}/assignments/${b.id}`,
    {},
  );
  expect(await BatchAssignment.countDocuments()).toBe(0);
});
it("reports and exports enforce Student, batch, Trainer and assessment authorization without leaking private payloads", async () => {
  const trainer = await studentAccount("trainer"),
    student = await studentAccount(),
    other = await studentAccount();
  const b = await Batch.create({ name: "Own", trainerIds: [trainer.user._id] }),
    unrelated = await Batch.create({ name: "Private unrelated batch" });
  await Enrollment.create({ batchId: b._id, studentId: student.user._id });
  for (const suffix of ["/reports", "/reports/export"]) {
    expect((await call(student.cookie, "get", suffix)).status).toBe(403);
    expect(
      (await call(trainer.cookie, "get", `${suffix}?batchId=${unrelated.id}`))
        .status,
    ).toBe(404);
    expect(
      (
        await call(
          trainer.cookie,
          "get",
          `${suffix}?trainerId=${trainer.user.id}`,
        )
      ).status,
    ).toBe(403);
  }
  const r = await call(trainer.cookie, "get", "/reports");
  expect(r.body.data.total).toBe(1);
  expect(r.body.data.rows[0].studentId).toBe(student.user.id);
  expect(JSON.stringify(r.body)).not.toContain(other.user.email);
  expect(JSON.stringify(r.body)).not.toMatch(
    /passwordHash|correctOptionId|"questions"|source|hiddenTests/,
  );
  expect(r.body.data.rows[0].assessments.averageScore).toBeNull();
  expect(r.body.data.rows[0].coding.solveRate).toBeNull();
  expect(r.body.data.rows[0].learning.percent).toBeNull();
  expect((await call(trainer.cookie, "get", "/reports?bad=1")).status).toBe(
    400,
  );
});
it("Admin institution reports and Trainer filters use real unique membership and assessment results", async () => {
  const { actor, id } = await bank(),
    admin = await studentAccount("admin"),
    student = await studentAccount(),
    other = await studentAccount();
  const b = await Batch.create({
      name: "Assigned",
      trainerIds: [actor.user._id],
    }),
    second = await Batch.create({
      name: "Also assigned",
      trainerIds: [actor.user._id],
    }),
    unrelated = await Batch.create({ name: "Other" });
  await Enrollment.create([
    { batchId: b._id, studentId: student.user._id },
    { batchId: second._id, studentId: student.user._id },
    { batchId: unrelated._id, studentId: other.user._id },
  ]);
  for (const batch of [b, second])
    await call(actor.cookie, "post", `/assessments/${id}/assignments`, {
      batchId: batch.id,
      dueAt: new Date(Date.now() + 86400000).toISOString(),
    });
  const start = await studentCall(
    app(),
    student.cookie,
    "post",
    `/assessments/${id}/attempts`,
    {},
  );
  const a = await TestAttempt.findById(start.body.data.attempt.id);
  a!.questions[0].selectedOptionId = "a";
  await a!.save();
  await finalizeAttempt(a!.id, student.user.id, a!.version);
  const r = await call(
    admin.cookie,
    "get",
    `/reports?trainerId=${actor.user.id}&assessmentId=${id}`,
  );
  expect(r.body.data.total).toBe(1);
  expect(r.body.data.rows[0].assessments).toMatchObject({
    completedAttempts: 1,
    averageScore: 100,
    assigned: 1,
    completedAssigned: 1,
    completionPercent: 100,
  });
  expect((await call(admin.cookie, "get", "/reports")).body.data.total).toBe(2);
  expect(
    (
      await call(
        admin.cookie,
        "get",
        `/reports?trainerId=${actor.user.id}&batchId=${unrelated.id}`,
      )
    ).status,
  ).toBe(400);
  const csv = await call(actor.cookie, "get", `/assessments/${id}/results.csv`);
  expect(csv.status).toBe(200);
  expect(csv.text).toContain('"100"');
  expect(csv.text).not.toMatch(/correctOptionId|What is two plus two/);
  expect(
    (
      await call(
        (await studentAccount("trainer")).cookie,
        "get",
        `/assessments/${id}/results.csv`,
      )
    ).status,
  ).toBe(404);
});
it("CSV exports escape formulas, quotes and line breaks while keeping missing metrics distinct from zero", async () => {
  const { csvCell } = await import("../src/services/staffReports.js");
  expect(csvCell('=HYPERLINK("unsafe")')).toBe('"\'=HYPERLINK(""unsafe"")"');
  expect(csvCell("   +SUM(1,2)")).toContain("'");
  expect(csvCell(-0.5)).toBe('"-0.5"');
  expect(csvCell(null)).toBe('""');
  expect(csvCell(0)).toBe('"0"');
  const admin = await studentAccount("admin"),
    student = await studentAccount();
  const { User } = await import("../src/models/User.js");
  await User.updateOne(
    { _id: student.user._id },
    { $set: { name: "=Formula Student" } },
  );
  const csv = await call(admin.cookie, "get", "/reports/export");
  expect(csv.status).toBe(200);
  expect(csv.headers["content-disposition"]).toContain("attachment");
  expect(csv.headers["cache-control"]).toBe("no-store");
  expect(csv.text).toContain("'=Formula Student");
});
it("reports use recorded coding, assigned/recorded learning and valid current company checklist evidence only", async () => {
  const { CodingSubmission } = await import(
      "../src/models/CodingSubmission.js"
    ),
    { LearningModule } = await import("../src/models/LearningModule.js"),
    { LearningProgress } = await import("../src/models/Preparation.js"),
    { Company, CompanyProgress } = await import("../src/models/Company.js"),
    { companySamples } = await import("../src/services/sampleCompanies.js");
  const admin = await studentAccount("admin"),
    trainer = await studentAccount("trainer"),
    student = await studentAccount();
  const b = await Batch.create({
    name: "Assigned",
    trainerIds: [trainer.user._id],
  });
  await Enrollment.create({ batchId: b._id, studentId: student.user._id });
  const m = await LearningModule.create({
    ownerId: trainer.user._id,
    title: "Real lesson",
    subject: "Algorithms",
    topic: "Arrays",
    published: true,
    lessons: [
      { title: "One", kind: "text", body: "Arrays" },
      { title: "Two", kind: "text", body: "More arrays" },
    ],
  });
  await call(trainer.cookie, "post", `/learning/${m.id}/assignments`, {
    batchId: b.id,
  });
  await LearningProgress.create({
    studentId: student.user._id,
    moduleId: m._id,
    moduleKey: `module:${m.id}`,
    title: m.title,
    completedLessons: 0,
    totalLessons: 2,
    completedLessonIds: [m.lessons[0]._id],
  });
  await CodingSubmission.create({
    studentId: student.user._id,
    problemId: m._id,
    problemVersion: 1,
    title: "Actual scored fixture",
    language: "python",
    source: "PRIVATE_SOURCE",
    requestId: "one",
    status: "completed",
    processingUntil: new Date(),
    verdict: "Accepted",
    score: 100,
    total: 1,
    passed: 1,
  });
  const c = await Company.create(companySamples[0]);
  await CompanyProgress.create({
    studentId: student.user._id,
    companyId: c._id,
    completedItemKeys: ["coding", "removed-key"],
  });
  const r = await call(trainer.cookie, "get", "/reports");
  expect(r.body.data.rows[0].coding).toMatchObject({
    solved: 1,
    attempted: 1,
    solveRate: 100,
  });
  expect(r.body.data.rows[0].learning).toMatchObject({
    completedLessons: 1,
    totalLessons: 2,
    percent: 50,
  });
  expect(r.body.data.rows[0].companies).toMatchObject({
    completed: 1,
    total: 5,
    percent: 20,
  });
  expect(JSON.stringify(r.body)).not.toContain("PRIVATE_SOURCE");
  expect(
    (await call(admin.cookie, "get", "/reports")).body.data.rows[0].studentId,
  ).toBe(student.user.id);
});
it("Admin Trainer workloads count real distinct students and owned content and exclude archived memberships", async () => {
  const trainer = await studentAccount("trainer"),
    admin = await studentAccount("admin"),
    student = await studentAccount();
  const batches = await Batch.create([
    { name: "One", trainerIds: [trainer.user._id] },
    { name: "Two", trainerIds: [trainer.user._id] },
    { name: "Archived", trainerIds: [trainer.user._id], active: false },
  ]);
  for (const b of batches)
    await Enrollment.create({ batchId: b._id, studentId: student.user._id });
  await Assessment.create({
    ...config,
    key: "workload",
    ownerId: trainer.user._id,
    questionIds: [],
  });
  const r = await call(admin.cookie, "get", "/trainers");
  expect(r.body.data[0]).toMatchObject({
    id: trainer.user.id,
    activeBatches: 2,
    students: 1,
    assessments: 1,
    publishedAssessments: 0,
    modules: 0,
  });
  expect(r.body.data[0].batches).toHaveLength(3);
  expect(JSON.stringify(r.body)).not.toMatch(/passwordHash|tokenHash|isDemo/);
  expect((await call(trainer.cookie, "get", "/trainers")).status).toBe(403);
  expect((await call(student.cookie, "get", "/trainers")).status).toBe(403);
});
it("Admin Trainer batch controls reject invalid roles, duplicates, stale changes and archived assignments without role escalation", async () => {
  const admin = await studentAccount("admin"),
    trainer = await studentAccount("trainer"),
    student = await studentAccount();
  const b = await Batch.create({ name: "Assignments" }),
    archived = await Batch.create({ name: "Archived", active: false });
  const path = `/trainers/${trainer.user.id}/batches/${b.id}`;
  expect(
    (await call(trainer.cookie, "put", path, { assigned: true, version: 1 }))
      .status,
  ).toBe(403);
  expect(
    (
      await call(
        admin.cookie,
        "put",
        `/trainers/${student.user.id}/batches/${b.id}`,
        { assigned: true, version: 1 },
      )
    ).status,
  ).toBe(400);
  expect(
    (await call(admin.cookie, "put", path, { assigned: true, version: 1 }))
      .status,
  ).toBe(200);
  expect(
    (await call(admin.cookie, "put", path, { assigned: true, version: 1 }))
      .status,
  ).toBe(409);
  expect(
    (await call(admin.cookie, "put", path, { assigned: true, version: 2 }))
      .status,
  ).toBe(200);
  expect((await Batch.findById(b._id))!.trainerIds).toHaveLength(1);
  expect(
    (await call(admin.cookie, "put", path, { assigned: false, version: 3 }))
      .status,
  ).toBe(200);
  expect((await call(trainer.cookie, "get", `/batches/${b.id}`)).status).toBe(
    404,
  );
  expect(
    (
      await call(
        admin.cookie,
        "put",
        `/trainers/${trainer.user.id}/batches/${archived.id}`,
        { assigned: true, version: 1 },
      )
    ).status,
  ).toBe(409);
  expect(
    (
      await call(admin.cookie, "put", path, {
        assigned: true,
        version: 4,
        role: "admin",
      })
    ).status,
  ).toBe(400);
});
it("assignment navigation hides foreign drafts and unrelated batches while distinguishing read-only published resources", async () => {
  const trainer = await studentAccount("trainer"),
    other = await studentAccount("trainer"),
    admin = await studentAccount("admin"),
    student = await studentAccount();
  const own = await Batch.create({
      name: "Scope",
      trainerIds: [trainer.user._id],
    }),
    unrelated = await Batch.create({ name: "Other scope" });
  const published = await Assessment.create({
      ...config,
      key: "published-foreign",
      questionIds: [
        (
          await Question.create({
            ...q,
            key: "foreign-question",
            category: config.category,
            published: true,
          })
        )._id,
      ],
      published: true,
      ownerId: other.user._id,
    }),
    hidden = await Assessment.create({
      ...config,
      key: "foreign-draft",
      ownerId: other.user._id,
    });
  await BatchAssignment.create([
    {
      kind: "assessment",
      resourceId: published._id,
      batchId: own._id,
      assignedBy: admin.user._id,
      dueAt: new Date(),
    },
    {
      kind: "assessment",
      resourceId: hidden._id,
      batchId: own._id,
      assignedBy: admin.user._id,
      dueAt: new Date(),
    },
    {
      kind: "assessment",
      resourceId: published._id,
      batchId: unrelated._id,
      assignedBy: admin.user._id,
      dueAt: new Date(),
    },
  ]);
  const r = await call(trainer.cookie, "get", "/assignments");
  expect(r.status).toBe(200);
  expect(r.body.data).toHaveLength(1);
  expect(r.body.data[0]).toMatchObject({
    resourceId: published.id,
    canManage: false,
    batchId: own.id,
  });
  expect(
    (await call(admin.cookie, "get", "/assignments")).body.data,
  ).toHaveLength(3);
  expect((await call(student.cookie, "get", "/assignments")).status).toBe(403);
});
it("CSV rejects duplicate rows and more than 100 questions before any persistence", async () => {
  const { actor, id } = await draft();
  const [header, row] = questionCSVTemplate.trim().split("\n");
  expect(
    (
      await call(actor.cookie, "post", `/assessments/${id}/import`, {
        version: 1,
        csv: header + "\n" + row + "\n" + row + "\n",
      })
    ).status,
  ).toBe(400);
  const rows = Array.from({ length: 101 }, (_, i) =>
    row.replace("What is 2 + 2?", `Question number ${i}?`),
  );
  expect(
    (
      await call(actor.cookie, "post", `/assessments/${id}/import`, {
        version: 1,
        csv: header + "\n" + rows.join("\n") + "\n",
      })
    ).status,
  ).toBe(400);
  expect(await Question.countDocuments()).toBe(0);
  expect((await state(actor.cookie, id)).assessment.version).toBe(1);
});
