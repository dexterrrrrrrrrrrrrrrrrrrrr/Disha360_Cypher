import { z } from "zod";
export const languages = ["python", "java", "cpp", "javascript"] as const;
export const codeInput = z
  .object({
    language: z.enum(languages),
    source: z.string().min(1).max(30000),
    stdin: z.string().max(10000).default(""),
  })
  .strict();
export const draftInput = codeInput
  .extend({ version: z.number().int().min(0) })
  .strict();
export const scopeInput = z
  .string()
  .regex(/^(playground|problem-[a-f0-9]{24})$/);
export const verdicts = [
  "Accepted",
  "Wrong Answer",
  "Time Limit Exceeded",
  "Memory Limit Exceeded",
  "Compilation Error",
  "Runtime Error",
  "System Error",
] as const;
export type CodeInput = z.infer<typeof codeInput>;
