import { beforeAll, beforeEach, afterAll, expect, it } from 'vitest';
import request from 'supertest';
import { testDatabase, studentAccount } from './helpers/student.js';
import { createApp } from '../src/app.js';
import { envSchema } from '../src/config/env.js';
const origin = 'https://disha.example.test';
let db: Awaited<ReturnType<typeof testDatabase>>;
beforeAll(async () => { db = await testDatabase(); }, 180000);
beforeEach(async () => db.clear());
afterAll(async () => db?.close());
const app = () => createApp({ clientOrigin: origin, databaseConfigured: true, secureCookies: true, cookieSameSite: 'none', trustProxy: true });
it('requires production database and exact HTTPS origin, disables demo and preserves Judge0 default', () => {
  const settings = { NODE_ENV: 'production', CLIENT_ORIGIN: origin, MONGODB_URI: 'mongodb://localhost/fixture', COOKIE_SAME_SITE: 'none', CODING_DEMO_MODE: 'true' };
  const parsed = envSchema.parse(settings);
  expect(parsed.CODING_DEMO_MODE).toBe(false); expect(parsed.JUDGE0_SECURITY_CONFIRMED).toBe(false);
  for (const CLIENT_ORIGIN of ['http://localhost:5173', 'https://disha.example.test/path', 'https://user:pass@disha.example.test', 'invalid']) expect(envSchema.safeParse({ ...settings, CLIENT_ORIGIN }).success).toBe(false);
  expect(envSchema.safeParse({ ...settings, MONGODB_URI: '' }).success).toBe(false);
  expect(() => createApp({ clientOrigin: origin, databaseConfigured: true, cookieSameSite: 'none' })).toThrow();
});
it.each(['student', 'trainer', 'admin'] as const)('supports secure cross-origin %s login, persistence, roles and logout', async role => {
  const account = await studentAccount(role), api = app();
  const login = await request(api).post('/api/v1/auth/login').set('Origin', origin).set('X-Disha360-Request', '1').send({ email: account.user.email, password: 'FixturePassword123!' });
  expect(login.status).toBe(200);
  const header = login.headers['set-cookie'][0];
  expect(header).toContain('Secure'); expect(header).toContain('HttpOnly'); expect(header).toContain('SameSite=None'); expect(header).not.toContain('Domain=');
  const cookie = header.split(';')[0];
  expect((await request(api).get('/api/v1/auth/me').set('Cookie', cookie)).body.data.user.role).toBe(role);
  for (const target of ['student', 'trainer', 'admin']) expect((await request(api).get(`/api/v1/auth/workspace/${target}`).set('Cookie', cookie)).status).toBe(target === role ? 200 : 403);
  const logout = await request(api).post('/api/v1/auth/logout').set('Cookie', cookie).set('Origin', origin).set('X-Disha360-Request', '1').send({});
  expect(logout.status).toBe(200); expect(logout.headers['set-cookie'][0]).toContain('SameSite=None');
  expect((await request(api).get('/api/v1/auth/me').set('Cookie', cookie)).status).toBe(401);
});
it('permits credentialed configured-origin preflight while rejecting CSRF and untrusted browser origins', async () => {
  const api = app();
  const preflight = await request(api).options('/api/v1/auth/login').set('Origin', origin).set('Access-Control-Request-Method', 'POST').set('Access-Control-Request-Headers', 'content-type,x-disha360-request');
  expect(preflight.headers['access-control-allow-origin']).toBe(origin); expect(preflight.headers['access-control-allow-credentials']).toBe('true');
  expect((await request(api).post('/api/v1/auth/logout').set('Origin', origin).send({})).status).toBe(403);
  expect((await request(api).post('/api/v1/auth/logout').set('Origin', 'https://evil.test').set('X-Disha360-Request', '1').send({})).status).toBe(403);
});
it('exposes readiness failures safely and trusts only one proxy hop', async () => {
  const api = app(); expect(api.get('trust proxy')).toBe(1);
  expect((await request(api).get('/api/v1/ready')).status).toBe(200);
  const offline = createApp({ clientOrigin: origin, databaseConfigured: true, status: () => 'disconnected' });
  expect((await request(offline).get('/api/v1/ready')).status).toBe(503);
});
