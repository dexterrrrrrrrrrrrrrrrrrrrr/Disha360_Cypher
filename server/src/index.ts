import { BadgeAward } from "./models/BadgeAward.js";
import { BatchAssignment } from "./models/BatchAssignment.js";
import { Company, CompanyProgress } from "./models/Company.js";
import { LearningModule } from "./models/LearningModule.js";
import { CodingProblem } from "./models/CodingProblem.js";
import { CodingSubmission } from "./models/CodingSubmission.js";
import { configureExecution } from './services/executionProvider.js';
import { CodeDraft } from "./models/CodeDraft.js";
import { env } from "./config/env.js";
import { connectDatabase, disconnectDatabase } from "./config/database.js";
import { createApp } from "./app.js";
import { User } from "./models/User.js";
import { Session } from "./models/Session.js";
import {
  Activity,
  LearningProgress,
  AssessmentAssignment,
} from "./models/Preparation.js";
import { Resume } from "./models/Resume.js";
import { ResumeAnalysis } from "./models/ResumeAnalysis.js";
import { InterviewSession } from "./models/InterviewSession.js";
import { configureAI } from "./services/aiProvider.js";
import { InterviewFeedback } from "./models/InterviewFeedback.js";
import { Question, Assessment, TestAttempt } from "./models/Assessment.js";
import { sweepExpiredAttempts } from "./services/assessments.js";
import { databaseStatus } from "./config/database.js";
import { Batch, Enrollment } from "./models/Batch.js";
import { LiveClass } from './models/LiveClass.js';

if (env.MONGODB_URI) {
  try {
    await connectDatabase(env.MONGODB_URI);
    // Explicitly ensure unique and TTL indexes, even when production autoIndex is disabled.
    await Promise.all([
      Company.createIndexes(),
      CompanyProgress.createIndexes(),
    ]);
    await LearningModule.createIndexes();
    await BatchAssignment.createIndexes();
    await BadgeAward.createIndexes();
    await CodeDraft.createIndexes();
    await Promise.all([
      CodingProblem.createIndexes(),
      CodingSubmission.createIndexes(),
    ]);
    await User.createIndexes();
    await Session.createIndexes();
    await Promise.all([
      Activity.createIndexes(),
      LearningProgress.createIndexes(),
      AssessmentAssignment.createIndexes(),
    ]);
    await Resume.createIndexes();
    await ResumeAnalysis.createIndexes();
    await InterviewSession.createIndexes();
    await InterviewFeedback.createIndexes();
    await Promise.all([
      Question.createIndexes(),
      Assessment.createIndexes(),
      TestAttempt.createIndexes(),
    ]);
    await Promise.all([Batch.createIndexes(), Enrollment.createIndexes()]);
    await LiveClass.createIndexes();
    console.log("MongoDB connected.");
  } catch {
    await disconnectDatabase();
    console.error(
      "MongoDB connection failed. Check the Atlas host, database user, and network access. Credentials are omitted from logs.",
    );
    if (env.NODE_ENV === "production") process.exit(1);
  }
} else
  console.warn(
    "MONGODB_URI is not configured. Authentication and persistence are unavailable; health endpoints remain available.",
  );

const ai = configureAI(env);
const execution = configureExecution(env);
const app = createApp({
  codingDemoMode: env.CODING_DEMO_MODE,
  executionProvider: execution.provider,
  executionSetupMessage: execution.message,
  clientOrigin: env.CLIENT_ORIGIN,
  databaseConfigured: Boolean(env.MONGODB_URI),
  secureCookies: env.NODE_ENV === "production",
  trustProxy: env.TRUST_PROXY,
  cookieSameSite: env.COOKIE_SAME_SITE,
  allowDemoAccounts: env.NODE_ENV === "development",
  interviewProvider: ai.provider,
  aiSetupMessage: ai.setupMessage,
});
const server = app.listen(env.PORT, "0.0.0.0", () =>
  console.log(`Disha360 API listening on port ${env.PORT}`),
);
let sweeping = false;
const expiryWorker = setInterval(() => {
  if (sweeping || databaseStatus() !== "connected") return;
  sweeping = true;
  void sweepExpiredAttempts()
    .catch(() =>
      console.error("Assessment expiry sweep failed; retrying later."),
    )
    .finally(() => {
      sweeping = false;
    });
}, 5000);
expiryWorker.unref();
async function shutdown() {
  clearInterval(expiryWorker);
  const forceExit = setTimeout(() => process.exit(1), 10000);
  forceExit.unref();
  server.close(async () => {
    await disconnectDatabase();
    clearTimeout(forceExit);
    process.exit(0);
  });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
