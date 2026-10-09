import type { RequestHandler } from 'express';
import { Session } from '../models/Session.js';
import { User, type UserDocument, type Role } from '../models/User.js';
import { readToken, tokenHash } from '../services/session.js';
import { AppError } from '../utils/AppError.js';

declare global { namespace Express { interface Request { user?: UserDocument } } }

export const requireAuth: RequestHandler = async (req, _res, next) => {
  const token = readToken(req);
  if (!token) throw new AppError(401, 'UNAUTHENTICATED', 'Please sign in to continue.');
  const session = await Session.findOne({ tokenHash: tokenHash(token), expiresAt: { $gt: new Date() } });
  const user = session ? await User.findById(session.userId).select('+isDemo') : null;
  if (!user || (user.isDemo && !req.app.locals.allowDemoAccounts)) throw new AppError(401, 'UNAUTHENTICATED', 'Your session has expired. Please sign in again.');
  req.user = user;
  next();
};
export function requireRole(...allowed: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) throw new AppError(401, 'UNAUTHENTICATED', 'Please sign in to continue.');
    if (!allowed.includes(req.user.role as Role)) throw new AppError(403, 'FORBIDDEN', 'You do not have access to this workspace.');
    next();
  };
}
export function protectMutations(clientOrigin: string): RequestHandler {
  return (req, _res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) { next(); return; }
    const origin = req.get('Origin');
    // A custom header cannot be attached by a cross-origin HTML form. CORS only
    // permits the configured frontend, while explicit Origin checks also reject
    // sibling origins. CLI clients may omit Origin, but must include the header.
    if (req.get('X-Disha360-Request') !== '1' || (origin && origin !== new URL(clientOrigin).origin)) throw new AppError(403, 'CSRF_REJECTED', 'This request did not come from an allowed client.');
    next();
  };
}
