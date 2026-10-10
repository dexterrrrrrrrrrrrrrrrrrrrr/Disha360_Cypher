import { expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MentorMarkdown } from '../src/features/coding/MentorMarkdown';
import { CodingMentor } from '../src/features/coding/CodingMentor';
const state = vi.hoisted(() => ({ available: true }));
vi.mock('../src/hooks/useStudentData', () => ({ useStudentData: () => ({ data: { configured: state.available, provider: 'Ollama', model: 'fixture:local', streaming: true, message: 'Start ollama serve if unavailable.' }, loading: false, reload: vi.fn() }) }));
it('renders readable Markdown and copyable highlighted code without active HTML, links or images', () => {
  const html = renderToStaticMarkup(<MentorMarkdown text={'### Explanation\n\n**Read the input.**\n\n```python\nprint("hello")\n```\n\n<script>alert(1)</script>\n\n[bad](javascript:alert(1))\n\n![track](https://tracker.test/image)'}/>);
  expect(html).toContain('<h3>Explanation</h3>'); expect(html).toContain('<strong>Read the input.</strong>'); expect(html).toContain('Copy code'); expect(html).toContain('text-emerald-300'); expect(html).not.toContain('<script>'); expect(html).not.toContain('<img'); expect(html).not.toContain('href=');
});
it('shows local provider privacy, action choices, explicit consent and progressive hints', () => {
  state.available = true; const html = renderToStaticMarkup(<CodingMentor language="python" source="print(1)"/>);
  expect(html).toContain('Ollama'); expect(html).toContain('needs no cloud key'); expect(html).toContain('Generate practice questions'); expect(html).toContain('Explain an algorithm'); expect(html).toContain('Hint 3'); expect(html).not.toContain('checked=""'); expect(html).not.toContain('GEMINI_API_KEY');
});
it('shows offline setup and keeps execution independent of AI configuration', () => {
  state.available = false; const html = renderToStaticMarkup(<CodingMentor language="python" source="print(1)"/>);
  expect(html).toContain('Start ollama serve'); expect(html).toContain('Check availability'); expect(html).toContain('You can still edit');
});
it('offers explicit error, hint and code shortcuts without bypassing consent',()=>{
 state.available=true;const html=renderToStaticMarkup(<CodingMentor language="java" source="class Main {}"/>);
 for(const label of ['Explain Error','Get Hint','Explain My Code'])expect(html).toContain(label);
 expect(html).not.toContain('checked=""');
});
