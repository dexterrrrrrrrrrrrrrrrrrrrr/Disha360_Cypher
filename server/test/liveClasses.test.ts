import { beforeAll, beforeEach, afterAll, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { testDatabase, studentAccount, studentCall } from './helpers/student.js';
import { createApp } from '../src/app.js';
import { Batch, Enrollment } from '../src/models/Batch.js';
import { LiveClass } from '../src/models/LiveClass.js';
import { meetingUrl } from '../src/validators/liveClass.js';
import { classStatus } from '../src/controllers/liveClasses.js';
let db: Awaited<ReturnType<typeof testDatabase>>;
beforeAll(async () => { db = await testDatabase(); }, 180000); beforeEach(async () => db.clear()); afterAll(async () => db?.close());
async function setup() {
  const trainer = await studentAccount('trainer'), admin = await studentAccount('admin'), student = await studentAccount(), other = await studentAccount(), colleague = await studentAccount('trainer');
  const batch = await Batch.create({ name: 'Placement batch', trainerIds: [trainer.user._id, colleague.user._id] });
  await Enrollment.create({ batchId: batch._id, studentId: student.user._id });
  const app = createApp({ clientOrigin: 'http://localhost:5173', databaseConfigured: true });
  const body = { title: 'Algorithms live class', description: 'Review sorting concepts.', batchId: batch.id, startsAt: new Date(Date.now() + 3600000).toISOString(), durationMinutes: 60, meetingUrl: 'https://sparkmeet-web.onrender.com/', notes: 'Read the shared notes.', resources: [{ title: 'Reference', url: 'https://example.org/resource' }], requestId: randomUUID() };
  const staff = (cookie: string, method: 'get' | 'post' | 'put', path: string, body?: object) => {
    const r = request(app)[method]('/api/v1/staff'+path).set('Cookie', cookie).set('Origin', 'http://localhost:5173').set('X-Disha360-Request', '1'); return body ? r.send(body) : r;
  };
  const create = async () => (await staff(trainer.cookie, 'post', '/live-classes', body)).body.data;
  return { app, trainer, admin, student, other, colleague, batch, body, staff, create };
}
it('schedules actual MongoDB classes and prevents duplicate or conflicting scheduling requests', async () => {
  const { staff, trainer, body } = await setup();
  const first = await staff(trainer.cookie, 'post', '/live-classes', body); expect(first.status).toBe(201);
  expect(first.body.data).toMatchObject({ title: body.title, status: 'Upcoming', trainerId: trainer.user.id, version: 1 });
  const retry = await staff(trainer.cookie, 'post', '/live-classes', body); expect(retry.body.data.id).toBe(first.body.data.id); expect(await LiveClass.countDocuments()).toBe(1);
  expect((await staff(trainer.cookie, 'post', '/live-classes', { ...body, title: 'Different title' })).status).toBe(409);
});
it('restricts students to active enrollment and exposes private meeting details only after authorization', async () => {
  const { app, student, other, staff, trainer, batch, create } = await setup(), c = await create();
  const list = await studentCall(app, student.cookie, 'get', '/live-classes'); expect(list.body.data.classes).toHaveLength(1); expect(JSON.stringify(list.body)).not.toContain('meetingUrl');
  expect((await studentCall(app, student.cookie, 'get', `/live-classes/${c.id}`)).body.data.meetingUrl).toBe('https://sparkmeet-web.onrender.com/');
  expect((await studentCall(app, other.cookie, 'get', '/live-classes')).body.data.classes).toEqual([]);
  expect((await studentCall(app, other.cookie, 'get', `/live-classes/${c.id}`)).status).toBe(404);
  await Enrollment.updateOne({ batchId: batch._id, studentId: student.user._id }, { $set: { active: false } });
  expect((await studentCall(app, student.cookie, 'get', `/live-classes/${c.id}`)).status).toBe(404);
  expect((await staff(trainer.cookie, 'get', `/live-classes/${c.id}`)).body.data.students).toHaveLength(0);
});
it('limits trainers to their own classes and assigned batches; admins can assign valid trainers', async () => {
  const { staff, trainer, colleague, admin, batch, body, create } = await setup(), c = await create();
  expect((await staff(colleague.cookie, 'get', `/live-classes/${c.id}`)).status).toBe(404);
  expect((await staff(colleague.cookie, 'post', `/live-classes/${c.id}/cancel`, { version: 1 })).status).toBe(404);
  expect((await staff(trainer.cookie, 'post', '/live-classes', { ...body, requestId: randomUUID(), trainerId: colleague.user.id })).status).toBe(403);
  const unrelated = await Batch.create({ name: 'Unrelated batch', trainerIds: [colleague.user._id] });
  expect((await staff(trainer.cookie, 'post', '/live-classes', { ...body, requestId: randomUUID(), batchId: unrelated.id })).status).toBe(404);
  const created = await staff(admin.cookie, 'post', '/live-classes', { ...body, requestId: randomUUID(), trainerId: colleague.user.id }); expect(created.status).toBe(201);
  expect((await staff(admin.cookie, 'get', '/live-classes')).body.data.analytics.total).toBe(2);
  expect((await staff(admin.cookie, 'put', `/live-classes/${c.id}`, { ...body, requestId: undefined, trainerId: colleague.user.id, version: 1 })).status).toBe(200);
  expect((await staff(trainer.cookie, 'get', `/live-classes/${c.id}`)).status).toBe(404);
  expect(batch.trainerIds.map(String)).toContain(colleague.user.id);
});
it('edits notes/resources with version checks and cancels without disclosing the cancelled meeting link', async () => {
  const { staff, trainer, app, student, body, create } = await setup(), c = await create(); const { requestId: _, ...fields } = body;
  const edit = await staff(trainer.cookie, 'put', `/live-classes/${c.id}`, { ...fields, notes: 'Updated notes', version: 1 }); expect(edit.body.data.version).toBe(2);
  expect((await staff(trainer.cookie, 'put', `/live-classes/${c.id}`, { ...fields, version: 1 })).status).toBe(409);
  expect((await staff(trainer.cookie, 'post', `/live-classes/${c.id}/cancel`, { version: 2 })).body.data).toMatchObject({ status: 'Cancelled', meetingUrl: null });
  const detail = await studentCall(app, student.cookie, 'get', `/live-classes/${c.id}`); expect(detail.body.data.meetingUrl).toBeNull(); expect(detail.body.data.notes).toBe('Updated notes');
  expect((await staff(trainer.cookie, 'put', `/live-classes/${c.id}`, { ...fields, version: 3 })).status).toBe(409);
});
it('records attendance only manually after start, validates enrollment, preserves student isolation and counts analytics', async () => {
  const { app, staff, trainer, admin, student, other, create } = await setup(), c = await create(); const path = `/live-classes/${c.id}/attendance`;
  const records = [{ studentId: student.user.id, status: 'present', note: 'Observed by trainer' }];
  expect((await staff(trainer.cookie, 'put', path, { version: 1, records })).status).toBe(409);
  await LiveClass.updateOne({ _id: c.id }, { $set: { startsAt: new Date(Date.now() - 60000) } });
  expect((await staff(trainer.cookie, 'get', `/live-classes/${c.id}`)).body.data.attendance).toEqual([]);
  expect((await staff(trainer.cookie, 'put', path, { version: 1, records: [{ studentId: other.user.id, status: 'present' }] })).status).toBe(400);
  expect((await staff(trainer.cookie, 'put', path, { version: 1, records: [...records, ...records] })).status).toBe(400);
  const save = await staff(trainer.cookie, 'put', path, { version: 1, records }); expect(save.status).toBe(200);
  const mine = await studentCall(app, student.cookie, 'get', `/live-classes/${c.id}`); expect(mine.body.data.attendance).toMatchObject([{ status: 'present', note: 'Observed by trainer' }]); expect(JSON.stringify(mine.body)).not.toContain('recordedBy'); expect(mine.body.data.students).toBeUndefined();
  expect((await staff(admin.cookie, 'get', '/live-classes')).body.data.analytics.attendance.present).toBe(1);
  expect((await staff(trainer.cookie, 'put', path, { version: 1, records })).status).toBe(409);
  expect((await request(app).put('/api/v1/staff'+path).set('Cookie', student.cookie).set('X-Disha360-Request', '1').send({ version: 2, records })).status).toBe(403);
  expect((await staff(trainer.cookie, 'post', `/live-classes/${c.id}/cancel`, { version: 2 })).status).toBe(200);
  expect((await staff(admin.cookie, 'get', '/live-classes')).body.data.analytics.attendance.present).toBe(1);
  expect((await staff(trainer.cookie, 'put', path, { version: 3, records })).status).toBe(409);
});
it('rejects invalid schedules, resources, spoofed IDs and unsafe request origins', async () => {
  const { app, staff, trainer, body, student } = await setup();
  for (const changes of [{ startsAt: 'not-a-date' }, { startsAt: new Date(0).toISOString() }, { durationMinutes: 0 }, { meetingUrl: 'https://evil.example/room' }, { resources: [{ title: 'Unsafe', url: 'javascript:alert(1)' }] }, { studentId: student.user.id }])
    expect((await staff(trainer.cookie, 'post', '/live-classes', { ...body, ...changes })).status).toBe(400);
  expect((await request(app).post('/api/v1/staff/live-classes').set('Cookie', trainer.cookie).send(body)).status).toBe(403);
  expect((await request(app).post('/api/v1/staff/live-classes').set('Cookie', trainer.cookie).set('X-Disha360-Request', '1').set('Origin', 'https://evil.example').send(body)).status).toBe(403);
  expect((await request(app).get('/api/v1/student/live-classes')).status).toBe(401); expect(await LiveClass.countDocuments()).toBe(0);
});
it('preserves past class notes but rejects rescheduling/reassignment or cancellation after completion', async () => {
  const { staff, trainer, body, create } = await setup(), c = await create();
  const startsAt = new Date(Date.now() - 7200000).toISOString(); await LiveClass.updateOne({ _id: c.id }, { $set: { startsAt } });
  const { requestId: _, ...fields } = body;
  expect((await staff(trainer.cookie, 'put', `/live-classes/${c.id}`, { ...fields, startsAt, notes: 'Post-class notes', version: 1 })).status).toBe(200);
  expect((await staff(trainer.cookie, 'put', `/live-classes/${c.id}`, { ...fields, version: 2 })).status).toBe(409);
  expect((await staff(trainer.cookie, 'post', `/live-classes/${c.id}/cancel`, { version: 2 })).status).toBe(409);
});
it.each(['https://sparkmeet-web.onrender.com.evil.example/room', 'https://sparkmeet-web.onrender.com@evil.example/room', 'http://sparkmeet-web.onrender.com/room', 'https://user:password@sparkmeet-web.onrender.com/room', 'javascript:alert(1)', 'https://sparkmeet-web.onrender.com:444/room', 'https://sparkmeet-web.onrender.com/%0aevil'])('rejects unsafe meeting URL %s', url => {
  expect(meetingUrl.safeParse(url).success).toBe(false);
});
it('uses scheduled status windows without claiming actual meeting activity', () => {
  const c = { startsAt: new Date(1000), durationMinutes: 10, cancelled: false };
  expect(classStatus(c, 999)).toBe('Upcoming'); expect(classStatus(c, 1000)).toBe('Live'); expect(classStatus(c, 601000)).toBe('Completed'); expect(classStatus({ ...c, cancelled: true }, 999)).toBe('Cancelled');
});
