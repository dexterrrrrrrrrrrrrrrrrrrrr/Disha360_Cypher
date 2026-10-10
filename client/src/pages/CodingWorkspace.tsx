import { Link } from "react-router-dom";
import { useEffect, useState, lazy, Suspense } from "react";
import { AppLayout } from "../layouts/AppLayout";
import { templates, type Language } from "../features/coding/templates";
const CodeEditor = lazy(() => import("../features/coding/Editor"));
import { useStudentData } from "../hooks/useStudentData";
import { studentRequest } from "../services/student";
import { PageHeading, ErrorNotice, Skeleton } from "../components/StudentUI";
import { EditorBoundary } from "../components/EditorBoundary";
export interface Execution {
  verdict: string;
  stdout: string;
  stderr: string;
  compileOutput: string;
  timeSeconds: number | null;
  memoryKb: number | null;
  outputTruncated: boolean;
}
export function CodingWorkspace() {
  return (
    <AppLayout role="student">
      <PageHeading
        title="Coding workspace"
        detail="Write, save and run code through an isolated backend provider."
      />
      <Link className="btn-secondary mb-5 inline-block" to="/coding/problems">
        Browse challenges →
      </Link>
      <Workspace scope="playground" />
    </AppLayout>
  );
}
export function Workspace({
  scope,
  sample = "",
  onSubmit,
}: {
  scope: string;
  sample?: string;
  onSubmit?: (language: Language, source: string) => Promise<void>;
}) {
  const config = useStudentData<{ configured: boolean; message: string }>(
    "/coding/config",
  );
  const [language, setLanguage] = useState<Language>("python");
  const [plainEditor, setPlainEditor] = useState(false);
  const [source, setSource] = useState(templates.python);
  const [stdin, setStdin] = useState(sample);
  const [version, setVersion] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [execution, setExecution] = useState<Execution | null>(null);
  const plainInput = <label className="block"><span className="field-label">Solution code</span><textarea className="input min-h-[420px] font-mono" aria-label="Solution code" spellCheck={false} maxLength={30000} aria-describedby="editor-help" value={source} disabled={!!busy} onChange={e => { setSource(e.target.value); setDirty(true); }} /></label>;
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setLoadFailed(false);
    setError("");
    setExecution(null);
    void studentRequest<{
      draft: { source: string; stdin: string; version: number } | null;
    }>(`/coding/drafts/${scope}?language=${language}`)
      .then((r) => {
        if (alive) {
          setSource(r.draft?.source ?? templates[language]);
          setStdin(r.draft?.stdin ?? sample);
          setVersion(r.draft?.version ?? 0);
          setDirty(false);
          setMessage("");
        }
      })
      .catch((e) => {
        if (alive) {
          setError(e.message);
          setLoadFailed(true);
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [scope, language, sample, retry]);
  async function act(kind: string) {
    setBusy(kind);
    setError("");
    setMessage("");
    try {
      if (kind === "save") {
        const r = await studentRequest<{ draft: { version: number } }>(
          "/coding/drafts/" + scope,
          { method: "PUT", body: { language, source, stdin, version } },
        );
        setVersion(r.draft.version);
        setDirty(false);
        setMessage("Draft saved.");
      } else if (kind === "submit" && onSubmit)
        await onSubmit(language, source);
      else {
        setExecution(null);
        const r = await studentRequest<{ execution: Execution }>(
          "/coding/run",
          { method: "POST", body: { language, source, stdin } },
        );
        setExecution(r.execution);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed.");
    } finally {
      setBusy("");
    }
  }
  return (
    <div className="space-y-5">
      {(error || config.error) && (
        <ErrorNotice message={error || config.error} />
      )}
      <p
        role="status"
        className={`rounded-lg p-4 text-sm ${config.data?.configured ? "bg-indigo-50 text-indigo-900" : "bg-amber-50 text-amber-900"}`}
      >
        {config.data?.message || "Checking execution configuration…"}
      </p>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label>
          <span className="field-label">Language</span>
          <select
            aria-label="Language"
            className="input"
            value={language}
            disabled={!!busy || loading || loadFailed}
            onChange={(e) => {
              if (
                !dirty ||
                window.confirm("Discard unsaved changes for this language?")
              )
                setLanguage(e.target.value as Language);
            }}
          >
            {Object.keys(templates).map((l) => (
              <option key={l} value={l}>
                {
                  {
                    python: "Python",
                    java: "Java",
                    cpp: "C++",
                    javascript: "JavaScript",
                  }[l]
                }
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            className="btn-secondary"
            disabled={!!busy || loading || loadFailed}
            onClick={() => {
              if (
                window.confirm("Replace your code with the language template?")
              ) {
                setSource(templates[language]);
                setDirty(true);
              }
            }}
          >
            Reset template
          </button>
          <button
            className="btn-secondary"
            disabled={!!busy || loading || loadFailed || !source}
            onClick={() => void act("save")}
          >
            {busy === "save" ? "Saving…" : "Save draft"}
          </button>
          <button
            className="btn-primary"
            disabled={
              !!busy ||
              loading ||
              loadFailed ||
              !source ||
              !config.data?.configured
            }
            onClick={() => void act("run")}
          >
            {busy === "run" ? "Running…" : "Run code"}
          </button>
          {onSubmit && (
            <button
              className="btn-primary"
              disabled={
                !!busy ||
                loading ||
                loadFailed ||
                !source ||
                !config.data?.configured
              }
              onClick={() => void act("submit")}
            >
              {busy === "submit" ? "Judging…" : "Submit solution"}
            </button>
          )}
        </div>
      </div>
      {loadFailed ? (
        <button
          className="btn-secondary"
          onClick={() => setRetry((v) => v + 1)}
        >
          Reload saved draft
        </button>
      ) : loading ? (
        <Skeleton />
      ) : (
        <>
        <button type="button" className="mb-3 text-sm font-semibold text-brand" aria-pressed={plainEditor} onClick={() => setPlainEditor(v => !v)}>{plainEditor ? "Use syntax highlighting editor" : "Use plain text editor"}</button>
        <p id="editor-help" className="mb-3 text-xs leading-6 text-slate-600">The plain text editor uses standard keyboard navigation. In the syntax editor, press Ctrl+M (Control+Shift+M on Mac) to toggle whether Tab moves focus. Both editors save the same draft.</p>
        {plainEditor ? plainInput : <EditorBoundary fallback={plainInput}><Suspense fallback={<Skeleton />}>
          <CodeEditor
            language={language}
            source={source}
            disabled={!!busy}
            onChange={(s) => {
              setSource(s);
              setDirty(true);
            }}
          />
        </Suspense></EditorBoundary>}
        </>
      )}
      <p role="status" className="text-xs text-slate-500">
        {message ||
          (dirty
            ? "Unsaved changes. Save before navigating away."
            : "Showing saved draft or starter template.")}{" "}
        · Explicit saves · Java entry class: Main
      </p>
      <div className="grid gap-5 lg:grid-cols-2">
        <label className="card">
          <span className="field-label">Custom standard input</span>
          <textarea
              aria-label="Custom standard input"
            className="input min-h-40 font-mono"
            maxLength={10000}
            value={stdin}
            disabled={loading || !!busy}
            onChange={(e) => {
              setStdin(e.target.value);
              setDirty(true);
            }}
          />
        </label>
        <section className="card min-w-0">
          <h2 className="font-semibold">Execution output</h2>
          {execution ? (
            <>
              <p
                role="status"
                className="my-3 text-sm font-semibold text-brand"
              >
                {execution.verdict === "Accepted"
                  ? "Execution finished (not a judged solution)"
                  : execution.verdict}
              </p>
              <p className="text-xs text-slate-500">
                Runtime: {execution.timeSeconds ?? "Unavailable"} s · Memory:{" "}
                {execution.memoryKb ?? "Unavailable"} KB
              </p>
              {[
                ["Standard output", execution.stdout],
                ["Standard error", execution.stderr],
                ["Compiler output", execution.compileOutput],
              ].map(([label, text]) => (
                <div className="mt-4" key={label}>
                  <h3 className="text-xs font-semibold">{label}</h3>
                  <pre className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap break-words rounded bg-slate-50 p-3 text-xs">
                    {text || "(empty)"}
                  </pre>
                </div>
              ))}
              {execution.outputTruncated && (
                <p className="mt-3 text-sm text-amber-800">
                  Output limit exceeded; output was truncated.
                </p>
              )}
            </>
          ) : (
            <p className="mt-4 text-sm text-slate-500">
              Run code to see genuine provider output. No execution is
              simulated.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
