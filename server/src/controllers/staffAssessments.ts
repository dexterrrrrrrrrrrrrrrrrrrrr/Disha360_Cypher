import type { RequestHandler } from "express";
import { randomUUID } from "node:crypto";
import { Assessment, Question, TestAttempt } from "../models/Assessment.js";
import { BatchAssignment } from "../models/BatchAssignment.js";
import { Batch, Enrollment } from "../models/Batch.js";
import {
  assessmentInput,
  assessmentEdit,
  questionEdit,
  revisionInput,
  assessmentPublish,
  csvInput,
  assessmentAssignmentInput,
  batchFilter,
} from "../validators/staffAssessment.js";
import { objectIdSchema } from "../validators/resume.js";
import {
  assessmentOwned,
  assessmentDTO,
  questionDTO,
  editable,
  staffTransaction,
  questionFingerprint,
} from "../services/staffAssessment.js";
import {
  parseQuestionCSV,
  questionCSVTemplate,
} from "../services/questionCSV.js";
import { authorizedBatch } from "./staffBatches.js";
import { staffScope } from "../services/staffScope.js";
import { AppError } from "../utils/AppError.js";
const dates = (a: { opensAt: string | null; closesAt: string | null }) => ({
  opensAt: a.opensAt ? new Date(a.opensAt) : null,
  closesAt: a.closesAt ? new Date(a.closesAt) : null,
});
export const managedAssessments: RequestHandler = async (req, res) => {
  const all = await Assessment.find({
    ...(req.user!.role === "admin" ? {} : { ownerId: req.user!._id }),
    ...(!req.app.locals.allowDemoAccounts ? { demo: false } : {}),
  }).sort({ updatedAt: -1 });
  res.json({ success: true, data: all.map(assessmentDTO) });
};
export const managedAssessment: RequestHandler = async (req, res) => {
  const a = await assessmentOwned(req, req.params.id);
  const qs = await Question.find({ _id: { $in: a.questionIds } });
  res.json({
    success: true,
    data: { assessment: assessmentDTO(a), questions: qs.map(questionDTO) },
  });
};
export const createAssessment: RequestHandler = async (req, res) => {
  const input = assessmentInput.parse(req.body);
  const a = await Assessment.create({
    ...input,
    ...dates(input),
    ownerId: req.user!._id,
    key: `staff:${randomUUID()}`,
    questionIds: [],
    published: false,
    demo: false,
  });
  res.status(201).json({ success: true, data: assessmentDTO(a) });
};
export const editAssessment: RequestHandler = async (req, res) => {
  const input = assessmentEdit.parse(req.body);
  const a = await staffTransaction(async (session) => {
    const a = await editable(req, req.params.id, input.version, session);
    if (a.questionIds.length && a.category !== input.content.category)
      throw new AppError(
        400,
        "CATEGORY_CONFLICT",
        "Remove the existing questions before changing category.",
      );
    a.set({ ...input.content, ...dates(input.content) });
    a.version++;
    await a.save({ session });
    return a;
  });
  res.json({ success: true, data: assessmentDTO(a) });
};
export const addQuestion: RequestHandler = async (req, res) => {
  const input = questionEdit.parse(req.body);
  const q = await staffTransaction(async (session) => {
    const a = await editable(req, req.params.id, input.version, session);
    if (a.questionIds.length >= 200)
      throw new AppError(
        400,
        "QUESTION_LIMIT",
        "An assessment supports at most 200 questions.",
      );
    const fingerprint = questionFingerprint(input.content.prompt);
    if (
      (
        await Question.find({ _id: { $in: a.questionIds } }).session(session)
      ).some((q) => questionFingerprint(q.prompt) === fingerprint)
    )
      throw new AppError(
        409,
        "DUPLICATE_QUESTION",
        "This question already exists in the assessment.",
      );
    const [q] = await Question.create(
      [
        {
          ...input.content,
          key: `staff:${randomUUID()}`,
          category: a.category,
          ownerId: a.ownerId || req.user!._id,
          managedAssessmentId: a._id,
          fingerprint,
          demo: a.demo,
          published: false,
        },
      ],
      { session },
    );
    a.questionIds.push(q._id);
    a.version++;
    await a.save({ session });
    return q;
  });
  res.status(201).json({ success: true, data: questionDTO(q) });
};
export const editQuestion: RequestHandler = async (req, res) => {
  const input = questionEdit.parse(req.body),
    id = objectIdSchema.parse(req.params.questionId);
  const q = await staffTransaction(async (session) => {
    const a = await editable(req, req.params.id, input.version, session);
    if (!a.questionIds.some((q) => q.toString() === id.toLowerCase()))
      throw new AppError(404, "NOT_FOUND", "Question not found.");
    const q = await Question.findById(id).session(session);
    if (!q) throw new AppError(404, "NOT_FOUND", "Question not found.");
    const fingerprint = questionFingerprint(input.content.prompt);
    const duplicate = (
      await Question.find({ _id: { $in: a.questionIds, $ne: q._id } }).session(
        session,
      )
    ).some((other) => questionFingerprint(other.prompt) === fingerprint);
    if (duplicate)
      throw new AppError(
        409,
        "DUPLICATE_QUESTION",
        "This question already exists.",
      );
    let changed = q;
    if (!q.managedAssessmentId?.equals(a._id)) {
      [changed] = await Question.create(
        [
          {
            ...input.content,
            key: `staff:${randomUUID()}`,
            category: a.category,
            ownerId: a.ownerId || req.user!._id,
            managedAssessmentId: a._id,
            fingerprint,
            demo: a.demo,
            published: false,
          },
        ],
        { session },
      );
      a.questionIds = a.questionIds.map((qId) =>
        qId.equals(q._id) ? changed._id : qId,
      );
    } else {
      q.set({ ...input.content, fingerprint });
      q.version++;
      await q.save({ session });
    }
    a.version++;
    await a.save({ session });
    return changed;
  });
  res.json({ success: true, data: questionDTO(q) });
};
export const deleteQuestion: RequestHandler = async (req, res) => {
  const input = revisionInput.parse(req.body),
    id = objectIdSchema.parse(req.params.questionId);
  await staffTransaction(async (session) => {
    const a = await editable(req, req.params.id, input.version, session);
    if (!a.questionIds.some((q) => q.toString() === id.toLowerCase()))
      throw new AppError(404, "NOT_FOUND", "Question not found.");
    a.questionIds = a.questionIds.filter(
      (q) => q.toString() !== id.toLowerCase(),
    );
    await Question.deleteOne({ _id: id, managedAssessmentId: a._id }).session(
      session,
    );
    a.version++;
    await a.save({ session });
  });
  res.json({ success: true, data: { deleted: true } });
};
export const publishAssessment: RequestHandler = async (req, res) => {
  const input = assessmentPublish.parse(req.body);
  const a = await staffTransaction(async (session) => {
    const a = await assessmentOwned(req, req.params.id, session);
    if (a.version !== input.version)
      throw new AppError(
        409,
        "STALE_ASSESSMENT",
        "Assessment changed. Reload before publishing.",
      );
    if (input.published) {
      const qs = await Question.find({
        _id: { $in: a.questionIds },
        category: a.category,
        ...(!a.demo ? { demo: false } : {}),
      }).session(session);
      if (qs.length !== a.questionIds.length || qs.length < a.questionCount)
        throw new AppError(
          400,
          "INCOMPLETE_ASSESSMENT",
          "Add enough valid questions before publishing.",
        );
      if (qs.some((q) => !q.published && !q.managedAssessmentId?.equals(a._id)))
        throw new AppError(
          400,
          "UNPUBLISHED_QUESTION",
          "The assessment references an unpublished external question.",
        );
    }
    await Question.updateMany(
      { managedAssessmentId: a._id, _id: { $in: a.questionIds } },
      { $set: { published: input.published } },
      { session },
    );
    a.published = input.published;
    a.version++;
    await a.save({ session });
    return a;
  });
  res.json({ success: true, data: assessmentDTO(a) });
};
export const csvTemplate: RequestHandler = (_req, res) => {
  res
    .type("text/csv")
    .attachment("disha360-question-template.csv")
    .send(questionCSVTemplate);
};
export const importQuestions: RequestHandler = async (req, res) => {
  const input = csvInput.parse(req.body);
  const rows = parseQuestionCSV(input.csv);
  const fingerprints = rows.map((q) => questionFingerprint(q.prompt));
  if (new Set(fingerprints).size !== rows.length)
    throw new AppError(
      400,
      "DUPLICATE_CSV",
      "CSV contains duplicate question prompts. Nothing was imported.",
    );
  const count = await staffTransaction(async (session) => {
    const a = await editable(req, req.params.id, input.version, session);
    if (a.questionIds.length + rows.length > 200)
      throw new AppError(
        400,
        "QUESTION_LIMIT",
        "Assessment question pool cannot exceed 200.",
      );
    const existing = await Question.find({
      _id: { $in: a.questionIds },
    }).session(session);
    if (
      existing.some((q) => fingerprints.includes(questionFingerprint(q.prompt)))
    )
      throw new AppError(
        409,
        "DUPLICATE_CSV",
        "CSV duplicates a saved question. Nothing was imported.",
      );
    const qs = await Question.create(
      rows.map((q, i) => ({
        ...q,
        key: `staff:${randomUUID()}`,
        category: a.category,
        ownerId: a.ownerId || req.user!._id,
        managedAssessmentId: a._id,
        fingerprint: fingerprints[i],
        demo: a.demo,
        published: false,
      })),
      { session },
    );
    a.questionIds.push(...qs.map((q) => q._id));
    a.version++;
    await a.save({ session });
    return qs.length;
  });
  res.status(201).json({ success: true, data: { imported: count } });
};
export const assignAssessment: RequestHandler = async (req, res) => {
  const input = assessmentAssignmentInput.parse(req.body);
  const assignment = await staffTransaction(async (session) => {
    const a = await assessmentOwned(req, req.params.id, session);
    if (!a.published)
      throw new AppError(
        409,
        "UNPUBLISHED_ASSESSMENT",
        "Publish the assessment before assigning it.",
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
    await Assessment.updateOne(
      { _id: a._id },
      { $set: { updatedAt: new Date() } },
      { session },
    );
    return BatchAssignment.findOneAndUpdate(
      { batchId: b._id, kind: "assessment", resourceId: a._id },
      { $set: { assignedBy: req.user!._id, dueAt: new Date(input.dueAt) } },
      { session, upsert: true, new: true, runValidators: true },
    );
  });
  res.json({ success: true, data: { id: assignment!.id } });
};
export const assessmentAssignments: RequestHandler = async (req, res) => {
  const a = await assessmentOwned(req, req.params.id);
  const batches = await Batch.find(
    req.user!.role === "admin"
      ? {}
      : { active: true, trainerIds: req.user!._id },
  );
  const rows = await BatchAssignment.find({
    kind: "assessment",
    resourceId: a._id,
    batchId: { $in: batches.map((b) => b._id) },
  });
  res.json({
    success: true,
    data: rows.map((r) => ({
      id: r.id,
      batchId: r.batchId.toString(),
      batchName: batches.find((b) => b._id.equals(r.batchId))!.name,
      active: batches.find((b) => b._id.equals(r.batchId))!.active,
      dueAt: r.dueAt,
    })),
  });
};
export const removeAssessmentAssignment: RequestHandler = async (req, res) => {
  const a = await assessmentOwned(req, req.params.id),
    b = await authorizedBatch(req, String(req.params.batchId));
  await BatchAssignment.deleteOne({
    kind: "assessment",
    resourceId: a._id,
    batchId: b._id,
  });
  res.json({ success: true, data: { removed: true } });
};
export const assessmentSubmissions: RequestHandler = async (req, res) => {
  const a = await assessmentOwned(req, req.params.id),
    q = batchFilter.parse(req.query),
    scope = await staffScope(req.user!, !!req.app.locals.allowDemoAccounts);
  let students = scope.students;
  if (q.batchId) {
    const b = await authorizedBatch(req, q.batchId);
    const ids = await Enrollment.distinct("studentId", {
      batchId: b._id,
      active: true,
    });
    students = students.filter((s) => ids.some((id) => id.equals(s._id)));
  }
  const attempts = await TestAttempt.find({
    assessmentId: a._id,
    studentId: { $in: students.map((s) => s._id) },
  }).sort({ startedAt: -1 });
  res.json({
    success: true,
    data: students.map((s) => ({
      studentId: s.id,
      name: s.name,
      email: s.email,
      status: attempts.some(
        (t) => t.studentId.equals(s._id) && t.status === "submitted",
      )
        ? "completed"
        : attempts.some((t) => t.studentId.equals(s._id))
          ? "in-progress"
          : "not-started",
      attempts: attempts
        .filter((t) => t.studentId.equals(s._id))
        .map((t) => ({
          id: t.id,
          status: t.status,
          startedAt: t.startedAt,
          deadlineAt: t.deadlineAt,
          finalizedAt: t.finalizedAt,
          percentage:
            t.status === "submitted" ? (t.result?.percentage ?? null) : null,
          score: t.status === "submitted" ? (t.result?.score ?? null) : null,
          maximum:
            t.status === "submitted" ? (t.result?.maximum ?? null) : null,
        })),
    })),
  });
};
