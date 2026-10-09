import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { ProtectedRoute } from "../src/features/auth/ProtectedRoute";
import { Login } from "../src/pages/Login";
import { useAuth } from "../src/features/auth/AuthProvider";
import type { Role } from "../src/types";
vi.mock("../src/features/auth/AuthProvider", () => ({ useAuth: vi.fn() }));
vi.mock("../src/layouts/AuthLayout", () => ({
  AuthLayout: ({ children }: { children: React.ReactNode }) => (
    <main>{children}</main>
  ),
}));
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    Navigate: ({ to }: { to: string }) => <span data-redirect={to} />,
    Outlet: () => <span>AUTHORIZED_CONTENT</span>,
  };
});
const roles = ["student", "trainer", "admin"] as const;
function session(role: Role | null) {
  return {
    user: role
      ? {
          id: "fixture",
          name: "Role Fixture",
          email: "fixture@example.test",
          role,
          department: role === "student" ? "CS" : null,
          semester: role === "student" ? 6 : null,
        }
      : null,
    loading: false,
    error: "",
    notice: null,
    refresh: vi.fn(),
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
  };
}
beforeEach(() => {
  vi.mocked(useAuth).mockReturnValue(session(null));
});
function render(node: React.ReactNode) {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={["/dashboard/admin"]}>{node}</MemoryRouter>,
  );
}
describe("actual React role guards and shared login page", () => {
  it.each(roles)("opens authorized %s routes", (role) => {
    vi.mocked(useAuth).mockReturnValue(session(role));
    expect(render(<ProtectedRoute role={role} />)).toContain(
      "AUTHORIZED_CONTENT",
    );
  });
  it.each(
    roles.flatMap((role) =>
      roles
        .filter((target) => target !== role)
        .map((target) => ({ role, target })),
    ),
  )("redirects $role away from $target routes", ({ role, target }) => {
    vi.mocked(useAuth).mockReturnValue(session(role));
    const html = render(<ProtectedRoute role={target} />);
    expect(html).toContain(`data-redirect="/dashboard/${role}"`);
    expect(html).not.toContain("AUTHORIZED_CONTENT");
  });
  it.each(roles)(
    "redirects an authenticated %s from login to their own dashboard",
    (role) => {
      vi.mocked(useAuth).mockReturnValue(session(role));
      expect(render(<Login />)).toContain(`data-redirect="/dashboard/${role}"`);
    },
  );
  it("requires login for anonymous navigation", () => {
    const html = render(<ProtectedRoute role="admin" />);
    expect(html).toContain('data-redirect="/login"');
    expect(html).not.toContain("AUTHORIZED_CONTENT");
  });
  it("does not disclose protected content during session loading", () => {
    vi.mocked(useAuth).mockReturnValue({ ...session("admin"), loading: true });
    const html = render(<ProtectedRoute role="admin" />);
    expect(html).toContain("Checking your session");
    expect(html).not.toContain("AUTHORIZED_CONTENT");
  });
  it("shows retryable session errors instead of granting access", () => {
    vi.mocked(useAuth).mockReturnValue({
      ...session("admin"),
      error: "Unavailable",
    });
    const html = render(<ProtectedRoute role="admin" />);
    expect(html).toContain("Unavailable");
    expect(html).toContain("Try again");
    expect(html).not.toContain("AUTHORIZED_CONTENT");
  });
  it("renders a shared email/password login without a privileged role selector or registration link", () => {
    const html = render(<Login />);
    expect(html).toContain("Email address");
    expect(html).toContain("Password");
    expect(html).toContain("New student?");
    expect(html).not.toContain("<select");
    expect(html).not.toContain("/register/admin");
    expect(html).not.toContain("/register/trainer");
  });
});
