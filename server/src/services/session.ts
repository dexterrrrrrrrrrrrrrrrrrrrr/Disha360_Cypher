import { createHash, randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import { Session } from '../models/Session.js';

export const COOKIE_NAME = 'disha360_session';
export const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
export function readToken(req: Request): string | null {
  const cookie = req.headers.cookie?.split(';').map(part => part.trim()).find(part => part.startsWith(`${COOKIE_NAME}=`));
  const token = cookie?.slice(COOKIE_NAME.length + 1);
  return token && /^[a-f0-9]{64}$/.test(token) ? token : null;
}
const cookieOptions = (secure: boolean) => ({ httpOnly: true, secure, sameSite: 'lax' as const, path: '/api' });
export async function createSession(req: Request, res: Response, userId: string, secure: boolean) {
  const old = readToken(req);
  if (old) await Session.deleteOne({ tokenHash: tokenHash(old) });
  const token = randomBytes(32).toString('hex');
  await Session.create({ tokenHash: tokenHash(token), userId, expiresAt: new Date(Date.now() + SESSION_MS) });
  res.cookie(COOKIE_NAME, token, { ...cookieOptions(secure), maxAge: SESSION_MS });
}
export function clearSessionCookie(res: Response, secure: boolean) { res.clearCookie(COOKIE_NAME, cookieOptions(secure)); }
