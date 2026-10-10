import { it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import {
  BadgeGrid,
  DashboardEngagement,
} from "../src/components/EngagementSummary";
import { Leaderboard } from "../src/pages/Leaderboard";
import { Achievements } from "../src/pages/Achievements";
import type { Engagement } from "../src/types/engagement";
const hook = vi.hoisted(() => vi.fn());
vi.mock("../src/hooks/useEngagementData", () => ({ useEngagementData: hook }));
vi.mock("../src/layouts/AppLayout", () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => (
    <main>{children}</main>
  ),
}));
const summary: Engagement = {
  studentId: "fixture",
  totalPoints: 140,
  completedAssessments: 1,
  solvedCoding: 0,
  completedModules: 1,
  breakdown: { assessments: 100, coding: 0, learning: 40 },
  streak: {
    current: 1,
    longest: 1,
    lastActiveDay: "2026-10-10",
    timezone: "UTC",
  },
  badges: [
    {
      key: "first-assessment",
      name: "First Assessment Completed",
      description: "One actual assessment",
      unlocked: true,
      earnedAt: "2026-10-10T12:00:00Z",
    },
    {
      key: "first-code",
      name: "First Coding Challenge Solved",
      description: "One Accepted solution",
      unlocked: false,
      earnedAt: null,
    },
  ],
  rules: "No visits or checklists count.",
};
function render(node: React.ReactNode) {
  return renderToStaticMarkup(<MemoryRouter>{node}</MemoryRouter>);
}
beforeEach(() => {
  hook.mockImplementation((path: string) => ({
    data: path.includes("options")
      ? { batches: [] }
      : path.startsWith("/leaderboard?")
        ? {
            rows: [],
            currentStudent: null,
            total: 0,
            page: 1,
            totalPages: 1,
            scope: "Institution-wide",
            rules: summary.rules,
            tieRule: "Stable identity",
            statistics: null,
          }
        : summary,
    error: "",
    loading: false,
    reload: vi.fn(),
  }));
});
it("badge collection distinguishes earned from locked and compact display shows earned badges only", () => {
  const full = render(<BadgeGrid badges={summary.badges} />);
  expect(full).toContain("First Assessment Completed");
  expect(full).toContain("Locked · keep preparing");
  expect(full).toContain("2026-10-10 UTC");
  expect(
    render(<BadgeGrid badges={summary.badges} locked={false} />),
  ).not.toContain("First Coding Challenge Solved");
});
it("Student dashboard engagement displays actual totals and meaningful streak policy with working destination links", () => {
  const html = render(<DashboardEngagement />);
  expect(html).toContain("140");
  expect(html).toContain("Current streak");
  expect(html).toContain("Login, visits and checklists earn no points");
  expect(html).toContain('href="/leaderboard"');
});
it("no-data leaderboards provide a helpful empty state and Student achievements navigation", () => {
  const html = render(<Leaderboard />);
  expect(html).toContain("No eligible students");
  expect(html).toContain('href="/achievements"');
  expect(html).toContain("Leaderboard scope");
});
it("achievements expose point breakdown and UTC rules without pretending locked badges are earned", () => {
  const html = render(<Achievements />);
  expect(html).toContain("Assessments: 100 points");
  expect(html).toContain("Missing a full UTC day resets");
  expect(html).toContain("Locked · keep preparing");
});
it("loading and backend errors produce distinct accessible states", () => {
  hook.mockReturnValue({
    data: null,
    loading: true,
    error: "",
    reload: vi.fn(),
  });
  expect(render(<DashboardEngagement />)).toContain('aria-hidden="true"');
  hook.mockReturnValue({
    data: null,
    loading: false,
    error: "Batch access revoked.",
    reload: vi.fn(),
  });
  const html = render(<DashboardEngagement />);
  expect(html).toContain('role="alert"');
  expect(html).toContain("Batch access revoked.");
  expect(html).not.toContain("140");
});
