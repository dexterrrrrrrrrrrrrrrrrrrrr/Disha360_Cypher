import { beforeAll, beforeEach, afterAll, it, expect } from 'vitest';
import { testDatabase, studentAccount, testApp, studentCall } from './helpers/student.js';
import { resumeFixture } from './helpers/resume.js';
import { analyzeResume, keywords } from '../src/services/resumeAnalysis.js';
import { ResumeAnalysis } from '../src/models/ResumeAnalysis.js';
const job = 'We require React, TypeScript, MongoDB, Python and unit testing. Build web applications and improve reliability.';
let db: Awaited<ReturnType<typeof testDatabase>>;
beforeAll(async () => { db = await testDatabase(); }, 180000);
beforeEach(async () => { await db.clear(); });
afterAll(async () => { if (db) await db.close(); });
it('calculates reproducible scores with transparent components from actual text', () => {
  const content = resumeFixture().content; const result = analyzeResume(content, job);
  expect(result).toEqual(analyzeResume(content, job)); expect(result.score).toBe(result.components.reduce((sum, c) => sum + c.earned, 0));
  expect(result.matchedKeywords).toEqual(expect.arrayContaining(['react', 'typescript', 'mongodb']));
  expect(result.missingKeywords).toEqual(expect.arrayContaining(['python', 'unit testing']));
  expect(result.disclaimer).toContain('not an official'); expect(result.sections.find(s => s.name === 'Skills')?.complete).toBe(false);
});
it('does not count substrings, repetition, empty sections or the draft title', () => {
  const c = resumeFixture().content; c.skills = ['JavaScript']; c.projects = []; c.education = []; c.personal.summary = '';
  const first = analyzeResume(c, 'Java Java Java and communication skills are required');
  expect(first.matchedKeywords).not.toContain('java'); expect(first.sections.filter(s => s.complete)).toHaveLength(1);
  c.skills = ['Python']; const single = analyzeResume(c, 'Python Python'); c.skills = ['Python Python Python'];
  expect(analyzeResume(c, 'Python Python').score).toBe(single.score);
  expect(keywords('C++ C# JavaScript js Node.js and machine learning')).toEqual(expect.arrayContaining(['c++', 'c#', 'javascript', 'nodejs', 'machine learning']));
});
it('stores immutable analysis history and keeps it private after resume edits or deletion', async () => {
  const s = await studentAccount(); const other = await studentAccount(); const app = testApp();
  const created = await studentCall(app, s.cookie, 'post', '/resumes', resumeFixture()); const id = created.body.data.resume.id;
  const response = await studentCall(app, s.cookie, 'post', `/resumes/${id}/analyses`, { jobDescription: job }); expect(response.status).toBe(201);
  const a = response.body.data.analysis; expect(a.resumeVersion).toBe(1);
  expect((await studentCall(app, other.cookie, 'post', `/resumes/${id}/analyses`, { jobDescription: job })).status).toBe(404);
  expect((await studentCall(app, other.cookie, 'get', `/analyses/${a.id}`)).status).toBe(404);
  expect((await studentCall(app, other.cookie, 'get', '/analyses')).body.data.analyses).toEqual([]);
  await studentCall(app, s.cookie, 'put', `/resumes/${id}`, { ...resumeFixture(), title: 'Changed', version: 1 });
  await studentCall(app, s.cookie, 'delete', `/resumes/${id}`);
  const saved = await studentCall(app, s.cookie, 'get', `/analyses/${a.id}`); expect(saved.body.data.analysis).toEqual(a);
  expect((await ResumeAnalysis.findById(a.id))?.resumeSnapshot.personal.fullName).toBe('Test Student');
  expect((await studentCall(app, s.cookie, 'get', '/analyses')).body.data.analyses).toHaveLength(1);
});
it('rejects invalid or empty requirements and prohibits staff access', async () => {
  const s = await studentAccount(); const admin = await studentAccount('admin'); const app = testApp(); const created = await studentCall(app, s.cookie, 'post', '/resumes', resumeFixture());
  const path = `/resumes/${created.body.data.resume.id}/analyses`;
  expect((await studentCall(app, s.cookie, 'post', path, { jobDescription: 'short' })).status).toBe(400);
  expect((await studentCall(app, s.cookie, 'post', path, { jobDescription: 'and the '.repeat(15) })).status).toBe(400);
  expect((await studentCall(app, admin.cookie, 'get', '/analyses')).status).toBe(403);
  expect(await ResumeAnalysis.countDocuments()).toBe(0);
});
