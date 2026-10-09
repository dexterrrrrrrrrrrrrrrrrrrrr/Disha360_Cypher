import type { RequestHandler } from "express";
import { Batch, Enrollment } from "../models/Batch.js";
import { TestAttempt } from "../models/Assessment.js";
import { CodingSubmission } from "../models/CodingSubmission.js";
import { Company, CompanyProgress } from "../models/Company.js";
import { calculateAnalytics } from "../services/assessmentAnalytics.js";
import { submissionDTO } from "../services/codingJudge.js";
import { learningRecords } from "../services/learningProgress.js";
import { preparationProgress } from "../services/companyPreparation.js";
import { staffScope } from "../services/staffScope.js";
import { studentQuery } from "../validators/staff.js";
import { objectIdSchema } from "../validators/resume.js";
import { AppError } from "../utils/AppError.js";
import { authorizedBatch, personDTO } from "./staffBatches.js";

export const listStudents: RequestHandler = async (req, res) => {
  const query = studentQuery.parse(req.query),
    scope = await staffScope(req.user!, !!req.app.locals.allowDemoAccounts);
  let students = scope.students;
  if (query.batchId) {
    const batch = await authorizedBatch(req, query.batchId);
    const ids = await Enrollment.distinct("studentId", {
      batchId: batch._id,
      active: true,
    });
    const members = new Set(ids.map(String));
    students = students.filter((s) => members.has(s.id));
  }
  const departments = [
    ...new Set(
      scope.students.map((s) => s.department).filter((d): d is string => !!d),
    ),
  ].sort();
  const search = query.search?.toLowerCase();
  students = students
    .filter(
      (s) =>
        (!query.department || s.department === query.department) &&
        (!search || `${s.name} ${s.email}`.toLowerCase().includes(search)),
    )
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const total = students.length,
    pageSize = 25,
    page = query.page;
  students = students.slice((page - 1) * pageSize, page * pageSize);
  const batches =
    req.user!.role === "admin"
      ? await Batch.find().sort({ name: 1 })
      : scope.batches;
  const memberships = await Enrollment.find({
    studentId: { $in: students.map((s) => s._id) },
    batchId: { $in: batches.map((b) => b._id) },
    active: true,
  });
  res.json({
    success: true,
    data: {
      students: students.map((s) => ({
        ...personDTO(s),
        batches: batches
          .filter((b) =>
            memberships.some(
              (e) => e.studentId.equals(s._id) && e.batchId.equals(b._id),
            ),
          )
          .map((b) => ({ id: b.id, name: b.name, active: b.active })),
      })),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      departments,
      batches: batches.map((b) => ({
        id: b.id,
        name: b.name,
        active: b.active,
      })),
    },
  });
};
export const studentDetails: RequestHandler = async (req, res) => {
  const id = objectIdSchema.parse(req.params.id),
    scope = await staffScope(req.user!, !!req.app.locals.allowDemoAccounts);
  const student = scope.students.find(
    (s) => s._id.toString() === id.toLowerCase(),
  );
  if (!student)
    throw new AppError(
      404,
      "STUDENT_NOT_FOUND",
      "Student not found in your authorized workspace.",
    );
  // Read-only reports: do not finalize attempts or invoke any AI/execution provider.
  const [attempts, submissions, learning, enrollments] = await Promise.all([
    TestAttempt.find({ studentId: student._id, status: "submitted" }),
    CodingSubmission.find({ studentId: student._id, status: "completed" }).sort(
      { createdAt: -1 },
    ),
    learningRecords(student.id),
    Enrollment.find({ studentId: student._id, active: true }),
  ]);
  const permittedBatches =
    req.user!.role === "admin"
      ? await Batch.find({ _id: { $in: enrollments.map((e) => e.batchId) } })
      : scope.batches.filter((b) =>
          enrollments.some((e) => e.batchId.equals(b._id)),
        );
  const scored = submissions.filter((s) => s.score !== null),
    attempted = new Set(scored.map((s) => s.problemId.toString())),
    solved = new Set(
      scored
        .filter((s) => s.verdict === "Accepted")
        .map((s) => s.problemId.toString()),
    );
  let companies:
    | {
        id: string;
        name: string;
        completed: number;
        total: number;
        percent: number;
        recorded: boolean;
      }[]
    | null = null;
  if (req.user!.role === "admin") {
    const profiles = await Company.find({
      published: true,
      ...(!req.app.locals.allowDemoAccounts ? { demo: false } : {}),
    }).sort({ name: 1 });
    const records = await CompanyProgress.find({
      studentId: student._id,
      companyId: { $in: profiles.map((c) => c._id) },
    });
    companies = profiles.map((c) => {
      const p = records.find((p) => p.companyId.equals(c._id));
      const progress = preparationProgress(
        c.checklist.map((i) => i.key),
        p?.completedItemKeys || [],
      );
      return {
        id: c.id,
        name: c.name,
        completed: progress.completed,
        total: progress.total,
        percent: progress.percent,
        recorded: !!p,
      };
    });
  }
  const completedLessons = learning.reduce(
      (sum, p) => sum + p.completedLessons,
      0,
    ),
    totalLessons = learning.reduce((sum, p) => sum + p.totalLessons, 0);
  res.json({
    success: true,
    data: {
      student: personDTO(student),
      batches: permittedBatches.map((b) => ({
        id: b.id,
        name: b.name,
        active: b.active,
      })),
      assessments: calculateAnalytics(attempts),
      coding: {
        judged: scored.length,
        attempted: attempted.size,
        solved: solved.size,
        solveRate: attempted.size
          ? Math.round((solved.size / attempted.size) * 100)
          : null,
        history: submissions.slice(0, 20).map(submissionDTO),
      },
      learning: {
        completedLessons,
        totalLessons,
        percent: totalLessons
          ? Math.round((completedLessons / totalLessons) * 100)
          : null,
        records: learning.map((p) => ({
          id: p._id.toString(),
          title: p.title,
          completedLessons: p.completedLessons,
          totalLessons: p.totalLessons,
        })),
      },
      companies,
    },
  });
};
