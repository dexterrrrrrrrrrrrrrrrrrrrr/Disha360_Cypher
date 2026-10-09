import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { healthRoutes } from './routes/health.js';
import { errorHandler, notFound } from './middleware/errors.js';
import type { databaseStatus } from './config/database.js';

export function createApp(options: { clientOrigin: string; databaseConfigured: boolean; status?: typeof databaseStatus }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: options.clientOrigin }));
  app.use('/api', rateLimit({ windowMs: 60000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false, message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests. Try again in a minute.' } } }));
  app.use(express.json({ limit: '100kb' }));
  app.use('/api/v1', healthRoutes(options.databaseConfigured, options.status));
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
