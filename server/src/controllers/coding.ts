import type { RequestHandler } from "express";
import { z } from "zod";
import { CodeDraft } from "../models/CodeDraft.js";
import {
  codeInput,
  draftInput,
  languages,
  scopeInput,
} from "../features/coding/validation.js";
import {
  executionLimits,
  type ExecutionProvider,
} from "../services/codeExecution.js";
import { AppError } from "../utils/AppError.js";
export function codingControllers(provider?: ExecutionProvider, demoMode = false) {
  const config: RequestHandler = (_req, res) =>
    res.json({
      success: true,
      data: {
        configured: !!provider,
        demoMode,
        provider: provider?.name || null,
        limits: executionLimits,
        message: demoMode
          ? "Coding Demo Mode: No code execution or grading. Code and custom input are not processed. Demo actions do not affect scores, points, badges or analytics."
          : provider
          ? "Code runs on the configured isolated provider."
          : "Execution setup required. Configure a trusted hardened Judge0 provider on the backend. Draft editing and saving remain available.",
      },
    });
  const draft: RequestHandler = async (req, res) => {
    const scope = scopeInput.parse(req.params.scope);
    const { language } = z
      .object({ language: z.enum(languages) })
      .strict()
      .parse(req.query);
    const d = await CodeDraft.findOne({
      studentId: req.user!._id,
      scope,
      language,
    });
    res.json({
      success: true,
      data: {
        draft: d
          ? {
              source: d.source,
              stdin: d.stdin,
              language: d.language,
              version: d.version,
              updatedAt: d.updatedAt,
            }
          : null,
      },
    });
  };
  const save: RequestHandler = async (req, res) => {
    const scope = scopeInput.parse(req.params.scope);
    const input = draftInput.parse(req.body);
    const filter = {
      studentId: req.user!._id,
      scope,
      language: input.language,
    };
    let d;
    if (input.version === 0) {
      try {
        d = await CodeDraft.create({
          ...filter,
          source: input.source,
          stdin: input.stdin,
        });
      } catch (e) {
        if (typeof e === "object" && e && "code" in e && e.code === 11000)
          throw new AppError(
            409,
            "DRAFT_CONFLICT",
            "A draft already exists. Reload before saving.",
          );
        throw e;
      }
    } else
      d = await CodeDraft.findOneAndUpdate(
        { ...filter, version: input.version },
        {
          $set: { source: input.source, stdin: input.stdin },
          $inc: { version: 1 },
        },
        { new: true, runValidators: true },
      );
    if (!d)
      throw new AppError(
        409,
        "DRAFT_CONFLICT",
        "This draft changed in another tab. Reload before saving.",
      );
    res.json({
      success: true,
      data: {
        draft: {
          source: d.source,
          stdin: d.stdin,
          language: d.language,
          version: d.version,
          updatedAt: d.updatedAt,
        },
      },
    });
  };
  const run: RequestHandler = async (req, res) => {
    const input = codeInput.parse(req.body);
    if (!provider)
      throw new AppError(
        503,
        "EXECUTION_SETUP_REQUIRED",
        "Code execution is unavailable until a trusted isolated provider is configured.",
      );
    const result = await provider.execute(input);
    res.json({ success: true, data: { execution: result } });
  };
  return { config, draft, save, run };
}
