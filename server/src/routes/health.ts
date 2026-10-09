import { Router } from 'express';
import { healthController, readinessController } from '../controllers/health.js';
import { databaseStatus } from '../config/database.js';

export function healthRoutes(configured: boolean, status = databaseStatus): Router {
  const router = Router();
  router.get('/health', healthController(configured, status));
  router.get('/ready', readinessController(configured, status));
  return router;
}
