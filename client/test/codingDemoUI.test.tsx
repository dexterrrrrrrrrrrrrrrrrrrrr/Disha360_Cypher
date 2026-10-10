import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { Workspace } from "../src/pages/CodingWorkspace";
const state = vi.hoisted(() => ({ demoMode: false }));
vi.mock("../src/hooks/useStudentData", () => ({ useStudentData: () => ({ data: { demoMode: state.demoMode, configured: false, message: "Backend configuration" } }) }));
function render(problemId?: string) { return renderToStaticMarkup(<MemoryRouter><Workspace scope="playground" problemId={problemId} /></MemoryRouter>); }
it("labels every demo action and explains fixed output without execution claims", () => {
  state.demoMode = true;
  const html = render("000000000000000000000001");
  for (const text of ["Coding Demo Mode", "Demo Run", "Demo Submit", "Illustrative output", "Demo Mode: Code was not executed. This is an illustrative output only.", "Code and custom input are not processed."]) expect(html).toContain(text);
  expect(html).not.toContain("Submit solution");
  expect(html).not.toContain("Runtime:");
});
it("offers a challenge navigation hint in the demo playground", () => {
  state.demoMode = true;
  expect(render()).toContain("Open a published challenge to demonstrate Demo Submit.");
  expect(render()).not.toContain("Demo Submit</button>");
});
it("preserves real-provider UI and setup-required controls when demo is off", () => {
  state.demoMode = false;
  const html = render();
  expect(html).toContain("Run code");
  expect(html).toContain("genuine provider output");
  expect(html).not.toContain("Coding Demo Mode");
  expect(html).not.toContain("Illustrative output");
});
