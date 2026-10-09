import { useState } from "react";
import { Link } from "react-router-dom";
import { AppLayout } from "../layouts/AppLayout";
import {
  Empty,
  ErrorNotice,
  PageHeading,
  Skeleton,
} from "../components/StudentUI";
import { useStaffData } from "../hooks/useStaffData";
export function StaffAssignmentDirectory({
  role,
}: {
  role: "trainer" | "admin";
}) {
  const result =
    useStaffData<
      {
        id: string;
        kind: string;
        resourceId: string;
        title: string;
        published: boolean;
        batchId: string;
        batchName: string;
        active: boolean;
        dueAt: string | null;
        canManage: boolean;
      }[]
    >("/assignments");
  const [search, setSearch] = useState(""),
    [kind, setKind] = useState("");
  const rows = result.data?.filter(
    (r) =>
      (!kind || r.kind === kind) &&
      `${r.title} ${r.batchName}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <AppLayout role={role}>
      <PageHeading
        title="Batch assignments"
        detail="Persistent assessment and learning assignments in your authorized batches."
      />
      <div className="mb-5 flex flex-wrap gap-3">
        <Link className="btn-secondary" to={`/manage/${role}/assessments`}>
          Manage assessments
        </Link>
        <Link className="btn-secondary" to={`/learning/manage/${role}`}>
          Manage learning content
        </Link>
      </div>
      <section className="card mb-6 grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium">
          Search assignments
          <input
            className="input mt-2"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label className="text-sm font-medium">
          Resource type
          <select
            aria-label="Assignment resource type"
            className="input mt-2"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            <option value="">All resources</option>
            <option value="assessment">Assessments</option>
            <option value="learning">Learning modules</option>
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
      ) : rows?.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {rows.map((r) => (
            <section className="card" key={r.id}>
              <p className="text-xs font-semibold text-brand">
                {r.kind} · {r.published ? "Published" : "Unpublished"}
                {r.active ? "" : " · Archived batch"}
              </p>
              <h2 className="mt-3 text-lg font-semibold">{r.title}</h2>
              <Link
                className="mt-3 inline-block text-sm text-brand"
                to={`/manage/${role}/batches/${r.batchId}`}
              >
                {r.batchName}
              </Link>
              {r.dueAt && (
                <p className="mt-3 text-sm text-slate-500">
                  Task due {new Date(r.dueAt).toLocaleString()}
                </p>
              )}
              {r.canManage ? (
                <Link
                  className="btn-secondary mt-4 inline-block"
                  to={
                    r.kind === "assessment"
                      ? `/manage/${role}/assessments/${r.resourceId}`
                      : `/learning/manage/${role}/${r.resourceId}`
                  }
                >
                  Manage assignment / completion
                </Link>
              ) : (
                <p className="mt-4 text-sm text-slate-500">
                  Published resource managed by another staff member. Student
                  results are available in your scoped reports.
                </p>
              )}
            </section>
          ))}
        </div>
      ) : (
        <Empty message="No matching authorized assignments. Assign published resources from their management pages." />
      )}
    </AppLayout>
  );
}
