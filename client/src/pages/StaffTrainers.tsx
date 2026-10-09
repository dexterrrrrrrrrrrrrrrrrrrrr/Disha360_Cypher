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
type Trainer = {
  id: string;
  name: string;
  email: string;
  batches: { id: string; name: string; active: boolean }[];
  activeBatches: number;
  students: number;
  modules: number;
  publishedModules: number;
  assessments: number;
  publishedAssessments: number;
  batchAssignments: number;
};
export function StaffTrainers() {
  const [search, setSearch] = useState(""),
    [trainer, setTrainer] = useState(""),
    [batch, setBatch] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const result = useStaffData<Trainer[]>(
      `/trainers?search=${encodeURIComponent(search)}`,
    ),
    batches =
      useStaffData<
        {
          id: string;
          name: string;
          active: boolean;
          trainerIds: string[];
          version: number;
        }[]
      >("/batches");
  async function assign(assigned: boolean, trainerId: string, batchId: string) {
    const b = batches.data?.find((b) => b.id === batchId);
    if (!b) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await staffRequest(`/trainers/${trainerId}/batches/${batchId}`, {
        method: "PUT",
        body: { assigned, version: b.version },
      });
      await Promise.all([result.reload(), batches.reload()]);
      setNotice(assigned ? "Trainer assigned." : "Trainer removed from batch.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to update assignment.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <AppLayout role="admin">
      <PageHeading
        title="Trainer management"
        detail="Real active batch memberships and owned content. Accounts are created with the existing secure operator command; roles cannot be changed here."
      />
      <section className="card mb-6">
        <label className="block text-sm font-medium">
          Search trainers
          <input
            className="input mt-2"
            type="search"
            maxLength={100}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setTrainer("");
            }}
          />
        </label>
        <form
          className="mt-5 grid items-end gap-4 md:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            void assign(true, trainer, batch);
          }}
        >
          <label className="text-sm font-medium">
            Trainer
            <select
              aria-label="Assign trainer"
              className="input mt-2"
              required
              value={trainer}
              onChange={(e) => setTrainer(e.target.value)}
            >
              <option value="">Choose trainer</option>
              {result.data?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium">
            Batch
            <select
              aria-label="Trainer assignment batch"
              className="input mt-2"
              required
              value={batch}
              onChange={(e) => setBatch(e.target.value)}
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
          <button
            className="btn-primary"
            disabled={
              busy || !trainer || !batch || batches.loading || result.loading
            }
          >
            {busy ? "Saving…" : "Assign trainer to batch"}
          </button>
        </form>
      </section>
      {error && <ErrorNotice message={error} />}{" "}
      {notice && (
        <p role="status" className="mb-5 text-sm text-emerald-700">
          {notice}
        </p>
      )}
      {batches.error && (
        <ErrorNotice
          message={batches.error}
          retry={() => void batches.reload()}
        />
      )}{" "}
      {result.error && (
        <ErrorNotice
          message={result.error}
          retry={() => void result.reload()}
        />
      )}
      {result.loading ? (
        <Skeleton />
      ) : result.data?.length ? (
        <div className="grid gap-5 xl:grid-cols-2">
          {result.data.map((t) => (
            <section className="card" key={t.id}>
              <h2 className="text-lg font-semibold">{t.name}</h2>
              <p className="mt-2 break-all text-xs text-slate-500">{t.email}</p>
              <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
                {[
                  ["Active assigned batches", t.activeBatches],
                  ["Unique assigned students", t.students],
                  ["Learning modules", t.modules],
                  ["Published modules", t.publishedModules],
                  ["Assessments", t.assessments],
                  ["Published assessments", t.publishedAssessments],
                  ["Assignments in active batches", t.batchAssignments],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs text-slate-500">{label}</dt>
                    <dd className="mt-1 font-semibold text-brand">{value}</dd>
                  </div>
                ))}
              </dl>
              <h3 className="mt-6 text-sm font-semibold">Assigned batches</h3>
              {t.batches.length ? (
                <ul className="mt-3 space-y-3">
                  {t.batches.map((b) => (
                    <li
                      className="flex flex-wrap items-center justify-between gap-3 text-sm"
                      key={b.id}
                    >
                      <Link
                        className="text-brand"
                        to={`/manage/admin/batches/${b.id}`}
                      >
                        {b.name}
                        {b.active ? "" : " · archived"}
                      </Link>
                      <button
                        className="font-semibold text-red-700"
                        disabled={busy || batches.loading}
                        onClick={() => {
                          if (
                            window.confirm(
                              `Remove ${t.name} from ${b.name}? Access will update immediately.`,
                            )
                          )
                            void assign(false, t.id, b.id);
                        }}
                      >
                        Remove trainer
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-slate-500">
                  No assigned batches.
                </p>
              )}
            </section>
          ))}
        </div>
      ) : (
        <Empty message="No matching Trainers. Use the documented user:create command to provision an account securely." />
      )}
    </AppLayout>
  );
}
