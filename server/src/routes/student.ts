import { Router } from 'express';
import { databaseStatus } from '../config/database.js';
import { requireAuth, requireRole, protectMutations } from '../middleware/auth.js';
import { AppError } from '../utils/AppError.js';
import { dashboard, recordActivity } from '../services/dashboard.js';
import { listResumes, getResume, createResume, updateResume, deleteResume, exportResume } from '../controllers/resumes.js';
import { createAnalysis, listAnalyses, getAnalysis } from '../controllers/analyses.js';
import { interviewControllers } from '../controllers/interviews.js';
import type { InterviewProvider } from '../services/interviewProvider.js';
import { rateLimit } from 'express-rate-limit';

export function studentRoutes(clientOrigin: string, status = databaseStatus, provider?: InterviewProvider) {
  const router = Router();
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.use(protectMutations(clientOrigin));
  router.use((_req, _res, next) => { if (status() !== 'connected') throw new AppError(503, 'DATABASE_UNAVAILABLE', 'The database is unavailable.'); next(); });
  router.use(requireAuth, requireRole('student'));
  router.get('/dashboard', async (req, res) => { res.json({ success: true, data: await dashboard(req.user!) }); });
  router.post('/activity/check-in', async (req, res) => {
    await recordActivity(req.user!.id as string, 'dashboard_visit', 'Checked in to your preparation workspace', `check-in:${new Date().toISOString().slice(0, 10)}`);
    res.json({ success: true, data: { message: 'Daily check-in recorded.' } });
  });
  router.get('/resumes', listResumes);
  router.post('/resumes', createResume);
  router.get('/resumes/:id/pdf', exportResume);
  router.post('/resumes/:id/analyses', createAnalysis);
  router.get('/analyses', listAnalyses);
  router.get('/analyses/:id', getAnalysis);
  router.get('/resumes/:id', getResume);
  router.put('/resumes/:id', updateResume);
  router.delete('/resumes/:id', deleteResume);
  const interviews = interviewControllers(provider);
  const aiLimit = rateLimit({ windowMs: 60000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false, message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many interview requests. Wait a minute before retrying.' } } });
  router.get('/interviews/config', interviews.config);
  router.get('/interviews', interviews.list);
  router.post('/interviews', aiLimit, interviews.start);
  router.get('/interviews/:id', interviews.get);
  router.post('/interviews/:id/answers', aiLimit, interviews.answer);
  router.post('/interviews/:id/complete', interviews.complete);
  return router;
}
