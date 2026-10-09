import { useState } from "react";
import { useStaffData } from "../hooks/useStaffData";
import { Empty, ErrorNotice, Skeleton } from "../components/StudentUI";
export function StaffLearningCompletion({ id }: { id: string }) {
  const [batch, setBatch] = useState("");
  const batches =
      useStaffData<{ id: string; name: string; active: boolean }[]>("/batches"),
    r = useStaffData<{
      published: boolean;
      rows: {
        studentId: string;
        name: string;
        department: string;
        recorded: boolean;
        completedLessons: number;
        totalLessons: number;
        percent: number;
      }[];
    }>(`/learning/${id}/completion${batch ? `?batchId=${batch}` : ""}`);
  return (
    <section className="card mt-6">
      <h2 className="mb-4 text-lg font-semibold">
        Assigned student completion
      </h2>
      <p className="mb-4 text-sm text-slate-500">
        Current members of active assigned batches. Lesson changes are reflected
        in the denominator; no saved progress means not started.
      </p>
      <label className="text-sm font-medium">
        Batch filter
        <select
          aria-label="Learning completion batch"
          className="input mt-2 mb-4"
          value={batch}
          onChange={(e) => setBatch(e.target.value)}
        >
          <option value="">All authorized assigned batches</option>
          {batches.data
            ?.filter((b) => b.active)
            .map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
        </select>
      </label>
      {r.error && (
        <ErrorNotice message={r.error} retry={() => void r.reload()} />
      )}
      {r.loading ? (
        <Skeleton />
      ) : r.data?.rows.length ? (
        <ul className="space-y-4">
          {r.data.rows.map((s) => (
            <li
              key={s.studentId}
              className="border-b border-slate-100 pb-3 text-sm"
            >
              <p className="font-semibold">
                {s.name} · {s.department}
              </p>
              <p className="mt-2 text-slate-500">
                {s.completedLessons}/{s.totalLessons} lessons · {s.percent}%
                {s.recorded ? "" : " · Not started"}
              </p>
              <progress
                aria-label={`${s.name} assigned completion`}
                className="mt-2 w-full accent-indigo-600"
                max={s.totalLessons || 1}
                value={s.completedLessons}
              />
            </li>
          ))}
        </ul>
      ) : (
        <Empty message="No students in authorized active batches assigned to this module." />
      )}
    </section>
  );
}
