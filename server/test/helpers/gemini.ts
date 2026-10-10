import { GenerateContentResponse, FinishReason } from '@google/genai';
import { competencyNames } from '../../src/validators/feedback.js';
export function geminiResponse(value: unknown) {
  const result = new GenerateContentResponse();
  result.candidates = [{ finishReason: FinishReason.STOP, content: { role: 'model', parts: [{ text: JSON.stringify(value) }] } }];
  return result;
}
export const geminiSetup = { type: 'technical' as const, difficulty: 'beginner' as const, targetRole: 'Software engineer', focus: 'React', questionLimit: 3 };
export const geminiAnswer = 'I built an error boundary and tested its fallback rendering.';
export function geminiFeedback() {
  const evidence = { questionNumber: 1, quote: geminiAnswer };
  return {
    competencies: Object.fromEntries(competencyNames.map(key => [key, { score: key === 'technicalAccuracy' ? null : 70, rationale: 'Concrete example with room for more detail.', evidence: [evidence] }])),
    strengths: [{ ...evidence, observation: 'Explains testing a feature.' }], improvements: [{ ...evidence, observation: 'Explain the design trade-off.' }],
    questions: [{ ...evidence, score: 70, assessment: 'Relevant example.', suggestions: ['Explain the design decision.'] }],
    nextSteps: ['Practise explaining a design trade-off.'],
  };
}
export const geminiSuggestion = { suggestions: [{ section: 'summary' as const, suggestion: 'Describe the web application you actually built.', reason: 'Make the summary specific without adding claims.' }] };
