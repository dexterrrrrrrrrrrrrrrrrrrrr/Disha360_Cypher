import { beforeAll, beforeEach, afterAll, it, expect } from 'vitest';
import request from 'supertest';
import { testDatabase, studentAccount, testApp, studentCall } from './helpers/student.js';
import { Activity, LearningProgress, AssessmentAssignment } from '../src/models/Preparation.js';
import { activeStreak } from '../src/services/dashboard.js';

let db: Awaited<ReturnType<typeof testDatabase>>;
beforeAll(async () => { db = await testDatabase(); }, 180000);
beforeEach(async () => { await db.clear(); });
afterAll(async () => { if (db) await db.close(); });
it('returns empty performance data without fabricated scores', async () => {
  const student = await studentAccount(); const app = testApp();
  const result = await studentCall(app, student.cookie, 'get', '/dashboard');
  expect(result.status).toBe(200);
  expect(result.body.data.learning.percent).toBeNull();
  expect(result.body.data.assessments.averageScore).toBeNull();
  expect(result.body.data.readiness.score).toBe(25);
  expect(result.body.data.student.name).toBe(student.user.name);
});
it('calculates metrics from the current student’s actual records only', async () => {
  const student = await studentAccount(); const other = await studentAccount();
  await LearningProgress.create([{ studentId: student.user._id, moduleKey: 'math', title: 'Quantitative aptitude', completedLessons: 2, totalLessons: 4 }, { studentId: other.user._id, moduleKey: 'private', title: 'Private module', completedLessons: 20, totalLessons: 20 }]);
  await AssessmentAssignment.create([{ studentId: student.user._id, title: 'Aptitude', topic: 'Percentages', dueAt: new Date(), status: 'completed', score: 16, maxScore: 20 }, { studentId: student.user._id, title: 'Upcoming reasoning', topic: 'Logic', dueAt: new Date(), status: 'pending' }, { studentId: other.user._id, title: 'Private test', topic: 'Other', dueAt: new Date() }]);
  const result = await studentCall(testApp(), student.cookie, 'get', `/dashboard?studentId=${other.user.id}`);
  expect(result.body.data.learning.percent).toBe(50);
  expect(result.body.data.assessments.averageScore).toBe(80);
  expect(result.body.data.readiness.score).toBe(73);
  expect(result.body.data.assessments.upcoming).toHaveLength(1);
  expect(JSON.stringify(result.body)).not.toContain('Private');
});
it('records a daily check-in once, persists recent activity and streak', async () => {
  const student = await studentAccount(); const app = testApp();
  await Promise.all([studentCall(app, student.cookie, 'post', '/activity/check-in'), studentCall(app, student.cookie, 'post', '/activity/check-in')]);
  expect(await Activity.countDocuments()).toBe(1);
  const result = await studentCall(app, student.cookie, 'get', '/dashboard');
  expect(result.body.data.streak.days).toBe(1);
  expect(result.body.data.recentActivity).toHaveLength(1);
});
it('computes streaks through yesterday, deduplicates days, and stops at gaps', () => {
  const now = new Date('2026-10-09T12:00:00Z');
  expect(activeStreak(['2026-10-08', '2026-10-08', '2026-10-07', '2026-10-05'], now)).toBe(2);
  expect(activeStreak(['2026-10-05'], now)).toBe(0);
});
it('requires student authorization and CSRF protection', async () => {
  const app = testApp(); const trainer = await studentAccount('trainer'); const student = await studentAccount();
  expect((await request(app).get('/api/v1/student/dashboard')).status).toBe(401);
  expect((await studentCall(app, trainer.cookie, 'get', '/dashboard')).status).toBe(403);
  expect((await request(app).post('/api/v1/student/activity/check-in').set('Cookie', student.cookie)).status).toBe(403);
});
it('rejects impossible learning and assessment records', async () => {
  const student = await studentAccount();
  await expect(LearningProgress.create({ studentId: student.user._id, moduleKey: 'bad', title: 'Bad', completedLessons: 5, totalLessons: 2 })).rejects.toThrow();
  await expect(AssessmentAssignment.create({ studentId: student.user._id, title: 'Bad', topic: 'Test', dueAt: new Date(), status: 'completed', score: 30, maxScore: 20 })).rejects.toThrow();
});
