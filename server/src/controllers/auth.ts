import type { RequestHandler } from 'express';
import { User, publicUser } from '../models/User.js';
import { Session } from '../models/Session.js';
import { loginSchema, registrationSchema } from '../validators/auth.js';
import { hashPassword, verifyPassword } from '../services/password.js';
import { clearSessionCookie, createSession, readToken, tokenHash } from '../services/session.js';
import type { CookieSameSite } from '../services/session.js';
import { AppError } from '../utils/AppError.js';

const dummyHash = hashPassword('DummyAuthenticationOnly123');
export function register(secure: boolean, sameSite: CookieSameSite = 'lax'): RequestHandler {
  return async (req, res) => {
    const input = registrationSchema.parse(req.body);
    let user;
    try {
      user = await User.create({ name: input.name, email: input.email, department: input.department, semester: input.semester, passwordHash: await hashPassword(input.password), role: 'student' });
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) throw new AppError(409, 'EMAIL_EXISTS', 'An account with this email already exists. Please sign in.');
      throw error;
    }
    await createSession(req, res, user.id as string, secure, sameSite);
    res.status(201).json({ success: true, data: { user: publicUser(user) } });
  };
}
export function login(secure: boolean, sameSite: CookieSameSite = 'lax'): RequestHandler {
  return async (req, res) => {
    const input = loginSchema.parse(req.body);
    const user = await User.findOne({ email: input.email }).select('+passwordHash +isDemo');
    const valid = await verifyPassword(input.password, user?.passwordHash || await dummyHash);
    if (!user || !valid || (user.isDemo && !req.app.locals.allowDemoAccounts)) throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
    await createSession(req, res, user.id as string, secure, sameSite);
    res.json({ success: true, data: { user: publicUser(user) } });
  };
}
export function logout(secure: boolean, sameSite: CookieSameSite = 'lax'): RequestHandler {
  return async (req, res) => {
    const token = readToken(req);
    if (token) await Session.deleteOne({ tokenHash: tokenHash(token) });
    clearSessionCookie(res, secure, sameSite);
    res.json({ success: true, data: { message: 'Signed out successfully.' } });
  };
}
export const me: RequestHandler = (req, res) => { res.json({ success: true, data: { user: publicUser(req.user!) } }); };
