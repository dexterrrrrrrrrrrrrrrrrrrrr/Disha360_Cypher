import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AppLayout } from "../layouts/AppLayout";
import {
  PageHeading,
  Empty,
  ErrorNotice,
  Skeleton,
} from "../components/StudentUI";
import { useLearningData } from "../hooks/useLearningData";
import { learningRequest } from "../services/learning";
export interface Lesson {
  id?: string;
  title: string;
  kind: "text" | "link";
  body: string;
  url: string;
}
export interface Module {
  id: string;
  title: string;
  subject: string;
  topic: string;
  description: string;
  objectives: string[];
  lessons: Lesson[];
  version: number;
  published: boolean;
  progress?: Progress;
}
interface Progress {
  completedLessonIds: string[];
  completedLessons: number;
  totalLessons: number;
  percent: number;
  lastLessonId: string | null;
}
export function Learning() {
  const [subject, setSubject] = useState(""),
    [topic, setTopic] = useState(""),
    [completed, setCompleted] = useState("");
  const data = useLearningData<{ modules: Module[] }>(
    `/modules?${new URLSearchParams({ ...(subject ? { subject } : {}), ...(topic ? { topic } : {}), ...(completed ? { completed } : {}) })}`,
  );
  return (
    <AppLayout role="student">
      <PageHeading
        title="Learning library"
        detail="Published lessons and trusted resource links, with your own saved progress."
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <label>
          <span className="field-label">Subject (exact match)</span>
          <input
            className="input"
            maxLength={100}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
        </label>
        <label>
          <span className="field-label">Topic (exact match)</span>
          <input
            className="input"
            maxLength={100}
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          />
        </label>
        <label>
          <span className="field-label">Completion</span>
          <select
            aria-label="Completion"
            className="input"
            value={completed}
            onChange={(e) => setCompleted(e.target.value)}
          >
            <option value="">All modules</option>
            <option value="true">Completed</option>
            <option value="false">Not completed</option>
          </select>
        </label>
      </div>
      {data.error && (
        <ErrorNotice message={data.error} retry={() => void data.reload()} />
      )}{" "}
      {data.loading && !data.data ? (
        <Skeleton />
      ) : data.data?.modules.length ? (
        <div className="grid gap-5 md:grid-cols-2">
          {data.data.modules.map((m) => (
            <section className="card break-words" key={m.id}>
              <p className="text-xs text-brand">
                {m.subject} · {m.topic}
              </p>
              <h2 className="my-3 font-semibold">{m.title}</h2>
              <p className="text-sm leading-6 text-slate-500">
                {m.description}
              </p>
              <p className="mt-4 text-xs text-slate-500">
                {m.progress!.completedLessons}/{m.progress!.totalLessons}{" "}
                lessons · {m.progress!.percent}% complete
              </p>
              <progress
                className="my-3 h-2 w-full accent-indigo-600"
                max={100}
                value={m.progress!.percent}
                aria-label={`${m.title} completion`}
              />
              <Link
                className="text-sm font-semibold text-brand"
                to={`/learning/${m.id}`}
              >
                {m.progress!.lastLessonId ? "Resume learning" : "Open module"} →
              </Link>
            </section>
          ))}
        </div>
      ) : (
        <Empty message="No published learning modules match. Your trainer can publish lessons and resources." />
      )}
    </AppLayout>
  );
}
export function LearningReader() {
  const { id } = useParams();
  const data = useLearningData<{ module: Module; progress: Progress }>(
    `/modules/${id}`,
  );
  const [active, setActive] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const m = data.data?.module,
    p = data.data?.progress;
  useEffect(() => {
    if (m && !m.lessons.some((l) => l.id === active))
      setActive(p?.lastLessonId || m.lessons[0]?.id || "");
  }, [m, p, active]);
  const lesson = m?.lessons.find((l) => l.id === active);
  async function visit(lessonId: string) {
    setBusy(true);
    setError("");
    try {
      await learningRequest(`/modules/${id}/lessons/${lessonId}/visit`, {
        method: "POST",
        body: {},
      });
      setActive(lessonId);
      await data.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Visit could not be saved.");
    } finally {
      setBusy(false);
    }
  }
  async function complete() {
    if (!lesson) return;
    setBusy(true);
    setError("");
    try {
      await learningRequest(`/modules/${id}/lessons/${lesson.id}/completion`, {
        method: "POST",
        body: { complete: !p?.completedLessonIds.includes(lesson.id!) },
      });
      await data.reload();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Completion could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <AppLayout role="student">
      <Link className="text-sm text-brand" to="/learning">
        ← Learning library
      </Link>
      <PageHeading
        title={m?.title || "Learning module"}
        detail={
          m
            ? `${m.subject} · ${m.topic} · ${p?.percent}% complete`
            : "Loading published content…"
        }
      />
      {(error || data.error) && (
        <ErrorNotice
          message={error || data.error}
          retry={() => void data.reload()}
        />
      )}{" "}
      {data.loading && !m ? (
        <Skeleton />
      ) : (
        m && (
          <>
            <section className="card mb-6">
              <p className="whitespace-pre-wrap break-words text-sm leading-7">
                {m.description}
              </p>
              <h2 className="mb-3 mt-5 text-sm font-semibold">
                Learning objectives
              </h2>
              <ul className="list-disc space-y-2 pl-5 text-sm text-slate-600">
                {m.objectives.map((o, i) => (
                  <li key={i}>{o}</li>
                ))}
              </ul>
            </section>
            <div className="grid items-start gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
              <nav aria-label="Lesson navigator" className="card space-y-2">
                {m.lessons.map((l, i) => (
                  <button
                    className={`w-full rounded p-3 text-left text-sm ${l.id === active ? "bg-indigo-50 text-brand" : "hover:bg-slate-50"}`}
                    disabled={busy}
                    key={l.id}
                    onClick={() => void visit(l.id!)}
                  >
                    {i + 1}. {l.title}
                    {p?.completedLessonIds.includes(l.id!) ? " ✓" : ""}
                  </button>
                ))}
              </nav>
              {lesson && (
                <section className="card min-w-0 break-words">
                  <h2 className="mb-5 text-xl font-semibold">{lesson.title}</h2>
                  <p className="whitespace-pre-wrap text-sm leading-8 text-slate-600">
                    {lesson.body}
                  </p>
                  {lesson.kind === "link" && (
                    <a
                      className="btn-secondary my-5 inline-block"
                      href={lesson.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open external resource ↗
                    </a>
                  )}
                  <div className="mt-8 flex flex-wrap items-center gap-4">
                    <button
                      className="btn-primary"
                      disabled={busy}
                      onClick={() => void complete()}
                    >
                      {busy
                        ? "Saving…"
                        : p?.completedLessonIds.includes(lesson.id!)
                          ? "Mark incomplete"
                          : "Mark lesson complete"}
                    </button>
                    <p role="status" className="text-xs text-slate-500">
                      {p?.completedLessons}/{p?.totalLessons} saved complete
                    </p>
                  </div>
                </section>
              )}
            </div>
          </>
        )
      )}
    </AppLayout>
  );
}
