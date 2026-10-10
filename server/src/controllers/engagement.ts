import type { Request, RequestHandler } from "express";
import { z } from "zod";
import { User } from "../models/User.js";
import { Batch, Enrollment } from "../models/Batch.js";
import { objectIdSchema } from "../validators/resume.js";
import { visibleUsers } from "../services/staffScope.js";
import {
  engagementSummaries,
  engagementRules,
  rankSummaries,
} from "../services/engagement.js";
import { AppError } from "../utils/AppError.js";
const querySchema = z
  .object({
    batchId: objectIdSchema.optional(),
    page: z.coerce.number().int().min(1).max(10000).default(1),
  })
  .strict();
async function scope(req: Request) {
  const q = querySchema.parse(req.query),
    role = req.user!.role;
  const enrolled =
    role === "student"
      ? await Enrollment.distinct("batchId", {
          studentId: req.user!._id,
          active: true,
        }).maxTimeMS(10000)
      : null;
  const batches = await Batch.find({
    active: true,
    ...(role === "trainer" ? { trainerIds: req.user!._id } : {}),
    ...(enrolled ? { _id: { $in: enrolled } } : {}),
    ...(q.batchId ? { $and: [{ _id: q.batchId }] } : {}),
  })
    .select("name")
    .limit(501)
    .maxTimeMS(10000);
  if (batches.length > 500)
    throw new AppError(
      422,
      "BATCH_SCOPE_LIMIT",
      "This prototype supports at most 500 active batches per selector. Specify an authorized batch ID to narrow the request.",
    );
  if (q.batchId && !batches.some((b) => b.id === q.batchId!.toLowerCase()))
    throw new AppError(
      404,
      "BATCH_NOT_FOUND",
      "Active authorized batch not found.",
    );
  let ids: unknown[] | undefined;
  if (q.batchId || role === "trainer")
    ids = await Enrollment.distinct("studentId", {
      active: true,
      batchId: { $in: q.batchId ? [q.batchId] : batches.map((b) => b._id) },
    }).maxTimeMS(10000);
  return {
    q,
    batches,
    filter: {
      role: "student",
      ...visibleUsers(!!req.app.locals.allowDemoAccounts),
      ...(ids ? { _id: { $in: ids } } : {}),
    },
  };
}
function publicProfile<
  T extends {
    studentId: string;
    totalPoints: number;
    completedAssessments: number;
    solvedCoding: number;
    completedModules: number;
    badges: { unlocked: boolean; key: string; name: string }[];
  },
>(s: T, name: string) {
  return {
    studentId: s.studentId,
    displayName: name,
    totalPoints: s.totalPoints,
    completedAssessments: s.completedAssessments,
    solvedCoding: s.solvedCoding,
    completedModules: s.completedModules,
    badges: s.badges
      .filter((b) => b.unlocked)
      .map((b) => ({ key: b.key, name: b.name })),
  };
}
export const leaderboardOptions: RequestHandler = async (req, res) => {
  const { batches } = await scope(req);
  res.json({
    success: true,
    data: { batches: batches.map((b) => ({ id: b.id, name: b.name })) },
  });
};
export const ownEngagement: RequestHandler = async (req, res) => {
  z.object({}).strict().parse(req.query);
  const [summary] = await engagementSummaries(
    [req.user!.id],
    !!req.app.locals.allowDemoAccounts,
  );
  res.json({ success: true, data: { ...summary, rules: engagementRules } });
};
export const leaderboard: RequestHandler = async (req, res) => {
  const { q, batches, filter } = await scope(req);
  const users = await User.find(filter)
    .select("name")
    .sort({ _id: 1 })
    .limit(501)
    .maxTimeMS(10000);
  if (users.length > 500)
    throw new AppError(
      422,
      "LEADERBOARD_LIMIT",
      "This prototype supports at most 500 students per leaderboard. Select a smaller active batch; no partial ranking was returned.",
    );
  const summaries = await engagementSummaries(
      users.map((u) => u.id),
      !!req.app.locals.allowDemoAccounts,
    ),
    ranked = rankSummaries(
      summaries.map((s) =>
        publicProfile(s, users.find((u) => u.id === s.studentId)!.name),
      ),
    ),
    own = ranked.find((s) => s.studentId === req.user!.id);
  res.json({
    success: true,
    data: {
      rows: ranked.slice((q.page - 1) * 25, q.page * 25),
      currentStudent: own || null,
      total: ranked.length,
      page: q.page,
      totalPages: Math.max(1, Math.ceil(ranked.length / 25)),
      scope: q.batchId
        ? "Active batch"
        : req.user!.role === "trainer"
          ? "Your active assigned batches"
          : "Institution-wide",
      batches: batches.map((b) => ({ id: b.id, name: b.name })),
      rules: engagementRules,
      tieRule:
        "Points descending, then completed assessments, solved coding challenges, completed modules descending, then stable Student ID ascending. Ordinal ranks.",
      statistics:
        req.user!.role === "admin"
          ? {
              students: ranked.length,
              engagedStudents: ranked.filter(
                (s) =>
                  s.completedAssessments + s.solvedCoding + s.completedModules >
                  0,
              ).length,
              totalPoints: ranked.reduce((n, s) => n + s.totalPoints, 0),
              badgeAwards: summaries.reduce(
                (n, s) => n + s.badges.filter((b) => b.unlocked).length,
                0,
              ),
            }
          : null,
    },
  });
};
export const leaderboardProfile: RequestHandler = async (req, res) => {
  const id = objectIdSchema.parse(req.params.id),
    { filter } = await scope(req),
    student = await User.findOne({
      ...filter,
      _id: id,
      ...("_id" in filter ? { $and: [{ _id: filter._id }] } : {}),
    }).select("name");
  if (!student)
    throw new AppError(404, "NOT_FOUND", "Leaderboard participant not found.");
  const [summary] = await engagementSummaries(
    [student.id],
    !!req.app.locals.allowDemoAccounts,
  );
  res.json({
    success: true,
    data: { ...publicProfile(summary, student.name), rules: engagementRules },
  });
};
export const staffAchievements: RequestHandler = async (req, res) => {
  const id = objectIdSchema.parse(req.params.id),
    { filter } = await scope(req),
    student = await User.findOne({
      ...filter,
      _id: id,
      ...("_id" in filter ? { $and: [{ _id: filter._id }] } : {}),
    }).select("name");
  if (!student)
    throw new AppError(404, "NOT_FOUND", "Authorized Student not found.");
  const [summary] = await engagementSummaries(
    [student.id],
    !!req.app.locals.allowDemoAccounts,
  );
  res.json({
    success: true,
    data: { ...summary, displayName: student.name, rules: engagementRules },
  });
};
