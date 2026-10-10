import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AppLayout } from "../layouts/AppLayout";
import {
  Empty,
  ErrorNotice,
  PageHeading,
  Skeleton,
} from "../components/StudentUI";
import { staffRequest, useStaffData } from "../hooks/useStaffData";
type Role = "trainer" | "admin";
type Person = {
  id: string;
  name: string;
  email: string;
  department?: string;
  semester?: number;
};
type Batch = {
  id: string;
  name: string;
  description: string;
  active: boolean;
  version: number;
  trainerIds: string[];
  memberCount?: number;
  students?: Person[];
  trainers?: Person[];
};
function BatchFields({
  initial,
  trainers,
  onSave,
  busy,
}: {
  initial?: Batch;
  trainers: Person[];
  onSave: (body: {
    name: string;
    description: string;
    trainerIds: string[];
  }) => Promise<void>;
  busy: boolean;
}) {
  const [name, setName] = useState(initial?.name || ""),
    [description, setDescription] = useState(initial?.description || ""),
    [ids, setIds] = useState(initial?.trainerIds || []);
  async function submit(e: FormEvent) {
    e.preventDefault();
    await onSave({ name, description, trainerIds: ids });
  }
  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-4">
      <label className="block text-sm font-medium">
        Batch name
        <input
          className="input mt-2"
          required
          minLength={2}
          maxLength={100}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label className="block text-sm font-medium">
        Description
        <textarea
          className="input mt-2"
          maxLength={2000}
          aria-label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      <fieldset>
        <legend className="mb-3 text-sm font-medium">Assigned trainers</legend>
        {trainers.length ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {trainers.map((t) => (
              <label key={t.id} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={ids.includes(t.id)}
                  onChange={(e) =>
                    setIds(
                      e.target.checked
                        ? [...ids, t.id]
                        : ids.filter((id) => id !== t.id),
                    )
                  }
                />
                <span>
                  {t.name}
                  <span className="block break-all text-xs text-slate-500">
                    {t.email}
                  </span>
                </span>
              </label>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">
            No trainers available. Create a Trainer with the documented secure
            provisioning command.
          </p>
        )}
      </fieldset>
      <button className="btn-primary" disabled={busy}>
        {busy ? "Saving…" : initial ? "Save batch details" : "Create batch"}
      </button>
    </form>
  );
}
export function StaffBatches({ role }: { role: Role }) {
  const result = useStaffData<Batch[]>("/batches"),
    [show, setShow] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const nav = useNavigate();
  const choices = useStaffData<{ people: Person[]; truncated: boolean }>(
    role === "admin" ? "/people?role=trainer" : null,
  );
  async function create(body: {
    name: string;
    description: string;
    trainerIds: string[];
  }) {
    setBusy(true);
    setError("");
    try {
      const b = await staffRequest<Batch>("/batches", { method: "POST", body });
      nav(`/manage/${role}/batches/${b.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to create batch.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <AppLayout role={role}>
      <PageHeading
        title="Batches"
        detail={
          role === "admin"
            ? "Create student groups, assign trainers and maintain memberships. Archiving preserves existing progress."
            : "Your active assigned batches. Only Admins can change assignments and membership."
        }
      />
      {role === "admin" && (
        <button className="btn-primary mb-6" onClick={() => setShow(!show)}>
          {show ? "Close new batch form" : "New batch"}
        </button>
      )}
      {error && <ErrorNotice message={error} />}
      {show && (
        <section className="card mb-6">
          <h2 className="mb-5 text-lg font-semibold">Create a batch</h2>
          {choices.error ? (
            <ErrorNotice
              message={choices.error}
              retry={() => void choices.reload()}
            />
          ) : choices.loading ? (
            <Skeleton />
          ) : (
            <BatchFields
              trainers={choices.data?.people || []}
              onSave={create}
              busy={busy}
            />
          )}
        </section>
      )}
      {result.error && (
        <ErrorNotice
          message={result.error}
          retry={() => void result.reload()}
        />
      )}
      {result.loading ? (
        <Skeleton />
      ) : result.data?.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {result.data.map((b) => (
            <Link
              key={b.id}
              to={`/manage/${role}/batches/${b.id}`}
              className="card block hover:border-indigo-300"
            >
              <p className="mb-3 text-xs font-semibold text-brand">
                {b.active ? "Active batch" : "Archived batch"}
              </p>
              <h2 className="break-words text-lg font-semibold">{b.name}</h2>
              <p className="mt-2 line-clamp-3 text-sm text-slate-500">
                {b.description || "No description provided."}
              </p>
              <p className="mt-5 text-sm">
                {b.memberCount} students · {b.trainerIds.length} assigned
                trainers
              </p>
            </Link>
          ))}
        </div>
      ) : (
        <Empty
          message={
            role === "admin"
              ? "No batches yet. Create your first batch to organize students."
              : "No active batches assigned. Ask your Admin to assign a batch."
          }
        />
      )}
    </AppLayout>
  );
}
export function StaffBatchDetails({ role }: { role: Role }) {
  const { id } = useParams(),
    result = useStaffData<Batch>(`/batches/${id}`),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [student, setStudent] = useState(""),
    [search, setSearch] = useState("");
  const trainers = useStaffData<{ people: Person[]; truncated: boolean }>(
    role === "admin" ? "/people?role=trainer" : null,
  );
  const people = useStaffData<{ people: Person[]; truncated: boolean }>(
      role === "admin"
        ? `/people?role=student&search=${encodeURIComponent(search)}`
        : null,
    ),
    b = result.data;
  async function change(operation: () => Promise<unknown>, message: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await operation();
      await result.reload();
      setNotice(message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to update batch.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <AppLayout role={role}>
      <Link
        className="text-sm font-semibold text-brand"
        to={`/manage/${role}/batches`}
      >
        ← All batches
      </Link>
      <div className="mt-5">
        <PageHeading
          title={b?.name || "Batch details"}
          detail="Memberships and permissions are enforced by the server."
        />
      </div>
      {error && <ErrorNotice message={error} />}{" "}
      {notice && (
        <p
          role="status"
          className="mb-5 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800"
        >
          {notice}
        </p>
      )}
      {result.error && (
        <ErrorNotice
          message={result.error}
          retry={() => void result.reload()}
        />
      )}
      {result.loading ? (
        <Skeleton />
      ) : (
        b && (
          <div className="grid gap-6 xl:grid-cols-2">
            <section className="card">
              <h2 className="mb-5 text-lg font-semibold">Batch details</h2>
              {role === "admin" ? (
                trainers.error ? (
                  <ErrorNotice
                    message={trainers.error}
                    retry={() => void trainers.reload()}
                  />
                ) : trainers.loading ? (
                  <Skeleton />
                ) : (
                  <>
                    <BatchFields
                      key={`${b.id}:${b.version}`}
                      initial={b}
                      trainers={trainers.data?.people || []}
                      busy={busy}
                      onSave={(body) =>
                        change(
                          () =>
                            staffRequest(`/batches/${b.id}`, {
                              method: "PUT",
                              body: {
                                ...body,
                                active: b.active,
                                version: b.version,
                              },
                            }),
                          "Batch details saved.",
                        )
                      }
                    />
                    <p className="mt-5 text-sm text-slate-500">
                      Archiving revokes Trainer access while preserving
                      memberships and historical records.
                    </p>
                    <button
                      className="btn-secondary mt-3"
                      disabled={busy}
                      onClick={() => {
                        if (
                          window.confirm(
                            b.active
                              ? "Archive this batch? Assigned trainers will lose access to its students unless another assigned batch grants access."
                              : "Reactivate this batch?",
                          )
                        )
                          void change(
                            () =>
                              staffRequest(`/batches/${b.id}`, {
                                method: "PUT",
                                body: {
                                  name: b.name,
                                  description: b.description,
                                  trainerIds: b.trainerIds,
                                  active: !b.active,
                                  version: b.version,
                                },
                              }),
                            b.active ? "Batch archived." : "Batch reactivated.",
                          );
                      }}
                    >
                      {b.active ? "Archive batch" : "Reactivate batch"}
                    </button>
                  </>
                )
              ) : (
                <>
                  <p className="text-sm text-slate-600">
                    {b.description || "No description provided."}
                  </p>
                  <h3 className="mt-6 font-semibold">Assigned trainers</h3>
                  <ul className="mt-3 space-y-2 text-sm">
                    {b.trainers?.map((t) => (
                      <li key={t.id}>{t.name}</li>
                    ))}
                  </ul>
                </>
              )}
            </section>
            <section className="card">
              <h2 className="mb-5 text-lg font-semibold">
                Students ({b.students?.length || 0})
              </h2>
              {b.students?.length ? (
                <ul className="space-y-4">
                  {b.students.map((s) => (
                    <li
                      className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3"
                      key={s.id}
                    >
                      <div className="min-w-0">
                        <Link
                          className="font-medium text-brand"
                          to={`/manage/${role}/students/${s.id}`}
                        >
                          {s.name}
                        </Link>
                        <p className="break-all text-sm text-slate-500">
                          {s.email}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                          {s.department} · Semester {s.semester}
                        </p>
                      </div>
                      {role === "admin" && b.active && (
                        <button
                          className="text-sm font-semibold text-red-700"
                          disabled={busy}
                          onClick={() => {
                            if (
                              window.confirm(
                                `Remove ${s.name} from this batch?`,
                              )
                            )
                              void change(
                                () =>
                                  staffRequest(
                                    `/batches/${b.id}/members/${s.id}`,
                                    { method: "PUT", body: { active: false } },
                                  ),
                                "Student removed from batch.",
                              );
                          }}
                        >
                          Remove
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty message="No students in this batch yet." />
              )}
              {role === "admin" && b.active && (
                <div className="mt-6 space-y-3 border-t pt-5">
                  <h3 className="font-semibold">Add a student</h3>
                  <label className="block text-sm">
                    Find students
                    <input
                      className="input mt-2"
                      placeholder="Name or email"
                      value={search}
                      onChange={(e) => {
                        setSearch(e.target.value);
                        setStudent("");
                      }}
                    />
                  </label>
                  {people.error ? (
                    <ErrorNotice
                      message={people.error}
                      retry={() => void people.reload()}
                    />
                  ) : (
                    <>
                      <label className="block text-sm">
                        Select student
                        <select
                          aria-label="Select student"
                          className="input mt-2"
                          value={student}
                          onChange={(e) => setStudent(e.target.value)}
                          disabled={people.loading}
                        >
                          <option value="">
                            {people.loading ? "Loading…" : "Choose a student"}
                          </option>
                          {people.data?.people
                            .filter(
                              (s) =>
                                !b.students?.some(
                                  (member) => member.id === s.id,
                                ),
                            )
                            .map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name} ({s.email})
                              </option>
                            ))}
                        </select>
                      </label>
                      {people.data?.truncated && (
                        <p className="text-xs text-slate-500">
                          Showing the first 500 matches. Narrow your search.
                        </p>
                      )}
                      <button
                        className="btn-primary"
                        disabled={!student || busy || people.loading}
                        onClick={() =>
                          void change(
                            () =>
                              staffRequest(
                                `/batches/${b.id}/members/${student}`,
                                { method: "PUT", body: { active: true } },
                              ),
                            "Student added to batch.",
                          )
                        }
                      >
                        Add student
                      </button>
                    </>
                  )}
                </div>
              )}
            </section>
          </div>
        )
      )}
    </AppLayout>
  );
}
