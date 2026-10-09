import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { register, login, logout, me } from '../controllers/auth.js';
import { protectMutations, requireAuth, requireRole } from '../middleware/auth.js';
import { AppError } from '../utils/AppError.js';
import { databaseStatus } from '../config/database.js';

export function authRoutes(options: { clientOrigin: string; secureCookies: boolean; status?: typeof databaseStatus; authRateLimit?: number }) {
  const router = Router();
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.use(protectMutations(options.clientOrigin));
  const limit = rateLimit({ windowMs: 15 * 60 * 1000, limit: options.authRateLimit ?? 20, standardHeaders: 'draft-8', legacyHeaders: false, message: { success: false, error: { code: 'AUTH_RATE_LIMITED', message: 'Too many sign-in attempts. Please try again in 15 minutes.' } } });
  router.use((_req, _res, next) => {
    if ((options.status || databaseStatus)() !== 'connected') throw new AppError(503, 'DATABASE_UNAVAILABLE', 'The database is unavailable. Please try again shortly.');
    next();
  });
  router.post('/register', limit, register(options.secureCookies));
  router.post('/login', limit, login(options.secureCookies));
  router.post('/logout', logout(options.secureCookies));
  router.get('/me', requireAuth, me);
  // These return only the current user's profile. No account listing or arbitrary
  // user-ID route is exposed before staff management is implemented.
  router.get('/workspace/student', requireAuth, requireRole('student'), me);
  router.get('/workspace/trainer', requireAuth, requireRole('trainer'), me);
  router.get('/workspace/admin', requireAuth, requireRole('admin'), me);
  return router;
}
