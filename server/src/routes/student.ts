import {
  ownEngagement,
  leaderboard,
  leaderboardProfile,
  leaderboardOptions,
} from "../controllers/engagement.js";
import {
  listCompanies,
  companyDetails,
  updateCompanyProgress,
} from "../controllers/companies.js";
import { problemControllers } from "../controllers/codingProblems.js";
import { codingControllers } from "../controllers/coding.js";
import type { ExecutionProvider } from "../services/codeExecution.js";
import { Router } from "express";
import { databaseStatus } from "../config/database.js";
import {
  requireAuth,
  requireRole,
  protectMutations,
} from "../middleware/auth.js";
import { AppError } from "../utils/AppError.js";
import { dashboard, recordActivity } from "../services/dashboard.js";
import {
  listResumes,
  getResume,
  createResume,
  updateResume,
  deleteResume,
  exportResume,
} from "../controllers/resumes.js";
import {
  createAnalysis,
  listAnalyses,
  getAnalysis,
} from "../controllers/analyses.js";
import { interviewControllers } from "../controllers/interviews.js";
import type { InterviewProvider } from "../services/interviewProvider.js";
import { rateLimit } from "express-rate-limit";
import { feedbackControllers } from "../controllers/feedback.js";
import {
  listAssessments,
  assessmentDetails,
  beginAssessment,
  listAttempts,
  getAttempt,
  saveProgress,
  submitAttempt,
} from "../controllers/assessments.js";
import { studentAnalytics } from "../controllers/analytics.js";

export function studentRoutes(
  clientOrigin: string,
  status = databaseStatus,
  provider?: InterviewProvider,
  execution?: ExecutionProvider,
  executionRateLimit = 10,
) {
  const router = Router();
  router.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  router.use(protectMutations(clientOrigin));
  router.use((_req, _res, next) => {
    if (status() !== "connected")
      throw new AppError(
        503,
        "DATABASE_UNAVAILABLE",
        "The database is unavailable.",
      );
    next();
  });
  router.use(requireAuth, requireRole("student"));
  router.get("/dashboard", async (req, res) => {
    res.json({
      success: true,
      data: await dashboard(req.user!, !!req.app.locals.allowDemoAccounts),
    });
  });
  router.post("/activity/check-in", async (req, res) => {
    await recordActivity(
      req.user!.id as string,
      "dashboard_visit",
      "Checked in to your preparation workspace",
      `check-in:${new Date().toISOString().slice(0, 10)}`,
    );
    res.json({ success: true, data: { message: "Daily check-in recorded." } });
  });
  router.get("/resumes", listResumes);
  router.post("/resumes", createResume);
  router.get("/resumes/:id/pdf", exportResume);
  router.post("/resumes/:id/analyses", createAnalysis);
  router.get("/analyses", listAnalyses);
  router.get("/analyses/:id", getAnalysis);
  router.get("/resumes/:id", getResume);
  router.put("/resumes/:id", updateResume);
  router.delete("/resumes/:id", deleteResume);
  const interviews = interviewControllers(provider);
  const aiLimit = rateLimit({
    windowMs: 60000,
    limit: 20,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      success: false,
      error: {
        code: "RATE_LIMITED",
        message: "Too many interview requests. Wait a minute before retrying.",
      },
    },
  });
  router.get("/interviews/config", interviews.config);
  router.get("/interviews", interviews.list);
  router.post("/interviews", aiLimit, interviews.start);
  router.get("/interviews/:id", interviews.get);
  router.post("/interviews/:id/answers", aiLimit, interviews.answer);
  router.post("/interviews/:id/complete", interviews.complete);
  const feedback = feedbackControllers(provider);
  router.get("/interviews/:id/feedback", feedback.get);
  router.post("/interviews/:id/feedback", aiLimit, feedback.generate);
  router.get("/assessments", listAssessments);
  router.get("/assessments/:id", assessmentDetails);
  router.post("/assessments/:id/attempts", beginAssessment);
  router.get("/attempts", listAttempts);
  router.get("/attempts/:id", getAttempt);
  router.put("/attempts/:id/progress", saveProgress);
  router.post("/attempts/:id/submit", submitAttempt);
  router.get("/analytics", studentAnalytics);
  router.get("/engagement", ownEngagement);
  router.get("/leaderboard", leaderboard);
  router.get("/leaderboard/options", leaderboardOptions);
  router.get("/leaderboard/:id", leaderboardProfile);
  const coding = codingControllers(execution);
  const codeLimit = rateLimit({
    windowMs: 60000,
    limit: executionRateLimit,
    keyGenerator: (req) => req.user!.id as string,
    message: {
      success: false,
      error: {
        code: "RATE_LIMITED",
        message: "Too many execution requests. Wait a minute.",
      },
    },
  });
  router.get("/coding/config", coding.config);
  router.get("/coding/drafts/:scope", coding.draft);
  router.put("/coding/drafts/:scope", coding.save);
  router.post("/coding/run", codeLimit, coding.run);
  const problems = problemControllers(execution);
  router.get("/coding/problems", problems.list);
  router.get("/coding/problems/:id", problems.detail);
  router.post("/coding/problems/:id/submissions", codeLimit, problems.submit);
  router.get("/coding/submissions", problems.history);
  router.get("/coding/submissions/:id", problems.get);
  router.get("/companies", listCompanies);
  router.get("/companies/:id", companyDetails);
  router.put("/companies/:id/progress", updateCompanyProgress);
  return router;
}
