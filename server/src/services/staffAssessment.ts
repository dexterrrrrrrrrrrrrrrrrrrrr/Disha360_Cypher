import mongoose, { type ClientSession } from "mongoose";
import type { Request } from "express";
import { createHash } from "node:crypto";
import { Assessment, Question } from "../models/Assessment.js";
import { objectIdSchema } from "../validators/resume.js";
import { AppError } from "../utils/AppError.js";
export async function assessmentOwned(
  req: Request,
  id: unknown,
  session: ClientSession | null = null,
) {
  const a = await Assessment.findOne({
    _id: objectIdSchema.parse(id),
    ...(req.user!.role === "admin" ? {} : { ownerId: req.user!._id }),
    ...(!req.app.locals.allowDemoAccounts ? { demo: false } : {}),
  }).session(session);
  if (!a)
    throw new AppError(
      404,
      "NOT_FOUND",
      "Assessment not found in your authorized workspace.",
    );
  return a;
}
export function questionFingerprint(prompt: string) {
  return createHash("sha256")
    .update(prompt.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase())
    .digest("hex");
}
export async function staffTransaction<T>(
  operation: (session: ClientSession) => Promise<T>,
): Promise<T> {
  try {
    return await mongoose.connection.transaction(operation);
  } catch (e) {
    const code = (e as { code?: number }).code;
    if (code === 20 || code === 303)
      throw new AppError(
        503,
        "TRANSACTIONS_REQUIRED",
        "Assessment authoring requires MongoDB Atlas or a replica set. No partial changes were saved.",
      );
    if (code === 11000)
      throw new AppError(
        409,
        "DUPLICATE_QUESTION",
        "A duplicate question or assignment was detected. No partial import was saved.",
      );
    throw e;
  }
}
export function assessmentDTO(a: InstanceType<typeof Assessment>) {
  return {
    id: a.id,
    ownerId: a.ownerId?.toString() || null,
    title: a.title,
    instructions: a.instructions,
    category: a.category,
    questionIds: a.questionIds.map(String),
    questionCount: a.questionCount,
    durationSeconds: a.durationSeconds,
    pointsPerCorrect: a.pointsPerCorrect,
    penaltyPerIncorrect: a.penaltyPerIncorrect,
    maxAttempts: a.maxAttempts,
    opensAt: a.opensAt,
    closesAt: a.closesAt,
    published: a.published,
    demo: a.demo,
    version: a.version,
  };
}
export function questionDTO(q: InstanceType<typeof Question>) {
  return {
    id: q.id,
    prompt: q.prompt,
    topic: q.topic,
    difficulty: q.difficulty,
    options: q.options.map((o) => ({ id: o.id, text: o.text })),
    correctOptionId: q.correctOptionId,
    explanation: q.explanation,
    shuffleOptions: q.shuffleOptions,
    expectedSeconds: q.expectedSeconds,
  };
}
export async function editable(
  req: Request,
  id: unknown,
  version: number,
  session: ClientSession,
) {
  const a = await assessmentOwned(req, id, session);
  if (a.published)
    throw new AppError(
      409,
      "PUBLISHED_ASSESSMENT",
      "Unpublish before editing. Existing attempt snapshots are preserved.",
    );
  if (a.version !== version)
    throw new AppError(
      409,
      "STALE_ASSESSMENT",
      "Assessment changed. Reload before editing.",
    );
  return a;
}
