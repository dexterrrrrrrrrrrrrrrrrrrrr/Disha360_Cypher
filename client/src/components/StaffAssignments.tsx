import { useState } from "react";
import { staffRequest, useStaffData } from "../hooks/useStaffData";
import { Empty, ErrorNotice, Skeleton } from "./StudentUI";
export function StaffAssignments({
  kind,
  id,
  published,
}: {
  kind: "assessments" | "learning";
  id: string;
  published: boolean;
}) {
  const base = `/${kind}/${id}/assignments`,
    records =
      useStaffData<
        {
          id: string;
          batchId: string;
          batchName: string;
          active: boolean;
          dueAt: string | null;
        }[]
      >(base),
    batches =
      useStaffData<{ id: string; name: string; active: boolean }[]>("/batches");
  const [batch, setBatch] = useState(""),
    [due, setDue] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  async function mutate(operation: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await operation();
      await records.reload();
      setNotice("Assignments saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save assignment.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card mt-6">
      <h2 className="mb-4 text-lg font-semibold">Batch assignments</h2>
      <p className="mb-4 text-sm text-slate-500">
        Assignments apply to current active members of active batches. Existing
        public published resources remain available to other students.
      </p>
      {error && <ErrorNotice message={error} />}{" "}
      {notice && (
        <p role="status" className="mb-4 text-sm text-emerald-700">
          {notice}
        </p>
      )}
      {records.error && (
        <ErrorNotice
          message={records.error}
          retry={() => void records.reload()}
        />
      )}
      {records.loading ? (
        <Skeleton />
      ) : records.data?.length ? (
        <ul className="mb-5 space-y-3">
          {records.data.map((r) => (
            <li
              className="flex flex-wrap items-center justify-between gap-3 text-sm"
              key={r.id}
            >
              <span>
                {r.batchName}
                {r.active ? "" : " · Archived"}
                {r.dueAt ? ` · Due ${new Date(r.dueAt).toLocaleString()}` : ""}
              </span>
              <button
                className="text-sm font-semibold text-red-700"
                disabled={busy}
                onClick={() => {
                  if (
                    window.confirm(
                      "Remove this batch assignment? Saved attempts and learning progress will remain.",
                    )
                  )
                    void mutate(() =>
                      staffRequest(`${base}/${r.batchId}`, {
                        method: "DELETE",
                        body: {},
                      }),
                    );
                }}
              >
                Remove assignment
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <Empty message="No authorized batch assignments yet." />
      )}
      {batches.error && (
        <ErrorNotice
          message={batches.error}
          retry={() => void batches.reload()}
        />
      )}
      {!published ? (
        <p className="mt-4 text-sm text-slate-500">
          Publish this resource before assigning it.
        </p>
      ) : (
        <form
          className="mt-5 grid items-end gap-4 md:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            void mutate(() =>
              staffRequest(base, {
                method: "POST",
                body: {
                  batchId: batch,
                  ...(kind === "assessments"
                    ? { dueAt: new Date(due).toISOString() }
                    : {}),
                },
              }),
            );
          }}
        >
          <label className="text-sm font-medium">
            Batch
            <select
              aria-label="Assignment batch"
              className="input mt-2"
              required
              value={batch}
              onChange={(e) => setBatch(e.target.value)}
              disabled={busy || batches.loading}
            >
              <option value="">Choose active batch</option>
              {batches.data
                ?.filter((b) => b.active)
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
            </select>
          </label>
          {kind === "assessments" && (
            <label className="text-sm font-medium">
              Task due date
              <input
                aria-label="Assignment due date"
                className="input mt-2"
                type="datetime-local"
                required
                value={due}
                onChange={(e) => setDue(e.target.value)}
              />
            </label>
          )}
          <button
            className="btn-primary"
            disabled={busy || !batch || batches.loading || !!batches.error}
          >
            {busy ? "Saving…" : "Assign to batch"}
          </button>
        </form>
      )}
    </section>
  );
}
