import { Assessment } from '../models/Assessment.js';
import { assessmentMetrics } from './assessmentAnalytics.js';
import { Activity, AssessmentAssignment, LearningProgress } from '../models/Preparation.js';
import type { UserDocument } from '../models/User.js';
import { Resume } from '../models/Resume.js';
import { ResumeAnalysis } from '../models/ResumeAnalysis.js';
import { InterviewSession } from '../models/InterviewSession.js';

export function activeStreak(days: string[], now = new Date()): number {
  const existing = new Set(days);
  const cursor = new Date(now.toISOString().slice(0, 10));
  if (!existing.has(cursor.toISOString().slice(0, 10))) cursor.setUTCDate(cursor.getUTCDate() - 1);
  let count = 0;
  while (existing.has(cursor.toISOString().slice(0, 10))) { count++; cursor.setUTCDate(cursor.getUTCDate() - 1); }
  return count;
}
export { recordActivity } from './activity.js';
export async function dashboard(user: UserDocument, allowDemo = false) {
  const filter = { studentId: user._id };
  const { attempts, analytics } = await assessmentMetrics(user.id as string);
  const [learning, assignments, recent, days, resume, activeInterview, interviewCount, availableAssessments] = await Promise.all([
    LearningProgress.find(filter).sort({ updatedAt: -1 }).lean(),
    AssessmentAssignment.find(filter).sort({ dueAt: 1 }).lean(),
    Activity.find(filter).sort({ createdAt: -1 }).limit(10).lean(),
    Activity.distinct('day', filter),
    Resume.findOne(filter).sort({ updatedAt: -1 }).lean(),
    InterviewSession.findOne({ ...filter, status: 'active' }).sort({ updatedAt: -1 }).lean(),
    InterviewSession.countDocuments(filter),
    Assessment.find({ published: true, ...(allowDemo ? {} : { demo: false }), $and: [{ $or: [{ opensAt: null }, { opensAt: { $lte: new Date() } }] }, { $or: [{ closesAt: null }, { closesAt: { $gt: new Date() } }] }] }).sort({ closesAt: 1 }).lean()
  ]);
  const analyzed = resume ? await ResumeAnalysis.exists({ ...filter, resumeId: resume._id, resumeVersion: resume.version }) : null;
  const completed = learning.reduce((sum, record) => sum + record.completedLessons, 0);
  const total = learning.reduce((sum, record) => sum + record.totalLessons, 0);
  const learningPercent = total ? Math.round(completed / total * 100) : null;
  const results = assignments.filter(record => record.status === 'completed' && record.score != null && record.maxScore != null);
  const legacyAverage = results.length ? Math.round(results.reduce((sum, record) => sum + record.score! / record.maxScore! * 100, 0) / results.length) : null;
  const averageScore = analytics.overview.averageScore ?? legacyAverage;
  const completedAssessments = attempts.length || assignments.filter(record => record.status === 'completed').length;
  const scored = attempts.length || results.length;
  const nextAssessments = availableAssessments.filter(a => attempts.filter(t => t.assessmentId.equals(a._id)).length < a.maxAttempts);
  const profile = [user.name, user.email, user.department, user.semester].filter(Boolean).length / 4 * 100;
  return {
    student: { name: user.name, department: user.department, semester: user.semester },
    readiness: { score: Math.round(profile * .25 + (learningPercent ?? 0) * .4 + (averageScore ?? 0) * .35), profilePercent: profile, formula: '25% profile completeness + 40% recorded lesson completion + 35% average recorded assessment score. Missing evidence adds no points; this is a preparation estimate, not a placement prediction.' },
    learning: { completed, total, percent: learningPercent, modules: learning.map(record => ({ id: record._id.toString(), title: record.title, completed: record.completedLessons, total: record.totalLessons })) },
    assessments: { completed: completedAssessments, scored, averageScore, source: attempts.length ? 'finalized-attempts' : results.length ? 'legacy-results' : 'no-data', upcoming: [...assignments.filter(record => record.status === 'pending' && (!record.assessmentId || !nextAssessments.some(a => a._id.equals(record.assessmentId!)))).map(record => ({ id: record._id.toString(), title: record.title, topic: record.topic, dueAt: record.dueAt })), ...nextAssessments.filter(a => a.closesAt).map(a => ({ id: a._id.toString(), title: a.title, topic: a.category, dueAt: a.closesAt }))] },
    streak: { days: activeStreak(days), calendar: 'UTC', description: 'Consecutive days with a dashboard check-in or saved preparation activity.' },
    recentActivity: recent.map(record => ({ id: record._id.toString(), kind: record.kind, title: record.title, at: record.createdAt })),
    nextActions: [
      ...analytics.weakTopics.slice(0, 2).map(t => ({ title: `Practise ${t.topic}`, detail: `${t.accuracy}% accuracy across ${t.questions} recorded responses and ${t.attempts} attempts. Review explanations and practise ${t.category} questions.`, href: '/analytics' })),
      ...(nextAssessments.length ? [{ title: `Try ${nextAssessments[0].title}`, detail: 'A published assessment is available within its actual availability window.', href: `/assessments/${nextAssessments[0]._id}` }] : []),
      ...assignments.filter(record => record.status === 'pending').slice(0, 2).map(record => ({ title: `Prepare for ${record.title}`, detail: `Due ${record.dueAt.toISOString().slice(0, 10)}; focus on ${record.topic}.` })),
      ...learning.filter(record => record.completedLessons < record.totalLessons).slice(0, 2).map(record => ({ title: `Continue ${record.title}`, detail: `${record.totalLessons - record.completedLessons} recorded lessons remain.` })),
      ...(!resume ? [{ title: 'Create your first resume', detail: 'No saved resume yet. Capture your education, skills, and projects.', href: '/resumes/new' }] : !analyzed ? [{ title: 'Review your latest resume', detail: `Version ${resume.version} of “${resume.title}” has no saved analysis yet. Compare it with a job description.`, href: '/resume-analyzer' }] : []),
      activeInterview ? { title: 'Continue your interview', detail: `Your ${activeInterview.targetRole} session is still active.`, href: `/interviews/${activeInterview._id}` } : { title: interviewCount ? 'Practice another interview' : 'Start your first interview', detail: interviewCount ? 'Build on your saved practice with another focused conversation.' : 'No saved interview yet. Choose a role and practice with the configured AI provider.', href: '/interviews' }
    ]
  };
}
