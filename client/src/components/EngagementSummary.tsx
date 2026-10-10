import { Link } from "react-router-dom";
import { Award, Flame, Lock, Trophy } from "lucide-react";
import type { Engagement, Badge } from "../types/engagement";
import { useEngagementData } from "../hooks/useEngagementData";
import { ErrorNotice, Skeleton, Empty } from "./StudentUI";
export function BadgeGrid({
  badges,
  locked = true,
}: {
  badges: Badge[];
  locked?: boolean;
}) {
  const visible = badges.filter((b) => locked || b.unlocked);
  return visible.length ? (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {visible.map((b) => (
        <section
          key={b.key}
          className={`rounded-xl border p-5 ${b.unlocked ? "border-indigo-200 bg-indigo-50" : "border-slate-200 bg-slate-50"}`}
        >
          <div className="flex items-start gap-3">
            {b.unlocked ? (
              <Award className="shrink-0 text-brand" aria-hidden="true" />
            ) : (
              <Lock className="shrink-0 text-slate-400" aria-hidden="true" />
            )}
            <div className="min-w-0">
              <h3 className="text-sm font-semibold">{b.name}</h3>
              <p className="mt-2 text-xs leading-5 text-slate-600">
                {b.description}
              </p>
              <p className="mt-3 text-xs font-semibold text-slate-500">
                {b.unlocked
                  ? `Earned${b.earnedAt ? " · " + b.earnedAt.slice(0, 10) + " UTC" : ""}`
                  : "Locked · keep preparing"}
              </p>
            </div>
          </div>
        </section>
      ))}
    </div>
  ) : (
    <Empty message="No badges earned yet. Complete an assessment, solve a challenge or finish a learning module to begin." />
  );
}
export function EngagementStats({ data }: { data: Engagement }) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "Total points",
            value: data.totalPoints,
            Icon: Trophy,
            note: "Unique verified achievements",
          },
          {
            label: "Current streak",
            value: `${data.streak.current} ${data.streak.current === 1 ? "day" : "days"}`,
            Icon: Flame,
            note: "Qualifying completions · UTC",
          },
          {
            label: "Longest streak",
            value: `${data.streak.longest} ${data.streak.longest === 1 ? "day" : "days"}`,
            Icon: Flame,
            note: "Consecutive UTC calendar days",
          },
          {
            label: "Earned badges",
            value: `${data.badges.filter((b) => b.unlocked).length}/${data.badges.length}`,
            Icon: Award,
            note: data.streak.lastActiveDay
              ? `Last active: ${data.streak.lastActiveDay} UTC`
              : "No qualifying activity yet",
          },
        ].map((x) => (
          <section key={x.label} className="card">
            <div className="flex items-center justify-between gap-2 text-sm text-slate-500">
              {x.label}
              <x.Icon size={18} className="text-brand" aria-hidden="true" />
            </div>
            <p className="my-3 text-3xl font-bold">{x.value}</p>
            <p className="text-xs text-slate-500">{x.note}</p>
          </section>
        ))}
      </div>
      <p className="my-5 text-sm text-slate-600">
        Assessments: {data.breakdown.assessments} points · Coding:{" "}
        {data.breakdown.coding} · Learning: {data.breakdown.learning}
      </p>
      {!!data.learningDatesUnknown && (
        <p className="mb-5 text-xs leading-6 text-amber-800">
          {data.learningDatesUnknown} older completed modules have no
          trustworthy completion date. Their points count, but they do not add
          historical streak days.
        </p>
      )}
    </>
  );
}
export function DashboardEngagement() {
  const result = useEngagementData<Engagement>("/engagement", "student");
  return (
    <section className="mt-6 space-y-4" aria-labelledby="engagement-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="engagement-heading" className="font-semibold">
          Achievements & meaningful streak
        </h2>
        <div className="flex gap-4 text-sm text-brand">
          <Link to="/achievements">All achievements →</Link>
          <Link to="/leaderboard">Leaderboard →</Link>
        </div>
      </div>
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
            <BadgeGrid badges={result.data.badges} locked={false} />
            <p className="text-xs leading-5 text-slate-500">
              Streaks count answered finalized assessments, first accepted
              coding solves and first full module completions. Login, visits and
              checklists earn no points or engagement streak days.
            </p>
          </>
        )
      )}
    </section>
  );
}
