import { staffScope } from "../services/staffScope.js";
import { Router } from "express";
import { z } from "zod";
import { databaseStatus } from "../config/database.js";
import {
  requireAuth,
  requireRole,
  protectMutations,
} from "../middleware/auth.js";
import { LearningModule } from "../models/LearningModule.js";
import { LearningProgress } from "../models/Preparation.js";
import {
  learningInput,
  learningUpdate,
  publishInput,
} from "../validators/learning.js";
import { objectIdSchema } from "../validators/resume.js";
import { AppError } from "../utils/AppError.js";
import { progressDTO } from "../services/learningProgress.js";
import { recordActivity } from "../services/activity.js";
export function moduleDTO(m: InstanceType<typeof LearningModule>) {
  return {
    id: m.id,
    title: m.title,
    subject: m.subject,
    topic: m.topic,
    description: m.description,
    objectives: m.objectives,
    lessons: m.lessons.map((l) => ({
      id: l.id,
      title: l.title,
      kind: l.kind,
      body: l.body,
      url: l.url,
    })),
    published: m.published,
    version: m.version,
    updatedAt: m.updatedAt,
  };
}
export function learningRoutes(origin: string, status = databaseStatus) {
  const r = Router();
  r.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  r.use(protectMutations(origin));
  r.use((_req, _res, next) => {
    if (status() !== "connected")
      throw new AppError(
        503,
        "DATABASE_UNAVAILABLE",
        "The database is unavailable.",
      );
    next();
  });
  r.use(requireAuth);
  const staff = requireRole("trainer", "admin");
  const student = requireRole("student");
  const owned = async (id: unknown, user: { id?: unknown; role: string }) => {
    const m = await LearningModule.findOne({
      _id: objectIdSchema.parse(id),
      ...(user.role === "admin" ? {} : { ownerId: user.id }),
    });
    if (!m) throw new AppError(404, "NOT_FOUND", "Learning module not found.");
    return m;
  };
  r.get("/config", (_req, res) =>
    res.json({
      success: true,
      data: {
        uploadsConfigured: false,
        message:
          "Text and external HTTPS resources are supported. PDF/file uploads require private storage and are unavailable.",
      },
    }),
  );
  r.get("/manage/modules", staff, async (req, res) => {
    const modules = await LearningModule.find(
      req.user!.role === "admin" ? {} : { ownerId: req.user!._id },
    )
      .sort({ updatedAt: -1 })
      .limit(100);
    res.json({ success: true, data: { modules: modules.map(moduleDTO) } });
  });
  r.post("/manage/modules", staff, async (req, res) => {
    const input = learningInput.parse(req.body);
    if (input.lessons.some((l) => l.id))
      throw new AppError(
        400,
        "INVALID_LESSON",
        "New lessons must not provide existing IDs.",
      );
    const m = await LearningModule.create({ ...input, ownerId: req.user!._id });
    res.status(201).json({ success: true, data: { module: moduleDTO(m) } });
  });
  r.get("/manage/modules/:id", staff, async (req, res) =>
    res.json({
      success: true,
      data: { module: moduleDTO(await owned(req.params.id, req.user!)) },
    }),
  );
  r.put("/manage/modules/:id", staff, async (req, res) => {
    const input = learningUpdate.parse(req.body);
    const m = await owned(req.params.id, req.user!);
    const ids = input.lessons.filter((l) => l.id).map((l) => l.id!);
    if (
      new Set(ids).size !== ids.length ||
      ids.some((id) => !m.lessons.some((l) => l.id === id))
    )
      throw new AppError(
        400,
        "INVALID_LESSON",
        "Lesson IDs must be distinct and belong to this module.",
      );
    if (m.published && !input.lessons.length)
      throw new AppError(
        400,
        "EMPTY_MODULE",
        "Published modules must contain lessons.",
      );
    const { version, ...fields } = input;
    const saved = await LearningModule.findOneAndUpdate(
      {
        _id: m._id,
        version,
        ...(req.user!.role === "admin" ? {} : { ownerId: req.user!._id }),
      },
      {
        $set: {
          ...fields,
          lessons: input.lessons.map(({ id, ...l }) => ({
            ...l,
            ...(id ? { _id: id } : {}),
          })),
        },
        $inc: { version: 1 },
      },
      { new: true, runValidators: true },
    );
    if (!saved)
      throw new AppError(
        409,
        "MODULE_CONFLICT",
        "Module changed in another tab. Reload before saving.",
      );
    res.json({ success: true, data: { module: moduleDTO(saved) } });
  });
  r.post("/manage/modules/:id/publication", staff, async (req, res) => {
    const input = publishInput.parse(req.body);
    const m = await owned(req.params.id, req.user!);
    if (input.published && !m.lessons.length)
      throw new AppError(400, "EMPTY_MODULE", "Add lessons before publishing.");
    const saved = await LearningModule.findOneAndUpdate(
      {
        _id: m._id,
        version: input.version,
        ...(req.user!.role === "admin" ? {} : { ownerId: req.user!._id }),
      },
      { $set: { published: input.published }, $inc: { version: 1 } },
      { new: true },
    );
    if (!saved)
      throw new AppError(
        409,
        "MODULE_CONFLICT",
        "Reload the current module before publishing.",
      );
    res.json({ success: true, data: { module: moduleDTO(saved) } });
  });
  r.get("/manage/modules/:id/progress", staff, async (req, res) => {
    const m = await owned(req.params.id, req.user!);
    const scope = await staffScope(
      req.user!,
      !!req.app.locals.allowDemoAccounts,
    );
    const records = await LearningProgress.find({
      moduleId: m._id,
      studentId: { $in: scope.studentIds },
    })
      .populate<{
        studentId: { _id: unknown; name: string; department?: string };
      }>({ path: "studentId", select: "name department" })
      .limit(200);
    res.json({
      success: true,
      data: {
        progress: records
          .filter((p) => p.studentId)
          .map((p) => ({
            student: {
              id: p.studentId._id,
              name: p.studentId.name,
              department: p.studentId.department,
            },
            ...progressDTO(
              m,
              p as unknown as InstanceType<typeof LearningProgress>,
            ),
          })),
        scope:
          "Progress for authorized students in this module; latest 200 records.",
      },
    });
  });
  r.get("/modules", student, async (req, res) => {
    const q = z
      .object({
        subject: z.string().max(100).optional(),
        topic: z.string().max(100).optional(),
        completed: z.enum(["true", "false"]).optional(),
      })
      .strict()
      .parse(req.query);
    const { completed, ...filters } = q;
    const modules = await LearningModule.find({ published: true, ...filters })
      .sort({ title: 1 })
      .limit(100);
    const records = await LearningProgress.find({
      studentId: req.user!._id,
      moduleId: { $in: modules.map((m) => m._id) },
    });
    const data = modules
      .map((m) => ({
        ...moduleDTO(m),
        progress: progressDTO(
          m,
          records.find((p) => p.moduleId?.equals(m._id)) || null,
        ),
      }))
      .filter(
        (m) =>
          completed === undefined ||
          (m.progress.percent === 100) === (completed === "true"),
      );
    res.json({ success: true, data: { modules: data } });
  });
  const published = async (id: unknown) => {
    const m = await LearningModule.findOne({
      _id: objectIdSchema.parse(id),
      published: true,
    });
    if (!m) throw new AppError(404, "NOT_FOUND", "Published module not found.");
    return m;
  };
  r.get("/modules/:id", student, async (req, res) => {
    const m = await published(req.params.id);
    const p = await LearningProgress.findOne({
      studentId: req.user!._id,
      moduleId: m._id,
    });
    res.json({
      success: true,
      data: { module: moduleDTO(m), progress: progressDTO(m, p) },
    });
  });
  for (const action of ["visit", "completion"])
    r.post(
      `/modules/:id/lessons/:lessonId/${action}`,
      student,
      async (req, res) => {
        const m = await published(req.params.id),
          lessonId = objectIdSchema.parse(req.params.lessonId);
        if (!m.lessons.some((l) => l.id === lessonId))
          throw new AppError(404, "NOT_FOUND", "Published lesson not found.");
        const input =
          action === "visit"
            ? z.object({}).strict().parse(req.body)
            : z.object({ complete: z.boolean() }).strict().parse(req.body);
        const filter = {
          studentId: req.user!._id,
          moduleKey: `module:${m.id}`,
        };
        const update = {
          $set: {
            moduleId: m._id,
            title: m.title,
            totalLessons: m.lessons.length,
            lastLessonId: lessonId,
          },
          $setOnInsert: { completedLessons: 0 },
          ...(action === "completion"
            ? "complete" in input && input.complete
              ? { $addToSet: { completedLessonIds: lessonId } }
              : { $pull: { completedLessonIds: lessonId } }
            : {}),
        };
        let p;
        try {
          p = await LearningProgress.findOneAndUpdate(filter, update, {
            upsert: true,
            new: true,
            runValidators: true,
            setDefaultsOnInsert: true,
          });
        } catch (e) {
          if (typeof e === "object" && e && "code" in e && e.code === 11000)
            p = await LearningProgress.findOneAndUpdate(filter, update, {
              new: true,
              runValidators: true,
            });
          else throw e;
        }
        if (!p)
          throw new AppError(
            409,
            "PROGRESS_CONFLICT",
            "Please retry progress saving.",
          );
        const progress = progressDTO(m, p);
        if (action === "completion" && "complete" in input && input.complete)
          await recordActivity(
            req.user!.id as string,
            "lesson_completed",
            `Completed ${m.lessons.find((l) => l.id === lessonId)!.title}`,
            `lesson:${lessonId}`,
          );
        res.json({ success: true, data: { progress } });
      },
    );
  return r;
}
