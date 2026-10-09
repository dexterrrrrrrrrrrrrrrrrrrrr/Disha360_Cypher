import { Batch, Enrollment } from "../src/models/Batch.js";
import { beforeAll, beforeEach, afterAll, it, expect } from "vitest";
import request from "supertest";
import {
  testDatabase,
  studentAccount,
  studentCall,
  testApp,
} from "./helpers/student.js";
import { LearningProgress, Activity } from "../src/models/Preparation.js";
import { LearningModule } from "../src/models/LearningModule.js";
const input = {
  title: "React fundamentals",
  subject: "Web development",
  topic: "React",
  description: "Learn practical React foundations.",
  objectives: ["Understand state"],
  lessons: [
    {
      title: "State introduction",
      kind: "text",
      body: "State tracks changes. <script>never rendered</script>",
      url: "",
    },
    {
      title: "Official resource",
      kind: "link",
      body: "Read the reference.",
      url: "https://react.dev/learn",
    },
  ],
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
function call(
  cookie: string,
  method: "get" | "post" | "put",
  path: string,
  body?: object,
) {
  const r = request(testApp())
    [method]("/api/v1/learning" + path)
    .set("Cookie", cookie)
    .set("Origin", "http://localhost:5173")
    .set("X-Disha360-Request", "1");
  return body ? r.send(body) : r;
}
async function setup() {
  const trainer = await studentAccount("trainer"),
    student = await studentAccount();
  const response = await call(trainer.cookie, "post", "/manage/modules", input);
  expect(response.status).toBe(201);
  const assignedBatch = await Batch.create({
    name: "Learning test batch",
    trainerIds: [trainer.user._id],
  });
  await Enrollment.create({
    batchId: assignedBatch._id,
    studentId: student.user._id,
  });
  return { trainer, student, module: response.body.data.module };
}
it("allows trainer ownership and admin access, denies students and other trainers", async () => {
  const { trainer, student, module } = await setup();
  const other = await studentAccount("trainer"),
    admin = await studentAccount("admin");
  expect(
    (await call(student.cookie, "post", "/manage/modules", input)).status,
  ).toBe(403);
  for (const suffix of ["", "/progress"])
    expect(
      (await call(other.cookie, "get", `/manage/modules/${module.id}${suffix}`))
        .status,
    ).toBe(404);
  expect(
    (await call(admin.cookie, "get", `/manage/modules/${module.id}`)).status,
  ).toBe(200);
  expect(
    (
      await call(
        admin.cookie,
        "post",
        `/manage/modules/${module.id}/publication`,
        { published: true, version: 1 },
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await call(
        other.cookie,
        "post",
        `/manage/modules/${module.id}/publication`,
        { published: true, version: 1 },
      )
    ).status,
  ).toBe(404);
  expect(
    (await call(trainer.cookie, "get", "/manage/modules")).body.data.modules,
  ).toHaveLength(1);
});
it("publishes/unpublishes safely and hides all unpublished lessons from students", async () => {
  const { trainer, student, module } = await setup();
  expect(
    (await call(student.cookie, "get", `/modules/${module.id}`)).status,
  ).toBe(404);
  expect(
    (await call(student.cookie, "get", "/modules")).body.data.modules,
  ).toEqual([]);
  expect(
    (
      await call(
        trainer.cookie,
        "post",
        `/manage/modules/${module.id}/publication`,
        { published: true, version: 1 },
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await call(
        student.cookie,
        "get",
        "/modules?subject=Web%20development&topic=React",
      )
    ).body.data.modules,
  ).toHaveLength(1);
  expect(
    (await call(student.cookie, "get", `/modules/${module.id}`)).body.data
      .module.lessons,
  ).toHaveLength(2);
  expect(
    (
      await call(
        trainer.cookie,
        "post",
        `/manage/modules/${module.id}/publication`,
        { published: false, version: 2 },
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await call(
        student.cookie,
        "post",
        `/modules/${module.id}/lessons/${module.lessons[0].id}/completion`,
        { complete: true },
      )
    ).status,
  ).toBe(404);
});
it("persists completion/resume, deduplicates progress/events and updates actual dashboard evidence", async () => {
  const { trainer, student, module } = await setup();
  await call(
    trainer.cookie,
    "post",
    `/manage/modules/${module.id}/publication`,
    { published: true, version: 1 },
  );
  const base = `/modules/${module.id}/lessons/${module.lessons[0].id}`;
  expect((await call(student.cookie, "post", base + "/visit", {})).status).toBe(
    200,
  );
  const completed = await call(student.cookie, "post", base + "/completion", {
    complete: true,
  });
  expect(completed.status).toBe(200);
  expect(completed.body.data.progress).toMatchObject({
    completedLessons: 1,
    totalLessons: 2,
    percent: 50,
    lastLessonId: module.lessons[0].id,
  });
  await call(student.cookie, "post", base + "/completion", { complete: true });
  expect(await LearningProgress.countDocuments()).toBe(1);
  expect(await Activity.countDocuments({ kind: "lesson_completed" })).toBe(1);
  const dash = (
    await studentCall(testApp(), student.cookie, "get", "/dashboard")
  ).body.data;
  expect(dash.learning).toMatchObject({ completed: 1, total: 2, percent: 50 });
  expect(dash.readiness.score).toBe(45);
  expect(
    dash.nextActions.some(
      (a: { href?: string }) => a.href === `/learning/${module.id}`,
    ),
  ).toBe(true);
  expect(
    (await call(trainer.cookie, "get", `/manage/modules/${module.id}/progress`))
      .body.data.progress[0].percent,
  ).toBe(50);
  await call(
    student.cookie,
    "post",
    `/modules/${module.id}/lessons/${module.lessons[1].id}/completion`,
    { complete: true },
  );
  expect(
    (await call(student.cookie, "get", "/modules?completed=true")).body.data
      .modules,
  ).toHaveLength(1);
});
it("prevents progress impersonation, score edits, missing lessons and role violations", async () => {
  const { trainer, student, module } = await setup();
  await call(
    trainer.cookie,
    "post",
    `/manage/modules/${module.id}/publication`,
    { published: true, version: 1 },
  );
  const other = await studentAccount();
  const path = `/modules/${module.id}/lessons/${module.lessons[0].id}/completion`;
  expect(
    (
      await call(student.cookie, "post", path, {
        complete: true,
        studentId: other.user.id,
        completedLessons: 999,
      })
    ).status,
  ).toBe(400);
  await call(student.cookie, "post", path, { complete: true });
  expect(
    (await call(other.cookie, "get", `/modules/${module.id}`)).body.data
      .progress.percent,
  ).toBe(0);
  expect(
    (await call(student.cookie, "get", `/manage/modules/${module.id}/progress`))
      .status,
  ).toBe(403);
  expect((await call(trainer.cookie, "get", "/modules")).status).toBe(403);
  expect(
    (
      await call(
        student.cookie,
        "post",
        `/modules/${module.id}/lessons/${other.user.id}/completion`,
        { complete: true },
      )
    ).status,
  ).toBe(404);
});
it("validates external URLs, plain content, empty publishing and stale edits", async () => {
  const trainer = await studentAccount("trainer");
  for (const url of [
    "javascript:alert(1)",
    "http://example.com",
    "https://localhost/a",
    "https://127.0.0.1/a",
    "https://user:password@example.com",
  ]) {
    expect(
      (
        await call(trainer.cookie, "post", "/manage/modules", {
          ...input,
          lessons: [{ ...input.lessons[1], url }],
        })
      ).status,
    ).toBe(400);
  }
  const empty = await call(trainer.cookie, "post", "/manage/modules", {
    ...input,
    lessons: [],
  });
  expect(
    (
      await call(
        trainer.cookie,
        "post",
        `/manage/modules/${empty.body.data.module.id}/publication`,
        { published: true, version: 1 },
      )
    ).status,
  ).toBe(400);
  const { module } = await setup();
  const owner = (await LearningModule.findById(module.id))!.ownerId;
  expect(owner).toBeTruthy();
  const r = await call(trainer.cookie, "get", "/config");
  expect(r.body.data.uploadsConfigured).toBe(false);
});
it("retains valid lesson identities across edits and recalculates changed completion denominators", async () => {
  const { trainer, student, module } = await setup();
  await call(
    trainer.cookie,
    "post",
    `/manage/modules/${module.id}/publication`,
    { published: true, version: 1 },
  );
  await call(
    student.cookie,
    "post",
    `/modules/${module.id}/lessons/${module.lessons[0].id}/completion`,
    { complete: true },
  );
  const edited = await call(
    trainer.cookie,
    "put",
    `/manage/modules/${module.id}`,
    { ...input, lessons: [module.lessons[0]], version: 2 },
  );
  expect(edited.status).toBe(200);
  expect(
    (await call(student.cookie, "get", `/modules/${module.id}`)).body.data
      .progress.percent,
  ).toBe(100);
  expect(
    (
      await call(trainer.cookie, "put", `/manage/modules/${module.id}`, {
        ...input,
        lessons: [module.lessons[0]],
        version: 2,
      })
    ).status,
  ).toBe(409);
  await call(
    trainer.cookie,
    "post",
    `/manage/modules/${module.id}/publication`,
    { published: false, version: 3 },
  );
  expect(
    (await studentCall(testApp(), student.cookie, "get", "/dashboard")).body
      .data.learning.total,
  ).toBe(0);
});

it("handles concurrent first completions without duplicate or lost lesson evidence", async () => {
  const { trainer, student, module } = await setup();
  await call(
    trainer.cookie,
    "post",
    `/manage/modules/${module.id}/publication`,
    { published: true, version: 1 },
  );
  const results = await Promise.all(
    module.lessons.map((l: { id: string }) =>
      call(
        student.cookie,
        "post",
        `/modules/${module.id}/lessons/${l.id}/completion`,
        { complete: true },
      ),
    ),
  );
  expect(results.every((r) => r.status === 200)).toBe(true);
  expect(await LearningProgress.countDocuments()).toBe(1);
  expect(
    (await call(student.cookie, "get", `/modules/${module.id}`)).body.data
      .progress.percent,
  ).toBe(100);
});
