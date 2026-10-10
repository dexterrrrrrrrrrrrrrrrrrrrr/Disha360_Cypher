import { beforeAll, beforeEach, afterAll, it, expect } from "vitest";
import mongoose from "mongoose";
import request from "supertest";
import {
  testDatabase,
  studentAccount,
  testApp,
  studentCall,
} from "./helpers/student.js";
import { TestAttempt } from "../src/models/Assessment.js";
import { CodingSubmission } from "../src/models/CodingSubmission.js";
import { CodingProblem } from "../src/models/CodingProblem.js";
import { LearningModule } from "../src/models/LearningModule.js";
import { LearningProgress, Activity } from "../src/models/Preparation.js";
import { Batch, Enrollment } from "../src/models/Batch.js";
import { BadgeAward } from "../src/models/BadgeAward.js";
import {
  engagementSummaries,
  normalizedPoints,
  streakStats,
  summarizeEvents,
  rankSummaries,
} from "../src/services/engagement.js";
let db: Awaited<ReturnType<typeof testDatabase>>;
beforeAll(async () => {
  db = await testDatabase();
}, 180000);
beforeEach(async () => db.clear());
afterAll(async () => db?.close());
const now = new Date("2026-10-10T12:00:00Z");
async function attempt(
  studentId: mongoose.Types.ObjectId,
  assessmentId = new mongoose.Types.ObjectId(),
  percentage = 80,
  at = new Date("2026-10-09T20:00:00Z"),
  number = 1,
) {
  return TestAttempt.create({
    studentId,
    assessmentId,
    assessmentVersion: 1,
    attemptNumber: number,
    title: "Verified fixture assessment",
    category: "technical",
    demo: false,
    status: "submitted",
    startedAt: new Date(at.getTime() - 60000),
    deadlineAt: at,
    finalizedAt: at,
    currentQuestionId: new mongoose.Types.ObjectId().toString(),
    cursorSince: at,
    questions: [],
    pointsPerCorrect: 1,
    penaltyPerIncorrect: 0,
    setSignature: "fixture",
    result: {
      percentage,
      correct: percentage > 0 ? 1 : 0,
      incorrect: percentage === 0 ? 1 : 0,
    },
  });
}
async function coding(
  studentId: mongoose.Types.ObjectId,
  difficulty: "easy" | "medium" | "hard" = "easy",
) {
  const problem = await CodingProblem.create({
    key: new mongoose.Types.ObjectId().toString(),
    title: "Fixture problem",
    difficulty,
    topic: "Arrays",
    statement: "A database fixture used only by tests.",
    inputFormat: "Number",
    outputFormat: "Number",
    constraints: "Small input",
    examples: [{ input: "1", output: "1", explanation: "Same number" }],
    hiddenTests: [{ input: "private input", expected: "private output" }],
    published: true,
    demo: false,
  });
  await CodingSubmission.create({
    studentId,
    problemId: problem._id,
    problemVersion: 1,
    title: problem.title,
    language: "python",
    source: "private source",
    requestId: new mongoose.Types.ObjectId().toString(),
    status: "completed",
    processingUntil: now,
    verdict: "Accepted",
    total: 1,
    passed: 1,
    score: 100,
    finishedAt: new Date("2026-10-09T23:00:00Z"),
  });
  return problem;
}
async function module(studentId: mongoose.Types.ObjectId, completed = true) {
  const trainer = await studentAccount("trainer"),
    m = await LearningModule.create({
      ownerId: trainer.user._id,
      title: "Fixture learning",
      subject: "Programming",
      topic: "Arrays",
      published: true,
      lessons: [{ title: "One lesson", kind: "text", body: "Read and learn." }],
    });
  const at = new Date("2026-10-08T19:00:00Z");
  await LearningProgress.create({
    studentId,
    moduleId: m._id,
    moduleKey: "module:" + m.id,
    title: m.title,
    totalLessons: 1,
    completedLessons: completed ? 1 : 0,
    completedLessonIds: completed ? [m.lessons[0]._id] : [],
    engagementCompletedAt: completed ? at : null,
  });
  if (completed)
    await Activity.create({
      studentId,
      key: "lesson:" + m.lessons[0].id,
      kind: "lesson_completed",
      title: "Actual completion",
      day: "2026-10-08",
      createdAt: at,
    });
  return m;
}
const staff = (cookie: string, path: string) =>
  request(testApp())
    .get("/api/v1/staff" + path)
    .set("Cookie", cookie);
it("normalizes actual percentages deterministically and caps point ranges", () => {
  expect([
    normalizedPoints(-10),
    normalizedPoints(82.6),
    normalizedPoints(130),
  ]).toEqual([0, 83, 100]);
});
it("UTC streaks handle midnight, yesterday grace, duplicates, gaps, leap days and future dates", () => {
  expect(
    streakStats(
      ["2026-10-08", "2026-10-09", "2026-10-09"],
      new Date("2026-10-10T00:00:00Z"),
    ),
  ).toMatchObject({ current: 2, longest: 2, lastActiveDay: "2026-10-09" });
  expect(
    streakStats(["2026-10-08", "2026-10-09"], new Date("2026-10-11T00:00:00Z"))
      .current,
  ).toBe(0);
  expect(
    streakStats(
      ["2024-02-28", "2024-02-29", "2024-03-01"],
      new Date("2024-03-01T23:59:59Z"),
    ).current,
  ).toBe(3);
  expect(
    streakStats(["2026-13-01", "2026-10-11"], now).lastActiveDay,
  ).toBeNull();
  expect(
    streakStats(["2026-10-05", "2026-10-07", "2026-10-08", "2026-10-09"], now),
  ).toMatchObject({ current: 3, longest: 3 });
});
it("assessment retakes and new versions award only best points once; unfinished, future, demo and unanswered-only attempts are excluded", async () => {
  const s = await studentAccount(),
    id = new mongoose.Types.ObjectId();
  await attempt(s.user._id, id, 60, undefined, 1);
  await attempt(s.user._id, id, 90, undefined, 2);
  const third = await attempt(s.user._id, id, 80, undefined, 3);
  await TestAttempt.updateOne(
    { _id: third._id },
    { $set: { assessmentVersion: 2 } },
  );
  const empty = await attempt(s.user._id);
  await TestAttempt.updateOne(
    { _id: empty._id },
    { $set: { "result.correct": 0, "result.incorrect": 0 } },
  );
  const draft = await attempt(s.user._id);
  await TestAttempt.updateOne(
    { _id: draft._id },
    { $set: { status: "in-progress" } },
  );
  const demo = await attempt(s.user._id);
  await TestAttempt.updateOne({ _id: demo._id }, { $set: { demo: true } });
  await attempt(s.user._id, undefined, 100, new Date("2099-01-01"));
  const [r] = await engagementSummaries([s.user.id], false, now);
  expect(r).toMatchObject({ totalPoints: 90, completedAssessments: 1 });
});
it("Accepted coding counts each problem once with exact difficulty points, never failed runs", async () => {
  const s = await studentAccount();
  const p = await coding(s.user._id);
  await coding(s.user._id, "medium");
  await coding(s.user._id, "hard");
  const original = await CodingSubmission.findOne({ problemId: p._id }).select(
    "+source",
  );
  await CodingSubmission.create({
    ...original!.toObject(),
    _id: new mongoose.Types.ObjectId(),
    requestId: "repeat",
    finishedAt: now,
  });
  await CodingSubmission.create({
    ...original!.toObject(),
    _id: new mongoose.Types.ObjectId(),
    requestId: "failed",
    verdict: "Wrong Answer",
    score: 0,
  });
  const [r] = await engagementSummaries([s.user.id], false, now);
  expect(r).toMatchObject({
    totalPoints: 300,
    solvedCoding: 3,
    streak: { current: 1 },
  });
});
it("verified full modules earn once and retain their actual completion date through unchecking and visits", async () => {
  const s = await studentAccount(),
    m = await module(s.user._id);
  await module(s.user._id, false);
  const [first] = await engagementSummaries([s.user.id], false, now);
  expect(first).toMatchObject({
    totalPoints: 40,
    completedModules: 1,
    streak: { lastActiveDay: "2026-10-08" },
  });
  await LearningProgress.updateOne(
    { moduleId: m._id },
    { $set: { completedLessonIds: [], completedLessons: 0, updatedAt: now } },
  );
  const [second] = await engagementSummaries([s.user.id], false, now);
  expect(second.totalPoints).toBe(40);
  expect(second.streak.lastActiveDay).toBe("2026-10-08");
});
it("legacy completion counts without evidence and arbitrary page/checklist activity earn nothing", async () => {
  const s = await studentAccount();
  await LearningProgress.create({
    studentId: s.user._id,
    moduleKey: "legacy",
    title: "Legacy unverified",
    completedLessons: 3,
    totalLessons: 3,
  });
  await Activity.create({
    studentId: s.user._id,
    key: "check-in:today",
    kind: "dashboard_visit",
    title: "Visited",
    day: "2026-10-10",
  });
  const [r] = await engagementSummaries([s.user.id], false, now);
  expect(r.totalPoints).toBe(0);
  expect(r.streak).toMatchObject({
    current: 0,
    longest: 0,
    lastActiveDay: null,
  });
  expect(r.badges.every((b) => !b.unlocked)).toBe(true);
});
it("badges unlock from distinct evidence and concurrent refreshes never duplicate persistent awards", async () => {
  const s = await studentAccount();
  for (let i = 0; i < 7; i++)
    await attempt(
      s.user._id,
      undefined,
      80,
      new Date(`2026-10-${String(i + 3).padStart(2, "0")}T18:00:00Z`),
    );
  for (let i = 0; i < 5; i++) await coding(s.user._id);
  await module(s.user._id);
  const results = await Promise.all([
    engagementSummaries([s.user.id], false, now),
    engagementSummaries([s.user.id], false, now),
  ]);
  expect(results[0][0].badges.every((b) => b.unlocked)).toBe(true);
  expect(await BadgeAward.countDocuments({ studentId: s.user._id })).toBe(6);
  expect(results[0][0].streak).toMatchObject({ current: 7, longest: 7 });
});
it("rank ties use documented deterministic counts then stable identity; input order does not change ranks", () => {
  const rows = [
    {
      studentId: "b",
      totalPoints: 100,
      completedAssessments: 1,
      solvedCoding: 0,
      completedModules: 0,
    },
    {
      studentId: "a",
      totalPoints: 100,
      completedAssessments: 1,
      solvedCoding: 0,
      completedModules: 0,
    },
    {
      studentId: "c",
      totalPoints: 100,
      completedAssessments: 2,
      solvedCoding: 0,
      completedModules: 0,
    },
  ];
  expect(rankSummaries(rows).map((r) => [r.studentId, r.rank])).toEqual([
    ["c", 1],
    ["a", 2],
    ["b", 3],
  ]);
  expect(rankSummaries(rows.reverse()).map((r) => r.studentId)).toEqual([
    "c",
    "a",
    "b",
  ]);
});
it("global rankings expose display names and achievements only; current rank remains available outside paginated rows", async () => {
  const s = await studentAccount(),
    other = await studentAccount();
  await attempt(other.user._id, undefined, 80);
  const r = await studentCall(testApp(), s.cookie, "get", "/leaderboard");
  expect(r.status).toBe(200);
  expect(r.body.data.currentStudent.rank).toBe(2);
  expect(r.body.data.rows).toHaveLength(2);
  expect(JSON.stringify(r.body)).not.toMatch(
    /email|passwordHash|correctOptionId|private input|private source|tokenHash/,
  );
  const detail = await studentCall(
    testApp(),
    s.cookie,
    "get",
    `/leaderboard/${other.user.id}`,
  );
  expect(detail.status).toBe(200);
  expect(detail.body.data.streak).toBeUndefined();
});
it("batch scopes require current active memberships and Trainer assignments, and archived or unrelated batches are rejected", async () => {
  const s = await studentAccount(),
    other = await studentAccount(),
    trainer = await studentAccount("trainer");
  const b = await Batch.create({
      name: "Assigned",
      trainerIds: [trainer.user._id],
    }),
    unrelated = await Batch.create({ name: "Other" });
  await Enrollment.create({ studentId: s.user._id, batchId: b._id });
  expect(
    (
      await studentCall(
        testApp(),
        s.cookie,
        "get",
        `/leaderboard?batchId=${b.id}`,
      )
    ).body.data.rows,
  ).toHaveLength(1);
  expect(
    (
      await studentCall(
        testApp(),
        other.cookie,
        "get",
        `/leaderboard?batchId=${b.id}`,
      )
    ).status,
  ).toBe(404);
  expect(
    (await staff(trainer.cookie, `/leaderboard?batchId=${unrelated.id}`))
      .status,
  ).toBe(404);
  expect(
    (await staff(trainer.cookie, `/engagement/${other.user.id}`)).status,
  ).toBe(404);
  expect((await staff(trainer.cookie, `/engagement/${s.user.id}`)).status).toBe(
    200,
  );
  await Batch.updateOne({ _id: b._id }, { $set: { active: false } });
  expect(
    (await staff(trainer.cookie, `/leaderboard?batchId=${b.id}`)).status,
  ).toBe(404);
});
it("authenticated role restrictions, strict filters and lack of point-writing endpoints prevent privilege escalation", async () => {
  const s = await studentAccount(),
    trainer = await studentAccount("trainer"),
    admin = await studentAccount("admin");
  expect(
    (await request(testApp()).get("/api/v1/student/leaderboard")).status,
  ).toBe(401);
  expect(
    (await studentCall(testApp(), trainer.cookie, "get", "/leaderboard"))
      .status,
  ).toBe(403);
  expect((await staff(s.cookie, "/leaderboard")).status).toBe(403);
  expect(
    (
      await studentCall(
        testApp(),
        s.cookie,
        "get",
        "/engagement?studentId=" + admin.user.id,
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await studentCall(testApp(), s.cookie, "put", "/engagement", {
        totalPoints: 999,
      })
    ).status,
  ).toBe(404);
  expect(
    (await staff(admin.cookie, "/leaderboard")).body.data.statistics.students,
  ).toBe(1);
});
it("unscoped leaderboards refuse over-limit results rather than returning a misleading partial ranking", async () => {
  const s = await studentAccount();
  await mongoose.connection.collection("users").insertMany(
    Array.from({ length: 500 }, (_, i) => ({
      name: "Bounded fixture " + i,
      email: "bounded-" + i + "@example.test",
      role: "student",
      isDemo: false,
      passwordHash: "not-a-login-fixture",
    })),
  );
  const r = await studentCall(testApp(), s.cookie, "get", "/leaderboard");
  expect(r.status).toBe(422);
  expect(r.body.error.code).toBe("LEADERBOARD_LIMIT");
});
it("first-time module completion is saved by the actual Student API and repeated completion cannot change its date", async () => {
  const s = await studentAccount(),
    m = await module(s.user._id, false),
    path = `/api/v1/learning/modules/${m.id}/lessons/${m.lessons[0].id}/completion`;
  const call = () =>
    request(testApp())
      .post(path)
      .set("Cookie", s.cookie)
      .set("Origin", "http://localhost:5173")
      .set("X-Disha360-Request", "1")
      .send({ complete: true });
  expect((await call()).status).toBe(200);
  const first = await LearningProgress.findOne({ moduleId: m._id });
  expect(first!.engagementCompletedAt).toBeInstanceOf(Date);
  await call();
  const second = await LearningProgress.findOne({ moduleId: m._id });
  expect(second!.engagementCompletedAt).toEqual(first!.engagementCompletedAt);
  expect(
    (await engagementSummaries([s.user.id], false))[0].completedModules,
  ).toBe(1);
});

it("historical full modules earn verified points but never invent completion dates or streak days from visits or lesson timestamps", async () => {
  const s = await studentAccount(),
    m = await module(s.user._id);
  await LearningProgress.updateOne(
    { moduleId: m._id },
    { $unset: { engagementCompletedAt: 1 } },
  );
  const [r] = await engagementSummaries([s.user.id], false, now);
  expect(r.totalPoints).toBe(40);
  expect(r.streak.lastActiveDay).toBeNull();
  expect(r.streak.current).toBe(0);
  const saved = await LearningProgress.findOne({ moduleId: m._id });
  expect(saved!.engagementCompletedAt).toBeNull();
  expect(saved!.engagementRecognizedAt).toEqual(now);
});

it("repeating completion of an already-full historical module cannot manufacture a streak timestamp", async () => {
  const s = await studentAccount(),
    m = await module(s.user._id);
  await LearningProgress.updateOne(
    { moduleId: m._id },
    { $unset: { engagementCompletedAt: 1 } },
  );
  const r = await request(testApp())
    .post(
      `/api/v1/learning/modules/${m.id}/lessons/${m.lessons[0].id}/completion`,
    )
    .set("Cookie", s.cookie)
    .set("Origin", "http://localhost:5173")
    .set("X-Disha360-Request", "1")
    .send({ complete: true });
  expect(r.status).toBe(200);
  const saved = await LearningProgress.findOne({ moduleId: m._id });
  expect(saved!.engagementCompletedAt).toBeNull();
  expect(saved!.engagementRecognizedAt).toBeInstanceOf(Date);
  expect(
    (await engagementSummaries([s.user.id], false))[0].streak.current,
  ).toBe(0);
});
it("eligible batch selectors stay available independently of large global rankings and hide unrelated memberships", async () => {
  const s = await studentAccount(),
    other = await studentAccount(),
    trainer = await studentAccount("trainer");
  const own = await Batch.create({
      name: "Own active",
      trainerIds: [trainer.user._id],
    }),
    hidden = await Batch.create({ name: "Private other batch" });
  await Enrollment.create([
    { studentId: s.user._id, batchId: own._id },
    { studentId: other.user._id, batchId: hidden._id },
  ]);
  const r = await studentCall(
    testApp(),
    s.cookie,
    "get",
    "/leaderboard/options",
  );
  expect(r.status).toBe(200);
  expect(r.body.data.batches).toEqual([{ id: own.id, name: own.name }]);
  expect(
    (await staff(trainer.cookie, "/leaderboard/options")).body.data.batches,
  ).toEqual([{ id: own.id, name: own.name }]);
});

it("current Student rank stays available when their row is outside the current page", async () => {
  const s = await studentAccount();
  await mongoose.connection
    .collection("users")
    .insertMany(
      Array.from({ length: 26 }, (_, i) => ({
        _id: new mongoose.Types.ObjectId(
          (i + 1).toString(16).padStart(24, "0"),
        ),
        name: "Earlier ranked " + i,
        email: "page-" + i + "@example.test",
        role: "student",
        isDemo: false,
        passwordHash: "not-a-login-fixture",
      })),
    );
  const r = await studentCall(testApp(), s.cookie, "get", "/leaderboard");
  expect(r.status).toBe(200);
  expect(r.body.data.rows).toHaveLength(25);
  expect(r.body.data.currentStudent).toMatchObject({
    studentId: s.user.id,
    rank: 27,
  });
  expect(
    r.body.data.rows.some(
      (row: { studentId: string }) => row.studentId === s.user.id,
    ),
  ).toBe(false);
});
