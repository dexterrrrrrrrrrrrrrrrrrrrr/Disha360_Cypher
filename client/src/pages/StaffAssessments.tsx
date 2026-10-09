import { downloadStaffCSV } from "./StaffReports";
import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AppLayout } from "../layouts/AppLayout";
import {
  Empty,
  ErrorNotice,
  PageHeading,
  Skeleton,
} from "../components/StudentUI";
import { StaffAssignments } from "../components/StaffAssignments";
import { staffRequest, useStaffData } from "../hooks/useStaffData";
type Role = "trainer" | "admin";
type Config = {
  title: string;
  instructions: string;
  category: string;
  questionCount: number;
  durationSeconds: number;
  pointsPerCorrect: number;
  penaltyPerIncorrect: number;
  maxAttempts: number;
  opensAt: string | null;
  closesAt: string | null;
};
type Assessment = Config & {
  id: string;
  published: boolean;
  version: number;
  questionIds: string[];
  demo: boolean;
};
type Question = {
  id?: string;
  prompt: string;
  topic: string;
  difficulty: string;
  options: { id: string; text: string }[];
  correctOptionId: string;
  explanation: string;
  expectedSeconds: number;
  shuffleOptions: boolean;
};
const initial: Config = {
  title: "",
  instructions:
    "Choose one answer per question. The timer is enforced by the server.",
  category: "quantitative",
  questionCount: 1,
  durationSeconds: 600,
  pointsPerCorrect: 1,
  penaltyPerIncorrect: 0,
  maxAttempts: 3,
  opensAt: null,
  closesAt: null,
};
const newQuestion: Question = {
  prompt: "",
  topic: "",
  difficulty: "easy",
  options: ["a", "b", "c", "d"].map((id) => ({ id, text: "" })),
  correctOptionId: "a",
  explanation: "",
  expectedSeconds: 60,
  shuffleOptions: true,
};
function ConfigForm({
  value,
  disabled,
  onSave,
  busy,
}: {
  value: Config;
  disabled: boolean;
  onSave: (v: Config) => Promise<void>;
  busy: boolean;
}) {
  const [c, setC] = useState(value);
  function submit(e: FormEvent) {
    e.preventDefault();
    void onSave(c);
  }
  return (
    <form onSubmit={submit}>
      <fieldset
        disabled={disabled || busy}
        className="grid gap-4 sm:grid-cols-2"
      >
        <label className="text-sm font-medium sm:col-span-2">
          Assessment title
          <input
            className="input mt-2"
            required
            minLength={3}
            maxLength={200}
            value={c.title}
            onChange={(e) => setC({ ...c, title: e.target.value })}
          />
        </label>
        <label className="text-sm font-medium sm:col-span-2">
          Instructions
          <textarea
            className="input mt-2"
            required
            minLength={10}
            maxLength={3000}
            value={c.instructions}
            onChange={(e) => setC({ ...c, instructions: e.target.value })}
          />
        </label>
        <label className="text-sm font-medium">
          Category
          <select
            aria-label="Assessment category"
            className="input mt-2"
            value={c.category}
            onChange={(e) => setC({ ...c, category: e.target.value })}
          >
            {["quantitative", "logical", "verbal", "technical"].map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
        {(
          [
            ["questionCount", "Questions per attempt", 1, 100, 1],
            ["durationSeconds", "Duration (seconds)", 30, 7200, 1],
            ["pointsPerCorrect", "Points per correct answer", 0.1, 100, 0.1],
            ["penaltyPerIncorrect", "Penalty per wrong answer", 0, 100, 0.1],
            ["maxAttempts", "Maximum attempts", 1, 10, 1],
          ] as const
        ).map(([key, label, min, max, step]) => (
          <label className="text-sm font-medium" key={key}>
            {label}
            <input
              className="input mt-2"
              type="number"
              required
              min={min}
              max={max}
              step={step}
              value={c[key]}
              onChange={(e) => setC({ ...c, [key]: Number(e.target.value) })}
            />
          </label>
        ))}
        {(["opensAt", "closesAt"] as const).map((key) => (
          <label className="text-sm font-medium" key={key}>
            {key === "opensAt" ? "Opens at (optional)" : "Closes at (optional)"}
            <input
              className="input mt-2"
              type="datetime-local"
              defaultValue={
                c[key]
                  ? new Date(
                      new Date(c[key]!).getTime() -
                        new Date(c[key]!).getTimezoneOffset() * 60000,
                    )
                      .toISOString()
                      .slice(0, 16)
                  : ""
              }
              onChange={(e) =>
                setC({
                  ...c,
                  [key]: e.target.value
                    ? new Date(e.target.value).toISOString()
                    : null,
                })
              }
            />
          </label>
        ))}
        {!disabled && (
          <button
            className="btn-primary justify-self-start sm:col-span-2"
            disabled={busy}
          >
            {busy ? "Saving…" : "Save assessment"}
          </button>
        )}
      </fieldset>
      {disabled && (
        <p className="mt-4 text-sm text-slate-500">
          Published configuration is locked. Unpublish to edit; saved attempts
          keep their original rules and questions.
        </p>
      )}
    </form>
  );
}
function QuestionForm({
  initial,
  onSave,
  busy,
  onCancel,
}: {
  initial: Question;
  onSave: (q: Question) => Promise<void>;
  busy: boolean;
  onCancel?: () => void;
}) {
  const [q, setQ] = useState(initial);
  return (
    <form
      className="mt-6 space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void onSave(q);
      }}
    >
      <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium sm:col-span-2">
          Question prompt
          <textarea
            className="input mt-2"
            required
            minLength={5}
            maxLength={3000}
            value={q.prompt}
            onChange={(e) => setQ({ ...q, prompt: e.target.value })}
          />
        </label>
        <label className="text-sm font-medium">
          Topic
          <input
            className="input mt-2"
            required
            maxLength={100}
            value={q.topic}
            onChange={(e) => setQ({ ...q, topic: e.target.value })}
          />
        </label>
        <label className="text-sm font-medium">
          Difficulty
          <select
            aria-label="Question difficulty"
            className="input mt-2"
            value={q.difficulty}
            onChange={(e) => setQ({ ...q, difficulty: e.target.value })}
          >
            {["easy", "medium", "hard"].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        {q.options.map((o, i) => (
          <label className="text-sm font-medium" key={o.id}>
            Option {i + 1}
            <input
              className="input mt-2"
              required
              maxLength={1000}
              value={o.text}
              onChange={(e) =>
                setQ({
                  ...q,
                  options: q.options.map((x) =>
                    x.id === o.id ? { ...x, text: e.target.value } : x,
                  ),
                })
              }
            />
          </label>
        ))}
        <label className="text-sm font-medium">
          Correct option
          <select
            aria-label="Correct option"
            className="input mt-2"
            value={q.correctOptionId}
            onChange={(e) => setQ({ ...q, correctOptionId: e.target.value })}
          >
            {q.options.map((o, i) => (
              <option key={o.id} value={o.id}>
                Option {i + 1}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium">
          Expected time (seconds)
          <input
            className="input mt-2"
            type="number"
            required
            min={5}
            max={600}
            value={q.expectedSeconds}
            onChange={(e) =>
              setQ({ ...q, expectedSeconds: Number(e.target.value) })
            }
          />
        </label>
        <label className="text-sm font-medium sm:col-span-2">
          Answer explanation
          <textarea
            className="input mt-2"
            required
            maxLength={3000}
            value={q.explanation}
            onChange={(e) => setQ({ ...q, explanation: e.target.value })}
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={q.shuffleOptions}
            onChange={(e) => setQ({ ...q, shuffleOptions: e.target.checked })}
          />
          Randomize answer order
        </label>
      </fieldset>
      <div className="flex flex-wrap gap-3">
        <button className="btn-primary" disabled={busy}>
          {busy ? "Saving…" : initial.id ? "Save question" : "Add question"}
        </button>
        {onCancel && (
          <button className="btn-secondary" type="button" onClick={onCancel}>
            Cancel edit
          </button>
        )}
      </div>
    </form>
  );
}
export function StaffAssessments({ role }: { role: Role }) {
  const result = useStaffData<Assessment[]>("/assessments"),
    [search, setSearch] = useState(""),
    [published, setPublished] = useState("");
  const rows = result.data?.filter(
    (a) =>
      a.title.toLowerCase().includes(search.toLowerCase()) &&
      (!published || String(a.published) === published),
  );
  return (
    <AppLayout role={role}>
      <PageHeading
        title="Assessment management"
        detail={
          role === "admin"
            ? "Manage institutional assessments and question banks."
            : "Manage your assessments and assign them to authorized batches."
        }
      />
      <Link
        className="btn-primary mb-5 inline-block"
        to={`/manage/${role}/assessments/new`}
      >
        Create assessment
      </Link>
      <section className="card mb-6 grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium">
          Search assessments
          <input
            className="input mt-2"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label className="text-sm font-medium">
          Publication
          <select
            aria-label="Assessment publication"
            className="input mt-2"
            value={published}
            onChange={(e) => setPublished(e.target.value)}
          >
            <option value="">All</option>
            <option value="false">Draft</option>
            <option value="true">Published</option>
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
          {rows.map((a) => (
            <Link
              className="card"
              key={a.id}
              to={`/manage/${role}/assessments/${a.id}`}
            >
              <p className="text-xs font-semibold text-brand">
                {a.published ? "Published" : "Draft"}
                {a.demo ? " · Development sample" : ""}
              </p>
              <h2 className="mt-3 text-lg font-semibold">{a.title}</h2>
              <p className="mt-3 text-sm text-slate-500">
                {a.category} · {a.questionIds.length} bank questions ·{" "}
                {a.questionCount} per attempt · {a.durationSeconds}s
              </p>
            </Link>
          ))}
        </div>
      ) : (
        <Empty message="No matching authorized assessments. Create a draft to start." />
      )}
    </AppLayout>
  );
}
export function StaffAssessmentEditor({ role }: { role: Role }) {
  const { id } = useParams(),
    isNew = id === "new",
    nav = useNavigate(),
    result = useStaffData<{ assessment: Assessment; questions: Question[] }>(
      isNew ? null : `/assessments/${id}`,
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [edit, setEdit] = useState<Question | null>(null);
  const d = result.data,
    a = d?.assessment;
  async function mutate(operation: () => Promise<unknown>, message: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await operation();
      await result.reload();
      setEdit(null);
      setNotice(message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save.");
    } finally {
      setBusy(false);
    }
  }
  async function save(content: Config) {
    if (!isNew)
      return mutate(
        () =>
          staffRequest(`/assessments/${id}`, {
            method: "PUT",
            body: { version: a!.version, content },
          }),
        "Assessment saved.",
      );
    setBusy(true);
    setError("");
    try {
      const a = await staffRequest<Assessment>("/assessments", {
        method: "POST",
        body: content,
      });
      nav(`/manage/${role}/assessments/${a.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to create assessment.");
    } finally {
      setBusy(false);
    }
  }
  async function template() {
    try {
      const blob = await staffRequest<Blob>("/assessments/csv-template", {
        raw: true,
      });
      const url = URL.createObjectURL(blob),
        link = document.createElement("a");
      link.href = url;
      link.download = "disha360-question-template.csv";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to download template.");
    }
  }
  return (
    <AppLayout role={role}>
      <Link
        className="text-sm font-semibold text-brand"
        to={`/manage/${role}/assessments`}
      >
        ← All assessments
      </Link>
      <div className="mt-5">
        <PageHeading
          title={isNew ? "Create assessment" : a?.title || "Assessment editor"}
          detail="Staff-only answer keys. Published attempts retain their original snapshots."
        />
      </div>
      {error && <ErrorNotice message={error} />}{" "}
      {notice && (
        <p className="mb-5 text-sm text-emerald-700" role="status">
          {notice}
        </p>
      )}
      {result.error && (
        <ErrorNotice
          message={result.error}
          retry={() => void result.reload()}
        />
      )}
      {!isNew && result.loading ? (
        <Skeleton />
      ) : (
        (isNew || a) && (
          <>
            <section className="card">
              <h2 className="mb-5 text-lg font-semibold">Configuration</h2>
              <ConfigForm
                key={a?.version || "new"}
                value={a || initial}
                disabled={!!a?.published}
                busy={busy}
                onSave={save}
              />
              {a && (
                <button
                  className="btn-secondary mt-5"
                  disabled={busy}
                  onClick={() =>
                    void mutate(
                      () =>
                        staffRequest(`/assessments/${id}/publish`, {
                          method: "PUT",
                          body: { version: a.version, published: !a.published },
                        }),
                      a.published
                        ? "Assessment unpublished."
                        : "Assessment published.",
                    )
                  }
                >
                  {a.published ? "Unpublish assessment" : "Publish assessment"}
                </button>
              )}
            </section>
            {a && (
              <>
                <section className="card mt-6">
                  <h2 className="text-lg font-semibold">
                    Question bank ({d!.questions.length})
                  </h2>
                  <p className="mt-2 text-sm text-slate-500">
                    Exactly four options per question. Changes require an
                    unpublished assessment; staff ownership is checked on every
                    request.
                  </p>
                  {d!.questions.length ? (
                    <ul className="mt-5 space-y-5">
                      {d!.questions.map((q, i) => (
                        <li
                          className="border-b border-slate-100 pb-4"
                          key={q.id}
                        >
                          <h3 className="font-medium">
                            {i + 1}. {q.prompt}
                          </h3>
                          <p className="mt-1 text-xs text-slate-500">
                            {q.topic} · {q.difficulty}
                          </p>
                          <ol className="mt-3 space-y-1 text-sm">
                            {q.options.map((o) => (
                              <li key={o.id}>
                                {o.text}
                                {o.id === q.correctOptionId
                                  ? " ✓ Correct (staff only)"
                                  : ""}
                              </li>
                            ))}
                          </ol>
                          <p className="mt-3 text-sm text-slate-500">
                            {q.explanation}
                          </p>
                          {!a.published && (
                            <div className="mt-3 flex gap-4">
                              <button
                                className="text-sm font-semibold text-brand"
                                disabled={busy}
                                onClick={() => setEdit(q)}
                              >
                                Edit question {i + 1}
                              </button>
                              <button
                                className="text-sm font-semibold text-red-700"
                                disabled={busy}
                                onClick={() => {
                                  if (
                                    window.confirm(
                                      "Delete this bank question? Existing attempts remain unchanged.",
                                    )
                                  )
                                    void mutate(
                                      () =>
                                        staffRequest(
                                          `/assessments/${id}/questions/${q.id}`,
                                          {
                                            method: "DELETE",
                                            body: { version: a.version },
                                          },
                                        ),
                                      "Question deleted.",
                                    );
                                }}
                              >
                                Delete question {i + 1}
                              </button>
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="mt-5">
                      <Empty message="No questions yet. Add one or import a validated CSV file." />
                    </div>
                  )}
                  {!a.published && (
                    <QuestionForm
                      key={`${a.version}:${edit?.id || "new"}`}
                      initial={edit || newQuestion}
                      busy={busy}
                      onCancel={edit ? () => setEdit(null) : undefined}
                      onSave={(q) => {
                        const { id: qId, ...content } = q;
                        return mutate(
                          () =>
                            staffRequest(
                              `/assessments/${id}/questions${qId ? `/${qId}` : ""}`,
                              {
                                method: qId ? "PUT" : "POST",
                                body: { version: a.version, content },
                              },
                            ),
                          "Question saved.",
                        );
                      }}
                    />
                  )}
                </section>
                <section className="card mt-6">
                  <h2 className="mb-4 text-lg font-semibold">
                    CSV question import
                  </h2>
                  <p className="mb-4 text-sm text-slate-500">
                    UTF-8 CSV, at most 50,000 bytes and 100 rows. All rows are
                    validated; duplicate prompts or any invalid row reject the
                    whole import. Maximum assessment pool: 200 questions.
                  </p>
                  <button
                    className="btn-secondary"
                    onClick={() => void template()}
                  >
                    Download CSV template
                  </button>
                  {!a.published && (
                    <label className="mt-5 block text-sm font-medium">
                      Import CSV file
                      <input
                        className="input mt-2"
                        type="file"
                        accept=".csv,text/csv"
                        disabled={busy}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          e.target.value = "";
                          if (!file) return;
                          if (
                            file.size > 50000 ||
                            !file.name.toLowerCase().endsWith(".csv")
                          ) {
                            setError(
                              "Choose a .csv file no larger than 50,000 bytes.",
                            );
                            return;
                          }
                          void mutate(async () => {
                            const csv = await file.text();
                            return staffRequest(`/assessments/${id}/import`, {
                              method: "POST",
                              body: { version: a.version, csv },
                            });
                          }, "CSV questions imported.");
                        }}
                      />
                    </label>
                  )}
                </section>
                <StaffAssignments
                  kind="assessments"
                  id={a.id}
                  published={a.published}
                />
                <AssessmentResults id={a.id} />
              </>
            )}
          </>
        )
      )}
    </AppLayout>
  );
}
function AssessmentResults({ id }: { id: string }) {
  const [batch, setBatch] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const batches = useStaffData<{ id: string; name: string }[]>("/batches"),
    result = useStaffData<
      {
        studentId: string;
        name: string;
        email: string;
        status: string;
        attempts: {
          id: string;
          status: string;
          percentage: number | null;
          score: number | null;
          maximum: number | null;
        }[];
      }[]
    >(`/assessments/${id}/submissions${batch ? `?batchId=${batch}` : ""}`);
  return (
    <section className="card mt-6">
      <h2 className="mb-4 text-lg font-semibold">Submissions and scores</h2>
      {error && <ErrorNotice message={error} />}
      <button
        className="btn-secondary mb-4"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setError("");
          void downloadStaffCSV(
            `/assessments/${id}/results.csv${batch ? `?batchId=${batch}` : ""}`,
            "disha360-assessment-results.csv",
          )
            .catch((e) =>
              setError(e instanceof Error ? e.message : "Unable to export."),
            )
            .finally(() => setBusy(false));
        }}
      >
        {busy ? "Exporting…" : "Export assessment results"}
      </button>
      <p className="mb-4 text-sm text-slate-500">
        Authorized students only. Not started indicates no saved attempt, and
        does not imply an assignment. Scores appear only after finalization.
      </p>
      <label className="block text-sm font-medium">
        Batch filter
        <select
          aria-label="Submission batch filter"
          className="input my-3"
          value={batch}
          onChange={(e) => setBatch(e.target.value)}
        >
          <option value="">All authorized students</option>
          {batches.data?.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </label>
      {result.error && (
        <ErrorNotice
          message={result.error}
          retry={() => void result.reload()}
        />
      )}
      {result.loading ? (
        <Skeleton />
      ) : result.data?.length ? (
        <ul className="space-y-4">
          {result.data.map((s) => (
            <li
              className="border-b border-slate-100 pb-4 text-sm"
              key={s.studentId}
            >
              <p className="font-semibold">
                {s.name} · {s.status}
              </p>
              <p className="break-all text-xs text-slate-500">{s.email}</p>
              {s.attempts.map((t) => (
                <p className="mt-2" key={t.id}>
                  {t.status} ·{" "}
                  {t.percentage === null
                    ? "Score unavailable"
                    : `${t.score} / ${t.maximum} (${t.percentage}%)`}
                </p>
              ))}
            </li>
          ))}
        </ul>
      ) : (
        <Empty message="No authorized student records for this filter." />
      )}
    </section>
  );
}
