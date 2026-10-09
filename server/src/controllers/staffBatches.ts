import type { RequestHandler } from "express";
import { Batch, Enrollment } from "../models/Batch.js";
import { User } from "../models/User.js";
import { AppError } from "../utils/AppError.js";
import { objectIdSchema } from "../validators/resume.js";
import {
  batchInput,
  batchUpdate,
  membershipInput,
  peopleQuery,
} from "../validators/staff.js";
import { visibleUsers } from "../services/staffScope.js";

export const personDTO = (u: InstanceType<typeof User>) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  department: u.department,
  semester: u.semester,
});
const batchDTO = (b: InstanceType<typeof Batch>) => ({
  id: b.id,
  name: b.name,
  description: b.description,
  active: b.active,
  trainerIds: b.trainerIds.map(String),
  version: b.version,
});
export async function authorizedBatch(
  req: Parameters<RequestHandler>[0],
  id: string,
) {
  const b = await Batch.findOne({
    _id: objectIdSchema.parse(id),
    ...(req.user!.role === "trainer"
      ? { active: true, trainerIds: req.user!._id }
      : {}),
  });
  if (!b)
    throw new AppError(
      404,
      "BATCH_NOT_FOUND",
      "Batch not found in your authorized workspace.",
    );
  return b;
}
async function validateTrainers(ids: string[], allowDemo: boolean) {
  if (
    (await User.countDocuments({
      _id: { $in: ids },
      role: "trainer",
      ...visibleUsers(allowDemo),
    })) !== ids.length
  )
    throw new AppError(
      400,
      "INVALID_TRAINERS",
      "Select existing Trainer accounts only.",
    );
}
export const listBatches: RequestHandler = async (req, res) => {
  const batches = await Batch.find(
    req.user!.role === "admin"
      ? {}
      : { active: true, trainerIds: req.user!._id },
  ).sort({ name: 1, _id: 1 });
  const enrollments = await Enrollment.find({
    batchId: { $in: batches.map((b) => b._id) },
    active: true,
  });
  const students = await User.find({
    _id: { $in: enrollments.map((e) => e.studentId) },
    role: "student",
    ...visibleUsers(!!req.app.locals.allowDemoAccounts),
  }).select("_id");
  const valid = new Set(students.map((s) => s.id));
  res.json({
    success: true,
    data: batches.map((b) => ({
      ...batchDTO(b),
      memberCount: enrollments.filter(
        (e) => e.batchId.equals(b._id) && valid.has(e.studentId.toString()),
      ).length,
    })),
  });
};
export const getBatch: RequestHandler = async (req, res) => {
  const b = await authorizedBatch(req, String(req.params.id));
  const memberships = await Enrollment.find({ batchId: b._id, active: true });
  const [students, trainers] = await Promise.all([
    User.find({
      _id: { $in: memberships.map((e) => e.studentId) },
      role: "student",
      ...visibleUsers(!!req.app.locals.allowDemoAccounts),
    }).sort({ name: 1 }),
    User.find({
      _id: { $in: b.trainerIds },
      role: "trainer",
      ...visibleUsers(!!req.app.locals.allowDemoAccounts),
    }).sort({ name: 1 }),
  ]);
  res.json({
    success: true,
    data: {
      ...batchDTO(b),
      students: students.map(personDTO),
      trainers: trainers.map(personDTO),
    },
  });
};
export const createBatch: RequestHandler = async (req, res) => {
  const input = batchInput.parse(req.body);
  await validateTrainers(input.trainerIds, !!req.app.locals.allowDemoAccounts);
  const b = await Batch.create(input);
  res.status(201).json({ success: true, data: batchDTO(b) });
};
export const updateBatch: RequestHandler = async (req, res) => {
  const id = objectIdSchema.parse(req.params.id),
    input = batchUpdate.parse(req.body);
  await authorizedBatch(req, id);
  await validateTrainers(input.trainerIds, !!req.app.locals.allowDemoAccounts);
  const { version, ...changes } = input;
  const b = await Batch.findOneAndUpdate(
    {
      _id: id,
      ...(version === 1
        ? { $or: [{ version: 1 }, { version: { $exists: false } }] }
        : { version }),
    },
    { $set: { ...changes, version: version + 1 } },
    { new: true, runValidators: true },
  );
  if (!b)
    throw new AppError(
      409,
      "STALE_BATCH",
      "This batch changed. Reload before saving.",
    );
  res.json({ success: true, data: batchDTO(b) });
};
export const updateMembership: RequestHandler = async (req, res) => {
  const input = membershipInput.parse(req.body),
    id = objectIdSchema.parse(req.params.studentId);
  const b = await authorizedBatch(req, String(req.params.id));
  if (!b.active)
    throw new AppError(
      409,
      "ARCHIVED_BATCH",
      "Reactivate this batch before changing memberships.",
    );
  const student = await User.findOne({
    _id: id,
    role: "student",
    ...visibleUsers(!!req.app.locals.allowDemoAccounts),
  }).select("_id");
  if (!student)
    throw new AppError(
      400,
      "INVALID_STUDENT",
      "Select an existing Student account.",
    );
  const key = { batchId: b._id, studentId: student._id };
  // The unique index is the concurrency guard; repeated adds update the same record.
  try {
    await Enrollment.updateOne(
      key,
      { $set: { active: input.active } },
      { upsert: input.active, runValidators: true },
    );
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
    await Enrollment.updateOne(
      key,
      { $set: { active: input.active } },
      { runValidators: true },
    );
  }
  res.json({ success: true, data: { studentId: id, active: input.active } });
};
export const people: RequestHandler = async (req, res) => {
  const q = peopleQuery.parse(req.query);
  // Literal substring matching prevents user input becoming a regular expression.
  const search = q.search?.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const users = await User.find({
    role: q.role,
    ...visibleUsers(!!req.app.locals.allowDemoAccounts),
    ...(search
      ? {
          $or: [
            { name: { $regex: search, $options: "i" } },
            { email: { $regex: search, $options: "i" } },
          ],
        }
      : {}),
  })
    .sort({ name: 1, _id: 1 })
    .limit(501);
  res.json({
    success: true,
    data: {
      people: users.slice(0, 500).map(personDTO),
      truncated: users.length > 500,
    },
  });
};
