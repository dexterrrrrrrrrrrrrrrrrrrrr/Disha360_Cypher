import type { RequestHandler } from "express";
import { z } from "zod";
import { User } from "../models/User.js";
import { Batch, Enrollment } from "../models/Batch.js";
import { BatchAssignment } from "../models/BatchAssignment.js";
import { LearningModule } from "../models/LearningModule.js";
import { Assessment } from "../models/Assessment.js";
import { objectIdSchema } from "../validators/resume.js";
import { visibleUsers } from "../services/staffScope.js";
import { AppError } from "../utils/AppError.js";
export const trainers: RequestHandler = async (req, res) => {
  const q = z
      .object({ search: z.string().trim().max(100).optional() })
      .strict()
      .parse(req.query),
    allowDemo = !!req.app.locals.allowDemoAccounts;
  const all = await User.find({
    role: "trainer",
    ...visibleUsers(allowDemo),
  }).sort({ name: 1 });
  const selected = all.filter(
    (t) =>
      !q.search ||
      `${t.name} ${t.email}`.toLowerCase().includes(q.search.toLowerCase()),
  );
  const [batches, modules, assessments] = await Promise.all([
    Batch.find().sort({ name: 1 }),
    LearningModule.find({
      ownerId: { $in: selected.map((t) => t._id) },
    }).select("ownerId published"),
    Assessment.find({
      ownerId: { $in: selected.map((t) => t._id) },
      ...(!allowDemo ? { demo: false } : {}),
    }).select("ownerId published"),
  ]);
  const active = batches.filter((b) => b.active),
    members = await Enrollment.find({
      active: true,
      batchId: { $in: active.map((b) => b._id) },
    }),
    students = await User.find({
      _id: { $in: members.map((e) => e.studentId) },
      role: "student",
      ...visibleUsers(allowDemo),
    }).select("_id"),
    studentIds = new Set(students.map((s) => s.id)),
    assignments = await BatchAssignment.find({
      batchId: { $in: active.map((b) => b._id) },
    });
  res.json({
    success: true,
    data: selected.map((t) => {
      const assigned = batches.filter((b) =>
          b.trainerIds.some((id) => id.equals(t._id)),
        ),
        batchIds = new Set(assigned.filter((b) => b.active).map((b) => b.id));
      return {
        id: t.id,
        name: t.name,
        email: t.email,
        batches: assigned.map((b) => ({
          id: b.id,
          name: b.name,
          active: b.active,
        })),
        activeBatches: batchIds.size,
        students: new Set(
          members
            .filter(
              (e) =>
                batchIds.has(e.batchId.toString()) &&
                studentIds.has(e.studentId.toString()),
            )
            .map((e) => e.studentId.toString()),
        ).size,
        modules: modules.filter((m) => m.ownerId.equals(t._id)).length,
        publishedModules: modules.filter(
          (m) => m.ownerId.equals(t._id) && m.published,
        ).length,
        assessments: assessments.filter((a) => a.ownerId?.equals(t._id)).length,
        publishedAssessments: assessments.filter(
          (a) => a.ownerId?.equals(t._id) && a.published,
        ).length,
        batchAssignments: assignments.filter((a) =>
          batchIds.has(a.batchId.toString()),
        ).length,
      };
    }),
  });
};
export const assignTrainer: RequestHandler = async (req, res) => {
  const id = objectIdSchema.parse(req.params.trainerId),
    batchId = objectIdSchema.parse(req.params.batchId),
    input = z
      .object({ assigned: z.boolean(), version: z.number().int().min(1) })
      .strict()
      .parse(req.body);
  if (
    !(await User.exists({
      _id: id,
      role: "trainer",
      ...visibleUsers(!!req.app.locals.allowDemoAccounts),
    }))
  )
    throw new AppError(
      400,
      "INVALID_TRAINER",
      "Select an existing Trainer account.",
    );
  const batch = await Batch.findById(batchId);
  if (!batch) throw new AppError(404, "NOT_FOUND", "Batch not found.");
  if (input.assigned && !batch.active)
    throw new AppError(
      409,
      "ARCHIVED_BATCH",
      "Reactivate the batch before assigning a Trainer.",
    );
  if (
    input.assigned &&
    !batch.trainerIds.some((t) => t.toString() === id.toLowerCase()) &&
    batch.trainerIds.length >= 20
  )
    throw new AppError(
      400,
      "TRAINER_LIMIT",
      "A batch supports at most 20 assigned Trainers.",
    );
  const result = await Batch.findOneAndUpdate(
    {
      _id: batchId,
      ...(input.version === 1
        ? { $or: [{ version: 1 }, { version: { $exists: false } }] }
        : { version: input.version }),
    },
    {
      $set: { version: input.version + 1 },
      ...(input.assigned
        ? { $addToSet: { trainerIds: id } }
        : { $pull: { trainerIds: id } }),
    },
    { new: true, runValidators: true },
  );
  if (!result)
    throw new AppError(
      409,
      "STALE_BATCH",
      "Batch changed. Reload before saving.",
    );
  res.json({ success: true, data: { id: result.id, version: result.version } });
};
