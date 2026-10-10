import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";
import { codeInput } from "../features/coding/validation.js";
import { CodingProblem } from "../models/CodingProblem.js";
import { objectIdSchema } from "../validators/resume.js";
import { AppError } from "../utils/AppError.js";

// Illustrations only: no executor, grading, activity recording or submission writes.
export function codingDemoControllers(enabled: boolean) {
  function requireDemo() {
    if (!enabled || (process.env.NODE_ENV ?? "development") !== "development")
      throw new AppError(404, "CODING_DEMO_DISABLED", "Coding Demo Mode is unavailable.");
  }
  const run: RequestHandler = (req, res) => {
    requireDemo();
    const { language } = codeInput.parse(req.body);
    res.json({ success: true, data: { demoRun: {
      demo: true, language, illustrativeOutput: "Hello, world!\n",
      message: "Demo Mode: Code was not executed. This is an illustrative output only.",
    } } });
  };
  const submit: RequestHandler = async (req, res) => {
    requireDemo();
    const { language } = codeInput.omit({ stdin: true }).strict().parse(req.body);
    const problem = await CodingProblem.findOne({
      _id: objectIdSchema.parse(req.params.id), published: true,
      ...(!req.app.locals.allowDemoAccounts ? { demo: false } : {}),
    }).select("title supportedLanguages");
    if (!problem) throw new AppError(404, "NOT_FOUND", "Coding problem not found.");
    if (!problem.supportedLanguages.includes(language))
      throw new AppError(400, "UNSUPPORTED_LANGUAGE", "Choose a language supported by this problem.");
    res.status(201).json({ success: true, data: { demoReceipt: {
      demo: true, receiptId: `demo-${randomUUID()}`, problemId: problem.id,
      title: problem.title, language, receivedAt: new Date().toISOString(),
      message: "Demo submission only. No code execution or grading occurred.",
    } } });
  };
  return { run, submit };
}
