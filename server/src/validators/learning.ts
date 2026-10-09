import { z } from "zod";
import { isIP } from "node:net";
import { objectIdSchema } from "./resume.js";
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine(
      (v) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v),
      "Unsupported control characters",
    );
export const resourceURL = z
  .string()
  .max(2000)
  .url()
  .refine((value) => {
    try {
      const u = new URL(value),
        host = u.hostname.toLowerCase();
      return (
        u.protocol === "https:" &&
        !u.username &&
        !u.password &&
        !isIP(host.replace(/[\[\]]/g, "")) &&
        host.includes(".") &&
        !/(^|\.)(localhost|local|internal)$/.test(host)
      );
    } catch {
      return false;
    }
  }, "Use an external HTTPS URL without credentials or local/IP hosts.");
const lesson = z
  .object({
    id: objectIdSchema.optional(),
    title: text(150).refine((v) => v.length >= 3),
    kind: z.enum(["text", "link"]),
    body: text(10000),
    url: z.union([resourceURL, z.literal("")]),
  })
  .strict()
  .superRefine((l, ctx) => {
    if (l.kind === "text" && !l.body.length)
      ctx.addIssue({
        code: "custom",
        path: ["body"],
        message: "Text lessons require content.",
      });
    if (l.kind === "link" && !l.url)
      ctx.addIssue({
        code: "custom",
        path: ["url"],
        message: "Link lessons require a validated HTTPS URL.",
      });
    if (l.kind === "text" && l.url)
      ctx.addIssue({
        code: "custom",
        path: ["url"],
        message: "Use a link lesson for external resources.",
      });
  });
export const learningInput = z
  .object({
    title: text(200).refine((v) => v.length >= 3),
    subject: text(100).refine((v) => v.length >= 2),
    topic: text(100).refine((v) => v.length >= 2),
    description: text(3000),
    objectives: z.array(text(300).refine((v) => v.length > 0)).max(20),
    lessons: z.array(lesson).max(30),
  })
  .strict();
export const learningUpdate = learningInput
  .extend({ version: z.number().int().min(1) })
  .strict();
export const publishInput = z
  .object({ published: z.boolean(), version: z.number().int().min(1) })
  .strict();
