import { useState, useRef } from "react";
import { Link, useParams } from "react-router-dom";
import { AppLayout } from "../layouts/AppLayout";
import {
  PageHeading,
  Empty,
  ErrorNotice,
  Skeleton,
} from "../components/StudentUI";
import { useStudentData } from "../hooks/useStudentData";
import { studentRequest } from "../services/student";
import { Workspace } from "./CodingWorkspace";
import type { Language } from "../features/coding/templates";
interface Problem {
  id: string;
  title: string;
  difficulty: string;
  topic: string;
  supportedLanguages: Language[];
  statement: string;
  inputFormat: string;
  outputFormat: string;
  constraints: string;
  examples: { input: string; output: string; explanation: string }[];
  demo: boolean;
  solved?: boolean;
}
interface Submission {
  id: string;
  problemId: string;
  title: string;
  language: string;
  status: string;
  verdict: string | null;
  score: number | null;
  passed: number;
  total: number;
  timeSeconds: number | null;
  memoryKb: number | null;
  createdAt: string;
}
export function CodingProblems() {
  const [difficulty, setDifficulty] = useState("");
  const [topic, setTopic] = useState("");
  const data = useStudentData<{ problems: Problem[] }>(
    `/coding/problems?${new URLSearchParams({ ...(difficulty ? { difficulty } : {}), ...(topic ? { topic } : {}) })}`,
  );
  return (
    <AppLayout role="student">
      <PageHeading
        title="Coding challenges"
        detail="Practise published problems and track real isolated-judge submissions."
      />
      <div className="mb-6 flex flex-wrap gap-4">
        <Link className="btn-secondary" to="/coding">
          Open workspace
        </Link>
        <Link className="btn-secondary" to="/coding/submissions">
          Submission history
        </Link>
      </div>
      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <label>
          <span className="field-label">Difficulty</span>
          <select
            aria-label="Difficulty"
            className="input"
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value)}
          >
            <option value="">All difficulties</option>
            {["easy", "medium", "hard"].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="field-label">Topic (exact match)</span>
          <input
            className="input"
            value={topic}
            maxLength={100}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g. Strings"
          />
        </label>
      </div>
      {data.error && (
        <ErrorNotice message={data.error} retry={() => void data.reload()} />
      )}{" "}
      {data.loading && !data.data ? (
        <Skeleton />
      ) : data.data?.problems.length ? (
        <div className="grid gap-5 md:grid-cols-2">
          {data.data.problems.map((p) => (
            <section className="card" key={p.id}>
              <p className="text-xs capitalize text-brand">
                {p.difficulty} · {p.topic} ·{" "}
                {p.solved ? "Solved" : "Not solved"}
              </p>
              <h2 className="my-3 font-semibold">{p.title}</h2>
              {p.demo && (
                <p className="mb-4 text-xs text-amber-700">
                  Explicit development sample
                </p>
              )}
              <Link
                className="text-sm font-semibold text-brand"
                to={`/coding/problems/${p.id}`}
              >
                Open challenge →
              </Link>
            </section>
          ))}
        </div>
      ) : (
        <Empty message="No published problems match. An operator can explicitly seed the development problem bank." />
      )}
    </AppLayout>
  );
}
export function CodingChallenge() {
  const { id } = useParams();
  const data = useStudentData<{ problem: Problem }>(`/coding/problems/${id}`);
  const [result, setResult] = useState<Submission | null>(null);
  const request = useRef<{
    source: string;
    language: Language;
    id: string;
  } | null>(null);
  const p = data.data?.problem;
  async function submit(language: Language, source: string) {
    if (
      !request.current ||
      request.current.source !== source ||
      request.current.language !== language
    )
      request.current = { source, language, id: crypto.randomUUID() };
    const r = await studentRequest<{ submission: Submission }>(
      `/coding/problems/${id}/submissions`,
      {
        method: "POST",
        body: { language, source, requestId: request.current.id },
      },
    );
    setResult(r.submission);
    if (r.submission.status === "completed") request.current = null;
  }
  return (
    <AppLayout role="student">
      <Link className="text-sm text-brand" to="/coding/problems">
        ← Coding challenges
      </Link>
      <PageHeading
        title={p?.title || "Coding challenge"}
        detail={p ? `${p.difficulty} · ${p.topic}` : "Loading problem…"}
      />
      {data.error && <ErrorNotice message={data.error} />}{" "}
      {data.loading && !p ? (
        <Skeleton />
      ) : (
        p && (
          <>
            <div className="grid items-start gap-6 xl:grid-cols-[minmax(280px,0.7fr)_minmax(0,1.3fr)]"><section className="card rounded-2xl border-violet-200 space-y-5 break-words xl:sticky xl:top-5"><span className="inline-block rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold capitalize text-brand">{p.difficulty} · {p.topic}</span>
              <p className="text-xs text-slate-500">
                Supported languages:{" "}
                {p.supportedLanguages
                  .map(
                    (l) =>
                      ({
                        python: "Python",
                        java: "Java",
                        cpp: "C++",
                        javascript: "JavaScript",
                      })[l],
                  )
                  .join(", ")}
              </p>
              <p className="whitespace-pre-wrap text-sm leading-7">
                {p.statement}
              </p>
              {[
                ["Input format", p.inputFormat],
                ["Output format", p.outputFormat],
                ["Constraints", p.constraints],
              ].map(([label, text]) => (
                <div key={label}>
                  <h2 className="text-sm font-semibold">{label}</h2>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">
                    {text}
                  </p>
                </div>
              ))}
              {p.examples.map((e, i) => (
                <div key={i}>
                  <h2 className="mb-3 text-sm font-semibold">
                    Example {i + 1}
                  </h2>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {[
                      ["Input", e.input],
                      ["Output", e.output],
                    ].map(([label, text]) => (
                      <pre
                        key={label}
                        className="overflow-auto rounded bg-slate-50 p-3 text-xs"
                      >
                        {label}:{"\n"}
                        {text}
                      </pre>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-slate-500">{e.explanation}</p>
                </div>
              ))}
              <p className="text-xs leading-5 text-slate-500">
                With a real provider, Run uses your custom input, not hidden tests. Submit compares
                outputs after normalizing line endings, trailing spaces/tabs per
                line and final newlines; interior whitespace and case matter.
                Hidden diagnostics are withheld. Coding Demo Mode performs neither execution nor grading.
              </p>
            </section>
            <div className="min-w-0"><Workspace
              key={id}
              problemId={id}
              submissionSummary={result ? { verdict: result.verdict, passed: result.passed, total: result.total } : undefined}
              scope={`problem-${id}`}
              sample={p.examples[0]?.input || ""}
              onSubmit={submit}
            />
            {result && (
              <section role="status" className="card mt-6">
                <h2 className="font-semibold">
                  {result.verdict || "Processing submission"}
                </h2>
                <p className="mt-3 text-sm">
                  Score: {result.score ?? "Unavailable"} /100 · {result.passed}/
                  {result.total} passed · Max test runtime:{" "}
                  {result.timeSeconds ?? "Unavailable"} s · Peak memory:{" "}
                  {result.memoryKb ?? "Unavailable"} KB
                </p>
                {result.verdict === "System Error" && (
                  <p className="mt-2 text-sm text-amber-800">
                    Provider/infrastructure failure. This result does not
                    contribute to coding performance.
                  </p>
                )}
                <Link
                  className="mt-3 inline-block text-sm text-brand"
                  to="/coding/submissions"
                >
                  View private history →
                </Link>
              </section>
            )}
            </div></div>
          </>
        )
      )}
    </AppLayout>
  );
}
export function CodingHistory() {
  const data = useStudentData<{ submissions: Submission[] }>(
    "/coding/submissions",
  );
  return (
    <AppLayout role="student">
      <PageHeading
        title="Your coding submissions"
        detail="Latest 100 private submissions; scores are calculated by the backend."
      />
      <button className="btn-secondary mb-5" onClick={() => void data.reload()}>
        Refresh results
      </button>
      {data.error && <ErrorNotice message={data.error} />}{" "}
      {data.loading && !data.data ? (
        <Skeleton />
      ) : data.data?.submissions.length ? (
        <section className="card overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th className="p-3">Problem</th>
                <th>Language</th>
                <th>Verdict</th>
                <th>Score</th>
                <th>Runtime / memory</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {data.data.submissions.map((s) => (
                <tr className="border-t border-slate-100" key={s.id}>
                  <td className="p-3">
                    <Link
                      className="text-brand"
                      to={`/coding/problems/${s.problemId}`}
                    >
                      {s.title}
                    </Link>
                  </td>
                  <td className="pr-3">{s.language}</td>
                  <td className="pr-3">{s.verdict || "Processing"}</td>
                  <td className="pr-3">{s.score ?? "—"}</td>
                  <td className="pr-3 whitespace-nowrap">
                    {s.timeSeconds ?? "—"} s / {s.memoryKb ?? "—"} KB
                  </td>
                  <td className="whitespace-nowrap">
                    {new Date(s.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : (
        <Empty message="No submissions yet. Configure an isolated execution provider, then submit a challenge." />
      )}
    </AppLayout>
  );
}
