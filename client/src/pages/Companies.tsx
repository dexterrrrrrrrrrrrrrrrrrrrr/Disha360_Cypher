import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Building2,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Code2,
  FileText,
  MessageSquare,
  Search,
} from "lucide-react";
import { AppLayout } from "../layouts/AppLayout";
import {
  PageHeading,
  Skeleton,
  Empty,
  ErrorNotice,
} from "../components/StudentUI";
import { useStudentData } from "../hooks/useStudentData";
import { studentRequest } from "../services/student";
import type {
  CompanyProfile,
  CompanyResource,
  CompanyResources,
} from "../features/companies/types";
function Progress({ progress }: { progress: CompanyProfile["progress"] }) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between gap-3 text-xs text-slate-500">
        <span>
          {progress.completed} of {progress.total} activities complete
        </span>
        <span className="font-semibold text-brand">{progress.percent}%</span>
      </div>
      <div
        role="progressbar"
        aria-label="Preparation checklist completion"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress.percent}
        className="h-2 overflow-hidden rounded-full bg-indigo-50"
      >
        <div
          className="h-full rounded-full bg-brand"
          style={{ width: `${progress.percent}%` }}
        />
      </div>
    </div>
  );
}
function Notice({ text }: { text: string }) {
  return (
    <p className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
      {text}
    </p>
  );
}
export function Companies() {
  const [search, setSearch] = useState("");
  const [completion, setCompletion] = useState("");
  const data = useStudentData<{ companies: CompanyProfile[] }>(
    `/companies?${new URLSearchParams({ ...(search.trim() ? { search: search.trim() } : {}), ...(completion ? { completion } : {}) })}`,
  );
  return (
    <AppLayout role="student">
      <PageHeading
        title="Company preparation"
        detail="Build a focused study plan, connect your practice, and keep track of each next step."
      />
      <Notice text="Sample profiles are illustrative study guides. Recruitment stages and requirements vary by role and year; verify the current official job posting. Checklist progress is self-reported preparation, not an employer readiness score." />
      <div className="mb-6 grid gap-4 sm:grid-cols-[1fr_240px]">
        <label className="relative">
          <span className="field-label">Search companies or topics</span>
          <Search
            size={18}
            className="pointer-events-none absolute bottom-3 left-3 text-slate-400"
          />
          <input
            className="input pl-10"
            type="search"
            maxLength={100}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Try TCS, databases, or arrays"
          />
        </label>
        <label>
          <span className="field-label">Preparation status</span>
          <select
            className="input"
            value={completion}
            onChange={(e) => setCompletion(e.target.value)}
          >
            <option value="">All companies</option>
            <option value="not-started">Not started</option>
            <option value="in-progress">In progress</option>
            <option value="complete">Complete</option>
          </select>
        </label>
      </div>
      {data.error && (
        <ErrorNotice message={data.error} retry={() => void data.reload()} />
      )}
      {data.loading ? (
        <>
          <p className="sr-only" role="status">
            Loading company profiles…
          </p>
          <Skeleton />
        </>
      ) : data.data?.companies.length ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {data.data.companies.map((c) => (
            <article key={c.id} className="card flex min-w-0 flex-col gap-4">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-brand">
                  <Building2 size={23} />
                </span>
                <div>
                  <h2 className="text-lg font-bold text-ink">{c.name}</h2>
                  <p className="text-xs text-slate-500">{c.industry}</p>
                </div>
              </div>
              {c.demo && (
                <span className="w-fit rounded bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800">
                  Illustrative sample
                </span>
              )}
              <p className="text-sm leading-6 text-slate-600">{c.overview}</p>
              <div className="flex flex-wrap gap-2">
                {[
                  ...c.topics.aptitude.slice(0, 2),
                  ...c.topics.coding.slice(0, 2),
                ].map((t) => (
                  <span
                    key={t}
                    className="rounded-full bg-slate-50 px-2.5 py-1 text-xs text-slate-600"
                  >
                    {t}
                  </span>
                ))}
              </div>
              <div className="mt-auto">
                <Progress progress={c.progress} />
                <Link
                  to={`/companies/${c.id}`}
                  className="mt-5 flex items-center justify-between text-sm font-semibold text-brand"
                >
                  Open preparation plan
                  <ArrowRight size={17} />
                </Link>
              </div>
            </article>
          ))}
        </div>
      ) : (
        !data.error && (
          <Empty message="No company profiles match. Clear the filters, or ask your development operator to run the explicit company sample seed. Profiles are never created automatically." />
        )
      )}
    </AppLayout>
  );
}
function Resources({
  title,
  items,
  empty,
}: {
  title: string;
  items: CompanyResource[];
  empty: string;
}) {
  return (
    <section className="card min-w-0">
      <h3 className="mb-4 font-semibold text-ink">{title}</h3>
      {items.length ? (
        <ul className="space-y-3">
          {items.map((r) => (
            <li key={r.id}>
              <Link
                className="block rounded-lg border border-slate-100 p-3 hover:border-indigo-200 hover:bg-indigo-50/40"
                to={r.href}
              >
                <p className="break-words text-sm font-semibold text-brand">
                  {r.title}
                </p>
                <p className="mt-1 text-xs text-slate-500">{r.detail}</p>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <Empty message={empty} />
      )}
    </section>
  );
}
export function CompanyPreparation() {
  const { id = "" } = useParams();
  return <CompanyPlan key={id} id={id} />;
}
function CompanyPlan({ id }: { id: string }) {
  const data = useStudentData<{
    company: CompanyProfile;
    resources: CompanyResources;
  }>(`/companies/${id}`);
  const [company, setCompany] = useState<CompanyProfile | null>(null);
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (data.data) setCompany(data.data.company);
  }, [data.data]);
  async function toggle(key: string, completed: boolean) {
    setSaving(key);
    setError("");
    setMessage("");
    try {
      const response = await studentRequest<{ company: CompanyProfile }>(
        `/companies/${id}/progress`,
        { method: "PUT", body: { itemKey: key, completed } },
      );
      setCompany(response.company);
      setMessage("Checklist saved. Your progress is up to date.");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Unable to save this activity. Try again.",
      );
    } finally {
      setSaving("");
    }
  }
  const resources = data.data?.resources;
  return (
    <AppLayout role="student">
      <Link
        className="mb-5 inline-block text-sm font-semibold text-brand"
        to="/companies"
      >
        ← All companies
      </Link>
      {data.error && (
        <ErrorNotice message={data.error} retry={() => void data.reload()} />
      )}
      {data.loading ? (
        <Skeleton />
      ) : (
        company &&
        resources && (
          <>
            <PageHeading
              title={`${company.name} preparation`}
              detail={company.industry}
            />
            <Notice text={company.disclaimer} />
            <div className="grid items-start gap-6 lg:grid-cols-[1fr_340px]">
              <div className="min-w-0 space-y-6">
                <section className="card">
                  <h2 className="mb-3 text-lg font-bold text-ink">
                    Your preparation focus
                  </h2>
                  <p className="text-sm leading-7 text-slate-600">
                    {company.overview}
                  </p>
                  <h3 className="mb-3 mt-6 font-semibold">
                    Typical stages · illustrative
                  </h3>
                  <ol className="space-y-3">
                    {company.stages.map((s, i) => (
                      <li
                        key={s}
                        className="flex items-center gap-3 text-sm text-slate-600"
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-xs font-semibold text-brand">
                          {i + 1}
                        </span>
                        {s}
                      </li>
                    ))}
                  </ol>
                </section>
                <section className="grid gap-4 sm:grid-cols-2">
                  {(
                    [
                      ["aptitude", "Aptitude preparation", FileText],
                      ["technical", "Technical preparation", BookOpen],
                      ["coding", "Coding preparation", Code2],
                      ["hr", "HR interview preparation", MessageSquare],
                    ] as const
                  ).map(([key, title, Icon]) => (
                    <div key={key} className="card">
                      <h2 className="mb-4 flex items-center gap-2 font-semibold">
                        <Icon size={18} className="text-brand" />
                        {title}
                      </h2>
                      <ul className="space-y-2 text-sm text-slate-600">
                        {company.topics[key].map((t) => (
                          <li key={t} className="flex gap-2">
                            <span aria-hidden="true" className="text-brand">
                              •
                            </span>
                            {t}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </section>
                <section className="card">
                  <h2 className="mb-3 font-semibold">
                    Interview practice prompts
                  </h2>
                  <p className="mb-3 text-xs text-slate-500">
                    General practice questions, not claimed past company
                    interview questions.
                  </p>
                  <ul className="space-y-3 text-sm leading-6 text-slate-600">
                    {company.interviewQuestions.map((q) => (
                      <li key={q}>{q}</li>
                    ))}
                  </ul>
                  <Link
                    to={resources.interview.href}
                    className="btn-secondary mt-5 inline-block"
                  >
                    {resources.interview.title}
                  </Link>
                  <p className="mt-3 text-xs leading-5 text-slate-500">
                    {resources.interview.detail}
                  </p>
                </section>
              </div>
              <aside className="card min-w-0 lg:sticky lg:top-6">
                <h2 className="mb-2 flex items-center gap-2 text-lg font-bold">
                  <CheckCircle2 size={21} className="text-brand" />
                  Your checklist
                </h2>
                <p className="mb-5 text-xs leading-5 text-slate-500">
                  Mark activities you have completed. Self-reported progress,
                  independent of assessment or coding scores.
                </p>
                <Progress progress={company.progress} />
                <div className="mt-5 space-y-3">
                  {company.checklist.map((item) => (
                    <label
                      key={item.key}
                      className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-100 p-3 text-sm leading-6 text-slate-700"
                    >
                      <input
                        className="mt-1 h-4 w-4 shrink-0 accent-indigo-600"
                        type="checkbox"
                        checked={company.progress.completedItemKeys.includes(
                          item.key,
                        )}
                        disabled={!!saving}
                        onChange={(e) =>
                          void toggle(item.key, e.target.checked)
                        }
                      />
                      <span>{item.label}</span>
                    </label>
                  ))}
                </div>
                {saving && (
                  <p role="status" className="mt-3 text-xs text-slate-500">
                    Saving activity…
                  </p>
                )}
                {message && (
                  <p role="status" className="mt-3 text-xs text-emerald-700">
                    {message}
                  </p>
                )}
                {error && (
                  <div className="mt-3">
                    <ErrorNotice message={error} />
                  </div>
                )}
              </aside>
            </div>
            <div className="mb-5 mt-9">
              <h2 className="text-xl font-bold">Connect your practice</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                {resources.explanation}
              </p>
            </div>
            <div className="grid gap-5 md:grid-cols-3">
              <Resources
                title="Learning resources"
                items={resources.learning}
                empty="No matching published learning modules yet. Check back after your trainer publishes relevant lessons."
              />
              <Resources
                title="Relevant assessments"
                items={resources.assessments}
                empty="No matching assessments with an available published question pool are open right now."
              />
              <Resources
                title="Coding challenges"
                items={resources.coding}
                empty="No matching published coding challenges yet. Your operator can add development samples explicitly."
              />
            </div>
          </>
        )
      )}
    </AppLayout>
  );
}
