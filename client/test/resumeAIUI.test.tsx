import { expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ResumeAISuggestions } from '../src/features/resume/ResumeAISuggestions';
const state = vi.hoisted(() => ({ available: true }));
vi.mock('../src/hooks/useStudentData', () => ({ useStudentData: () => ({ loading: false, data: { resumeSuggestionsAvailable: state.available } }) }));
it('shows privacy disclosure and requires opt-in before enabling suggestions', () => {
  state.available = true;
  const html = renderToStaticMarkup(<ResumeAISuggestions resumeId="fixture" jobDescription={'x'.repeat(60)}/>);
  expect(html).toContain('Google Gemini'); expect(html).toContain('Free-form text may still identify you');
  expect(html).toContain('I consent to sending'); expect(html).toMatch(/<input[^>]*type="checkbox"[^>]*>/);
  expect(html).not.toContain('checked=""'); expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Get optional AI suggestions/);
  expect(html).toContain('do not change your score or resume'); expect(html).not.toMatch(/API key|GEMINI_API_KEY/);
});
it('keeps the ATS workflow available when Gemini is not configured', () => {
  state.available = false;
  const html = renderToStaticMarkup(<ResumeAISuggestions resumeId="fixture" jobDescription={'x'.repeat(60)}/>);
  expect(html).toContain('ATS analysis and the resume builder remain available'); expect(html).not.toContain('Get optional AI suggestions</button>');
});
