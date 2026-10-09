import { z } from "zod";
import { categories, questionSchema, assessmentSchema } from "./assessment.js";
import { objectIdSchema } from "./resume.js";
export const questionInput = questionSchema
  .innerType()
  .omit({
    key: true,
    category: true,
    published: true,
    demo: true,
    version: true,
  })
  .strict()
  .superRefine((q, ctx) => {
    const r = questionSchema.safeParse({
      ...q,
      key: "validation",
      category: "quantitative",
    });
    if (!r.success) for (const issue of r.error.issues) ctx.addIssue(issue);
  });
export const assessmentInput = z
  .object({
    title: z.string().trim().min(3).max(200),
    instructions: z.string().trim().min(10).max(3000),
    category: z.enum(categories),
    questionCount: z.number().int().min(1).max(100),
    durationSeconds: z.number().int().min(30).max(7200),
    pointsPerCorrect: z.number().min(0.1).max(100),
    penaltyPerIncorrect: z.number().min(0).max(100),
    maxAttempts: z.number().int().min(1).max(10),
    opensAt: z.string().datetime().nullable(),
    closesAt: z.string().datetime().nullable(),
  })
  .strict()
  .superRefine((a, ctx) => {
    const r = assessmentSchema.safeParse({
      ...a,
      key: "validation",
      questionIds: [],
      published: false,
      opensAt: a.opensAt ? new Date(a.opensAt) : null,
      closesAt: a.closesAt ? new Date(a.closesAt) : null,
    });
    if (!r.success) for (const issue of r.error.issues) ctx.addIssue(issue);
  });
export const revisionInput = z
  .object({ version: z.number().int().min(1) })
  .strict();
export const assessmentEdit = z
  .object({ version: z.number().int().min(1), content: assessmentInput })
  .strict();
export const questionEdit = z
  .object({ version: z.number().int().min(1), content: questionInput })
  .strict();
export const assessmentPublish = z
  .object({ version: z.number().int().min(1), published: z.boolean() })
  .strict();
export const csvInput = z
  .object({
    version: z.number().int().min(1),
    csv: z.string().min(1).max(50000),
  })
  .strict();
export const assessmentAssignmentInput = z
  .object({ batchId: objectIdSchema, dueAt: z.string().datetime() })
  .strict();
export const batchFilter = z
  .object({ batchId: objectIdSchema.optional() })
  .strict();
