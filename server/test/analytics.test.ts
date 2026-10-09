import { beforeAll, beforeEach, afterAll, it, expect } from 'vitest';
import { testDatabase, studentAccount, studentCall, testApp } from './helpers/student.js';
import { assessmentFixture } from './helpers/assessment.js';
import { startAttempt, finalizeAttempt } from '../src/services/assessments.js';
import { calculateAnalytics } from '../src/services/assessmentAnalytics.js';
import { Assessment, TestAttempt } from '../src/models/Assessment.js';
import { Batch, Enrollment } from '../src/models/Batch.js';
import { Activity, AssessmentAssignment } from '../src/models/Preparation.js';
let db: Awaited<ReturnType<typeof testDatabase>>;
beforeAll(async () => { db = await testDatabase(); }, 180000); beforeEach(async () => { await db.clear(); }); afterAll(async () => { if (db) await db.close(); });
async function complete(studentId: string, assessmentId: string, right: (topic: string, i: number) => boolean = () => true, times = false) {
  const a = await startAttempt(assessmentId, studentId, false); a.questions.forEach((q, i) => { q.selectedOptionId = right(q.topic, i) ? q.correctOptionId : q.options.find(v => v.id !== q.correctOptionId)!.id; q.timeSpentMs = times ? (i + 1) * 1000 : 1000; }); a.startedAt = new Date(Date.now() - 60000); a.cursorSince = new Date(); await a.save(); return finalizeAttempt(a.id as string, studentId, a.version);
}
it('distinguishes no data, active attempts, insufficient evidence and actual zero scores', async () => {
  const s = await studentAccount(); const { assessment } = await assessmentFixture({ questionCount: 6 }); const app = testApp();
  let result = await studentCall(app, s.cookie, 'get', '/analytics'); expect(result.body.data.overview).toMatchObject({ completedAttempts: 0, averageScore: null, accuracy: null, evidence: 'no-data' }); expect(result.body.data.batch.available).toBe(false);
  await startAttempt(assessment.id as string, s.user.id as string, false); result = await studentCall(app, s.cookie, 'get', '/analytics'); expect(result.body.data.overview.completedAttempts).toBe(0);
  await complete(s.user.id as string, assessment.id as string, () => false); result = await studentCall(app, s.cookie, 'get', '/analytics'); expect(result.body.data.overview).toMatchObject({ completedAttempts: 1, averageScore: 0, accuracy: 0, evidence: 'insufficient' }); expect(result.body.data.weakTopics).toEqual([]);
});
it('calculates category, topic, difficulty and average time from real completed records', async () => {
  const s = await studentAccount(); const { assessment } = await assessmentFixture({ questionCount: 6 }); await complete(s.user.id as string, assessment.id as string, (topic) => topic === 'Ratios', true);
  const result = await studentCall(testApp(), s.cookie, 'get', '/analytics'); const data = result.body.data;
  expect(data.overview.accuracy).toBe(50); expect(data.overview.averageTimeSeconds).toBeCloseTo(3.5, 1); expect(data.overview.totalTimeSeconds).toBeGreaterThanOrEqual(60);
  expect(data.categories).toHaveLength(1); expect(data.categories[0]).toMatchObject({ key: 'quantitative', questions: 6, correct: 3, accuracy: 50 }); expect(data.topics.find((t: { topic: string }) => t.topic === 'Percentages').accuracy).toBe(0); expect(data.difficulties).toHaveLength(3); expect(data.difficulties.every((d: { questions: number }) => d.questions === 2)).toBe(true); expect(data.history[0].questions).toBe(6);
});
it('requires repeated diverse evidence before identifying weak/strong topics and uses difficulty and time', async () => {
  const s = await studentAccount(); const { assessment } = await assessmentFixture({ questionCount: 6 }); await complete(s.user.id as string, assessment.id as string, topic => topic === 'Ratios');
  let response = await studentCall(testApp(), s.cookie, 'get', '/analytics'); expect(response.body.data.weakTopics).toEqual([]);
  await complete(s.user.id as string, assessment.id as string, topic => topic === 'Ratios'); response = await studentCall(testApp(), s.cookie, 'get', '/analytics');
  expect(response.body.data.weakTopics).toHaveLength(1); expect(response.body.data.weakTopics[0]).toMatchObject({ topic: 'Percentages', questions: 6, attempts: 2, uniqueQuestions: 3, weightedAccuracy: 0 }); expect(response.body.data.strongTopics[0].topic).toBe('Ratios');
  const records = await TestAttempt.find({ studentId: s.user._id }); records.forEach(a => a.questions.forEach(q => { q.timeSpentMs = q.expectedSeconds * 2000; })); const slow = calculateAnalytics(records); expect(slow.strongTopics).toEqual([]); expect(slow.topics.find(t => t.topic === 'Ratios')?.classification).toBe('needs-time-practice');
});
it('builds deterministic UTC trends, ignores duplicate attempt IDs and keeps student histories isolated', async () => {
  const s = await studentAccount(); const other = await studentAccount(); const { assessment } = await assessmentFixture({ questionCount: 6 });
  const first = await complete(s.user.id as string, assessment.id as string); const second = await complete(s.user.id as string, assessment.id as string, () => false); await complete(other.user.id as string, assessment.id as string);
  await TestAttempt.updateOne({ _id: first._id }, { $set: { finalizedAt: new Date('2026-10-08T20:00:00Z') } }); await TestAttempt.updateOne({ _id: second._id }, { $set: { finalizedAt: new Date('2026-10-09T02:00:00Z') } });
  const result = await studentCall(testApp(), s.cookie, 'get', `/analytics?studentId=${other.user.id}`); expect(result.body.data.overview.completedAttempts).toBe(2); expect(result.body.data.trends).toMatchObject([{ day: '2026-10-08', averageScore: 100 }, { day: '2026-10-09', averageScore: 0 }]);
  const same = calculateAnalytics([first, first]); expect(same.overview.completedAttempts).toBe(1); expect(same.overview.totalQuestions).toBe(6);
});
it('compares only real active batch membership and latest equivalent peer results without exposing students', async () => {
  const owner = await studentAccount(); const peers = await Promise.all([studentAccount(), studentAccount(), studentAccount()]); const outsider = await studentAccount(); const batch = await Batch.create({ name: 'Engineering batch' }); const { assessment } = await assessmentFixture({ questionCount: 6, maxAttempts: 10 });
  await Enrollment.create([owner, ...peers].map(s => ({ batchId: batch._id, studentId: s.user._id })));
  await complete(owner.user.id as string, assessment.id as string); await complete(peers[0].user.id as string, assessment.id as string); await complete(peers[0].user.id as string, assessment.id as string, () => false); await complete(peers[1].user.id as string, assessment.id as string, () => false); await complete(peers[2].user.id as string, assessment.id as string, (_topic, i) => i < 3); await complete(outsider.user.id as string, assessment.id as string);
  const result = await studentCall(testApp(), owner.cookie, 'get', '/analytics'); expect(result.body.data.batch.available).toBe(true); expect(result.body.data.batch.comparisons[0]).toMatchObject({ peers: 3, ownPercentage: 100, averagePercentage: 13 });
  for (const peer of [...peers, outsider]) { expect(JSON.stringify(result.body)).not.toContain(peer.user.email); expect(JSON.stringify(result.body)).not.toContain(peer.user.id); }
  await TestAttempt.updateMany({ studentId: peers[2].user._id }, { $set: { assessmentVersion: 2 } }); expect((await studentCall(testApp(), owner.cookie, 'get', '/analytics')).body.data.batch.available).toBe(false);
  await Enrollment.updateOne({ studentId: owner.user._id, batchId: batch._id }, { $set: { active: false } }); expect((await studentCall(testApp(), owner.cookie, 'get', '/analytics')).body.data.batch.available).toBe(false);
});
it('integrates true zero performance and actual upcoming assessments into the dashboard without double counting', async () => {
  const s = await studentAccount(); const { assessment } = await assessmentFixture({ questionCount: 6, closesAt: new Date(Date.now() + 600000) });
  await AssessmentAssignment.create({ studentId: s.user._id, assessmentId: assessment._id, title: assessment.title, topic: 'Arithmetic', dueAt: assessment.closesAt, status: 'completed', score: 10, maxScore: 10 });
  const a = await complete(s.user.id as string, assessment.id as string, () => false); const app = testApp(); const first = await studentCall(app, s.cookie, 'get', '/dashboard'); const second = await studentCall(app, s.cookie, 'get', '/dashboard');
  expect(first.body.data.assessments).toMatchObject({ averageScore: 0, completed: 1, scored: 1, source: 'finalized-attempts' }); expect(first.body.data.readiness.score).toBe(25); expect(first.body.data.assessments.upcoming).toHaveLength(1); expect(first.body.data.assessments.upcoming[0].id).toBe(assessment.id); expect(first.body.data.nextActions.some((v: { href?: string }) => v.href === `/assessments/${assessment.id}`)).toBe(true);
  expect(second.body.data.assessments).toEqual(first.body.data.assessments); expect(await Activity.countDocuments({ key: `attempt:${a.id}:completed` })).toBe(1);
  const admin = await studentAccount('admin'); expect((await studentCall(app, admin.cookie, 'get', '/analytics')).status).toBe(403);
});
