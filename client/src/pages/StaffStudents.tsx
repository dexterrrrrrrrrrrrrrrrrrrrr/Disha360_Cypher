import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AppLayout } from "../layouts/AppLayout";
import {
  Empty,
  ErrorNotice,
  PageHeading,
  Skeleton,
} from "../components/StudentUI";
import { useStaffData } from "../hooks/useStaffData";
type Role = "trainer" | "admin";
type Batch = { id: string; name: string; active: boolean };
type Student = {
  id: string;
  name: string;
  email: string;
  department: string;
  semester: number;
  batches: Batch[];
};
export function StaffStudents({ role }: { role: Role }) {
  const [search, setSearch] = useState(""),
    [department, setDepartment] = useState(""),
    [batch, setBatch] = useState(""),
    [page, setPage] = useState(1);
  const params = new URLSearchParams({ page: String(page) });
  if (search) params.set("search", search);
  if (department) params.set("department", department);
  if (batch) params.set("batchId", batch);
  const result = useStaffData<{
      students: Student[];
      total: number;
      page: number;
      totalPages: number;
      departments: string[];
      batches: Batch[];
    }>(`/students?${params}`),
    d = result.data;
  return (
    <AppLayout role={role}>
      <PageHeading
        title="Student directory"
        detail={
          role === "admin"
            ? "Institution-wide profiles, memberships and recorded preparation performance."
            : "Students in your active assigned batches. Private preparation content stays with its owner."
        }
      />
      <section className="card mb-6 grid gap-4 md:grid-cols-3">
        <label className="text-sm font-medium">
          Search students
          <input
            className="input mt-2"
            type="search"
            maxLength={100}
            placeholder="Name or email"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <label className="text-sm font-medium">
          Department
          <select
            className="input mt-2"
            aria-label="Department"
            value={department}
            onChange={(e) => {
              setDepartment(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All departments</option>
            {d?.departments.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium">
          Batch
          <select
            className="input mt-2"
            aria-label="Batch"
            value={batch}
            onChange={(e) => {
              setBatch(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All authorized students</option>
            {d?.batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
                {b.active ? "" : " (archived)"}
              </option>
            ))}
          </select>
        </label>
      </section>
      {result.error && (
        <ErrorNotice
          message={result.error}
          retry={() => void result.reload()}
        />
      )}
      {result.loading ? (
        <Skeleton />
      ) : (
        d && (
          <>
            <p className="mb-4 text-sm text-slate-500">
              {d.total} matching students
            </p>
            {d.students.length ? (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {d.students.map((s) => (
                  <Link
                    className="card hover:border-indigo-300"
                    key={s.id}
                    to={`/manage/${role}/students/${s.id}`}
                  >
                    <h2 className="text-lg font-semibold">{s.name}</h2>
                    <p className="mt-2 break-all text-sm text-slate-500">
                      {s.email}
                    </p>
                    <p className="mt-3 text-sm">
                      {s.department} · Semester {s.semester}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {s.batches.length ? (
                        s.batches.map((b) => (
                          <span
                            className="rounded-md bg-indigo-50 px-2 py-1 text-xs text-brand"
                            key={b.id}
                          >
                            {b.name}
                            {b.active ? "" : " · archived"}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-slate-400">
                          No active memberships
                        </span>
                      )}
                    </div>
                    <p className="mt-5 text-sm font-semibold text-brand">
                      View preparation performance →
                    </p>
                  </Link>
                ))}
              </div>
            ) : (
              <Empty message="No students match your filters. Trainers need an active batch assignment and enrolled students." />
            )}
            <div className="mt-6 flex items-center justify-between gap-3">
              <button
                className="btn-secondary"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </button>
              <p className="text-sm text-slate-500">
                Page {d.page} of {d.totalPages}
              </p>
              <button
                className="btn-secondary"
                disabled={page >= d.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </>
        )
      )}
    </AppLayout>
  );
}
type Details = {
  student: Student;
  batches: Batch[];
  assessments: {
    overview: {
      completedAttempts: number;
      averageScore: number | null;
      accuracy: number | null;
      evidence: string;
    };
    history: {
      id: string;
      title: string;
      percentage: number;
      finalizedAt: string;
    }[];
    topics: {
      key: string;
      topic: string;
      questions: number;
      accuracy: number;
      classification: string;
    }[];
  };
  coding: {
    judged: number;
    attempted: number;
    solved: number;
    solveRate: number | null;
    history: {
      id: string;
      title: string;
      language: string;
      verdict: string | null;
      score: number | null;
    }[];
  };
  learning: {
    completedLessons: number;
    totalLessons: number;
    percent: number | null;
    records: {
      id: string;
      title: string;
      completedLessons: number;
      totalLessons: number;
    }[];
  };
  companies:
    | {
        id: string;
        name: string;
        completed: number;
        total: number;
        percent: number;
        recorded: boolean;
      }[]
    | null;
};
export function StaffStudentDetails({ role }: { role: Role }) {
  const { id } = useParams(),
    result = useStaffData<Details>(`/students/${id}`),
    d = result.data;
  const percent = (n: number | null) =>
    n === null ? "No scored data" : `${n}%`;
  return (
    <AppLayout role={role}>
      <Link
        className="text-sm font-semibold text-brand"
        to={`/manage/${role}/students`}
      >
        ← Student directory
      </Link>
      <div className="mt-5">
        <PageHeading
          title={d?.student.name || "Student profile"}
          detail="Saved assessment, coding and learning records. These metrics are not an AI readiness evaluation."
        />
      </div>
      {result.error && (
        <ErrorNotice
          message={result.error}
          retry={() => void result.reload()}
        />
      )}
      {result.loading ? (
        <Skeleton />
      ) : (
        d && (
          <>
            <section className="card mb-6">
              <p className="break-all text-sm text-slate-600">
                {d.student.email}
              </p>
              <p className="mt-2 text-sm">
                {d.student.department} · Semester {d.student.semester}
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                {d.batches.length ? (
                  d.batches.map((b) => (
                    <Link
                      key={b.id}
                      className="rounded-md bg-indigo-50 px-3 py-2 text-sm text-brand"
                      to={`/manage/${role}/batches/${b.id}`}
                    >
                      {b.name}
                      {b.active ? "" : " · archived"}
                    </Link>
                  ))
                ) : (
                  <p className="text-sm text-slate-500">
                    No authorized batch memberships.
                  </p>
                )}
              </div>
              {role === "admin" && (
                <Link
                  className="btn-secondary mt-5 inline-block"
                  to="/manage/admin/batches"
                >
                  Manage batch membership
                </Link>
              )}
            </section>
            <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {[
                [
                  "Assessment average",
                  percent(d.assessments.overview.averageScore),
                ],
                [
                  "Finalized assessments",
                  String(d.assessments.overview.completedAttempts),
                ],
                ["Solved coding problems", String(d.coding.solved)],
                [
                  "Recorded learning completion",
                  d.learning.percent === null
                    ? "No learning data"
                    : `${d.learning.percent}%`,
                ],
              ].map(([label, value]) => (
                <section className="card" key={label}>
                  <h2 className="text-sm text-slate-500">{label}</h2>
                  <p className="mt-3 text-2xl font-bold text-brand">{value}</p>
                </section>
              ))}
            </div>
            <div className="grid gap-6 xl:grid-cols-2">
              <section className="card">
                <h2 className="mb-4 text-lg font-semibold">
                  Assessment performance
                </h2>
                <p className="mb-4 text-sm text-slate-500">
                  Evidence:{" "}
                  {d.assessments.overview.evidence.replaceAll("-", " ")}.
                  Question keys and answer snapshots are excluded.
                </p>
                {d.assessments.history.length ? (
                  <ul className="space-y-4">
                    {d.assessments.history.map((a) => (
                      <li
                        className="flex justify-between gap-4 border-b border-slate-100 pb-3 text-sm"
                        key={a.id}
                      >
                        <div>
                          <p className="font-medium">{a.title}</p>
                          <time className="mt-1 block text-xs text-slate-400">
                            {new Date(a.finalizedAt).toLocaleDateString()}
                          </time>
                        </div>
                        <span className="font-semibold text-brand">
                          {a.percentage}%
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Empty message="No finalized assessments yet." />
                )}
                {d.assessments.topics.length > 0 && (
                  <div className="mt-6">
                    <h3 className="mb-3 font-semibold">Topic accuracy</h3>
                    <ul className="space-y-3">
                      {d.assessments.topics.map((t) => (
                        <li className="text-sm" key={t.key}>
                          {t.topic}: {t.accuracy}% ({t.questions} questions)
                          <p className="text-xs text-slate-500">
                            {t.classification === "insufficient"
                              ? "Insufficient evidence for a strength or weakness conclusion"
                              : t.classification.replaceAll("-", " ")}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
              <section className="card">
                <h2 className="mb-4 text-lg font-semibold">Coding progress</h2>
                <p className="mb-4 text-sm text-slate-500">
                  {d.coding.judged} scored submissions · {d.coding.solved} of{" "}
                  {d.coding.attempted} attempted problems solved. Solve rate:{" "}
                  {percent(d.coding.solveRate)}.
                </p>
                {d.coding.history.length ? (
                  <ul className="space-y-4">
                    {d.coding.history.map((s) => (
                      <li
                        className="border-b border-slate-100 pb-3 text-sm"
                        key={s.id}
                      >
                        <p className="font-medium">{s.title}</p>
                        <p className="mt-1 text-slate-500">
                          {s.language} · {s.verdict || "Verdict unavailable"} ·{" "}
                          {s.score === null ? "Not scored" : `${s.score}%`}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Empty message="No completed coding submissions yet. Provider failures are not counted as scored attempts." />
                )}
              </section>
              <section className="card">
                <h2 className="mb-4 text-lg font-semibold">
                  Learning progress
                </h2>
                <p className="mb-4 text-sm text-slate-500">
                  {d.learning.completedLessons} of {d.learning.totalLessons}{" "}
                  lessons complete among saved records. Currently unpublished
                  modules are excluded; this is not the entire assigned
                  curriculum.
                </p>
                {d.learning.records.length ? (
                  <ul className="space-y-4">
                    {d.learning.records.map((p) => (
                      <li key={p.id} className="text-sm">
                        <p className="font-medium">{p.title}</p>
                        <p className="mt-1 text-slate-500">
                          {p.completedLessons} / {p.totalLessons} lessons
                        </p>
                        <progress
                          className="mt-2 w-full accent-indigo-600"
                          aria-label={`${p.title} completion`}
                          max={p.totalLessons}
                          value={p.completedLessons}
                        />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Empty message="No recorded progress on available learning modules." />
                )}
              </section>
              {d.companies !== null && (
                <section className="card">
                  <h2 className="mb-4 text-lg font-semibold">
                    Company preparation
                  </h2>
                  <p className="mb-4 text-sm text-slate-500">
                    Self-reported checklist completion for published company
                    profiles.
                  </p>
                  {d.companies.length ? (
                    <ul className="space-y-4">
                      {d.companies.map((c) => (
                        <li className="text-sm" key={c.id}>
                          <p className="font-medium">
                            {c.name} · {c.percent}%
                          </p>
                          <p className="mt-1 text-slate-500">
                            {c.completed} / {c.total} checklist items
                            {c.recorded ? "" : " · Not started"}
                          </p>
                          <progress
                            className="mt-2 w-full accent-indigo-600"
                            aria-label={`${c.name} preparation`}
                            max={c.total || 1}
                            value={c.completed}
                          />
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <Empty message="No published company profiles available." />
                  )}
                </section>
              )}
            </div>
          </>
        )
      )}
    </AppLayout>
  );
}
