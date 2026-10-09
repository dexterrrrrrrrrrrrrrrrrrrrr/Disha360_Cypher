import { z } from "zod";
import { objectIdSchema } from "./resume.js";
const text = (max: number, multiline = false) =>
  z
    .string()
    .trim()
    .max(max)
    .refine(
      (v) =>
        !(
          multiline
            ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/
            : /[\u0000-\u001f]/
        ).test(v),
      "Unsupported control characters.",
    );
const trainerIds = z
  .array(objectIdSchema)
  .max(20)
  .refine(
    (ids) => new Set(ids.map((id) => id.toLowerCase())).size === ids.length,
    "A trainer may be assigned only once.",
  );
export const batchInput = z
  .object({
    name: text(100).refine(
      (v) => v.length >= 2,
      "Batch names require at least two characters.",
    ),
    description: text(2000, true),
    trainerIds,
  })
  .strict();
export const batchUpdate = batchInput
  .extend({ active: z.boolean(), version: z.number().int().min(1) })
  .strict();
export const membershipInput = z.object({ active: z.boolean() }).strict();
export const peopleQuery = z
  .object({
    role: z.enum(["student", "trainer"]),
    search: text(100).optional(),
  })
  .strict();
export const studentQuery = z
  .object({
    search: text(100).optional(),
    department: text(100).optional(),
    batchId: objectIdSchema.optional(),
    page: z.coerce.number().int().min(1).max(100000).default(1),
  })
  .strict();
