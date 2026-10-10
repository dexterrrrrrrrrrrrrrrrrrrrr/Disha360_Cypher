import { Link, useParams } from "react-router-dom";
import { AppLayout } from "../layouts/AppLayout";
import { useEngagementData } from "../hooks/useEngagementData";
import { PageHeading, ErrorNotice, Skeleton } from "../components/StudentUI";
import { BadgeGrid, EngagementStats } from "../components/EngagementSummary";
import type { Engagement } from "../types/engagement";
import type { Role } from "../types";
export function Achievements({ role = "student" }: { role?: Role }) {
  const { id } = useParams(),
    result = useEngagementData<Engagement>(
      role === "student" ? "/engagement" : `/engagement/${id}`,
      role,
    );
  return (
    <AppLayout role={role}>
      <PageHeading
        title={
          result.data?.displayName
            ? `${result.data.displayName} · Achievements`
            : "Your achievements"
        }
        detail="Real preparation milestones, clear criteria and meaningful activity streaks."
      />
      <Link
        className="mb-6 inline-block text-sm text-brand"
        to={role === "student" ? "/leaderboard" : `/manage/${role}/leaderboard`}
      >
        ← Back to leaderboard
      </Link>
      {result.error && (
        <ErrorNotice
          message={result.error}
          retry={() => void result.reload()}
        />
      )}{" "}
      {result.loading ? (
        <Skeleton />
      ) : (
        result.data && (
          <>
            <EngagementStats data={result.data} />
            <h2 className="my-5 font-semibold">Badge collection</h2>
            <BadgeGrid badges={result.data.badges} />
            <section className="card mt-6">
              <h2 className="font-semibold">How points and streaks work</h2>
              <p className="mt-3 text-sm leading-7 text-slate-600">
                {result.data.rules}
              </p>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Your current streak remains active through yesterday, so you
                have today to continue it. Missing a full UTC day resets the
                current streak. Your longest streak and earned badges remain.
                Learning completion reflects saved lesson marks, not an
                examination or guarantee of mastery.
              </p>
            </section>
          </>
        )
      )}
    </AppLayout>
  );
}
export function LeaderboardProfile() {
  const { id } = useParams(),
    result = useEngagementData<{
      displayName: string;
      totalPoints: number;
      completedAssessments: number;
      solvedCoding: number;
      completedModules: number;
      badges: { key: string; name: string }[];
      rules: string;
    }>(`/leaderboard/${id}`, "student");
  return (
    <AppLayout role="student">
      <PageHeading
        title={result.data?.displayName || "Leaderboard profile"}
        detail="Public preparation achievements only. Private performance details stay private."
      />
      <Link to="/leaderboard" className="mb-5 inline-block text-sm text-brand">
        ← Back to leaderboard
      </Link>
      {result.error && (
        <ErrorNotice
          message={result.error}
          retry={() => void result.reload()}
        />
      )}{" "}
      {result.loading ? (
        <Skeleton />
      ) : (
        result.data && (
          <>
            <section className="card">
              <p className="text-3xl font-bold text-brand">
                {result.data.totalPoints} points
              </p>
              <p className="mt-4 text-sm text-slate-600">
                {result.data.completedAssessments} assessments ·{" "}
                {result.data.solvedCoding} solved challenges ·{" "}
                {result.data.completedModules} completed modules
              </p>
            </section>
            <h2 className="my-5 font-semibold">Earned badges</h2>
            <BadgeGrid
              locked={false}
              badges={result.data.badges.map((b) => ({
                ...b,
                description: "Verified preparation milestone",
                unlocked: true,
                earnedAt: null,
              }))}
            />
          </>
        )
      )}
    </AppLayout>
  );
}
