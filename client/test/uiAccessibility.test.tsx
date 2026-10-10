import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { AppLayout } from "../src/layouts/AppLayout";
import { AuthLayout } from "../src/layouts/AuthLayout";
import { Skeleton, ErrorNotice } from "../src/components/StudentUI";
import { ResumeEditor } from "../src/pages/ResumeEditor";
vi.mock("../src/features/auth/AuthProvider", () => ({ useAuth: () => ({ user: { name: "Test student", email: "student@example.test" }, loading: false, logout: vi.fn() }) }));
function render(node: React.ReactNode) { return renderToStaticMarkup(<MemoryRouter>{node}</MemoryRouter>); }
it("closed mobile navigation is inert and the named opener points to its controlled region", () => {
  const html = render(<AppLayout role="student"><h1>Workspace</h1></AppLayout>);
  expect(html).toMatch(/<aside[^>]*id="workspace-navigation"[^>]*inert=""/);
  expect(html).toContain('aria-expanded="false"');
  expect(html).toContain('aria-controls="workspace-navigation"');
  expect(html).toContain('aria-label="Open navigation"');
  expect(html).toContain('href="/dashboard/student"');
});
it("main content can receive keyboard focus in authenticated and authentication layouts", () => {
  for (const node of [<AppLayout role="admin"><h1>Admin</h1></AppLayout>, <AuthLayout><h1>Sign in</h1></AuthLayout>]) {
    expect(render(node)).toMatch(/<main[^>]*id="main-content"[^>]*tabindex="-1"/);
  }
});
it("loading skeleton announces progress while keeping decorative blocks hidden", () => {
  const html = render(<Skeleton />);
  expect(html).toContain('role="status"');
  expect(html).toContain('aria-busy="true"');
  expect(html).toContain("Loading records…");
  expect(html).toContain('aria-hidden="true"');
});
it("errors are announced and expose a named retry action", () => {
  const html = render(<ErrorNotice message="Network unavailable" retry={() => {}} />);
  expect(html).toContain('role="alert"');
  expect(html).toContain("Network unavailable");
  expect(html).toContain("Try again");
});
it("repeatable resume sections have distinct accessible add actions", () => {
  const html = render(<ResumeEditor />);
  for (const section of ["education", "projects", "experience", "certifications"]) expect(html).toContain(`aria-label="Add ${section} entry"`);
});
