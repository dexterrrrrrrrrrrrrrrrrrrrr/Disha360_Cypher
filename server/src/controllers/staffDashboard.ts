import { BatchAssignment } from "../models/BatchAssignment.js";
import { Enrollment } from "../models/Batch.js";
import { TestAttempt } from "../models/Assessment.js";
import type { RequestHandler } from "express";
import { User } from "../models/User.js";
import { Batch } from "../models/Batch.js";
import { Assessment } from "../models/Assessment.js";
import {
  Activity,
  AssessmentAssignment,
  LearningProgress,
} from "../models/Preparation.js";
import { LearningModule } from "../models/LearningModule.js";
import { progressDTO } from "../services/learningProgress.js";
import { staffScope, visibleUsers } from "../services/staffScope.js";
export const staffDashboard: RequestHandler = async (req, res) => {
  const allowDemo = !!req.app.locals.allowDemoAccounts;
  const scope = await staffScope(req.user!, allowDemo);
  const [
    modules,
    assignments,
    progress,
    recent,
    trainers,
    totalBatches,
    assessments,
  ] = await Promise.all([
    LearningModule.find(
      req.user!.role === "admin" ? {} : { ownerId: req.user!._id },
    ).select("published"),
    AssessmentAssignment.find({ studentId: { $in: scope.studentIds } }).select(
      "assessmentId studentId status",
    ),
    LearningProgress.find({
      studentId: { $in: scope.studentIds },
      moduleId: { $ne: null },
    }),
    Activity.find({
      studentId: { $in: scope.studentIds },
      kind: {
        $in: [
          "lesson_completed",
          "assessment_completed",
          "coding_submitted",
          "dashboard_visit",
        ],
      },
    })
      .sort({ createdAt: -1 })
      .limit(8)
      .select("studentId kind title createdAt"),
    req.user!.role === "admin"
      ? User.countDocuments({ role: "trainer", ...visibleUsers(allowDemo) })
      : Promise.resolve(null),
    req.user!.role === "admin"
      ? Batch.countDocuments()
      : Promise.resolve(scope.batches.length),
    req.user!.role === "admin"
      ? Assessment.countDocuments(allowDemo ? {} : { demo: false })
      : Promise.resolve(null),
  ]);
  const published = await LearningModule.find({
    _id: { $in: progress.map((p) => p.moduleId) },
    published: true,
  });
  const records = progress.flatMap((p) => {
    const m = published.find((m) => m._id.equals(p.moduleId!));
    return m ? [progressDTO(m, p)] : [];
  });
  const completedLessons = records.reduce(
      (sum, p) => sum + p.completedLessons,
      0,
    ),
    totalLessons = records.reduce((sum, p) => sum + p.totalLessons, 0);
  const batchAssignments = await BatchAssignment.find({
    kind: "assessment",
    batchId: { $in: scope.batches.map((b) => b._id) },
  });
  const taskAssessments = await Assessment.find({
    _id: { $in: batchAssignments.map((a) => a.resourceId) },
    published: true,
    ...(!allowDemo ? { demo: false } : {}),
  });
  const memberships = await Enrollment.find({
    active: true,
    batchId: { $in: scope.batches.map((b) => b._id) },
    studentId: { $in: scope.studentIds },
  });
  const finalized = await TestAttempt.find({
    studentId: { $in: scope.studentIds },
    status: "submitted",
  }).select("studentId assessmentId");
  const completedKeys = new Set(
    finalized.map((a) => `${a.studentId}:${a.assessmentId}`),
  );
  const recordsByTask = new Map(
    assignments.map((a) => [
      a.assessmentId ? `${a.studentId}:${a.assessmentId}` : `legacy:${a.id}`,
      a.status === "completed",
    ]),
  );
  for (const assignment of batchAssignments) {
    if (!taskAssessments.some((a) => a._id.equals(assignment.resourceId)))
      continue;
    for (const e of memberships.filter((e) =>
      e.batchId.equals(assignment.batchId),
    )) {
      const key = `${e.studentId}:${assignment.resourceId}`;
      recordsByTask.set(key, recordsByTask.get(key) || completedKeys.has(key));
    }
  }
  const linkedIds = [
    ...taskAssessments.map((a) => a.id),
    ...new Set(
      assignments
        .filter((a) => a.assessmentId)
        .map((a) => a.assessmentId!.toString()),
    ),
  ];
  const assignedAssessments = await Assessment.countDocuments({
    _id: { $in: linkedIds },
    ...(!allowDemo ? { demo: false } : {}),
  });
  res.json({
    success: true,
    data: {
      role: req.user!.role,
      scope:
        req.user!.role === "admin"
          ? "Institution-wide student records"
          : "Students enrolled in your active assigned batches",
      metrics: {
        students: scope.students.length,
        trainers,
        batches: totalBatches,
        activeBatches: scope.batches.length,
        modules: modules.length,
        publishedModules: modules.filter((m) => m.published).length,
        assessments,
        assignedAssessments,
        assignmentRecords: recordsByTask.size,
        completedAssignments: [...recordsByTask.values()].filter(Boolean)
          .length,
      },
      learning: {
        recordedModules: records.length,
        completedModules: records.filter(
          (p) => p.totalLessons > 0 && p.completedLessons === p.totalLessons,
        ).length,
        completedLessons,
        totalLessons,
        percent: totalLessons
          ? Math.round((completedLessons / totalLessons) * 100)
          : null,
        description:
          "Completion among saved progress records for currently published modules; not a measure of all assigned curriculum.",
      },
      recentActivity: recent.map((a) => ({
        id: a.id,
        studentName:
          scope.students.find((s) => s._id.equals(a.studentId))?.name ||
          "Student",
        kind: a.kind,
        title: a.title,
        at: a.createdAt,
      })),
    },
  });
};
