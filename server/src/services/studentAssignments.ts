import { Batch, Enrollment } from "../models/Batch.js";
import { BatchAssignment } from "../models/BatchAssignment.js";
import { Assessment, TestAttempt } from "../models/Assessment.js";
export async function studentAssessmentAssignments(
  studentId: string,
  allowDemo: boolean,
) {
  const enrollments = await Enrollment.find({ studentId, active: true });
  const batches = await Batch.find({
    _id: { $in: enrollments.map((e) => e.batchId) },
    active: true,
  });
  const assignments = await BatchAssignment.find({
    kind: "assessment",
    batchId: { $in: batches.map((b) => b._id) },
  }).sort({ dueAt: 1 });
  const assessments = await Assessment.find({
    _id: { $in: assignments.map((a) => a.resourceId) },
    published: true,
    ...(!allowDemo ? { demo: false } : {}),
  });
  const completed = await TestAttempt.distinct("assessmentId", {
    studentId,
    status: "submitted",
  });
  const done = new Set(completed.map(String));
  const seen = new Set<string>();
  return assignments.flatMap((r) => {
    const a = assessments.find((a) => a._id.equals(r.resourceId));
    if (!a || seen.has(a.id)) return [];
    seen.add(a.id);
    return [
      {
        id: a.id,
        title: a.title,
        topic: a.category,
        dueAt: r.dueAt,
        status: done.has(a.id) ? ("completed" as const) : ("pending" as const),
      },
    ];
  });
}
export async function studentLearningAssignments(studentId: string) {
  const enrollments = await Enrollment.find({ studentId, active: true }),
    batches = await Batch.find({
      _id: { $in: enrollments.map((e) => e.batchId) },
      active: true,
    });
  const assignments = await BatchAssignment.find({
    kind: "learning",
    batchId: { $in: batches.map((b) => b._id) },
  });
  return assignments.map((a) => a.resourceId);
}
