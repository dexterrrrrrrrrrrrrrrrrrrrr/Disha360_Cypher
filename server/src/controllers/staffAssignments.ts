import type { RequestHandler } from "express";
import { Batch } from "../models/Batch.js";
import { BatchAssignment } from "../models/BatchAssignment.js";
import { Assessment } from "../models/Assessment.js";
import { LearningModule } from "../models/LearningModule.js";
export const allAssignments: RequestHandler = async (req, res) => {
  const batches = await Batch.find(
    req.user!.role === "admin"
      ? {}
      : { active: true, trainerIds: req.user!._id },
  );
  const assignments = await BatchAssignment.find({
    batchId: { $in: batches.map((b) => b._id) },
  }).sort({ createdAt: -1 });
  const [assessments, modules] = await Promise.all([
    Assessment.find({
      _id: {
        $in: assignments
          .filter((a) => a.kind === "assessment")
          .map((a) => a.resourceId),
      },
      ...(!req.app.locals.allowDemoAccounts ? { demo: false } : {}),
      ...(req.user!.role === "admin"
        ? {}
        : { $or: [{ ownerId: req.user!._id }, { published: true }] }),
    }).select("title published ownerId"),
    LearningModule.find({
      _id: {
        $in: assignments
          .filter((a) => a.kind === "learning")
          .map((a) => a.resourceId),
      },
      ...(req.user!.role === "admin"
        ? {}
        : { $or: [{ ownerId: req.user!._id }, { published: true }] }),
    }).select("title published ownerId"),
  ]);
  res.json({
    success: true,
    data: assignments.flatMap((a) => {
      const resource = (a.kind === "assessment" ? assessments : modules).find(
          (r) => r._id.equals(a.resourceId),
        ),
        batch = batches.find((b) => b._id.equals(a.batchId));
      if (!resource || !batch) return [];
      return [
        {
          id: a.id,
          kind: a.kind,
          resourceId: a.resourceId.toString(),
          title: resource.title,
          published: resource.published,
          batchId: batch.id,
          batchName: batch.name,
          active: batch.active,
          dueAt: a.dueAt,
          canManage:
            req.user!.role === "admin" ||
            !!resource.ownerId?.equals(req.user!._id),
        },
      ];
    }),
  });
};
