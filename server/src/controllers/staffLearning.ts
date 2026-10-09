import type { RequestHandler, Request } from "express";
import { z } from "zod";
import { LearningModule } from "../models/LearningModule.js";
import { LearningProgress } from "../models/Preparation.js";
import { Batch, Enrollment } from "../models/Batch.js";
import { BatchAssignment } from "../models/BatchAssignment.js";
import { objectIdSchema } from "../validators/resume.js";
import { batchFilter } from "../validators/staffAssessment.js";
import { AppError } from "../utils/AppError.js";
import { staffTransaction } from "../services/staffAssessment.js";
import { staffScope } from "../services/staffScope.js";
import { progressDTO } from "../services/learningProgress.js";
import { authorizedBatch } from "./staffBatches.js";
import type { ClientSession } from "mongoose";
export async function learningOwned(
  req: Request,
  id: unknown,
  session: ClientSession | null = null,
) {
  const m = await LearningModule.findOne({
    _id: objectIdSchema.parse(id),
    ...(req.user!.role === "admin" ? {} : { ownerId: req.user!._id }),
  }).session(session);
  if (!m)
    throw new AppError(
      404,
      "NOT_FOUND",
      "Learning module not found in your authorized workspace.",
    );
  return m;
}
export const assignLearning: RequestHandler = async (req, res) => {
  const input = z.object({ batchId: objectIdSchema }).strict().parse(req.body);
  const assignment = await staffTransaction(async (session) => {
    const m = await learningOwned(req, req.params.id, session);
    if (!m.published)
      throw new AppError(
        409,
        "UNPUBLISHED_MODULE",
        "Publish before assigning this module.",
      );
    const b = await Batch.findOne({
      _id: input.batchId,
      ...(req.user!.role === "admin" ? {} : { trainerIds: req.user!._id }),
    }).session(session);
    if (!b) throw new AppError(404, "NOT_FOUND", "Authorized batch not found.");
    if (!b.active)
      throw new AppError(
        409,
        "ARCHIVED_BATCH",
        "Archived batches cannot receive assignments.",
      );
    await Batch.updateOne(
      { _id: b._id },
      { $set: { version: b.version + 1 } },
      { session },
    );
    await LearningModule.updateOne(
      { _id: m._id },
      { $set: { updatedAt: new Date() } },
      { session },
    );
    return BatchAssignment.findOneAndUpdate(
      { kind: "learning", resourceId: m._id, batchId: b._id },
      { $set: { assignedBy: req.user!._id } },
      { session, upsert: true, new: true, runValidators: true },
    );
  });
  res.json({ success: true, data: { id: assignment!.id } });
};
export const learningAssignments: RequestHandler = async (req, res) => {
  const m = await learningOwned(req, req.params.id);
  const batches = await Batch.find(
    req.user!.role === "admin"
      ? {}
      : { active: true, trainerIds: req.user!._id },
  );
  const rows = await BatchAssignment.find({
    kind: "learning",
    resourceId: m._id,
    batchId: { $in: batches.map((b) => b._id) },
  });
  res.json({
    success: true,
    data: rows.map((r) => ({
      id: r.id,
      batchId: r.batchId.toString(),
      batchName: batches.find((b) => b._id.equals(r.batchId))!.name,
      active: batches.find((b) => b._id.equals(r.batchId))!.active,
      dueAt: null,
    })),
  });
};
export const removeLearningAssignment: RequestHandler = async (req, res) => {
  const m = await learningOwned(req, req.params.id),
    b = await authorizedBatch(req, String(req.params.batchId));
  await BatchAssignment.deleteOne({
    kind: "learning",
    resourceId: m._id,
    batchId: b._id,
  });
  res.json({ success: true, data: { removed: true } });
};
export const learningCompletion: RequestHandler = async (req, res) => {
  const m = await learningOwned(req, req.params.id),
    q = batchFilter.parse(req.query),
    scope = await staffScope(req.user!, !!req.app.locals.allowDemoAccounts);
  if (q.batchId) await authorizedBatch(req, q.batchId);
  const assignments = await BatchAssignment.find({
    kind: "learning",
    resourceId: m._id,
    batchId: {
      $in: scope.batches
        .filter((b) => !q.batchId || b.id === q.batchId)
        .map((b) => b._id),
    },
  });
  const memberships = await Enrollment.find({
    active: true,
    batchId: { $in: assignments.map((a) => a.batchId) },
    studentId: { $in: scope.studentIds },
  });
  const students = scope.students.filter((s) =>
    memberships.some((e) => e.studentId.equals(s._id)),
  );
  const records = await LearningProgress.find({
    studentId: { $in: students.map((s) => s._id) },
    moduleId: m._id,
  });
  res.json({
    success: true,
    data: {
      published: m.published,
      rows: students.map((s) => ({
        studentId: s.id,
        name: s.name,
        department: s.department,
        recorded: records.some((p) => p.studentId.equals(s._id)),
        ...progressDTO(
          m,
          records.find((p) => p.studentId.equals(s._id)) || null,
        ),
      })),
    },
  });
};
