import type { RequestHandler } from "express";
import { z } from "zod";
import { CodingProblem } from "../models/CodingProblem.js";
import { CodingSubmission } from "../models/CodingSubmission.js";
import { objectIdSchema } from "../validators/resume.js";
import { codeInput } from "../features/coding/validation.js";
import { AppError } from "../utils/AppError.js";
import {
  expireSubmissions,
  judgeSubmission,
  submissionDTO,
} from "../services/codingJudge.js";
import type { ExecutionProvider } from "../services/codeExecution.js";
export function problemDTO(p: InstanceType<typeof CodingProblem>) {
  return {
    id: p.id,
    title: p.title,
    difficulty: p.difficulty,
    topic: p.topic,
    supportedLanguages: [...p.supportedLanguages],
    statement: p.statement,
    inputFormat: p.inputFormat,
    outputFormat: p.outputFormat,
    constraints: p.constraints,
    examples: p.examples.map((e) => ({
      input: e.input,
      output: e.output,
      explanation: e.explanation,
    })),
    demo: p.demo,
    version: p.version,
  };
}
export function problemControllers(provider?: ExecutionProvider) {
  const list: RequestHandler = async (req, res) => {
    const query = z
      .object({
        difficulty: z.enum(["easy", "medium", "hard"]).optional(),
        topic: z.string().max(100).optional(),
      })
      .strict()
      .parse(req.query);
    const problems = await CodingProblem.find({
      published: true,
      ...(!req.app.locals.allowDemoAccounts ? { demo: false } : {}),
      ...query,
    })
      .sort({ title: 1 })
      .limit(100);
    const solved = await CodingSubmission.distinct("problemId", {
      studentId: req.user!._id,
      verdict: "Accepted",
      status: "completed",
    });
    res.json({
      success: true,
      data: {
        problems: problems.map((p) => ({
          ...problemDTO(p),
          solved: solved.some((id) => id.equals(p._id)),
        })),
      },
    });
  };
  const detail: RequestHandler = async (req, res) => {
    const p = await CodingProblem.findOne({
      _id: objectIdSchema.parse(req.params.id),
      published: true,
      ...(!req.app.locals.allowDemoAccounts ? { demo: false } : {}),
    });
    if (!p) throw new AppError(404, "NOT_FOUND", "Coding problem not found.");
    res.json({ success: true, data: { problem: problemDTO(p) } });
  };
  const history: RequestHandler = async (req, res) => {
    await expireSubmissions(req.user!.id as string);
    res.json({
      success: true,
      data: {
        submissions: (
          await CodingSubmission.find({ studentId: req.user!._id })
            .sort({ createdAt: -1 })
            .limit(100)
        ).map(submissionDTO),
      },
    });
  };
  const get: RequestHandler = async (req, res) => {
    await expireSubmissions(req.user!.id as string);
    const s = await CodingSubmission.findOne({
      _id: objectIdSchema.parse(req.params.id),
      studentId: req.user!._id,
    });
    if (!s) throw new AppError(404, "NOT_FOUND", "Submission not found.");
    res.json({ success: true, data: { submission: submissionDTO(s) } });
  };
  const submit: RequestHandler = async (req, res) => {
    const input = codeInput
      .omit({ stdin: true })
      .extend({ requestId: z.string().uuid() })
      .strict()
      .parse(req.body);
    const id = objectIdSchema.parse(req.params.id);
    await expireSubmissions(req.user!.id as string);
    const existing = await CodingSubmission.findOne({
      studentId: req.user!._id,
      requestId: input.requestId,
    });
    if (existing) {
      if (!existing.problemId.equals(id))
        throw new AppError(
          409,
          "SUBMISSION_CONFLICT",
          "Request ID already belongs to another problem.",
        );
      res.json({
        success: true,
        data: { submission: submissionDTO(existing) },
      });
      return;
    }
    if (!provider)
      throw new AppError(
        503,
        "EXECUTION_SETUP_REQUIRED",
        "Judging requires a configured trusted isolated execution provider.",
      );
    const p = await CodingProblem.findOne({
      _id: id,
      published: true,
      ...(!req.app.locals.allowDemoAccounts ? { demo: false } : {}),
    }).select("+hiddenTests");
    if (!p) throw new AppError(404, "NOT_FOUND", "Coding problem not found.");
    let s;
    if (!p.supportedLanguages.includes(input.language)) throw new AppError(400, 'UNSUPPORTED_LANGUAGE', 'This problem does not support the selected language.');
    try {
      s = await CodingSubmission.create({
        studentId: req.user!._id,
        problemId: p._id,
        problemVersion: p.version,
        title: p.title,
        language: input.language,
        source: input.source,
        requestId: input.requestId,
        total: p.hiddenTests.length,
        processingUntil: new Date(Date.now() + 90000),
      });
    } catch (e) {
      if (typeof e === "object" && e && "code" in e && e.code === 11000) {
        const duplicate = await CodingSubmission.findOne({
          studentId: req.user!._id,
          requestId: input.requestId,
        });
        res.json({
          success: true,
          data: { submission: submissionDTO(duplicate!) },
        });
        return;
      }
      throw e;
    }
    const done = await judgeSubmission(
      s,
      { language: input.language, source: input.source, stdin: "" },
      p.hiddenTests.map((t) => ({ input: t.input, expected: t.expected })),
      provider,
    );
    res
      .status(201)
      .json({ success: true, data: { submission: submissionDTO(done) } });
  };
  return { list, detail, history, get, submit };
}
