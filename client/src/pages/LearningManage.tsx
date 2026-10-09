import { StaffAssignments } from "../components/StaffAssignments";
import { StaffLearningCompletion } from "./StaffLearningCompletion";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../features/auth/AuthProvider";
import { AppLayout } from "../layouts/AppLayout";
import {
  PageHeading,
  Empty,
  ErrorNotice,
  Skeleton,
} from "../components/StudentUI";
import { useLearningData } from "../hooks/useLearningData";
import { learningRequest } from "../services/learning";
import type { Lesson, Module } from "./Learning";
export function LearningManage() {
  const auth = useAuth();
  const role = auth.user!.role as "trainer" | "admin";
  const data = useLearningData<{ modules: Module[] }>("/manage/modules");
  return (
    <AppLayout role={role}>
      <PageHeading
        title="Learning content"
        detail={
          role === "admin"
            ? "Manage institutional modules and progress."
            : "Manage your own modules and view their student progress."
        }
      />
      <Link
        className="btn-primary mb-6 inline-block"
        to={`/learning/manage/${role}/new`}
      >
        Create module
      </Link>
      <p className="mb-5 rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
        Text and HTTPS resources supported. PDF uploads are unavailable until
        secure private storage is configured.
      </p>
      {data.error && <ErrorNotice message={data.error} />}{" "}
      {data.loading && !data.data ? (
        <Skeleton />
      ) : data.data?.modules.length ? (
        <div className="grid gap-5 md:grid-cols-2">
          {data.data.modules.map((m) => (
            <section className="card" key={m.id}>
              <p className="text-xs text-brand">
                {m.published ? "Published" : "Draft"} · {m.subject} · {m.topic}
              </p>
              <h2 className="my-3 font-semibold">{m.title}</h2>
              <p className="mb-4 text-xs text-slate-500">
                {m.lessons.length} lessons · Version {m.version}
              </p>
              <Link
                className="text-sm text-brand"
                to={`/learning/manage/${role}/${m.id}`}
              >
                Edit / publish / progress →
              </Link>
            </section>
          ))}
        </div>
      ) : (
        <Empty message="No authorized modules yet. Create your first draft." />
      )}
    </AppLayout>
  );
}
const initial = {
  title: "",
  subject: "",
  topic: "",
  description: "",
  objectives: [] as string[],
  lessons: [] as Lesson[],
};
export function LearningEditor() {
  const { id } = useParams();
  const isNew = id === "new";
  const auth = useAuth(),
    role = auth.user!.role as "trainer" | "admin";
  const navigate = useNavigate();
  const [module, setModule] = useState(initial);
  const [version, setVersion] = useState(0);
  const [published, setPublished] = useState(false);
  const [loading, setLoading] = useState(!isNew);
  const [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [progress, setProgress] = useState<
    | {
        student: { id: string; name: string; department: string };
        percent: number;
        completedLessons: number;
        totalLessons: number;
      }[]
    | null
  >(null);
  useEffect(() => {
    if (isNew) {
      setModule(initial);
      setVersion(0);
      setPublished(false);
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    void learningRequest<{ module: Module }>(`/manage/modules/${id}`)
      .then((r) => {
        if (alive) {
          const { title, subject, topic, description, objectives, lessons } =
            r.module;
          setModule({
            title,
            subject,
            topic,
            description,
            objectives,
            lessons,
          });
          setVersion(r.module.version);
          setPublished(r.module.published);
        }
      })
      .catch((e) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [id, isNew]);
  function editLesson(i: number, fields: Partial<Lesson>) {
    setModule((m) => ({
      ...m,
      lessons: m.lessons.map((l, n) => (n === i ? { ...l, ...fields } : l)),
    }));
  }
  async function save() {
    setBusy("save");
    setError("");
    setMessage("");
    try {
      const r = await learningRequest<{ module: Module }>(
        isNew ? "/manage/modules" : `/manage/modules/${id}`,
        {
          method: isNew ? "POST" : "PUT",
          body: {
            ...module,
            objectives: module.objectives.map((o) => o.trim()).filter(Boolean),
            ...(!isNew ? { version } : {}),
          },
        },
      );
      setModule({
        title: r.module.title,
        subject: r.module.subject,
        topic: r.module.topic,
        description: r.module.description,
        objectives: r.module.objectives,
        lessons: r.module.lessons,
      });
      setVersion(r.module.version);
      setPublished(r.module.published);
      setMessage("Module saved.");
      if (isNew)
        navigate(`/learning/manage/${role}/${r.module.id}`, { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setBusy("");
    }
  }
  async function publish() {
    setBusy("publish");
    setError("");
    try {
      const r = await learningRequest<{ module: Module }>(
        `/manage/modules/${id}/publication`,
        { method: "POST", body: { published: !published, version } },
      );
      setVersion(r.module.version);
      setPublished(r.module.published);
      setMessage(
        r.module.published ? "Saved module published." : "Module unpublished.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Publication failed.");
    } finally {
      setBusy("");
    }
  }
  async function loadProgress() {
    setBusy("progress");
    setError("");
    try {
      const r = await learningRequest<{
        progress: NonNullable<typeof progress>;
      }>(`/manage/modules/${id}/progress`);
      setProgress(r.progress);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load progress.");
    } finally {
      setBusy("");
    }
  }
  return (
    <AppLayout role={role}>
      <Link className="text-sm text-brand" to={`/learning/manage/${role}`}>
        ← Learning content
      </Link>
      <PageHeading
        title={isNew ? "Create learning module" : "Edit learning module"}
        detail={
          isNew
            ? "New content starts unpublished."
            : `Version ${version} · ${published ? "Published" : "Draft"} · Save edits before publishing.`
        }
      />
      {error && <ErrorNotice message={error} />}{" "}
      {message && (
        <p role="status" className="mb-5 text-sm text-emerald-700">
          {message}
        </p>
      )}
      {loading ? (
        <Skeleton />
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
          className="space-y-6"
        >
          <fieldset
            disabled={!!busy || (!isNew && version === 0)}
            className="space-y-6"
          >
            <section className="card grid gap-5 sm:grid-cols-2">
              {(["title", "subject", "topic"] as const).map((field) => (
                <label key={field}>
                  <span className="field-label capitalize">{field}</span>
                  <input
                    className="input"
                    required
                    minLength={field === "title" ? 3 : 2}
                    maxLength={field === "title" ? 200 : 100}
                    value={module[field]}
                    onChange={(e) =>
                      setModule((m) => ({ ...m, [field]: e.target.value }))
                    }
                  />
                </label>
              ))}
              <label className="sm:col-span-2">
                <span className="field-label">Description</span>
                <textarea
                  className="input min-h-24"
                  maxLength={3000}
                  value={module.description}
                  onChange={(e) =>
                    setModule((m) => ({ ...m, description: e.target.value }))
                  }
                />
              </label>
              <label className="sm:col-span-2">
                <span className="field-label">
                  Learning objectives (one per line)
                </span>
                <textarea
                  className="input"
                  value={module.objectives.join("\n")}
                  onChange={(e) =>
                    setModule((m) => ({
                      ...m,
                      objectives: e.target.value.split("\n"),
                    }))
                  }
                />
              </label>
            </section>
            <section className="card space-y-5">
              <h2 className="font-semibold">Lessons & resources</h2>
              {module.lessons.map((l, i) => (
                <div
                  className="space-y-4 rounded border border-slate-200 p-4"
                  key={l.id || i}
                >
                  <label>
                    <span className="field-label">Lesson {i + 1} title</span>
                    <input
                      className="input"
                      required
                      minLength={3}
                      maxLength={150}
                      value={l.title}
                      onChange={(e) => editLesson(i, { title: e.target.value })}
                    />
                  </label>
                  <label>
                    <span className="field-label">Content type</span>
                    <select
                      aria-label="Content type"
                      className="input"
                      value={l.kind}
                      onChange={(e) =>
                        editLesson(i, {
                          kind: e.target.value as Lesson["kind"],
                          url: "",
                        })
                      }
                    >
                      <option value="text">Text lesson</option>
                      <option value="link">External HTTPS resource</option>
                    </select>
                  </label>
                  <label>
                    <span className="field-label">
                      {l.kind === "text"
                        ? "Lesson content"
                        : "Resource notes (optional)"}
                    </span>
                    <textarea
                      className="input min-h-36"
                      required={l.kind === "text"}
                      maxLength={10000}
                      value={l.body}
                      onChange={(e) => editLesson(i, { body: e.target.value })}
                    />
                  </label>
                  {l.kind === "link" && (
                    <label>
                      <span className="field-label">Resource URL</span>
                      <input
                        type="url"
                        className="input"
                        required
                        maxLength={2000}
                        value={l.url}
                        onChange={(e) => editLesson(i, { url: e.target.value })}
                      />
                    </label>
                  )}
                  <button
                    type="button"
                    className="text-sm text-red-700"
                    onClick={() => {
                      if (
                        window.confirm(
                          "Remove this lesson? Saved progress for other lessons is preserved.",
                        )
                      )
                        setModule((m) => ({
                          ...m,
                          lessons: m.lessons.filter((_, n) => n !== i),
                        }));
                    }}
                  >
                    Remove lesson
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="btn-secondary"
                disabled={module.lessons.length >= 30}
                onClick={() =>
                  setModule((m) => ({
                    ...m,
                    lessons: [
                      ...m.lessons,
                      { title: "", kind: "text", body: "", url: "" },
                    ],
                  }))
                }
              >
                Add lesson
              </button>
              <p className="text-xs text-slate-500">
                Plain text is displayed safely; HTML is not rendered. Secure PDF
                uploads are unavailable.
              </p>
            </section>
            <div className="flex flex-wrap gap-3">
              <button className="btn-primary">
                {busy === "save" ? "Saving…" : "Save module"}
              </button>
              {!isNew && (
                <>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => void publish()}
                  >
                    {published
                      ? "Unpublish saved module"
                      : "Publish saved module"}
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => void loadProgress()}
                  >
                    View student progress
                  </button>
                </>
              )}
            </div>
          </fieldset>
        </form>
      )}
      {!isNew && !loading && (
        <>
          <StaffAssignments kind="learning" id={id!} published={published} />
          <StaffLearningCompletion id={id!} />
        </>
      )}
      {progress && (
        <section className="card mt-6 overflow-x-auto">
          <h2 className="mb-5 font-semibold">Authorized module progress</h2>
          {progress.length ? (
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Department</th>
                  <th>Lessons</th>
                  <th>Completion</th>
                </tr>
              </thead>
              <tbody>
                {progress.map((p) => (
                  <tr key={p.student.id} className="border-t border-slate-100">
                    <td className="py-4 pr-3">{p.student.name}</td>
                    <td className="pr-3">{p.student.department}</td>
                    <td className="pr-3">
                      {p.completedLessons}/{p.totalLessons}
                    </td>
                    <td>{p.percent}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Empty message="No students have started this module yet." />
          )}
        </section>
      )}
    </AppLayout>
  );
}
