import { z } from "zod";
import { categories } from "./assessment.js";
const text = z.string().trim().min(1).max(300);
const topics = z.array(text).min(1).max(20);
export const companySchema = z
  .object({
    key: z.string().regex(/^[a-z0-9-]{1,100}$/),
    name: text,
    overview: z.string().trim().min(10).max(3000),
    industry: text,
    disclaimer: z.string().trim().min(20).max(1000),
    stages: topics,
    topics: z
      .object({
        aptitude: topics,
        technical: topics,
        coding: topics,
        hr: topics,
      })
      .strict(),
    interviewQuestions: z.array(text).min(1).max(20),
    checklist: z
      .array(
        z
          .object({ key: z.string().regex(/^[a-z0-9-]{1,60}$/), label: text })
          .strict(),
      )
      .min(1)
      .max(30),
    resourceTopics: topics,
    assessmentCategories: z.array(z.enum(categories)).min(1).max(4),
    published: z.boolean(),
    demo: z.boolean(),
  })
  .strict()
  .refine(
    (c) => new Set(c.checklist.map((i) => i.key)).size === c.checklist.length,
    "Checklist keys must be unique",
  );
export const companyFilterSchema = z
  .object({
    search: z.string().trim().max(100).optional(),
    industry: text.optional(),
    completion: z.enum(["not-started", "in-progress", "complete"]).optional(),
  })
  .strict();
export const companyProgressSchema = z
  .object({
    itemKey: z.string().regex(/^[a-z0-9-]{1,60}$/),
    completed: z.boolean(),
  })
  .strict();
