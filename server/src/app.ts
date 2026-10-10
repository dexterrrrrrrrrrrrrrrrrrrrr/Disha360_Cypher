import { staffRoutes } from "./routes/staff.js";
import type { ExecutionProvider } from "./services/codeExecution.js";
import { learningRoutes } from "./routes/learning.js";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { healthRoutes } from "./routes/health.js";
import { errorHandler, notFound } from "./middleware/errors.js";
import type { databaseStatus } from "./config/database.js";
import { authRoutes } from "./routes/auth.js";
import { studentRoutes } from "./routes/student.js";
import type { InterviewProvider } from "./services/interviewProvider.js";

export function createApp(options: {
  clientOrigin: string;
  databaseConfigured: boolean;
  status?: typeof databaseStatus;
  secureCookies?: boolean;
  authRateLimit?: number;
  trustProxy?: boolean;
  allowDemoAccounts?: boolean;
  interviewProvider?: InterviewProvider;
  aiSetupMessage?: string;
  executionProvider?: ExecutionProvider;
  executionRateLimit?: number;
  codingDemoMode?: boolean;
}) {
  const app = express();
  app.locals.allowDemoAccounts = options.allowDemoAccounts ?? false;
  app.disable("x-powered-by");
  app.use(helmet());
  if (options.trustProxy) app.set("trust proxy", 1);
  app.use(
    cors({ origin: new URL(options.clientOrigin).origin, credentials: true }),
  );
  app.use(
    "/api",
    rateLimit({
      windowMs: 60000,
      limit: 120,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: {
        success: false,
        error: {
          code: "RATE_LIMITED",
          message: "Too many requests. Try again in a minute.",
        },
      },
    }),
  );
  app.use(express.json({ limit: "100kb" }));
  app.use("/api/v1", healthRoutes(options.databaseConfigured, options.status));
  app.use(
    "/api/v1/auth",
    authRoutes({ ...options, secureCookies: options.secureCookies ?? false }),
  );
  app.use(
    "/api/v1/student",
    studentRoutes(
      options.clientOrigin,
      options.status,
      options.interviewProvider,
      options.executionProvider,
      options.executionRateLimit,
      options.codingDemoMode === true && (process.env.NODE_ENV ?? "development") === "development" && !options.secureCookies,
      options.aiSetupMessage,
    ),
  );
  app.use("/api/v1/staff", staffRoutes(options.clientOrigin, options.status));
  app.use(
    "/api/v1/learning",
    learningRoutes(options.clientOrigin, options.status),
  );
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
