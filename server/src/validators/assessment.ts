import { z } from "zod";
import { objectIdSchema } from "./resume.js";
export const categories = [
  "quantitative",
  "logical",
  "verbal",
  "technical",
] as const;
export const difficulties = ["easy", "medium", "hard"] as const;
export const questionSchema = z
  .object({
    key: z.string().trim().min(1).max(100),
    category: z.enum(categories),
    topic: z.string().trim().min(1).max(100),
    difficulty: z.enum(difficulties),
    prompt: z.string().trim().min(5).max(3000),
    options: z
      .array(
        z
          .object({
            id: z.string().regex(/^[a-z0-9-]{1,30}$/i),
            text: z.string().trim().min(1).max(1000),
          })
          .strict(),
      )
      .length(4),
    correctOptionId: z.string(),
    explanation: z.string().trim().min(1).max(3000),
    shuffleOptions: z.boolean().default(true),
    expectedSeconds: z.number().int().min(5).max(600).default(60),
    published: z.boolean().default(false),
    demo: z.boolean().default(false),
    version: z.number().int().min(1).default(1),
  })
  .strict()
  .superRefine((q, ctx) => {
    if (
      new Set(q.options.map((v) => v.id)).size !== 4 ||
      new Set(q.options.map((v) => v.text)).size !== 4 ||
      !q.options.some((v) => v.id === q.correctOptionId)
    )
      ctx.addIssue({
        code: "custom",
        path: ["options"],
        message: "Four distinct options and a valid answer are required.",
      });
  });
export const assessmentSchema = z
  .object({
    key: z.string().trim().min(1).max(100),
    title: z.string().trim().min(3).max(200),
    instructions: z.string().trim().min(10).max(3000),
    category: z.enum(categories),
    questionIds: z.array(objectIdSchema).max(200),
    questionCount: z.number().int().min(1).max(100),
    durationSeconds: z.number().int().min(30).max(7200),
    pointsPerCorrect: z.number().min(0.1).max(100).default(1),
    penaltyPerIncorrect: z.number().min(0).max(100).default(0),
    maxAttempts: z.number().int().min(1).max(10).default(3),
    opensAt: z.date().nullable().default(null),
    closesAt: z.date().nullable().default(null),
    published: z.boolean().default(false),
    demo: z.boolean().default(false),
    version: z.number().int().min(1).default(1),
  })
  .strict()
  .superRefine((a, ctx) => {
    if (
      (a.published && a.questionCount > a.questionIds.length) ||
      new Set(a.questionIds).size !== a.questionIds.length ||
      a.penaltyPerIncorrect > a.pointsPerCorrect ||
      (a.opensAt && a.closesAt && a.opensAt >= a.closesAt)
    )
      ctx.addIssue({
        code: "custom",
        message: "Invalid assessment pool, scoring, or availability window.",
      });
  });
export const progressSchema = z
  .object({
    version: z.number().int().min(1),
    currentQuestionId: objectIdSchema,
    questionId: objectIdSchema.optional(),
    selectedOptionId: z.string().max(30).nullable().optional(),
  })
  .strict()
  .refine(
    (v) => (v.questionId === undefined) === (v.selectedOptionId === undefined),
    "Supply both questionId and selectedOptionId when answering.",
  );
export const submissionSchema = z
  .object({ version: z.number().int().min(1) })
  .strict();
