import { expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { CodingMentor } from '../src/features/coding/CodingMentor';
import { LiveClasses, LiveClassDetails } from '../src/pages/LiveClasses';
const state = vi.hoisted(() => ({ mentor: true, detail: false }));
vi.mock('../src/hooks/useStudentData', () => ({ useStudentData: () => ({ data: { configured: state.mentor }, loading: false }) }));
vi.mock('../src/hooks/useStaffData', () => ({ useStaffData: () => ({ loading: false, data: state.detail ? { id: 'fixture', title: 'Private meeting', startsAt: '2026-10-11T10:00:00Z', durationMinutes: 60, status: 'Upcoming', version: 1, meetingUrl: 'https://sparkmeet-web.onrender.com/', notes: '<script>alert(1)</script>', attendance: [] } : { classes: [], truncated: false } }) }));
vi.mock('../src/layouts/AppLayout', () => ({ AppLayout: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
const render = (element: React.ReactNode) => renderToStaticMarkup(<MemoryRouter>{element}</MemoryRouter>);
it('discloses mentor data sharing, starts with consent and full-solution opt-ins unchecked, and disables calls', () => {
  state.mentor = true; const html = render(<CodingMentor language="python" source="print(1)"/>);
  expect(html).toContain('AI Coding Mentor'); expect(html).toContain('Hidden tests and demo output are never sent');
  expect(html).not.toContain('checked=""'); expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Get hint 1/);
  expect(html).toContain('not execution, verified correctness, or grading'); expect(html).not.toContain('GEMINI_API_KEY');
});
it('keeps mentor configuration errors separate from execution availability', () => {
  state.mentor = false; expect(render(<CodingMentor language="python" source="x"/>)).toContain('You can still edit and use available execution or demo actions');
});
it('shows clear live-class empty states and staff scheduling navigation', () => {
  state.detail = false;
  expect(render(<LiveClasses role="student"/>)).toContain('Only assigned batches appear');
  expect(render(<LiveClasses role="trainer"/>)).toContain('Schedule Live Class');
});
it('opens meeting links securely and never treats joining as attendance; notes remain escaped', () => {
  state.detail = true; const html = render(<LiveClassDetails role="student"/>);
  expect(html).toContain('rel="noopener noreferrer"'); expect(html).toContain('referrerPolicy="no-referrer"');
  expect(html).toContain('Opening a link never marks attendance'); expect(html).toContain('Not recorded'); expect(html).not.toContain('<script>');
});
