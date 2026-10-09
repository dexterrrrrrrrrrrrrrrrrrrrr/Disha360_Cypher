import { Assessment, Question } from '../../src/models/Assessment.js';
import { randomBytes } from 'node:crypto';
export async function assessmentFixture(overrides: Record<string, unknown> = {}) {
  const prefix = randomBytes(6).toString('hex'); const questions = await Question.create(Array.from({ length: 6 }, (_, i) => ({ key: `${prefix}-${i}`, category: 'quantitative', topic: i < 3 ? 'Percentages' : 'Ratios', difficulty: i % 3 === 0 ? 'easy' : i % 3 === 1 ? 'medium' : 'hard', prompt: `What is ${i + 1} plus one?`, options: [{ id: 'right', text: String(i + 2) }, { id: 'wrong-a', text: '100' }, { id: 'wrong-b', text: '200' }, { id: 'wrong-c', text: '300' }], correctOptionId: 'right', explanation: 'Add one to the given number.', published: true, expectedSeconds: 60 })));
  const assessment = await Assessment.create({ key: `${prefix}-test`, title: 'Arithmetic practice', instructions: 'Choose one answer per question. The timer is enforced by the server.', category: 'quantitative', questionIds: questions.map(q => q._id), questionCount: 4, durationSeconds: 120, pointsPerCorrect: 2, penaltyPerIncorrect: .5, maxAttempts: 3, published: true, ...overrides });
  return { assessment, questions };
}
