import { beforeAll, beforeEach, afterAll, it, expect } from 'vitest';
import { testDatabase, studentAccount, testApp, studentCall } from './helpers/student.js';
import { Resume } from '../src/models/Resume.js';
import { Activity } from '../src/models/Preparation.js';
import { resumeFixture } from './helpers/resume.js';

let db: Awaited<ReturnType<typeof testDatabase>>;
beforeAll(async () => { db = await testDatabase(); }, 180000);
beforeEach(async () => { await db.clear(); });
afterAll(async () => { if (db) await db.close(); });
it('persists, retrieves, updates and deletes a student’s resume', async () => {
  const s = await studentAccount(); const app = testApp(); const input = resumeFixture();
  const created = await studentCall(app, s.cookie, 'post', '/resumes', input); expect(created.status).toBe(201);
  const id = created.body.data.resume.id;
  expect((await studentCall(app, s.cookie, 'get', `/resumes/${id}`)).body.data.resume.content).toEqual(input.content);
  const update = await studentCall(app, s.cookie, 'put', `/resumes/${id}`, { ...input, title: 'Updated draft', template: 'classic', version: 1 });
  expect(update.status).toBe(200); expect(update.body.data.resume.version).toBe(2);
  expect((await Resume.findById(id))?.title).toBe('Updated draft');
  expect((await studentCall(app, s.cookie, 'get', '/resumes')).body.data.resumes).toHaveLength(1);
  expect(await Activity.countDocuments({ studentId: s.user._id })).toBe(2);
  expect((await studentCall(app, s.cookie, 'delete', `/resumes/${id}`)).status).toBe(200); expect(await Resume.countDocuments()).toBe(0);
});
it('prevents cross-student reads, edits, PDF exports and deletes without revealing existence', async () => {
  const s = await studentAccount(); const other = await studentAccount(); const app = testApp();
  const created = await studentCall(app, s.cookie, 'post', '/resumes', resumeFixture()); const id = created.body.data.resume.id;
  expect((await studentCall(app, other.cookie, 'get', '/resumes')).body.data.resumes).toEqual([]);
  for (const [method, path] of [['get', `/resumes/${id}`], ['get', `/resumes/${id}/pdf`], ['delete', `/resumes/${id}`], ['put', `/resumes/${id}`]] as const) expect((await studentCall(app, other.cookie, method, path, method === 'put' ? { ...resumeFixture(), version: 1 } : undefined)).status).toBe(404);
  expect(await Resume.countDocuments()).toBe(1);
});
it('rejects stale writes and owner injection, unsafe URLs and invalid IDs', async () => {
  const s = await studentAccount(); const app = testApp(); const input = resumeFixture();
  expect((await studentCall(app, s.cookie, 'post', '/resumes', { ...input, studentId: s.user.id })).status).toBe(400);
  expect((await studentCall(app, s.cookie, 'post', '/resumes', { ...input, content: { ...input.content, personal: { ...input.content.personal, website: 'javascript:alert(1)' } } })).status).toBe(400);
  expect((await studentCall(app, s.cookie, 'get', '/resumes/invalid')).status).toBe(400);
  const created = await studentCall(app, s.cookie, 'post', '/resumes', input); const id = created.body.data.resume.id;
  await studentCall(app, s.cookie, 'put', `/resumes/${id}`, { ...input, version: 1 });
  expect((await studentCall(app, s.cookie, 'put', `/resumes/${id}`, { ...input, version: 1 })).status).toBe(409);
});
it('exports each template as a real PDF and requires student authorization', async () => {
  const s = await studentAccount(); const trainer = await studentAccount('trainer'); const app = testApp();
  expect((await studentCall(app, trainer.cookie, 'get', '/resumes')).status).toBe(403);
  for (const template of ['classic', 'modern', 'compact']) {
    const created = await studentCall(app, s.cookie, 'post', '/resumes', { ...resumeFixture(), template });
    const pdf = await studentCall(app, s.cookie, 'get', `/resumes/${created.body.data.resume.id}/pdf`);
    expect(pdf.status).toBe(200); expect(pdf.headers['content-type']).toContain('application/pdf');
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-'); expect((pdf.body as Buffer).length).toBeGreaterThan(1000);
  }
});
