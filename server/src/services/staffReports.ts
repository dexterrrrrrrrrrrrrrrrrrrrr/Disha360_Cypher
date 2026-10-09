import type { Request } from "express";
import { z } from "zod";
import { objectIdSchema } from "../validators/resume.js";
import { staffScope, visibleUsers } from "./staffScope.js";
import { authorizedBatch } from "../controllers/staffBatches.js";
import { AppError } from "../utils/AppError.js";
import { Batch, Enrollment } from "../models/Batch.js";
import { User } from "../models/User.js";
import { Assessment, TestAttempt } from "../models/Assessment.js";
import { CodingSubmission } from "../models/CodingSubmission.js";
import { LearningModule } from "../models/LearningModule.js";
import { LearningProgress } from "../models/Preparation.js";
import { BatchAssignment } from "../models/BatchAssignment.js";
import { Company, CompanyProgress } from "../models/Company.js";
import { progressDTO } from "./learningProgress.js";
import { preparationProgress } from "./companyPreparation.js";
export const reportQuery = z
  .object({
    batchId: objectIdSchema.optional(),
    trainerId: objectIdSchema.optional(),
    assessmentId: objectIdSchema.optional(),
    search: z.string().trim().max(100).optional(),
    page: z.coerce.number().int().min(1).max(100000).default(1),
  })
  .strict();
export async function reportChoices(req: Request) {
  const scope = await staffScope(req.user!, !!req.app.locals.allowDemoAccounts);
  const batches =
    req.user!.role === "admin"
      ? await Batch.find().sort({ name: 1 })
      : scope.batches;
  const assessments = await Assessment.find({
    ...(!req.app.locals.allowDemoAccounts ? { demo: false } : {}),
    ...(req.user!.role === "admin"
      ? {}
      : { $or: [{ ownerId: req.user!._id }, { published: true }] }),
  }).sort({ title: 1 });
  const trainers =
    req.user!.role === "admin"
      ? await User.find({
          role: "trainer",
          ...visibleUsers(!!req.app.locals.allowDemoAccounts),
        }).sort({ name: 1 })
      : [];
  return {
    batches: batches.map((b) => ({ id: b.id, name: b.name, active: b.active })),
    assessments: assessments.map((a) => ({
      id: a.id,
      title: a.title,
      published: a.published,
    })),
    trainers: trainers.map((t) => ({ id: t.id, name: t.name })),
  };
}
export async function buildStaffReport(req: Request, input: unknown) {
  const q = reportQuery.parse(input),
    allowDemo = !!req.app.locals.allowDemoAccounts,
    scope = await staffScope(req.user!, allowDemo);
  let students = scope.students;
  if (q.trainerId) {
    if (req.user!.role !== "admin")
      throw new AppError(
        403,
        "FORBIDDEN_FILTER",
        "Only Admins can filter by Trainer.",
      );
    if (
      !(await User.exists({
        _id: q.trainerId,
        role: "trainer",
        ...visibleUsers(allowDemo),
      }))
    )
      throw new AppError(404, "NOT_FOUND", "Trainer not found.");
    const batches = await Batch.find({ active: true, trainerIds: q.trainerId });
    const members = await Enrollment.distinct("studentId", {
      active: true,
      batchId: { $in: batches.map((b) => b._id) },
    });
    students = students.filter((s) => members.some((id) => id.equals(s._id)));
  }
  if (q.batchId) {
    const b = await authorizedBatch(req, q.batchId);
    if (
      q.trainerId &&
      !b.trainerIds.some((id) => id.toString() === q.trainerId!.toLowerCase())
    )
      throw new AppError(
        400,
        "FILTER_CONFLICT",
        "The batch is not assigned to the selected Trainer.",
      );
    const members = await Enrollment.distinct("studentId", {
      batchId: b._id,
      active: true,
    });
    students = students.filter((s) => members.some((id) => id.equals(s._id)));
  }
  if (
    q.assessmentId &&
    !(await Assessment.exists({
      _id: q.assessmentId,
      ...(!allowDemo ? { demo: false } : {}),
      ...(req.user!.role === "admin"
        ? {}
        : { $or: [{ ownerId: req.user!._id }, { published: true }] }),
    }))
  )
    throw new AppError(404, "NOT_FOUND", "Authorized assessment not found.");
  if (q.search) {
    const text = q.search.toLowerCase();
    students = students.filter((s) =>
      `${s.name} ${s.email}`.toLowerCase().includes(text),
    );
  }
  students.sort(
    (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
  );
  if (students.length > 1000)
    throw new AppError(
      400,
      "REPORT_LIMIT",
      "Limit reports to 1,000 students using batch, Trainer or search filters. No rows have been silently truncated.",
    );
  const ids = students.map((s) => s._id),
    [attempts, coding, progress, memberships, companies, companyRecords] =
      await Promise.all([
        TestAttempt.find({
          studentId: { $in: ids },
          ...(q.assessmentId ? { assessmentId: q.assessmentId } : {}),
        }).select(
          "studentId assessmentId title category assessmentVersion attemptNumber status result startedAt finalizedAt",
        ),
        CodingSubmission.find({
          studentId: { $in: ids },
          status: "completed",
          score: { $ne: null },
        }).select("studentId problemId verdict"),
        LearningProgress.find({ studentId: { $in: ids } }),
        Enrollment.find({ studentId: { $in: ids }, active: true }),
        Company.find({
          published: true,
          ...(!allowDemo ? { demo: false } : {}),
        }),
        CompanyProgress.find({ studentId: { $in: ids } }),
      ]);
  const activeBatches = await Batch.find({
    _id: { $in: memberships.map((e) => e.batchId) },
    active: true,
  });
  const allBatches =
    req.user!.role === "admin"
      ? await Batch.find({ _id: { $in: memberships.map((e) => e.batchId) } })
      : scope.batches;
  const tasks = await BatchAssignment.find({
    batchId: { $in: activeBatches.map((b) => b._id) },
  });
  const assessmentTasks = await Assessment.find({
    _id: {
      $in: tasks
        .filter((t) => t.kind === "assessment")
        .map((t) => t.resourceId),
    },
    published: true,
    ...(!allowDemo ? { demo: false } : {}),
  }).select("_id");
  const modules = await LearningModule.find({
    _id: {
      $in: [
        ...progress.map((p) => p.moduleId).filter(Boolean),
        ...tasks.filter((t) => t.kind === "learning").map((t) => t.resourceId),
      ],
    },
    published: true,
  });
  const rows = students.map((s) => {
    const membership = memberships.filter((e) => e.studentId.equals(s._id)),
      batchIds = new Set(membership.map((e) => e.batchId.toString()));
    const ownTasks = tasks.filter((t) => batchIds.has(t.batchId.toString()));
    const ownAttempts = attempts.filter((a) => a.studentId.equals(s._id)),
      done = ownAttempts.filter((a) => a.status === "submitted" && a.result);
    const assignedIds = new Set(
      ownTasks
        .filter(
          (t) =>
            t.kind === "assessment" &&
            (!q.assessmentId ||
              t.resourceId.toString() === q.assessmentId.toLowerCase()) &&
            assessmentTasks.some((a) => a._id.equals(t.resourceId)),
        )
        .map((t) => t.resourceId.toString()),
    );
    const completeAssigned = new Set(
      done
        .map((a) => a.assessmentId.toString())
        .filter((id) => assignedIds.has(id)),
    );
    const ownCoding = coding.filter((c) => c.studentId.equals(s._id)),
      attempted = new Set(ownCoding.map((c) => c.problemId.toString())),
      solved = new Set(
        ownCoding
          .filter((c) => c.verdict === "Accepted")
          .map((c) => c.problemId.toString()),
      );
    const ownProgress = progress.filter((p) => p.studentId.equals(s._id)),
      assignedModuleIds = new Set(
        ownTasks
          .filter((t) => t.kind === "learning")
          .map((t) => t.resourceId.toString()),
      );
    const learningModules = modules.filter(
      (m) =>
        assignedModuleIds.has(m.id) ||
        ownProgress.some((p) => p.moduleId?.equals(m._id)),
    );
    const lessonRecords = learningModules.map((m) =>
      progressDTO(
        m,
        ownProgress.find((p) => p.moduleId?.equals(m._id)) || null,
      ),
    );
    const legacy = ownProgress.filter((p) => !p.moduleId);
    const completedLessons =
        lessonRecords.reduce((n, p) => n + p.completedLessons, 0) +
        legacy.reduce((n, p) => n + p.completedLessons, 0),
      totalLessons =
        lessonRecords.reduce((n, p) => n + p.totalLessons, 0) +
        legacy.reduce((n, p) => n + p.totalLessons, 0);
    const ownCompany = companies.map((c) =>
      preparationProgress(
        c.checklist.map((i) => i.key),
        companyRecords.find(
          (p) => p.studentId.equals(s._id) && p.companyId.equals(c._id),
        )?.completedItemKeys || [],
      ),
    );
    const companyCompleted = ownCompany.reduce((n, p) => n + p.completed, 0),
      companyTotal = ownCompany.reduce((n, p) => n + p.total, 0);
    return {
      studentId: s.id,
      name: s.name,
      email: s.email,
      department: s.department,
      semester: s.semester,
      batches: allBatches
        .filter((b) => batchIds.has(b.id))
        .map((b) => ({ id: b.id, name: b.name, active: b.active })),
      assessments: {
        completedAttempts: done.length,
        averageScore: done.length
          ? Math.round(
              done.reduce((n, a) => n + Number(a.result.percentage), 0) /
                done.length,
            )
          : null,
        assigned: assignedIds.size,
        completedAssigned: completeAssigned.size,
        completionPercent: assignedIds.size
          ? Math.round((completeAssigned.size / assignedIds.size) * 100)
          : null,
        attempts: ownAttempts.map((a) => ({
          id: a.id,
          title: a.title,
          assessmentId: a.assessmentId.toString(),
          version: a.assessmentVersion,
          attemptNumber: a.attemptNumber,
          status: a.status,
          percentage:
            a.status === "submitted" ? (a.result?.percentage ?? null) : null,
          score: a.status === "submitted" ? (a.result?.score ?? null) : null,
          maximum:
            a.status === "submitted" ? (a.result?.maximum ?? null) : null,
          finalizedAt: a.finalizedAt,
        })),
      },
      coding: {
        attempted: attempted.size,
        solved: solved.size,
        judged: ownCoding.length,
        solveRate: attempted.size
          ? Math.round((solved.size / attempted.size) * 100)
          : null,
      },
      learning: {
        completedLessons,
        totalLessons,
        percent: totalLessons
          ? Math.round((completedLessons / totalLessons) * 100)
          : null,
      },
      companies: {
        completed: companyCompleted,
        total: companyTotal,
        percent: companyTotal
          ? Math.round((companyCompleted / companyTotal) * 100)
          : null,
      },
    };
  });
  return {
    rows,
    total: rows.length,
    page: q.page,
    totalPages: Math.max(1, Math.ceil(rows.length / 25)),
    scope:
      req.user!.role === "admin"
        ? "Institution-wide; filters applied"
        : "Active assigned batch members only",
    rules:
      "Assessment filter applies only to assessments. Completion counts any finalized attempt for each currently assigned published assessment. Coding = distinct solved/scored attempted problems. Learning = current published assigned or recorded lessons plus existing legacy records. Company = current published checklist items, self-reported. Missing denominators are unavailable, not zero. No readiness prediction.",
  };
}
export function csvCell(value: unknown) {
  let text = value == null ? "" : String(value);
  if (
    typeof value === "string" &&
    (/^[\s]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text))
  )
    text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}
export function reportCSV(
  report: Awaited<ReturnType<typeof buildStaffReport>>,
) {
  const headers = [
    "student_id",
    "name",
    "email",
    "department",
    "semester",
    "batches",
    "completed_attempts",
    "assessment_average_percent",
    "assigned_assessments",
    "completed_assigned",
    "assessment_completion_percent",
    "coding_attempted",
    "coding_solved",
    "coding_solve_rate",
    "learning_completed_lessons",
    "learning_total_lessons",
    "learning_percent",
    "company_completed_items",
    "company_total_items",
    "company_percent",
  ];
  return (
    "\ufeff" +
    [
      headers.map(csvCell).join(","),
      ...report.rows.map((s) =>
        [
          s.studentId,
          s.name,
          s.email,
          s.department,
          s.semester,
          s.batches.map((b) => b.name).join("; "),
          s.assessments.completedAttempts,
          s.assessments.averageScore,
          s.assessments.assigned,
          s.assessments.completedAssigned,
          s.assessments.completionPercent,
          s.coding.attempted,
          s.coding.solved,
          s.coding.solveRate,
          s.learning.completedLessons,
          s.learning.totalLessons,
          s.learning.percent,
          s.companies.completed,
          s.companies.total,
          s.companies.percent,
        ]
          .map(csvCell)
          .join(","),
      ),
    ].join("\r\n") +
    "\r\n"
  );
}
export function assessmentResultsCSV(
  report: Awaited<ReturnType<typeof buildStaffReport>>,
) {
  const headers = [
    "student_id",
    "name",
    "email",
    "assessment",
    "assessment_version",
    "attempt",
    "status",
    "raw_score",
    "maximum",
    "percentage",
    "finalized_at",
  ];
  return (
    "\ufeff" +
    [
      headers.map(csvCell).join(","),
      ...report.rows.flatMap((s) =>
        s.assessments.attempts.map((a) =>
          [
            s.studentId,
            s.name,
            s.email,
            a.title,
            a.version,
            a.attemptNumber,
            a.status,
            a.score,
            a.maximum,
            a.percentage,
            a.finalizedAt?.toISOString(),
          ]
            .map(csvCell)
            .join(","),
        ),
      ),
    ].join("\r\n") +
    "\r\n"
  );
}
