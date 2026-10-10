import { useState } from "react";
import { Link } from "react-router-dom";
import { Trophy, Award } from "lucide-react";
import { AppLayout } from "../layouts/AppLayout";
import { useEngagementData } from "../hooks/useEngagementData";
import {
  PageHeading,
  ErrorNotice,
  Skeleton,
  Empty,
} from "../components/StudentUI";
import type { Role } from "../types";
import type { LeaderboardData } from "../types/engagement";
export function Leaderboard({ role = "student" }: { role?: Role }) {
  const [batch, setBatch] = useState(""),
    [page, setPage] = useState(1),
    [showRules, setShowRules] = useState(false);
  const options = useEngagementData<{
      batches: { id: string; name: string }[];
    }>("/leaderboard/options", role),
    params = new URLSearchParams({ page: String(page) });
  if (batch) params.set("batchId", batch);
  const result = useEngagementData<LeaderboardData>(
      `/leaderboard?${params}`,
      role,
    ),
    data = result.data;
  return (
    <AppLayout role={role}>
      <PageHeading
        title="Leaderboard"
        detail="Preparation points from actual assessments, accepted coding solutions and completed learning modules."
      />
      <section className="card mb-6 flex flex-wrap items-end justify-between gap-4">
        <label className="w-full text-sm font-medium sm:w-auto">
          Leaderboard scope
          <select
            aria-label="Leaderboard scope"
            className="input mt-2 sm:min-w-64"
            value={batch}
            disabled={options.loading}
            onChange={(e) => {
              setBatch(e.target.value);
              setPage(1);
            }}
          >
            <option value="">
              {role === "trainer"
                ? "All assigned active batches"
                : "Global · institution-wide"}
            </option>
            {options.data?.batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap gap-4 text-sm">
          <button
            className="text-brand"
            onClick={() => setShowRules(!showRules)}
            aria-expanded={showRules}
          >
            {showRules ? "Hide scoring rules" : "How points work"}
          </button>
          {role === "student" && (
            <Link to="/achievements" className="font-semibold text-brand">
              My achievements →
            </Link>
          )}
          <button
            className="btn-secondary"
            disabled={result.loading}
            onClick={() => void result.reload()}
          >
            Refresh rankings
          </button>
        </div>
      </section>
      {options.error && (
        <ErrorNotice
          message={options.error}
          retry={() => void options.reload()}
        />
      )}{" "}
      {result.error && (
        <ErrorNotice
          message={result.error}
          retry={() => void result.reload()}
        />
      )}{" "}
      {result.loading ? (
        <Skeleton />
      ) : (
        data && (
          <>
            {showRules && (
              <section className="card mb-6 text-sm leading-7 text-slate-600">
                <h2 className="font-semibold text-ink">Transparent scoring</h2>
                <p className="mt-2">{data.rules}</p>
                <p className="mt-3">Tie order: {data.tieRule}</p>
                <p className="mt-3">
                  All points are recomputed by the backend. A recorded learning
                  completion is a self-marked learning milestone, not proof of
                  mastery.
                </p>
              </section>
            )}
            {data.currentStudent && (
              <section className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-indigo-200 bg-indigo-50 p-5">
                <div className="flex items-center gap-3">
                  <Trophy className="text-brand" aria-hidden="true" />
                  <div>
                    <h2 className="text-sm font-semibold">
                      Your rank · #{data.currentStudent.rank}
                    </h2>
                    <p className="mt-1 text-xs text-slate-600">
                      {data.scope} · {data.total} students
                    </p>
                  </div>
                </div>
                <p className="text-2xl font-bold text-brand">
                  {data.currentStudent.totalPoints} points
                </p>
              </section>
            )}
            {data.statistics && (
              <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  {
                    label: "Students in scope",
                    value: data.statistics.students,
                  },
                  {
                    label: "Students with achievements",
                    value: data.statistics.engagedStudents,
                  },
                  {
                    label: "Total verified points",
                    value: data.statistics.totalPoints,
                  },
                  {
                    label: "Earned badge awards",
                    value: data.statistics.badgeAwards,
                  },
                ].map((s) => (
                  <section className="card" key={s.label}>
                    <p className="text-xs text-slate-500">{s.label}</p>
                    <p className="mt-3 text-2xl font-bold">{s.value}</p>
                  </section>
                ))}
              </div>
            )}
            {!data.rows.length ? (
              <Empty message="No eligible students are in this leaderboard. Active batch members will appear when memberships are assigned." />
            ) : (
              <>
                <p className="mb-4 text-xs text-slate-500">
                  {data.scope} · {data.total} students · {data.tieRule}
                </p>
                {data.rows.every((r) => r.totalPoints === 0) && (
                  <p className="mb-4 rounded-lg bg-slate-100 p-4 text-sm text-slate-600">
                    These students have no points in this view yet. Complete
                    qualifying preparation activities to begin earning points.
                  </p>
                )}
                <div className="space-y-3">
                  {data.rows.map((row) => (
                    <section
                      className="card grid gap-4 sm:grid-cols-[3rem_minmax(0,1fr)_6rem]"
                      key={row.studentId}
                    >
                      <p
                        className="text-xl font-bold text-slate-400"
                        aria-label={`Rank ${row.rank}`}
                      >
                        #{row.rank}
                      </p>
                      <div className="min-w-0">
                        <Link
                          className="break-words font-semibold text-ink hover:text-brand"
                          to={
                            role === "student"
                              ? `/leaderboard/${row.studentId}`
                              : `/manage/${role}/achievements/${row.studentId}`
                          }
                        >
                          {row.displayName}
                        </Link>
                        <p className="mt-2 text-xs leading-6 text-slate-500">
                          {row.completedAssessments} assessments ·{" "}
                          {row.solvedCoding} solved coding challenges ·{" "}
                          {row.completedModules} modules
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {row.badges.length ? (
                            row.badges.map((b) => (
                              <span
                                className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-3 py-1 text-xs text-indigo-800"
                                key={b.key}
                              >
                                <Award size={12} aria-hidden="true" />
                                {b.name}
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-slate-400">
                              No earned badges yet
                            </span>
                          )}
                        </div>
                      </div>
                      <p className="font-semibold text-brand sm:text-right">
                        {row.totalPoints}
                        <span className="ml-1 text-xs font-normal">points</span>
                      </p>
                    </section>
                  ))}
                </div>
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm">
                  <button
                    className="btn-secondary"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Previous
                  </button>
                  <p>
                    Page {data.page} of {data.totalPages}
                  </p>
                  <button
                    className="btn-secondary"
                    disabled={page >= data.totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </button>
                </div>
              </>
            )}
          </>
        )
      )}
    </AppLayout>
  );
}
