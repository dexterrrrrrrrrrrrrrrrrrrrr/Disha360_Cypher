import { Assessment, Question } from '../models/Assessment.js';
import { categories, questionSchema, assessmentSchema } from '../validators/assessment.js';
const samples: Record<typeof categories[number], [string, string, string[], number, string][]> = {
  quantitative: [
    ['Percentages', 'What is 20% of 250?', ['25', '50', '75', '100'], 1, '250 × 20/100 = 50.'],
    ['Percentages', 'A price increases from 100 to 120. What is the percentage increase?', ['10%', '15%', '20%', '25%'], 2, '(120 − 100)/100 × 100 = 20%.'],
    ['Percentages', 'After a 10% discount, an item marked 500 costs how much?', ['400', '450', '475', '490'], 1, '500 × 0.9 = 450.'],
    ['Ratios', 'The ratio of A to B is 2:3. If their total is 50, what is A?', ['10', '20', '25', '30'], 1, 'A is 2/5 of 50, or 20.'],
    ['Ratios', 'Simplify the ratio 18:24.', ['2:3', '3:4', '4:5', '6:7'], 1, 'Divide both terms by 6 to get 3:4.']
  ],
  logical: [
    ['Deduction', 'All roses are flowers. Some flowers fade quickly. Which conclusion must be true?', ['All roses fade quickly', 'Some roses fade quickly', 'All roses are flowers', 'No flowers are roses'], 2, 'Only the given universal premise is guaranteed; fading does not necessarily apply to roses.'],
    ['Deduction', 'If every A is B and every B is C, which statement follows?', ['Every C is A', 'Every A is C', 'No A is C', 'Every C is B'], 1, 'The implication chain A → B → C establishes that every A is C.'],
    ['Deduction', 'If P implies Q and Q is false, what follows about P?', ['P is true', 'P is false', 'P is unknown', 'Q is true'], 1, 'By modus tollens, P must be false.'],
    ['Sequences', 'What comes next: 2, 4, 8, 16?', ['18', '24', '30', '32'], 3, 'Each value doubles, so the next is 32.'],
    ['Sequences', 'What comes next: 3, 6, 9, 12?', ['13', '14', '15', '18'], 2, 'Add 3 to each term, giving 15.']
  ],
  verbal: [
    ['Grammar', 'Choose the grammatically correct sentence.', ['She go to college.', 'She goes to college.', 'She going to college.', 'She gone to college.'], 1, 'A singular third-person subject takes “goes” in the simple present.'],
    ['Grammar', 'Choose the correct article: “He is ___ honest person.”', ['a', 'an', 'the only', 'no article'], 1, '“Honest” begins with a vowel sound, so use “an”.'],
    ['Grammar', 'Choose the correct form: “Neither of the answers ___ correct.”', ['are', 'were', 'is', 'be'], 2, '“Neither” takes the singular verb “is” here.'],
    ['Vocabulary', 'Which word is closest in meaning to “concise”?', ['Brief', 'Lengthy', 'Unclear', 'Careless'], 0, '“Concise” means brief while retaining necessary meaning.'],
    ['Vocabulary', 'Which word is opposite in meaning to “abundant”?', ['Plentiful', 'Ample', 'Scarce', 'Numerous'], 2, '“Scarce” means insufficient or limited, the opposite of abundant.']
  ],
  technical: [
    ['Data structures', 'Which data structure follows FIFO?', ['Stack', 'Queue', 'Tree', 'Set'], 1, 'A queue removes items in first-in, first-out order.'],
    ['Data structures', 'What is the worst-case time to access an array element by index?', ['O(1)', 'O(log n)', 'O(n)', 'O(n²)'], 0, 'Index access computes an offset directly and is O(1).'],
    ['Data structures', 'Which operation is characteristic of a stack?', ['Dequeue', 'Push', 'Hash join', 'Breadth-first traversal'], 1, 'Push adds an item to the top of a stack.'],
    ['Databases', 'Which SQL clause filters grouped aggregate results?', ['WHERE', 'ORDER BY', 'HAVING', 'LIMIT'], 2, 'HAVING applies conditions to groups after aggregation.'],
    ['Databases', 'Which property of a primary key is required?', ['May contain duplicates', 'Must be unique', 'Must be text', 'Must be an email'], 1, 'A primary key uniquely identifies each row.']
  ]
};
export async function seedSampleAssessments(nodeEnv: string) {
  if (nodeEnv !== 'development') throw new Error('Sample assessments can only be seeded in development.');
  for (const category of categories) {
    const ids: string[] = [];
    for (const [i, item] of samples[category].entries()) {
      const [topic, prompt, choices, correct, explanation] = item; const key = `disha360-demo-${category}-${i + 1}`;
      let question = await Question.findOne({ key });
      if (question && !question.demo) throw new Error('Refusing to overwrite a non-demo question.');
      if (!question) question = await Question.create(questionSchema.parse({ key, category, topic, prompt, options: choices.map((text, index) => ({ id: `option-${index + 1}`, text })), correctOptionId: `option-${correct + 1}`, explanation, difficulty: i < 2 ? 'easy' : i === 4 ? 'hard' : 'medium', published: true, demo: true }));
      ids.push(question.id as string);
    }
    const key = `disha360-demo-assessment-${category}`; const existing = await Assessment.findOne({ key });
    if (existing && !existing.demo) throw new Error('Refusing to overwrite a non-demo assessment.');
    if (!existing) await Assessment.create(assessmentSchema.parse({ key, category, title: `[SAMPLE] ${category[0].toUpperCase() + category.slice(1)} practice`, instructions: 'Development sample assessment. Five questions, five minutes. Choices and question order may vary. Answers save when selected; the backend enforces the deadline. Unanswered questions score zero. These questions are practice examples, not employer tests.', questionIds: ids, questionCount: 5, durationSeconds: 300, pointsPerCorrect: 1, penaltyPerIncorrect: category === 'technical' ? .25 : 0, published: true, demo: true, maxAttempts: 3 }));
  }
}
