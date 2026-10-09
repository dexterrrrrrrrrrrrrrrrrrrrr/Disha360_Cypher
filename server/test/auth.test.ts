import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { User } from '../src/models/User.js';
import { Session } from '../src/models/Session.js';
import { hashPassword, verifyPassword } from '../src/services/password.js';
import { tokenHash } from '../src/services/session.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const origin = 'http://localhost:5173';
const password = 'TestingPassword123!';
const student = { name: 'Test Student', email: 'student@example.test', password, department: 'Computer Science', semester: 6 };
let mongo: MongoMemoryServer;
let app: ReturnType<typeof createApp>;
let passwordHash: string;
const mutation = (agent: ReturnType<typeof request>, path: string, body: object = {}) => agent.post(`/api/v1/auth/${path}`).set('X-Disha360-Request', '1').set('Origin', origin).send(body);
const cookie = (response: request.Response) => (response.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
async function account(role: 'student' | 'trainer' | 'admin', email = `${role}@example.test`, isDemo = false) {
  return User.create({ name: `Test ${role}`, email, role, passwordHash, isDemo, ...(role === 'student' ? { department: 'CS', semester: 4 } : {}) });
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create({ binary: { version: '7.0.24', downloadDir: join(tmpdir(), 'cypher-mongodb'), checkMD5: true } });
  await mongoose.connect(mongo.getUri());
  await Promise.all([User.createIndexes(), Session.createIndexes()]);
  passwordHash = await hashPassword(password);
}, 180000);
beforeEach(async () => {
  await Promise.all([User.deleteMany({}), Session.deleteMany({})]);
  app = createApp({ clientOrigin: origin, databaseConfigured: true, allowDemoAccounts: true });
});
afterAll(async () => { await mongoose.disconnect(); if (mongo) await mongo.stop(); });

describe('persistent authentication', () => {
  it('registers a student, persists a salted hash, and sends only safe fields', async () => {
    const response = await mutation(request(app), 'register', student);
    expect(response.status).toBe(201);
    expect(response.body.data.user).toMatchObject({ role: 'student', name: student.name, department: student.department, semester: 6 });
    expect(JSON.stringify(response.body)).not.toContain('password');
    const stored = await User.findOne({ email: student.email }).select('+passwordHash');
    expect(stored!.passwordHash).not.toBe(password);
    expect(await verifyPassword(password, stored!.passwordHash)).toBe(true);
    expect((await User.findOne({ email: student.email }))!.passwordHash).toBeUndefined();
    expect(response.headers['set-cookie'][0]).toContain('HttpOnly');
    expect(response.headers['set-cookie'][0]).toContain('SameSite=Lax');
    expect(response.headers['set-cookie'][0]).toContain('Max-Age=604800');
    const rawToken = cookie(response).split('=')[1];
    expect(await Session.countDocuments({ tokenHash: rawToken })).toBe(0);
    expect(await Session.countDocuments({ tokenHash: tokenHash(rawToken) })).toBe(1);
  });
  it.each(['admin', 'trainer'])('rejects public role injection: %s', async role => {
    expect((await mutation(request(app), 'register', { ...student, role })).status).toBe(400);
    expect(await User.countDocuments()).toBe(0);
  });
  it.each([{ password: 'weak' }, { semester: 0 }, { semester: 1.5 }, { semester: 13 }, { email: 'bad' }, { department: '' }, { name: 'a' }])('rejects invalid registration input: %j', async invalid => {
    expect((await mutation(request(app), 'register', { ...student, ...invalid })).status).toBe(400);
  });
  it('normalizes email and rejects duplicates, including concurrent registrations', async () => {
    const responses = await Promise.all([mutation(request(app), 'register', student), mutation(request(app), 'register', { ...student, email: ' STUDENT@EXAMPLE.TEST ' })]);
    expect(responses.map(r => r.status).sort()).toEqual([201, 409]);
    expect(await User.countDocuments()).toBe(1);
  });
  it.each(['student', 'trainer', 'admin'] as const)('logs in a %s account and restores its session', async role => {
    const user = await account(role);
    const response = await mutation(request(app), 'login', { email: user.email.toUpperCase(), password });
    expect(response.status).toBe(200);
    const me = await request(app).get('/api/v1/auth/me').set('Cookie', cookie(response));
    expect(me.body.data.user.role).toBe(role);
    expect(me.headers['cache-control']).toBe('no-store');
    expect(JSON.stringify(me.body)).not.toContain('password');
  });
  it('uses the same error for wrong passwords and unknown users', async () => {
    await account('student');
    const wrong = await mutation(request(app), 'login', { email: 'student@example.test', password: 'IncorrectPassword123' });
    const unknown = await mutation(request(app), 'login', { email: 'unknown@example.test', password });
    expect(wrong.status).toBe(401); expect(unknown.body).toEqual(wrong.body);
    expect(await Session.countDocuments()).toBe(0);
  });
  it('restores login across application instance restarts using MongoDB sessions', async () => {
    const response = await mutation(request(app), 'register', student);
    const restarted = createApp({ clientOrigin: origin, databaseConfigured: true });
    expect((await request(restarted).get('/api/v1/auth/me').set('Cookie', cookie(response))).status).toBe(200);
  });
  it('rejects expired sessions before the TTL cleanup runs', async () => {
    const response = await mutation(request(app), 'register', student);
    await Session.updateMany({}, { expiresAt: new Date(Date.now() - 1000) });
    expect((await request(app).get('/api/v1/auth/me').set('Cookie', cookie(response))).status).toBe(401);
  });
  it('revokes logout on the server and clears the cookie', async () => {
    const response = await mutation(request(app), 'register', student);
    const result = await mutation(request(app), 'logout').set('Cookie', cookie(response));
    expect(result.status).toBe(200);
    expect(result.headers['set-cookie'][0]).toContain('disha360_session=;');
    expect(await Session.countDocuments()).toBe(0);
    expect((await request(app).get('/api/v1/auth/me').set('Cookie', cookie(response))).status).toBe(401);
  });
  it('rotates and invalidates an existing session on successful login', async () => {
    const old = await mutation(request(app), 'register', student);
    const fresh = await mutation(request(app), 'login', { email: student.email, password }).set('Cookie', cookie(old));
    expect(cookie(fresh)).not.toBe(cookie(old));
    expect((await request(app).get('/api/v1/auth/me').set('Cookie', cookie(old))).status).toBe(401);
    expect(await Session.countDocuments()).toBe(1);
  });
  it('rejects forged cookies and sessions whose user no longer exists', async () => {
    expect((await request(app).get('/api/v1/auth/me').set('Cookie', 'disha360_session=forged')).status).toBe(401);
    const response = await mutation(request(app), 'register', student);
    await User.deleteMany({});
    expect((await request(app).get('/api/v1/auth/me').set('Cookie', cookie(response))).status).toBe(401);
  });
  it('sets Secure cookies for production configuration', async () => {
    const secure = createApp({ clientOrigin: origin, databaseConfigured: true, secureCookies: true });
    const response = await mutation(request(secure), 'register', student);
    expect(response.headers['set-cookie'][0]).toContain('Secure');
  });
  it('returns an actionable 503 when the database is offline', async () => {
    const offline = createApp({ clientOrigin: origin, databaseConfigured: false, status: () => 'disconnected' });
    expect((await mutation(request(offline), 'register', student)).status).toBe(503);
  });
});

describe('server authorization and request protection', () => {
  it('rejects unauthenticated access to every workspace', async () => {
    for (const role of ['student', 'trainer', 'admin']) expect((await request(app).get(`/api/v1/auth/workspace/${role}`)).status).toBe(401);
  });
  it.each(['student', 'trainer', 'admin'] as const)('enforces backend role permissions for %s', async role => {
    const user = await account(role);
    const response = await mutation(request(app), 'login', { email: user.email, password });
    for (const target of ['student', 'trainer', 'admin']) {
      const result = await request(app).get(`/api/v1/auth/workspace/${target}`).set('Cookie', cookie(response));
      expect(result.status).toBe(target === role ? 200 : 403);
    }
  });
  it('returns only the signed-in student even if another user ID is supplied', async () => {
    const other = await account('student', 'other@example.test');
    const response = await mutation(request(app), 'register', student);
    const result = await request(app).get(`/api/v1/auth/me?userId=${other.id}`).set('Cookie', cookie(response));
    expect(result.body.data.user.email).toBe(student.email);
    expect((await request(app).get(`/api/v1/users/${other.id}`).set('Cookie', cookie(response))).status).toBe(404);
  });
  it('rejects CSRF: missing custom header and untrusted Origin', async () => {
    expect((await request(app).post('/api/v1/auth/register').send(student)).status).toBe(403);
    expect((await request(app).post('/api/v1/auth/register').set('X-Disha360-Request', '1').set('Origin', 'https://evil.example').send(student)).status).toBe(403);
    expect(await User.countDocuments()).toBe(0);
  });
  it('rate-limits credential endpoints', async () => {
    const limited = createApp({ clientOrigin: origin, databaseConfigured: true, authRateLimit: 2 });
    await mutation(request(limited), 'login', { email: student.email, password });
    await mutation(request(limited), 'login', { email: student.email, password });
    expect((await mutation(request(limited), 'login', { email: student.email, password })).status).toBe(429);
  });
  it('rejects demo accounts and their existing sessions when demo access is disabled', async () => {
    const demo = await account('admin', 'demo.admin@disha360.test', true);
    const session = await mutation(request(app), 'login', { email: demo.email, password });
    const production = createApp({ clientOrigin: origin, databaseConfigured: true });
    expect((await mutation(request(production), 'login', { email: demo.email, password })).status).toBe(401);
    expect((await request(production).get('/api/v1/auth/me').set('Cookie', cookie(session))).status).toBe(401);
  });
  it('validates model role and student academic fields', async () => {
    await expect(User.create({ name: 'Invalid Student', email: 'invalid@example.test', role: 'student', passwordHash })).rejects.toThrow();
    await expect(User.create({ name: 'Invalid Role', email: 'invalid-role@example.test', role: 'owner', passwordHash })).rejects.toThrow();
  });
  it('creates independently salted password hashes', async () => {
    const another = await hashPassword(password);
    expect(another).not.toBe(passwordHash);
    expect(await verifyPassword('wrong', another)).toBe(false);
  });
});

describe('operator-only account commands', () => {
  const execute = promisify(execFile);
  async function command(file: string, extras: Record<string, string> = {}) {
    return execute(process.execPath, ['--import', 'tsx', `src/utils/${file}.ts`], {
      cwd: fileURLToPath(new URL('..', import.meta.url)),
      env: { ...process.env, NODE_ENV: 'development', MONGODB_URI: mongo.getUri(), ...extras }, timeout: 10000
    });
  }
  it('seeds all three demo roles, is repeatable, and never prints passwords', async () => {
    const first = await command('seedDemo', { SEED_DEMO_PASSWORD: password });
    expect(first.stdout).not.toContain(password);
    expect(await User.countDocuments({ isDemo: true })).toBe(3);
    const stored = await User.findOne({ email: 'demo.admin@disha360.test' }).select('+passwordHash');
    await command('seedDemo', { SEED_DEMO_PASSWORD: 'AnotherTestingPassword456' });
    expect((await User.findById(stored!._id).select('+passwordHash'))!.passwordHash).toBe(stored!.passwordHash);
    expect(await User.countDocuments()).toBe(3);
  });
  it('blocks demo seeding outside development', async () => {
    await expect(command('seedDemo', { NODE_ENV: 'production', SEED_DEMO_PASSWORD: password })).rejects.toMatchObject({ code: 1 });
    expect(await User.countDocuments()).toBe(0);
  });
  it('refuses to overwrite a non-demo account', async () => {
    const original = await account('admin', 'demo.student@disha360.test');
    await expect(command('seedDemo', { SEED_DEMO_PASSWORD: password })).rejects.toMatchObject({ code: 1 });
    expect((await User.findById(original._id))!.role).toBe('admin');
  });
  it.each(['trainer', 'admin'])('securely provisions %s and refuses a duplicate', async role => {
    const vars = { PROVISION_NAME: 'Operator Account', PROVISION_EMAIL: 'staff@example.test', PROVISION_ROLE: role, PROVISION_PASSWORD: password };
    const result = await command('provisionUser', vars);
    expect(result.stdout).not.toContain(password);
    const user = await User.findOne({ email: vars.PROVISION_EMAIL }).select('+passwordHash');
    expect(user!.role).toBe(role);
    expect(await verifyPassword(password, user!.passwordHash)).toBe(true);
    await expect(command('provisionUser', vars)).rejects.toMatchObject({ code: 1 });
    expect(await User.countDocuments()).toBe(1);
  });
  it('rejects invalid provisioning roles and weak demo passwords', async () => {
    await expect(command('provisionUser', { PROVISION_NAME: 'Invalid Role', PROVISION_EMAIL: 'staff@example.test', PROVISION_ROLE: 'owner', PROVISION_PASSWORD: password })).rejects.toMatchObject({ code: 1 });
    await expect(command('seedDemo', { SEED_DEMO_PASSWORD: 'weak' })).rejects.toMatchObject({ code: 1 });
    expect(await User.countDocuments()).toBe(0);
  });
});

describe("explicit development staff provisioning", () => {
  const execute = promisify(execFile);
  async function provision(role: string, extras: Record<string, string> = {}) {
    return execute("npm", ["run", "user:create", "--", "--development"], {
      cwd: fileURLToPath(
        new URL(role === "trainer" ? "../.." : "..", import.meta.url),
      ),
      env: {
        ...process.env,
        NODE_ENV: "development",
        MONGODB_URI: mongo.getUri("staff_accounts_dev"),
        PROVISION_DATABASE: "staff_accounts_dev",
        PROVISION_NAME: "Local Staff",
        PROVISION_EMAIL: `local.${role}@example.test`,
        PROVISION_ROLE: role,
        PROVISION_PASSWORD: password,
        ...extras,
      },
      timeout: 10000,
    });
  }
  it.each(["trainer", "admin"] as const)(
    "creates development %s securely, permits login and prevents production use",
    async (role) => {
      const connection = await mongoose
        .createConnection(mongo.getUri("staff_accounts_dev"))
        .asPromise();
      try {
        await connection.db!.dropDatabase();
        const result = await provision(role);
        expect(result.stdout + result.stderr).not.toContain(password);
        const staff = await connection
          .db!.collection("users")
          .findOne({ email: `local.${role}@example.test` });
        expect(staff?.role).toBe(role);
        expect(staff?.isDemo).toBe(true);
        expect(await verifyPassword(password, staff!.passwordHash)).toBe(true);
        // Move only the isolated test fixture into the main disposable test database.
        await User.create({
          name: staff!.name,
          email: staff!.email,
          passwordHash: staff!.passwordHash,
          role,
          isDemo: true,
        });
        const login = await mutation(request(app), "login", {
          email: staff!.email,
          password,
        });
        expect(login.status).toBe(200);
        expect(login.body.data.user.role).toBe(role);
        expect(
          (
            await request(app)
              .get(`/api/v1/auth/workspace/${role}`)
              .set("Cookie", cookie(login))
          ).status,
        ).toBe(200);
        const production = createApp({
          clientOrigin: origin,
          databaseConfigured: true,
        });
        expect(
          (
            await mutation(request(production), "login", {
              email: staff!.email,
              password,
            })
          ).status,
        ).toBe(401);
        await expect(provision(role)).rejects.toMatchObject({ code: 1 });
        expect(await connection.db!.collection("users").countDocuments()).toBe(
          1,
        );
      } finally {
        await connection.db!.dropDatabase();
        await connection.close();
      }
    },
    30000,
  );
  it("refuses production execution before connecting and omits secret values", async () => {
    const result = await provision("admin", {
      NODE_ENV: "production",
      MONGODB_URI: "mongodb://127.0.0.1:1/live",
      PROVISION_DATABASE: "live",
    }).then(
      () => null,
      (e) => e,
    );
    expect(result?.code).toBe(1);
    expect(result.stderr).toContain("Development provisioning refused");
    expect(result.stderr + result.stdout).not.toContain(password);
    expect(await User.countDocuments()).toBe(0);
  });
  it("refuses missing or mismatched development database acknowledgement before connecting", async () => {
    for (const target of ["", "another_dev"])
      await expect(
        provision("trainer", {
          MONGODB_URI: "mongodb://127.0.0.1:1/staff_accounts_dev",
          PROVISION_DATABASE: target,
        }),
      ).rejects.toMatchObject({ code: 1 });
    expect(await User.countDocuments()).toBe(0);
  }, 30000);
  it("never promotes or overwrites an existing student through development provisioning", async () => {
    const connection = await mongoose
      .createConnection(mongo.getUri("staff_accounts_dev"))
      .asPromise();
    try {
      await connection.db!.dropDatabase();
      const stored = {
        name: "Existing Student",
        email: "local.admin@example.test",
        role: "student",
        department: "CS",
        semester: 6,
        passwordHash,
      };
      await connection.db!.collection("users").insertOne(stored);
      await expect(provision("admin")).rejects.toMatchObject({ code: 1 });
      const after = await connection
        .db!.collection("users")
        .findOne({ email: stored.email });
      expect(after?.role).toBe("student");
      expect(after?.passwordHash).toBe(passwordHash);
    } finally {
      await connection.db!.dropDatabase();
      await connection.close();
    }
  }, 30000);
  it("rejects role injection during login and exposes no public role-edit endpoint", async () => {
    const user = await account("student");
    expect(
      (
        await mutation(request(app), "login", {
          email: user.email,
          password,
          role: "admin",
        })
      ).status,
    ).toBe(400);
    const login = await mutation(request(app), "login", {
      email: user.email,
      password,
    });
    expect(
      (
        await request(app)
          .patch("/api/v1/auth/me")
          .set("Cookie", cookie(login))
          .set("Origin", origin)
          .set("X-Disha360-Request", "1")
          .send({ role: "admin" })
      ).status,
    ).toBe(404);
    expect((await User.findById(user._id))?.role).toBe("student");
  });
});
