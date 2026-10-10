import {
  leaderboard,
  staffAchievements,
  leaderboardOptions,
} from "../controllers/engagement.js";
import { allAssignments } from "../controllers/staffAssignments.js";
import { trainers, assignTrainer } from "../controllers/staffTrainers.js";
import * as reports from "../controllers/staffReports.js";
import * as learning from "../controllers/staffLearning.js";
import * as assessments from "../controllers/staffAssessments.js";
import { Router } from "express";
import {
  requireAuth,
  requireRole,
  protectMutations,
} from "../middleware/auth.js";
import { databaseStatus } from "../config/database.js";
import { AppError } from "../utils/AppError.js";
import { staffDashboard } from "../controllers/staffDashboard.js";
import {
  listBatches,
  getBatch,
  createBatch,
  updateBatch,
  updateMembership,
  people,
} from "../controllers/staffBatches.js";
import { listStudents, studentDetails } from "../controllers/staffStudents.js";
import { listLiveClasses, getLiveClass, createLiveClass, updateLiveClass, cancelLiveClass, recordClassAttendance } from '../controllers/liveClasses.js';
import { rateLimit } from 'express-rate-limit';
export function staffRoutes(origin: string, status = databaseStatus) {
  const r = Router();
  r.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  r.use(protectMutations(origin));
  r.use((_req, _res, next) => {
    if (status() !== "connected")
      throw new AppError(
        503,
        "DATABASE_UNAVAILABLE",
        "The database is unavailable.",
      );
    next();
  });
  r.use(requireAuth, requireRole("trainer", "admin"));
  const classLimit = rateLimit({ windowMs: 60000, limit: 20, keyGenerator: req => req.user!.id as string,
    message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many class updates. Please wait a minute.' } } });
  r.get('/live-classes', listLiveClasses);
  r.get('/live-classes/:id', getLiveClass);
  r.post('/live-classes', classLimit, createLiveClass);
  r.put('/live-classes/:id', classLimit, updateLiveClass);
  r.post('/live-classes/:id/cancel', classLimit, cancelLiveClass);
  r.put('/live-classes/:id/attendance', classLimit, recordClassAttendance);
  r.get("/dashboard", staffDashboard);
  r.get("/leaderboard", leaderboard);
  r.get("/leaderboard/options", leaderboardOptions);
  r.get("/engagement/:id", staffAchievements);
  r.get("/batches", listBatches);
  r.get("/batches/:id", getBatch);
  r.post("/batches", requireRole("admin"), createBatch);
  r.put("/batches/:id", requireRole("admin"), updateBatch);
  r.put(
    "/batches/:id/members/:studentId",
    requireRole("admin"),
    updateMembership,
  );
  r.get("/people", requireRole("admin"), people);
  r.get("/students", listStudents);
  r.get("/students/:id", studentDetails);
  r.get("/assessments", assessments.managedAssessments);
  r.post("/assessments", assessments.createAssessment);
  r.get("/assessments/csv-template", assessments.csvTemplate);
  r.get("/assessments/:id", assessments.managedAssessment);
  r.put("/assessments/:id", assessments.editAssessment);
  r.post("/assessments/:id/questions", assessments.addQuestion);
  r.put("/assessments/:id/questions/:questionId", assessments.editQuestion);
  r.delete(
    "/assessments/:id/questions/:questionId",
    assessments.deleteQuestion,
  );
  r.post("/assessments/:id/import", assessments.importQuestions);
  r.put("/assessments/:id/publish", assessments.publishAssessment);
  r.get("/assessments/:id/assignments", assessments.assessmentAssignments);
  r.post("/assessments/:id/assignments", assessments.assignAssessment);
  r.delete(
    "/assessments/:id/assignments/:batchId",
    assessments.removeAssessmentAssignment,
  );
  r.get("/assessments/:id/submissions", assessments.assessmentSubmissions);
  r.get("/learning/:id/assignments", learning.learningAssignments);
  r.post("/learning/:id/assignments", learning.assignLearning);
  r.delete(
    "/learning/:id/assignments/:batchId",
    learning.removeLearningAssignment,
  );
  r.get("/learning/:id/completion", learning.learningCompletion);
  r.get("/report-options", reports.reportOptions);
  r.get("/reports", reports.reports);
  r.get("/reports/export", reports.exportReport);
  r.get("/assessments/:id/results.csv", reports.exportAssessmentResults);
  r.get("/trainers", requireRole("admin"), trainers);
  r.put(
    "/trainers/:trainerId/batches/:batchId",
    requireRole("admin"),
    assignTrainer,
  );
  r.get("/assignments", allAssignments);
  return r;
}
