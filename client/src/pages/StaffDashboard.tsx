import { Link } from "react-router-dom";
import { AppLayout } from "../layouts/AppLayout";
import {
  PageHeading,
  Empty,
  Skeleton,
  ErrorNotice,
} from "../components/StudentUI";
import { useStaffData } from "../hooks/useStaffData";
export function StaffDashboard({ role }: { role: "trainer" | "admin" }) {
  const result = useStaffData<{
    scope: string;
    metrics: {
      students: number;
      trainers: number | null;
      batches: number;
      activeBatches: number;
      modules: number;
      publishedModules: number;
      assessments: number | null;
      assignedAssessments: number;
      assignmentRecords: number;
      completedAssignments: number;
    };
    learning: {
      recordedModules: number;
      completedModules: number;
      completedLessons: number;
      totalLessons: number;
      percent: number | null;
      description: string;
    };
    recentActivity: {
      id: string;
      studentName: string;
      title: string;
      at: string;
    }[];
  }>("/dashboard");
  const d = result.data;
  return (
    <AppLayout role={role}>
      <PageHeading
        title={role === "admin" ? "Admin overview" : "Trainer overview"}
        detail="Actual institution records and authorized student preparation activity."
      />
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
            <p className="mb-6 rounded-lg bg-indigo-50 p-4 text-sm text-indigo-900">
              {d.scope}. Empty metrics show zero; missing performance evidence
              is labeled.
            </p>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {(role === "admin"
                ? [
                    ["Total students", d.metrics.students],
                    ["Total trainers", d.metrics.trainers],
                    ["Total batches", d.metrics.batches],
                    ["Total assessments", d.metrics.assessments],
                    ["Total learning modules", d.metrics.modules],
                  ]
                : [
                    ["Assigned students", d.metrics.students],
                    ["Assigned active batches", d.metrics.batches],
                    ["Published learning modules", d.metrics.publishedModules],
                    ["Assigned assessments", d.metrics.assignedAssessments],
                  ]
              ).map(([label, value]) => (
                <section key={String(label)} className="card">
                  <h2 className="text-sm text-slate-500">{label}</h2>
                  <p className="mt-3 text-3xl font-bold text-ink">
                    {value ?? "—"}
                  </p>
                </section>
              ))}
            </div>
            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <section className="card">
                <h2 className="text-lg font-semibold">
                  Recorded learning completion
                </h2>
                <p className="mt-4 text-3xl font-bold text-brand">
                  {d.learning.percent === null
                    ? "No recorded progress"
                    : `${d.learning.percent}%`}
                </p>
                <p className="mt-3 text-sm text-slate-600">
                  {d.learning.completedLessons} of {d.learning.totalLessons}{" "}
                  recorded lessons complete · {d.learning.completedModules}{" "}
                  completed module records.
                </p>
                <p className="mt-2 text-xs leading-6 text-slate-500">
                  {d.learning.description}
                </p>
                <p className="mt-4 text-sm text-slate-600">
                  Assessment assignment records:{" "}
                  {d.metrics.completedAssignments} complete of{" "}
                  {d.metrics.assignmentRecords}.
                </p>
                <Link
                  className="btn-secondary mr-3 mt-5 inline-block"
                  to={`/manage/${role}/assessments`}
                >
                  Manage assessments
                </Link>
                <Link
                  className="btn-secondary mr-3 mt-5 inline-block"
                  to={`/manage/${role}/reports`}
                >
                  View reports
                </Link>
                {role === "admin" && (
                  <Link
                    className="btn-secondary mr-3 mt-5 inline-block"
                    to="/manage/admin/trainers"
                  >
                    Manage trainers
                  </Link>
                )}
                <Link
                  className="btn-secondary mr-3 mt-5 inline-block"
                  to={`/manage/${role}/batches`}
                >
                  View batches
                </Link>
                <Link
                  className="btn-secondary mr-3 mt-5 inline-block"
                  to={`/manage/${role}/students`}
                >
                  View students
                </Link>
                <Link
                  className="btn-secondary mt-5 inline-block"
                  to={`/learning/manage/${role}`}
                >
                  Manage learning content
                </Link>
              </section>
              <section className="card">
                <h2 className="mb-4 text-lg font-semibold">
                  Recent student activity
                </h2>
                {d.recentActivity.length ? (
                  <ul className="space-y-4">
                    {d.recentActivity.map((a) => (
                      <li
                        key={a.id}
                        className="border-b border-slate-100 pb-3 text-sm"
                      >
                        <p className="font-semibold">{a.studentName}</p>
                        <p className="mt-1 text-slate-600">{a.title}</p>
                        <time className="mt-1 block text-xs text-slate-400">
                          {new Date(a.at).toLocaleString()}
                        </time>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Empty message="No authorized learning, assessment, coding or check-in activity yet." />
                )}
              </section>
            </div>
          </>
        )
      )}
    </AppLayout>
  );
}
