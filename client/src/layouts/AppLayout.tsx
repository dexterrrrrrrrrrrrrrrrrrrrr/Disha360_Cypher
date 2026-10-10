import { useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  BarChart3,
  BookOpen,
  BriefcaseBusiness,
  Code2,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  ShieldCheck,
  Trophy,
  Users,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import { Brand } from "../components/Brand";
import { roleLabels, type Role } from "../types";
import { useAuth } from "../features/auth/AuthProvider";
import { useNavigationDrawer } from "../hooks/useNavigationDrawer";

export function AppLayout({
  role,
  children,
}: {
  role: Role;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const { drawer, mobile } = useNavigationDrawer(open, () => setOpen(false));
  const navigate = useNavigate();
  const auth = useAuth();
  const location = useLocation();
  const destinations: Record<string, string> = {
    Leaderboard:
      role === "student" ? "/leaderboard" : `/manage/${role}/leaderboard`,
    Achievements: "/achievements",
    "Trainers & accounts": "/manage/admin/trainers",
    Assignments: `/manage/${role}/assignments`,
    "Reports & analytics": `/manage/${role}/reports`,
    "Questions & tests": `/manage/${role}/assessments`,
    "Student directory": `/manage/${role}/students`,
    "Batches & students": `/manage/${role}/batches`,
    "Company preparation": "/companies",
    "Learning modules": "/learning",
    "Learning content": `/learning/manage/${role}`,
    "Coding practice": "/coding",
    "Resume studio": "/resumes",
    "ATS analyzer": "/resume-analyzer",
    "Mock interviews": "/interviews",
    Assessments: "/assessments",
    "Performance analytics": "/analytics",
  };
  const navClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-semibold ${isActive ? "bg-indigo-50 text-brand" : "text-slate-600 hover:bg-slate-50"}`;
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  async function logout() {
    setLoggingOut(true);
    setLogoutError("");
    try {
      await auth.logout();
      navigate("/login", { replace: true, state: { loggedOut: true } });
    } catch (err) {
      setLogoutError(
        err instanceof Error
          ? err.message
          : "Unable to sign out. Please try again.",
      );
    } finally {
      setLoggingOut(false);
    }
  }
  const student = [
    ["Learning modules", BookOpen],
    ["Assessments", FileText],
    ["Performance analytics", BarChart3],
    ["Coding practice", Code2],
    ["Resume studio", BriefcaseBusiness],
    ["ATS analyzer", FileText],
    ["Mock interviews", MessageSquare],
    ["Company preparation", Users],
    ["Leaderboard", Trophy],
    ["Achievements", Trophy],
  ] as const;
  const staff = [
    ["Batches & students", Users],
    ["Student directory", Users],
    ["Learning content", BookOpen],
    ["Questions & tests", FileText],
    ["Assignments", BriefcaseBusiness],
    ["Reports & analytics", BarChart3],
    ["Leaderboard", Trophy],
    ...(role === "admin"
      ? [["Trainers & accounts", ShieldCheck] as const]
      : []),
  ] as const;
  return (
    <div className="min-h-screen bg-[#f5f7fb]">
      {open && (
        <button
          className="fixed inset-0 z-30 bg-ink/40 lg:hidden"
          aria-label="Close navigation"
          tabIndex={-1}
          aria-hidden="true"
          onClick={() => setOpen(false)}
        />
      )}
      <aside
        ref={drawer}
        id="workspace-navigation"
        inert={mobile && !open}
        role={mobile && open ? "dialog" : undefined}
        aria-modal={mobile && open ? true : undefined}
        aria-label="Workspace navigation"
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-slate-200 bg-white transition-transform lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex h-24 items-center justify-between px-7">
          <Link to={`/dashboard/${role}`} aria-label="Disha360 home">
            <Brand />
          </Link>
          <button
            className="icon-button lg:hidden"
            onClick={() => setOpen(false)}
            aria-label="Close navigation"
          >
            <X size={20} />
          </button>
        </div>
        <div className="mx-5 rounded-lg border border-indigo-100 bg-indigo-50/60 px-3 py-3">
          <span className="text-[10px] font-bold uppercase tracking-widest text-brand">
            Your workspace
          </span>
          <p className="mt-1 truncate text-sm font-semibold text-ink">
            {roleLabels[role]}
          </p>
        </div>
        <nav
          aria-label="Main navigation"
          className="mt-7 min-h-0 flex-1 overflow-y-auto space-y-1 px-4"
        >
          <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[.15em] text-slate-400">
            Workspace
          </p>
          <NavLink
            to={`/dashboard/${role}`}
            className={navClass}
            onClick={() => setOpen(false)}
          >
            <LayoutDashboard size={18} />
            Overview
          </NavLink>
          {(role === "student" ? student : staff).map(([label, Icon]) =>
            destinations[label] ? (
              <NavLink
                key={label}
                to={destinations[label]}
                className={navClass}
                onClick={() => setOpen(false)}
              >
                <Icon size={18} />
                {label}
              </NavLink>
            ) : (
              <button
                key={label}
                disabled
                title="Planned for a later checkpoint"
                className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm text-slate-400"
              >
                <Icon size={18} />
                {label}
              </button>
            ),
          )}
        </nav>
        <div className="m-5 rounded-xl bg-slate-50 p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
            <ShieldCheck size={16} />
            Authenticated workspace
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            {role === "student"
              ? "Your preparation records are private to your account."
              : "Student records are limited to your authorized staff scope."}
          </p>
        </div>
        <div className="border-t border-slate-100">
          {logoutError && (
            <p role="alert" className="px-5 pt-3 text-xs text-red-700">
              {logoutError}
            </p>
          )}
          <button
            onClick={() => void logout()}
            disabled={loggingOut}
            className="flex w-full items-center gap-3 px-7 py-5 text-sm font-medium text-slate-600"
          >
            <LogOut size={17} />
            {loggingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </aside>
      <div className="min-w-0 lg:pl-64" inert={mobile && open}>
        <header className="flex min-h-20 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              className="icon-button lg:hidden"
              onClick={() => setOpen(true)}
              aria-label="Open navigation"
              aria-expanded={open}
              aria-controls="workspace-navigation"
            >
              <Menu size={22} />
            </button>
            <span className="min-w-0 text-sm text-slate-500">
              <span className="hidden sm:inline">Workspace <span className="mx-2 text-slate-300">/</span></span>
              <span className="font-medium text-ink">
                {location.pathname.startsWith("/leaderboard")
                  ? "Leaderboard"
                  : location.pathname === "/achievements"
                    ? "Achievements"
                    : location.pathname.startsWith("/manage")
                      ? "Staff management"
                      : location.pathname.startsWith("/companies")
                        ? "Company preparation"
                        : location.pathname.startsWith("/learning")
                          ? "Learning modules"
                          : location.pathname.startsWith("/coding")
                            ? "Coding practice"
                            : location.pathname.startsWith("/resumes")
                              ? "Resume studio"
                              : location.pathname === "/resume-analyzer"
                                ? "ATS analyzer"
                                : location.pathname.startsWith("/interviews")
                                  ? "Mock interviews"
                                  : location.pathname.startsWith(
                                        "/assessments",
                                      ) ||
                                      location.pathname.startsWith("/attempts")
                                    ? "Assessments"
                                    : location.pathname === "/analytics"
                                      ? "Performance analytics"
                                      : "Overview"}
              </span>
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <div className="max-w-24 text-right sm:max-w-44">
              <p className="truncate text-xs font-semibold text-ink">
                {auth.user?.name}
              </p>
              <p className="mt-1 truncate text-[10px] text-slate-500">
                {roleLabels[role]}
              </p>
            </div>
            <span className="hidden h-9 w-9 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-brand sm:flex">
              {role === "student" ? "ST" : role === "trainer" ? "TF" : "AD"}
            </span>
          </div>
        </header>
        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto max-w-[1440px] p-4 sm:p-8 lg:p-9"
        >
          {children}
        </main>
        <footer className="flex flex-wrap justify-between gap-2 px-4 pb-6 text-xs text-slate-400 sm:px-8">
          <span>© {new Date().getFullYear()} Disha360</span>
          <span>Placement preparation, one step at a time.</span>
        </footer>
      </div>
    </div>
  );
}
