import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { User } from '../../src/models/User.js';
import { Session } from '../../src/models/Session.js';
import { hashPassword } from '../../src/services/password.js';
import { tokenHash } from '../../src/services/session.js';

export async function testDatabase() {
  const mongo = await MongoMemoryServer.create({ binary: { version: '7.0.24', downloadDir: join(tmpdir(), 'cypher-mongodb'), checkMD5: true } });
  await mongoose.connect(mongo.getUri());
  await Promise.all(Object.values(mongoose.models).map(model => model.createIndexes()));
  return { close: async () => { await mongoose.disconnect(); await mongo.stop(); }, clear: async () => { await Promise.all(Object.values(mongoose.models).map(model => model.deleteMany({}))); } };
}
export async function studentAccount(role: 'student' | 'trainer' | 'admin' = 'student') {
  const user = await User.create({ name: 'Real Test Student', email: `${randomBytes(8).toString('hex')}@example.test`, passwordHash: await hashPassword('FixturePassword123!'), role, ...(role === 'student' ? { department: 'Computer Science', semester: 6 } : {}) });
  const token = randomBytes(32).toString('hex');
  await Session.create({ userId: user._id, tokenHash: tokenHash(token), expiresAt: new Date(Date.now() + 3600000) });
  return { user, cookie: `disha360_session=${token}` };
}
export const testApp = () => createApp({ clientOrigin: 'http://localhost:5173', databaseConfigured: true });
export function studentCall(app: ReturnType<typeof createApp>, cookie: string, method: 'get' | 'post' | 'put' | 'delete', path: string, body?: object) {
  const call = request(app)[method](`/api/v1/student${path}`).set('Cookie', cookie).set('X-Disha360-Request', '1').set('Origin', 'http://localhost:5173');
  return body ? call.send(body) : call;
}
