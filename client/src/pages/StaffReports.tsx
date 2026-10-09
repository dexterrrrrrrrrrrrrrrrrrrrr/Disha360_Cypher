import { useState } from "react";
import { Link } from "react-router-dom";
import { AppLayout } from "../layouts/AppLayout";
import {
  Empty,
  ErrorNotice,
  PageHeading,
  Skeleton,
} from "../components/StudentUI";
import { staffRequest, useStaffData } from "../hooks/useStaffData";
export async function downloadStaffCSV(path: string, filename: string) {
  const blob = await staffRequest<Blob>(path, { raw: true });
  const url = URL.createObjectURL(blob),
    link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
type ReportRow = {
  studentId: string;
  name: string;
  email: string;
  assessments: {
    completedAttempts: number;
    averageScore: number | null;
    assigned: number;
    completedAssigned: number;
    completionPercent: number | null;
  };
  coding: { attempted: number; solved: number; solveRate: number | null };
  learning: {
    completedLessons: number;
    totalLessons: number;
    percent: number | null;
  };
  companies: { completed: number; total: number; percent: number | null };
};
export function StaffReports({ role }: { role: "trainer" | "admin" }) {
  const [batch, setBatch] = useState(""),
    [assessment, setAssessment] = useState(""),
    [trainer, setTrainer] = useState(""),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(1),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const options = useStaffData<{
    batches: { id: string; name: string; active: boolean }[];
    assessments: { id: string; title: string; published: boolean }[];
    trainers: { id: string; name: string }[];
  }>("/report-options");
  const params = new URLSearchParams({ page: String(page) });
  if (batch) params.set("batchId", batch);
  if (assessment) params.set("assessmentId", assessment);
  if (trainer) params.set("trainerId", trainer);
  if (search) params.set("search", search);
  const result = useStaffData<{
      rows: ReportRow[];
      total: number;
      page: number;
      totalPages: number;
      scope: string;
      rules: string;
    }>(`/reports?${params}`),
    percent = (n: number | null) => (n === null ? "Unavailable" : `${n}%`);
  async function exportCSV() {
    setBusy(true);
    setError("");
    try {
      params.delete("page");
      await downloadStaffCSV(
        `/reports/export?${params}`,
        "disha360-preparation-report.csv",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to export report.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <AppLayout role={role}>
      <PageHeading
        title="Reports & analytics"
        detail="Actual assessment, coding, learning and company checklist records. Missing evidence is shown explicitly."
      />
      <section className="card mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <label className="text-sm font-medium">
          Search students
          <input
            className="input mt-2"
            type="search"
            maxLength={100}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <label className="text-sm font-medium">
          Batch
          <select
            aria-label="Report batch"
            className="input mt-2"
            value={batch}
            onChange={(e) => {
              setBatch(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All authorized students</option>
            {options.data?.batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
                {b.active ? "" : " · archived"}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium">
          Assessment
          <select
            aria-label="Report assessment"
            className="input mt-2"
            value={assessment}
            onChange={(e) => {
              setAssessment(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All assessments</option>
            {options.data?.assessments.map((a) => (
              <option key={a.id} value={a.id}>
                {a.title}
              </option>
            ))}
          </select>
        </label>
        {role === "admin" && (
          <label className="text-sm font-medium">
            Trainer
            <select
              aria-label="Report trainer"
              className="input mt-2"
              value={trainer}
              onChange={(e) => {
                setTrainer(e.target.value);
                setBatch("");
                setPage(1);
              }}
            >
              <option value="">All trainers</option>
              {options.data?.trainers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </section>
      {options.error && (
        <ErrorNotice
          message={options.error}
          retry={() => void options.reload()}
        />
      )}{" "}
      {error && <ErrorNotice message={error} />}{" "}
      {result.error && (
        <ErrorNotice
          message={result.error}
          retry={() => void result.reload()}
        />
      )}
      {result.loading ? (
        <Skeleton />
      ) : (
        result.data && (
          <>
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-slate-500">
                {result.data.scope} · {result.data.total} students
              </p>
              <button
                className="btn-primary"
                disabled={busy}
                onClick={() => void exportCSV()}
              >
                {busy ? "Exporting…" : "Export filtered CSV"}
              </button>
            </div>
            <p className="mb-5 rounded-lg bg-indigo-50 p-4 text-xs leading-6 text-indigo-900">
              {result.data.rules} Export includes all filtered students (up to
              1,000), rather than just the current page.
            </p>
            {result.data.rows.length ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {result.data.rows.map((s) => (
                  <section className="card" key={s.studentId}>
                    <Link
                      className="text-lg font-semibold text-brand"
                      to={`/manage/${role}/students/${s.studentId}`}
                    >
                      {s.name}
                    </Link>
                    <p className="mt-1 break-all text-xs text-slate-500">
                      {s.email}
                    </p>
                    <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <dt className="text-xs text-slate-500">
                          Assessment average
                        </dt>
                        <dd className="mt-1 font-semibold">
                          {percent(s.assessments.averageScore)} ·{" "}
                          {s.assessments.completedAttempts} finalized
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-slate-500">
                          Assessment assignments
                        </dt>
                        <dd className="mt-1 font-semibold">
                          {s.assessments.completedAssigned}/
                          {s.assessments.assigned} complete
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-slate-500">
                          Coding challenges
                        </dt>
                        <dd className="mt-1 font-semibold">
                          {s.coding.solved}/{s.coding.attempted} solved ·{" "}
                          {percent(s.coding.solveRate)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-slate-500">Learning</dt>
                        <dd className="mt-1 font-semibold">
                          {s.learning.completedLessons}/
                          {s.learning.totalLessons} lessons ·{" "}
                          {percent(s.learning.percent)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-slate-500">
                          Company checklists
                        </dt>
                        <dd className="mt-1 font-semibold">
                          {s.companies.completed}/{s.companies.total} items ·{" "}
                          {percent(s.companies.percent)}
                        </dd>
                      </div>
                    </dl>
                  </section>
                ))}
              </div>
            ) : (
              <Empty message="No authorized students match these report filters." />
            )}
            <div className="mt-6 flex items-center justify-between gap-3">
              <button
                className="btn-secondary"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </button>
              <p className="text-sm">
                Page {result.data.page} of {result.data.totalPages}
              </p>
              <button
                className="btn-secondary"
                disabled={page >= result.data.totalPages}
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
