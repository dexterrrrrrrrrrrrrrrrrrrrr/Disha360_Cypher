# Disha360 Placement Training LMS

A placement training LMS built with React, Vite, TypeScript, Tailwind, Express, and MongoDB. The completed placement-training workflows are preserved. AI interviews support a centralized Google Gemini integration and the optional existing OpenAI provider; live AI verification still requires a properly configured backend. The student dashboard reads actual MongoDB records and shows empty states when performance evidence is absent. The existing design system and project structure are preserved.

## Install and run

Requirements: Node.js 22.12+ and npm 10+, plus a MongoDB Atlas cluster and database user.

From the repository root:

```sh
npm ci
# Only if you do not already have a private configuration file:
cp server/.env.example server/.env
# Edit server/.env with your real Atlas URI.
npm run db:check
npm run dev
```

Do not overwrite an existing `.env`. In this cloud workspace, use `npm ci --cache /tmp/cypher-npm-cache` because the default home cache is not writable.

Open `http://localhost:5173`. The API listens on port 4000. Vite proxies `/api` to the backend. If you change the backend port, update `client/vite.config.ts`. `server/.env` is resolved relative to the server module, including after compilation; injected environment variables take precedence. Never commit credentials or put secrets in `VITE_` variables.

The API development process uses Nodemon with `server/nodemon.json` to watch only TypeScript files under `server/src`, running them through `tsx` without its dependency watcher. Source edits, additions, and deletions restart the API. Dependency directories, build outputs, generated files, logs, caches, temporary files, and common editor backup files are excluded. The root development command still runs the API and Vite together. Changes to `.env` or watcher configuration require a manual restart. A short proxy disconnect during an intentional source-code restart is expected; dependency/build changes should not restart the API.

## Coding Demo Mode (development only)

For a ₹0 hackathon demonstration, use the existing authenticated Student coding
workspace without an execution provider. In your existing private `server/.env`
(or injected backend environment), set:

```dotenv
NODE_ENV=development
CODING_DEMO_MODE=true
```

Keep your dedicated development MongoDB connection: authentication, published
problems and saved drafts still require it. Never use production data for a demo.
Do not overwrite an existing private configuration file. Restart `npm run dev`
after changing the flag, sign in as Student, and open Coding practice. Open a
published challenge for **Demo Submit**. If your dedicated development database
has no problems, follow the existing explicit `seed:coding` instructions and
matching `CODING_SEED_DATABASE` safeguard; nothing is seeded automatically.

A visible **Coding Demo Mode** badge identifies the workflow. Monaco, the plain
text fallback, Python/Java/C++/JavaScript selection, custom input and private draft
saving remain available. **Demo Run** shows the fixed illustrative text
`Hello, world!`, unrelated to the entered source or input. It explicitly says:
“Demo Mode: Code was not executed. This is an illustrative output only.”

**Demo Submit** returns a temporary receipt naming the selected published problem
and language: “Demo submission only. No code execution or grading occurred.”
Receipts are not saved and disappear on reload or language/problem changes. Demo
endpoints validate input but never execute, compile, process custom input, call
Judge0, read hidden tests, grade, or create real coding submissions. They do not
record activity or affect correctness scores, coding analytics, leaderboard
points, streaks or badges. Draft saving still persists the Student's own draft.
The existing Student authentication, role checks, CSRF/origin protections and
per-Student request limits apply. A database outage still blocks private features.

Demo Mode is **off by default**, accepts only explicit `true`, and is forced off
outside `NODE_ENV=development`, including production. To disable it, remove the
setting or set `CODING_DEMO_MODE=false`, then restart the backend. Without a real
provider, Run/Submit return to their existing setup-required disabled state.

Real Judge0 integration is preserved. Later, disable Demo Mode, configure a genuine
trusted hardened CE-compatible provider using the existing backend-only
`JUDGE0_URL`/`JUDGE0_API_KEY` settings, and verify its isolation and supported
language IDs before an authorized operator enables `JUDGE0_SECURITY_CONFIRMED`.
This demo feature does not change that flag or weaken the provider gate. Real
Run/Submit remain separate from demo endpoints; live provider execution has not
been verified by this work. No account, paid service or provider credential is
required for Demo Mode.

## MongoDB Atlas

Follow [docs/MONGODB_ATLAS.md](docs/MONGODB_ATLAS.md). Create an Atlas database user with read/write permission to `cypher`, permit the backend machine's outbound IP, and put the Atlas-supplied URI in **server/.env**. Use a separate development database for demo users. `npm run db:check` connects and sends a read-only ping without printing credentials.

Without a connected database, health remains available but private feature endpoints return 503. No fallback accounts or in-memory session storage are used. Startup explicitly creates the User unique-email, Session unique-token/TTL, and student-feature indexes. Production refuses startup if database connection or index preparation fails. Development retains the server with the database disconnected. Sessions and users persist in MongoDB Atlas; only tests use disposable MongoDB instances.

## Authentication

- `/register`: Student-only registration with name, email, password, department, and semester (1–12). Passwords require 12–128 characters, uppercase, lowercase, and a number. Registration signs the student in.
- `/login`: One sign-in form for Student, Trainer, and Admin. The stored account role determines the workspace; users cannot pick or promote their role.
- `/dashboard/student`, `/dashboard/trainer`, `/dashboard/admin`: authenticated, role-protected workspaces. The Student dashboard shows personal preparation records; staff dashboards remain placeholders. Wrong-role navigation redirects to the account's own workspace. The former public `/preview/*` routes no longer expose dashboards.
- **Sign out** deletes the server session and clears the browser cookie.

Passwords use Node's scrypt with random per-user salts and timing-safe comparison. Sessions are random 256-bit opaque tokens; only SHA-256 hashes are stored in MongoDB. The cookie is HttpOnly, SameSite=Lax, scoped to `/api`, and valid for seven days (fixed expiration). Production adds Secure and requires HTTPS. No authentication tokens are stored in localStorage. Expiration is checked on every private API request, even before MongoDB TTL cleanup. The client restores its session through `/auth/me` on reload and rechecks it when returning to the tab.

State-changing auth requests require `X-Disha360-Request: 1`; unexpected browser Origins are rejected. CORS allows only `CLIENT_ORIGIN` with credentials. Serve the client and API through the same site in production. Behind one trusted reverse proxy, set `TRUST_PROXY=true`; leave it false when the API is accessed directly. Do not expose the backend directly when trusting that proxy. Sensitive auth endpoints are limited to 20 attempts per IP per 15 minutes; the API also has a general limiter.

### API routes

All responses follow `{ success: true, data: ... }` or `{ success: false, error: { code, message, fields? } }`.

| Method | `/api/v1` path | Access / behavior |
|---|---|---|
| GET | `/health` | API liveness (200); includes database status, no credentials |
| GET | `/ready` | 200 when connected; otherwise 503 |
| POST | `/auth/register` | Public, validated, Student-only; returns safe user fields |
| POST | `/auth/login` | Public, rate-limited; generic invalid-credential errors |
| POST | `/auth/logout` | Revokes the supplied session; requires CSRF header |
| GET | `/auth/me` | Authenticated user's own profile only |
| GET | `/auth/workspace/student` | Student role only; returns only the current profile |
| GET | `/auth/workspace/trainer` | Trainer role only; returns only the current profile |
| GET | `/auth/workspace/admin` | Admin role only; returns only the current profile |

There is no public staff-account creation API, user directory, or arbitrary user-ID profile endpoint. Public registration rejects extra fields including `role`. User responses whitelist safe fields and never serialize password hashes, session hashes, or demo flags. `requireAuth` and `requireRole` enforce permissions on the server. Future private endpoints must use these middleware and explicit ownership/batch checks.

## Development demo accounts

Set **NODE_ENV=development** and choose a private strong **SEED_DEMO_PASSWORD** in `server/.env`, then run:

```sh
npm run seed:demo
```

This creates:

- `demo.student@disha360.test` — Student
- `demo.trainer@disha360.test` — Trainer
- `demo.admin@disha360.test` — Admin

Use the private password you configured. No default password is committed or printed, and there is no automatic seed on startup. Rerunning preserves existing demo accounts and their passwords; it will not overwrite non-demo accounts. Use a dedicated development database. Production blocks demo seeding, demo login, and previously issued demo sessions even if demo users exist in the same database. Remove `SEED_DEMO_PASSWORD` from the private file after seeding if you do not need it again.

## Secure Trainer/Admin provisioning

An authorized operator with backend/database access can add a real staff account. Set these values privately in `server/.env` (not in Git, public chat, or command-line arguments):

```dotenv
PROVISION_NAME="Staff Member"
PROVISION_EMAIL="staff@your-college.edu"
PROVISION_ROLE="trainer"
PROVISION_PASSWORD="<choose-a-private-strong-password>"
```

`PROVISION_ROLE` accepts only `trainer` or `admin`. Then run:

```sh
npm run user:create
```

Existing accounts are never overwritten or promoted. The command validates inputs, hashes the password, creates the account, and omits credentials from output. Remove the provisioning fields from your private configuration after use. Account management and role editing interfaces are reserved for a later checkpoint.

## Checks and builds

```sh
npm run typecheck
npm test
npm run build
npm start                  # Compiled API only; build first
npm run preview -w client  # Built frontend preview only
```

The production frontend needs a reverse proxy forwarding `/api` to Express and SPA fallback to `index.html`. `npm start` does not serve frontend assets. Set `NODE_ENV=production`, an HTTPS `CLIENT_ORIGIN`, and the genuine URI; production cookies cannot be tested over plain HTTP. Vite preview does not proxy the API.

Tests use mongodb-memory-server to launch a **real, disposable MongoDB 7.0.24 process**, not mocks of persistence and not your Atlas database. The first test run downloads the official binary with checksum verification and needs access to `fastdl.mongodb.org`. For restricted runners with a trusted MongoDB 7.0.24 binary already installed:

```sh
MONGOMS_SYSTEM_BINARY=/path/to/mongod npm test
```

The official MongoDB test binary is cached under the operating system temporary directory. MongoDB integration tests cover Student-only registration, validation, email uniqueness, hashing, login for all roles, session persistence/rotation/expiry, logout revocation, CSRF, rate limits, role denial, student privacy, secure cookie flags, demo restrictions, and operator provisioning. Disposable data is deleted after the suite. The test database is isolated from development and Atlas data.

## Manual testing

1. Configure Atlas, run `npm run db:check`, then `npm run dev`.
2. Open `/dashboard/admin` while signed out: expect `/login`.
3. Register a Student at `/register`; test mismatched passwords, then valid registration. Expect a success message and Student workspace.
4. Reload the page: login persists. Visit `/dashboard/admin`: expect a redirect to the Student workspace.
5. Sign out, then revisit a private route: expect login. Try an incorrect password: expect an error.
6. Seed the three development accounts and verify each lands in its own workspace.
7. Confirm the session cookie is HttpOnly and no token exists in browser localStorage. Inspect API responses: no password/hash fields.
8. Test narrow viewports and the navigation drawer. The Student dashboard shows actual records or honest empty states, never invented scores.

Backend checks:

```sh
curl http://localhost:4000/api/v1/health
curl -i http://localhost:4000/api/v1/ready
curl -i http://localhost:4000/api/v1/auth/me # 401 when no cookie is supplied
```

## Structure and scope

`client/src/features/auth` contains session state and protected routing; `layouts/AuthLayout.tsx` preserves the shared sign-in design. Backend modules separate models, validators, services, controllers, middleware, routes, and operator utilities. npm workspaces keep installation simple.

Checkpoints 1–4, 7 and 8 are implemented; Checkpoints 5–6 await live provider verification. Coding workspace/judge (9–10) are implemented with live-provider verification pending. Checkpoint 12 company preparation is now implemented; Checkpoint 14 management and Checkpoint 13 engagement are implemented below; Checkpoint 15 responsive UI/accessibility polish is implemented below. Your locally verified Atlas connection was not re-tested here because its credentials are not available in this cloud runtime. The auth flows were verified using an isolated actual MongoDB server. See [docs/CHECKPOINTS.md](docs/CHECKPOINTS.md) for status.

## Student preparation features (Checkpoints 2–8)

- **Dashboard `/dashboard/student`:** personal details, learning completion, recorded assessment average, upcoming assignments, UTC daily streak, persisted recent activity, and next actions derived from the student's resume/interview records. Readiness is an explicit estimate: 25% profile completeness + 40% recorded lesson completion + 35% recorded assessment average. Missing performance records contribute no points; their displayed metrics are blank. A new student with a complete profile has a 25% estimate, not an invented test score. Dashboard visits count as daily check-ins. Students cannot set scores: the assessment engine calculates them from saved answers. Published text/link learning and saved completion are now available.
- **Resume studio `/resumes`:** private structured drafts, personal details, education, skills, projects, experience, certifications; Classic, Modern, and Compact templates; live preview; explicit save; server-generated PDF. Reload preserves saved content. Save before exporting; the PDF uses the saved version. Concurrent edits are rejected with 409 instead of overwriting a newer version. Resume lists show the latest 100 drafts.
- **ATS analyzer `/resume-analyzer`:** select a saved resume and enter a 50–12,000-character job description. Deterministic keyword extraction, matched/missing keywords, five completeness checks, evidence checks, component breakdown and suggestions. Scores are reproducible, never random. No AI credentials are needed for this heuristic. History retains private immutable content snapshots and the rubric/version used, including after the original resume is deleted. Latest 100 results are listed.
- **Interviews `/interviews`:** Technical, Behavioral or HR; Beginner, Intermediate or Advanced; target role, optional focus, 3–10 questions; AI-generated first questions and adaptive follow-ups; private saved transcripts, history, resumable active sessions, automatic completion or early end. The server forwards actual prior questions and answers to the selected backend AI provider. Concurrent processing uses a bounded MongoDB lease and version checks. Failed question generation leaves the transcript/version unchanged and permits retry. Text answers remain in the input after a failed request. Completed sessions can now generate saved evidence-linked feedback reports; see Checkpoint 6 below.

All feature routes are protected for Students on both client and server. Ownership always comes from the authenticated session, never a submitted student ID. Cross-student record access returns 404. Private responses use `Cache-Control: no-store`; mutations require the existing CSRF header/origin checks. Inputs use Zod, records are persisted in MongoDB, and MongoDB unavailability returns a safe 503. No credentials or session tokens enter React code.

### Gemini AI configuration (₹0 budget)

The backend uses the official maintained `@google/genai` Node.js SDK, pinned to
2.28.0. All Gemini calls go through one `GeminiAIService`; React never receives
keys or chooses credentials. Existing Technical, Behavioral and HR interviews,
adaptive follow-ups, actual-answer evaluation, feedback and private history use
the same workflows and database structures. Feedback retains evidence-checked
quotes, AI-estimate scores and the existing rubric, not hiring predictions.

**Current Free Tier eligibility is unverified in this workspace.** On 10 October
2026, the official SDK source and npm metadata were accessible, but Google's
pricing, rate-limit and library pages returned network-policy HTTP 403. No live
model is selected automatically: `GEMINI_MODEL` deliberately defaults to blank,
and AI stays unavailable until an operator sets it. Do not copy a stale model
name or use a `latest` alias without checking its current terms.

For a strict ₹0 deployment, review the [official pricing table](https://ai.google.dev/gemini-api/docs/pricing),
[rate limits](https://ai.google.dev/gemini-api/docs/rate-limits),
[API terms](https://ai.google.dev/gemini-api/terms) and
[API-key instructions](https://ai.google.dev/gemini-api/docs/api-key).
Choose a currently Free Tier-eligible text model with structured JSON support,
and keep billing disabled on its Google project. This application cannot inspect
Google billing status or guarantee zero cost on a billed project. No billing,
paid resources, paid tools, grounding, automatic upgrades or fallback APIs are
enabled by this integration. Two keys do not double the free allowance: quotas
may be shared at project level. Never rotate keys to bypass limits.

Local setup:

1. Run `npm ci --cache /tmp/cypher-npm-cache` in the repository root.
2. Keep the existing private `server/.env` and a dedicated development MongoDB
   connection. Do not overwrite that file or put credentials in chat/Git.
3. Independently verify model eligibility and your project's disabled billing.
   Obtain permitted Gemini Developer API credentials through Google AI Studio;
   keep both credentials server-side. This work does not create an account or key.
4. Add the following backend settings privately (the blank example contains no
   secrets). Set the model to the exact ID you just verified.

```dotenv
AI_PROVIDER=gemini
GEMINI_API_KEY=
GEMINI_API_KEY_BACKUP=
GEMINI_MODEL=
GEMINI_KEY_SELECTION=primary
```

5. Fill the selected credential and model locally, then restart `npm run dev`.
   With `primary`, only `GEMINI_API_KEY` is used. The backup can remain unavailable
   until you need manual rotation; both settings are supported.
6. Sign in as Student. In Mock interviews, select type, difficulty, target role
   and focus. Start, answer, review a follow-up, end the session and review feedback.
   Verify history reload and another Student's inability to open the same record.
7. To use qualitative resume suggestions, select your saved resume and job
   description in ATS analysis, read the privacy disclosure, check consent and
   click **Get optional AI suggestions**. The ATS calculation remains unchanged.

Manual rotation: change `GEMINI_KEY_SELECTION=backup` in backend configuration,
then restart the server. Only `GEMINI_API_KEY_BACKUP` will be used. To revert,
select `primary` and restart. Missing, invalid or revoked selected credentials
produce a safe error; the other key is never selected automatically. Students,
Trainers and Admins have no key inputs or switching controls. Keys are not stored
in MongoDB. Changing the selected model/provider also requires a restart.

Limits: 45-second deadlines, 85,000-byte JSON input, 100,000-byte output checks,
600 question / 6,000 feedback / 1,800 suggestion output-token caps, ten Gemini
requests per minute and two concurrent calls per backend instance. Existing
HTTP/body/role/CSRF/origin limits remain, including the twenty-per-minute AI route
limit. Failed requests count toward local limits. These local safeguards are not
Google's project quota or a monetary spending cap. There are no automatic retries,
key switches, model switches or provider switches. Quota, rate and network failures
show: “The AI service is temporarily unavailable or its free usage limit has been
reached. Please try again later.” No failed call produces a fake question, report
or score. Saved transcripts survive provider outages; failed answers are not
silently added to the saved conversation.

Privacy: interviews send the actual setup and saved text conversation to the
selected provider. Avoid sensitive/personal details and review its current
retention/data-use terms, including Free Tier terms. Resume suggestions require
explicit consent on every POST and are owned-Student-only. They omit contact
fields, names, locations, links, institution/employer names, dates and record IDs;
known contact values, email addresses, URLs and phone-like strings are also
redacted from selected text. Free-form content can still identify you. Only the
first five project/experience descriptions (1,500 characters each), forty skills,
three degree/field entries, a 2,000-character summary and the job description are
sent. This is best-effort minimization, not guaranteed anonymization. Suggestions
are temporary, contain no numeric ATS score and never edit the resume. Review
claims and manually apply only approved, accurate changes in the builder.

The existing OpenAI Responses integration is preserved as an explicit alternative:
set `AI_PROVIDER=openai`, `OPENAI_API_KEY` and a compatible `OPENAI_MODEL`, then
restart. Its existing 60-second timeout, no-retry policy, structured responses and
`store: false` remain. **OpenAI is not a ₹0 fallback**; do not select it under this
budget without independently confirmed cost-free access. Qualitative resume
suggestions are Gemini-only; the deterministic ATS analyzer works with either
provider or no provider. No automatic cross-provider fallback exists.

Troubleshooting: missing selected key/model shows setup-required; invalid/revoked
keys or unsupported models show a sanitized configuration error. Verify local
settings and current model access without enabling billing. For rate/quota errors,
wait for the allowed reset; do not switch keys to bypass quota. Network/timeouts
and blocked, incomplete or invalid JSON responses save no fake results. The
backend needs HTTPS access to `generativelanguage.googleapis.com`. Live keys and
Google availability were not tested here; tests use mocked responses and a local
SDK HTTP endpoint. Run `npm test`, `npm run typecheck`, `npm run build`.

Optional voice uses browser SpeechRecognition/webkitSpeechRecognition (English `en-IN`) and speechSynthesis. It is activated only by the student's buttons. Microphone permission, browser/OS support, a secure context (or localhost), and sometimes the browser's network service are required. If recognition is unavailable or fails, text chat remains fully usable. The browser provides dictation independently of the backend AI provider.

### Verification and exact manual flow

```sh
npm ci
# Edit your existing server/.env; do not replace it.
npm run db:check
npm run typecheck
npm test
npm run build
npm run dev
```

1. Open `http://localhost:5173`, register or log in as a Student, and open Overview. With no learning or assessment records, expect honest empty states. Reload: the daily visit is recorded only once per UTC day. Existing learning/assignment records appear only for their owner.
2. Open Resume studio → Create resume. Fill every relevant section, add/remove entries, choose each template, and inspect the live preview. Save, reload, edit and save again. Export a PDF; verify all populated sections. Unfinished drafts are allowed. Export is disabled until changes are saved. Open the same resume in two tabs; a stale save should report a conflict. Unsaved edits are not autosaved; save before navigating away.
3. Open ATS analyzer. Select your saved resume, paste a real job description, and analyze. Inspect the score components, missing terms, section checks and suggestions. Reload and open a history entry. Repeat with identical saved content and description: the score must match. Edit the resume: previous history retains the original version and result.
4. Without a configured selected provider, open Mock interviews: expect AI setup required and disabled Start. After completing the Gemini Free Tier checks and private setup above, restart the backend, choose a type/difficulty/role and Start. Wait for the generated question, send an answer containing concrete detail, and check that the next question follows the conversation. Reload and continue from history. Finish at the question limit or End session; review the saved transcript. A second Student must not be able to open this session or your resume/analysis by URL.
5. In a supported browser, try Dictate answer and Read question; grant microphone permission as desired. Review dictated text before sending. Test denied permission/unsupported recognition and continue by typing. Check mobile/tablet navigation and desktop layouts. No real microphone/provider speech service is assumed by automated tests.
6. Trainer and Admin login still open their own existing workspaces. Their accounts cannot call student-feature endpoints. Authentication, logout and cookie behavior remain unchanged.

Checks were run separately after each phase: 56, 60, 64, then 83 passing tests. Both workspace TypeScript checks and both production builds passed at each phase. Current tests include real disposable MongoDB persistence/ownership, deterministic scoring, PDF signatures for all templates, watcher regression, provider errors, transcript context, concurrency, expiry recovery, and Responses SDK requests against an explicit local HTTP fixture. Those provider fixtures are tests, not a runtime fallback and not proof of a live AI call. Browser checks cover registration/session restoration, dashboard empty states, resume persistence/PDF download, analysis/history, responsive navigation, unconfigured AI, and interview chat workflows with an explicitly labeled local protocol fixture.

Actual Atlas and live OpenAI were not contacted in this cloud task: no credentials are available here. Atlas was previously verified by you locally. Checkpoints 5–6 remain **Blocked for live-provider verification**, rather than claiming a verified live AI interview. See [docs/IMPLEMENTATION.md](docs/IMPLEMENTATION.md) for routes, models, files and limitations, and [docs/CHECKPOINTS.md](docs/CHECKPOINTS.md) for status.

## Interview reports and aptitude practice (Checkpoints 6–8)

- **Feedback:** complete an interview, then review the saved AI estimate, competency breakdown, cited answer evidence, strengths, improvements, question analysis and preparation plan. Unsupported competencies are unassessed. Vocal confidence/tone/body language cannot be inferred from text. Missing AI configuration means feedback unavailable, never fake evaluations. History links reopen saved reports.
- **Assessments `/assessments`:** database-backed published aptitude, reasoning, verbal and technical tests; instructions, randomized fixed snapshots, immediate server-confirmed answer saves, question navigation, refresh/resume, server-enforced timer, manual/automatic finalization, results/explanations and history. Correct answers are hidden until finalization; scores come from the backend.
- **Insights `/analytics`:** actual overall/category/topic/difficulty accuracy, question/assessment time, evidence-limited weak/strong topics, UTC trends, history and anonymous equivalent-test batch comparisons. No data, insufficient data and real zero are distinct. Dashboard scores/readiness/activity/next steps now use finalized attempts without double-counting.

### Exact local verification for Checkpoints 6–8

From the repository root, keep your existing private `server/.env` and verified Atlas URI. Use a dedicated development database for sample data:

```sh
npm ci
npm run db:check
# Optional; NODE_ENV must be development. Never seeds on startup.
npm run seed:assessments
npm run typecheck
npm test
npm run build
npm run dev
```

1. Open `http://localhost:5173` and sign in as a Student. Open Insights before submitting any assessments: expect no-data and Comparison unavailable, not invented scores.
2. Open Assessments. Development samples are explicitly labeled. Filter each category and review instructions/scoring. Start a test, answer, navigate and reload: saved selection, question order, option order and timer persist. Use Review unanswered and clear an answer. Submit early, accept the unanswered warning and inspect the score explanation and per-question answer review. Reload and reopen history: the result is unchanged.
3. Start another attempt and let its displayed timer expire (samples are five minutes). Saved answers are automatically finalized, further editing is disabled, and closing/reopening the tab does not extend time. Repeated result visits do not duplicate completion activities. Each sample permits three attempts.
4. Open Insights: compare metrics/history against your actual results. After only one attempt, topic interpretations are insufficient evidence. More questions alone do not bypass the distinct-attempt/unique-question thresholds. Check Overview's assessment average, unchanged readiness formula, recent activity and recommended actions.
5. Batch comparison remains unavailable until an operator supplies **real** Batch/Enrollment data and at least three other members complete the same assessment version and exact question set. Use the Checkpoint 14 Admin batch UI described below to manage real memberships. No other student's individual performance is exposed.
6. For feedback, privately configure the selected backend AI provider using the Gemini setup above, then restart development. Start an interview, answer with concrete evidence, complete it and wait for the report. Inspect quoted evidence and AI-estimate labeling; reload and reopen from history. Unsupported technical competencies may be unassessed. Without a key, the application explicitly shows AI/feedback unavailable.
7. Sign out and verify private routes require login. Sign in as another Student and try the first student's attempt/interview URL: access must fail. Trainer/Admin accounts cannot access student APIs. Verify mobile/tablet navigation, assessments, insights and reports.
8. Verify backend health/readiness at `http://localhost:4000/api/v1/health` and `/api/v1/ready`. Tests use disposable MongoDB, not Atlas. For exact API bodies, scoring/analytics formulas and limitations, see [docs/IMPLEMENTATION.md](docs/IMPLEMENTATION.md).

Checkpoints 6–8 were developed and checked sequentially (90 → 101 → 107 tests). Final review passed **108 tests in 13 files**, client/server/test TypeScript checks and both production builds. Chromium verified refresh/resume, manual/automatic submission, real analytics and saved feedback using an explicitly labeled local provider fixture. Live OpenAI/Atlas were not contacted here because credentials are absent. Feedback estimates are model judgments, not objective measurements; validating quoted evidence cannot establish that every judgment is correct. Keep all credentials in the private backend configuration. The approved pre-commit review reran all 108 tests, TypeScript checks and both production builds successfully; backend enforcement, ownership, explicit development seeding and Git exclusions were reviewed.


## Coding and learning (Checkpoints 9–11)

Coding practice uses Monaco (locally bundled and loaded only on the workspace), Python/Java/C++/JavaScript templates, custom stdin, genuine provider stdout/stderr/compiler output, runtime/memory when available, explicit private draft saves and refresh restoration. The app never executes submitted code in Express or local subprocesses. No execution provider means a visible setup-required state and disabled Run/Submit; editing/saving remain usable.

### Execution provider setup

1. Obtain a trusted dedicated **Judge0 CE-compatible provider** or provision its current patched infrastructure separately. Review the provider's sandbox/process/filesystem isolation, host cgroup CPU/memory/process limits and disabled egress. Do not use an unreviewed public demo service. Provider infrastructure is separate from this MERN app.
2. Confirm it supports asynchronous `/submissions` and language IDs Python=71, Java=62, C++=54, JavaScript=63. Runtime versions depend on that provider. This adapter supports `X-Auth-Token` authentication, not RapidAPI-specific headers.
3. Set these values in your existing private **server/.env**, never React or Git:

```dotenv
JUDGE0_URL=https://your-trusted-judge.example
JUDGE0_API_KEY=<your-private-provider-token-if-required>
JUDGE0_SECURITY_CONFIRMED=true
```

Only set `JUDGE0_SECURITY_CONFIRMED=true` after verifying the isolation controls. HTTPS is required except loopback HTTP for local infrastructure/protocol tests. URL credentials and query-string keys are rejected. Without a URL AND this confirmation, execution stays unavailable. The application cannot attest provider infrastructure just from configuration.

4. Restart `npm run dev`. Run a simple stdin/print program in each language and verify real output, compile/runtime errors, an infinite-loop timeout and provider-reported memory. Test network/file/process restrictions in that infrastructure before exposing the service. API presence alone does not prove isolation. Never run these programs inside the Express process.

Backend requests specify CPU 2s (+0.5s extra), wall 5s, memory 256 MiB, stack 64 MiB, process/thread cap 32, file/output cap 16 KiB, one run and network disabled. Provider polling/request deadline is 20s per case; judge processing has a 90s reservation, refuses another case with fewer than 20s remaining. Provider output/response size is bounded. Providers must enforce limits at the host as well; language/runtime memory reporting varies. Judge0 has no portable separate memory-limit verdict: this app labels MLE only when reported usage exceeds the bound, otherwise preserves the runtime/error status. Live provider execution has **not been verified in this cloud environment**.

### Local coding checks

```sh
npm ci
npm run db:check
npm run seed:coding   # Optional, NODE_ENV=development, dedicated development DB
npm run dev
```

Open Coding practice → switch through all four languages → edit code and stdin → Save draft → reload. Each student/language/problem scope has its own versioned draft. Save before navigating away. Java uses class `Main`; JavaScript uses Node stdin via `fs`.

Browse challenges at `/coding/problems`, filter difficulty/topic and inspect statements/formats/constraints/examples. The seed creates three clearly marked database-backed sample problems: Easy (sum), Medium (reverse a word), and Hard (longest increasing subsequence). Each includes valid examples, four-language metadata and backend-only hidden cases. It validates the entire bank, inserts missing keys only, preserves edited existing problems and all submissions, refuses non-demo key collisions and never runs on startup. Production hides samples. With configured isolation, Run uses custom/sample stdin; Submit evaluates backend-only hidden cases. After finalization inspect the private history and real solved indicators. Retry the same request after a network failure to reuse its request ID; duplicates do not reprocess. Wrong answers, timeouts, compile/runtime/memory and system errors have explicit verdicts. Hidden inputs, expected/actual outputs and diagnostics are never returned by judging.

Scores = passed hidden cases / total cases × 100 rounded. Output comparison normalizes CRLF/CR, trailing spaces/tabs per line and final newlines; leading/interior whitespace and case remain significant. Runtime/memory are max reported case values. System Error has no performance score; its infrastructure failure does not fabricate a successful run. Latest 100 private submissions appear in history.

Dashboard coding metrics count actual judged submissions and distinct attempted/accepted problems. The readiness weights remain 25% profile / 40% learning / 35% performance. **Documented extension:** when coding evidence exists, performance is the mean of available assessment average and coding solve rate; without coding evidence the existing calculation is unchanged. Solve rate = distinct solved / distinct attempted problems; repeated submissions do not inflate it. System Errors are excluded.

### Learning publishing and consumption

Sign in as a securely provisioned Trainer/Admin and open Learning content. Create a draft with subject/topic, description/objectives, text lessons or HTTPS resources. Save; publish the saved module; edit and save changes; view student progress; unpublish. Trainers can manage only modules they own and view progress only for their currently assigned Students. Admins can manage all modules. That Checkpoints 9–11 delivery did not add batch management; the later Checkpoint 14 increment below adds batches and Student profiles.

Sign in as a Student and open `/learning`. Filter by subject/topic/completion, open a published module, navigate lessons, mark complete/incomplete, reload and resume. Completion IDs and last visited lesson persist privately; duplicate completion requests create no duplicate progress/activity. Progress percentages use the current published lesson set, so removing lessons/unpublishing updates dashboard evidence. Text is escaped, not rendered as HTML; links require external HTTPS without credentials/local or IP hosts. The backend never fetches resource URLs.

**PDF/file uploads are not implemented:** there is no configured private storage, malware scanning, file validation/download authorization or end-to-end upload flow. The UI explicitly states this limitation; only text/external links are supported. Do not add an unrestricted upload folder as a substitute.

Run `npm run typecheck`, `npm test`, `npm run build` for regression checks. Tests use real disposable MongoDB and clearly labeled mocked provider/protocol fixtures, never execute student code or prove live sandbox isolation. See [docs/IMPLEMENTATION.md](docs/IMPLEMENTATION.md) for routes/models/limits and [docs/CHECKPOINTS.md](docs/CHECKPOINTS.md) for phase results. Checkpoints 12–15 remain unimplemented. The implementation was reviewed before the approved final verification and commit.


### Coding seed setup and checkout troubleshooting

The published commit `1ceaaa5` already contains both `seed:coding` npm scripts, `server/src/utils/seedCoding.ts`, registered student coding routes, and enabled Coding practice/Learning modules sidebar links. The follow-up fix adds the missing Hard sample, explicit supported-language metadata, stronger seed destination checks, and automated command-level regression coverage. It does not replace working navigation or authentication.

Before seeding, configure **private `server/.env`**:

```dotenv
NODE_ENV=development
# Keep your real connection string private; select a dedicated development DB.
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster-host>/disha360_dev?retryWrites=true&w=majority
CODING_SEED_DATABASE=disha360_dev
```

Use a database containing development data only, preferably with an Atlas database user restricted to that database. Changing the URI's database path selects a different database; it does not migrate existing accounts or submissions. Sign up separately in the development database if needed. Do not rename a production database to bypass these checks. The seed command requires development mode and explicit acknowledgement of the **same** database selected by the URI; the name must end `_dev`, `_development`, or `_demo`. It refuses other modes, missing acknowledgement, and mismatched destinations before connecting. Naming and mode checks cannot independently prove that a database contains no production data: choosing a dedicated development database remains the operator's responsibility.

From the repository root:

```bash
npm ci
npm run db:check
npm run seed:coding
npm run seed:coding  # Repeat: 0 inserted; existing problems/submissions unchanged
# Equivalent server workspace invocation:
npm run seed:coding -w server
npm run dev
```

Without Judge0 configuration, sign in as a Student → click **Coding practice** in the sidebar → switch languages → edit code and custom stdin → **Save draft** → refresh and confirm restoration. Open **Browse challenges** and filter Easy/Medium/Hard. Hidden cases never appear in problem details or submission responses. Run/Submit remain disabled with a visible setup-required message; Monaco, templates, navigation and draft persistence remain available. **Learning modules** is also an enabled student link; an empty library means no published content, not a disabled feature.

If macOS reports `Missing script: "seed:coding"` or displays grey Coding/Learning items, inspect the actual checkout from the terminal used to launch the app:

```bash
pwd
git rev-parse --show-toplevel
git log -1 --oneline
npm pkg get scripts.seed:coding
npm pkg get scripts.seed:coding -w server
git show HEAD:package.json
git show HEAD:server/package.json
git ls-tree HEAD server/src/utils/seedCoding.ts
git status --short
git diff HEAD -- package.json server/package.json client/src/layouts/AppLayout.tsx client/src/main.tsx
```

Compare the working files with the committed versions; preserve local changes before resolving discrepancies. No script in the current committed root/server manifests is missing. A different directory, different working files or an older running frontend can explain the symptom, but this cloud review cannot identify the exact state of your Mac. Stop the previous dev process with Ctrl+C, restart `npm run dev` from the verified repository root, and hard-refresh the browser. Check that the browser uses the URL printed by Vite. If a port is already occupied, identify its owner with `lsof -nP -iTCP:5173 -sTCP:LISTEN` (and port 4000) before deciding which local server to stop. Do not reset or overwrite uncommitted work just to repair navigation.

Verification commands: `npm run typecheck`, `npm test`, `npm run build`. Seed regression tests execute both real npm entry points against an isolated MongoDB database, verify production-mode refusal before connection, validate all examples/hidden outputs, and test repeat/concurrent seeding, existing-data preservation, language metadata and public answer confidentiality. The follow-up review passed **147 tests in 17 files**, all TypeScript checks and both builds. Browser verification used a disposable MongoDB-backed API and Vite proxy with no execution provider; it does not verify live Atlas/Judge0/OpenAI services.

## Company-wise preparation (Checkpoint 12)

Students can open **Company preparation** from the sidebar, search by company/topic and filter by checklist status. Each profile includes an overview, illustrative stages, aptitude/technical/coding/HR topics, general interview prompts, real published resource recommendations and a private editable preparation checklist. All six development samples—TCS, Infosys, Wipro, Accenture, Cognizant and Capgemini—are **illustrative study plans**, not verified recruitment facts. Requirements vary by role and year; check the current official job posting.

Checklist completion is self-reported: **round(current completed items / current checklist items × 100)**. It persists per student/company. It does not change assessment results, coding verdicts or placement readiness. Duplicate completion requests do not add duplicate progress; removed items do not count toward the current checklist.

### Explicit development sample setup

In private `server/.env`, use your actual MongoDB connection string selecting a dedicated development database and set:

```dotenv
NODE_ENV=development
# URI database path must match, e.g. /disha360_dev; keep credentials private.
COMPANY_SEED_DATABASE=disha360_dev
```

This reuses the coding seed destination safety guard: the acknowledged name must end `_dev`, `_development` or `_demo`, match the URI's explicit database path, and use development mode. Never point it at a database containing production data. These checks cannot prove what data an operator has placed in a development-named database; use a dedicated database and restricted database user. Selecting a different URI database does not migrate your existing accounts.

From the repository root:

```bash
npm ci
npm run db:check
npm run seed:companies
npm run seed:companies  # 0 inserted on repeat
# Equivalent: npm run seed:companies -w server
npm run dev
```

Seeding validates profiles, inserts missing sample keys only, rejects non-demo collisions and preserves existing company edits, publication flags and checklist progress. It never runs on startup and never creates learning modules, assessments or coding problems. Samples are hidden when the application is not in development mode. Optional existing `seed:coding` and `seed:assessments` commands can populate their own development banks; they are separate explicit operations.

### Local verification

1. Register/log in as a Student. Click **Company preparation**. Six labeled samples should appear after explicit seeding; otherwise expect the helpful empty state.
2. Search `TCS`, open its preparation plan and inspect the illustrative stages, study topics and general interview prompts.
3. Mark two checklist items complete: expect **40%**. Refresh the page and return to the directory: progress persists. Uncheck an item: expect **20%**. Use the In progress/Complete filters.
4. Register a second Student: the same company starts at **0%** for that account. Trainer/Admin do not have student company-progress access.
5. Open recommended modules/problems/assessments. Recommendations use actual published records matched by curated topics or categories; no matching records produce empty states. Closed/future assessments or assessments without enough published questions are omitted. Resource availability is rechecked on navigation by the existing destination APIs.
6. Open the linked mock interview workspace. Missing OpenAI credentials still show the existing setup-required state; no company-specific AI interview or fake interview is generated.
7. Repeat checks on a phone/tablet-sized viewport. Run `npm test`, `npm run typecheck`, and `npm run build` for regression verification.

No new paid service or credentials are required beyond the existing MongoDB configuration. Company content is read-only for students; full company authoring is outside this checkpoint. Profiles are database-backed, not hardcoded frontend cards. General recommendations are not employer-endorsed resources and do not guarantee hiring outcomes. Lists are capped at 200 company profiles and 12 items per resource group for this prototype; no pagination is added. Live Atlas/OpenAI/Judge0 verification remains unchanged from earlier checkpoints.

Checkpoint 12 verification: **161 tests / 18 files**, all client/server/test TypeScript checks and both builds passed. Browser checks covered real database-backed Student navigation, search, saved checklist reload/uncheck, actual module links, resource empty states and phone/tablet/desktop layouts. Testing uses a disposable real MongoDB server, not Atlas. On a fresh test cache, if parallel MongoDB binary downloads collide, first run `npm run test -w server -- test/companies.test.ts` to populate the verified cache, then rerun the full suite. The existing lazy Monaco bundle advisory remains.

## Test Trainer and Admin login locally

All roles use the same `/login` form. There is no role dropdown: MongoDB stores the role and the backend returns it after a successful login. Students cannot register a staff role or edit their own role.

The existing `npm run user:create` is the authorized operator command for regular staff accounts. For **local test accounts**, use its new guarded `--development` option. It refuses production mode and unacknowledged/mismatched database destinations before connecting, creates accounts marked as development/demo accounts, and refuses existing emails. These test accounts and their sessions are blocked when the app runs outside development, even if you later point a production app at the same database. No accounts are created automatically on application startup.

### 1. Prepare the private development configuration

Open **`server/.env`**, not `.env.example`. Keep your real MongoDB credentials there and never commit them. Ensure:

```dotenv
NODE_ENV=development
# Your MONGODB_URI must explicitly select this same dedicated development database.
PROVISION_DATABASE=disha360_dev
```

The database selected in your private connection string must match `PROVISION_DATABASE` and end `_dev`, `_development`, or `_demo`, following the existing coding/company seed safety approach. Never select a database containing production data. If your existing database is named differently, selecting `/disha360_dev` creates a separate development database; it does not migrate or delete your existing students, resumes or other records. Run the backend against the same URI used for provisioning to find the new accounts. Remove conflicting exported `PROVISION_*` variables if they override your file values.

### 2. Create one Trainer

Add these **private values** to `server/.env`, choosing your own email and password:

```dotenv
PROVISION_NAME="Local Trainer"
PROVISION_EMAIL="<your-private-trainer-email>"
PROVISION_ROLE=trainer
PROVISION_PASSWORD="<your-own-private-strong-password>"
```

Replace the placeholders; do not use them as credentials. Passwords need 12–128 characters, at least one uppercase letter, one lowercase letter and one number. Use a different password for each test account. Do not paste passwords into chat, command-line arguments or shell history. From the repository root:

```bash
chmod 600 server/.env
npm run db:check
npm run user:create -- --development
```

Success prints `Staff account created. Credentials omitted.` No email/password/hash is printed. A duplicate email is refused, including an existing Student; the script never promotes or overwrites that account.

### 3. Create one Admin

In the same private file, replace only the provisioning fields with your second account:

```dotenv
PROVISION_NAME="Local Admin"
PROVISION_EMAIL="<your-private-admin-email>"
PROVISION_ROLE=admin
PROVISION_PASSWORD="<a-different-private-strong-password>"
```

Run the same explicit command:

```bash
npm run user:create -- --development
```

Remember your two chosen passwords securely. **Delete the `PROVISION_NAME`, `PROVISION_EMAIL`, `PROVISION_ROLE`, `PROVISION_PASSWORD` and `PROVISION_DATABASE` entries from `server/.env` after creating the accounts.** The stored hashes remain; removing configuration does not remove the accounts. The equivalent invocation from `server/` is `npm run user:create -- --development`. Root argument forwarding is covered by automated tests.

### 4. Log in and verify access

```bash
npm run dev
```

Open `http://localhost:5173/login`. If already signed in, use **Sign out** first; otherwise Disha360 will restore that account's session and send you to its workspace.

| Account | Login with | Expected landing page | Working staff navigation |
|---|---|---|---|
| Student | Your registered student email/password | `/dashboard/student` | Student preparation modules |
| Trainer | The Trainer email/password you selected | `/dashboard/trainer` | Assigned batches, Student directory, Learning content |
| Admin | The Admin email/password you selected | `/dashboard/admin` | Institution overview, Batches & students, Student directory, Learning content |

Refresh after logging in: the session should persist. Staff dashboards, batch management and the scoped student directory are now functional in the Checkpoint 14 increment described below. Assessment authoring, assignments, reports and Trainer workloads are now available. Existing **Learning content** remains available.

- As a Student, visit `/dashboard/admin` or `/learning/manage/trainer`: the frontend redirects to `/dashboard/student`; the corresponding protected backend endpoints deny access.
- As a Trainer, visit `/dashboard/admin`: return to `/dashboard/trainer`. Create a learning draft, save and publish it. A Trainer can manage only their own modules; attempting another Trainer's module is denied.
- As an Admin, visit `/dashboard/trainer`: return to `/dashboard/admin`. In Learning content, Admin can manage modules owned by Trainers according to existing permissions.
- Staff accounts cannot use Student-only APIs for resumes, assessments, coding, analytics or company checklists. A frontend redirect never grants backend privileges.
- Sign out, then revisit a dashboard: expect `/login`. No public staff signup or role-edit API is added.

If login fails, confirm the backend and provisioning command use the same `server/.env`/database, the account email is unique, and the app runs with `NODE_ENV=development` for these test accounts. Restart `npm run dev` after changing environment configuration; never use production mode merely to test local staff accounts.

### Verification for this follow-up

`npm test` now runs both existing backend integration tests and client component tests. `npm run typecheck` checks client source/tests and server source/tests. `npm run build` builds both production targets. Client tests exercise the actual Login and ProtectedRoute components; the router navigation boundary is instrumented to assert redirects without introducing a browser dependency. Backend tests execute both actual npm provisioning entry points, test all role logins and permissions, prevent public role injection/promotion, reject unsafe development destinations and preserve existing accounts. No production login or dashboard implementation was replaced.

Final follow-up verification: **183 tests passed** (167 backend in 18 files, 16 client component tests in one file), client/server/source-and-test TypeScript checks passed, and both production builds passed. Chromium with disposable MongoDB verified Student registration/login, actual Trainer/Admin accounts provisioned through the guarded npm command, role-specific landing/refresh, wrong-role redirects, authorized Learning content navigation, backend role denial and logout. No browser runtime errors occurred. New command-level tests have explicit longer timeouts for their nested npm subprocesses; no assertions were skipped. No live Atlas or provider access was used. Existing staff dashboard placeholders and the Monaco chunk-size advisory remain. No additional checkpoints are implemented; this verification report was recorded before the approved commit/push.

## Trainer/Admin management — Checkpoint 14

The existing Phases 1–3 are preserved. Assessment authoring, batch assignments, reporting and Trainer workloads extend the same authentication, models and Disha360 interface.

- **Admin:** real institution dashboard, batch creation/edit/archive, Student memberships, all assessment/learning management, institution reports and Trainer workload/assignment controls.
- **Trainer:** actual assigned-batch dashboard and Student directory, own assessment/question and learning content management, assignments to active authorized batches and reports for assigned Students only.
- **Students:** existing published assessments and lessons remain available. Batch assignments feed actual upcoming tasks and recommended actions. No grading, readiness formula, judging or authentication rewrite.
- Working navigation includes Questions & tests, Assignments, Learning content, Reports & analytics, and Admin Trainers & accounts. Empty data stays empty; no metrics are invented.

No public privileged signup or role-edit endpoint is added. Reuse `npm run user:create -- --development` with the private configuration instructions above. No new environment variables or paid services. The only added application dependency is `csv-parse` for validated CSV input.

### Local verification

```bash
npm ci
npm test
npm run typecheck
npm run build
npm run dev
```

1. Configure private `server/.env` with your development **MongoDB Atlas URI or replica-set URI**. Transactions are required for atomic question imports/edits and assignments. Standalone MongoDB receives a clear setup error rather than partial writes. Never use production data for manual testing.
2. Provision a Trainer and Admin securely; register two Students. Sign in at `http://localhost:5173/login`. As Admin create an active batch, assign the Trainer and add one Student. Search the Student directory and verify new profiles show missing evidence honestly.
3. Open **Questions & tests → Create assessment**. Save title, instructions, category, duration (seconds), scoring/penalty, attempt limit and question count. Add four-option questions, edit/delete while draft, or download the CSV template and import it. Invalid or duplicate rows reject the whole import. Publish only after the configured question pool is sufficient.
4. Assign the published assessment to the active batch and choose a task due date. This date organizes upcoming work; the assessment duration and opening/closing window still govern attempts on the backend. Existing attempts retain immutable question/scoring snapshots when staff unpublish or edit later drafts.
5. As Trainer create and publish an owned learning module, assign it to your batch and open its completion table. As Student complete a lesson and an assessment, refresh, then return to Trainer reports to verify actual persisted results. Unrelated Students/batches are inaccessible to Trainer staff APIs; Students cannot access staff APIs or answer keys.
6. Open **Reports & analytics**, filter by batch/assessment (Admin may also filter Trainer), and export CSV. Assessment detail also exports attempt results. Scores are blank with no scored evidence, distinct from real zero. Company completion is explicitly a self-reported checklist, not a readiness score.
7. As Admin open **Trainers & accounts**: inspect unique Student counts, active/archived batches, owned content and assignment workloads. Assign/remove a Trainer and verify access is revoked immediately when no other active assigned batch grants scope. Archived batches cannot receive new assignments.
8. Test mobile sidebar and pages at phone/tablet/desktop widths. Verify publication, saved progress, reports and CSV downloads after refresh.

CSV columns (exact order):

```csv
prompt,topic,difficulty,option_a,option_b,option_c,option_d,correct_option,explanation,expected_seconds
"What is 2 + 2?",Arithmetic,easy,1,4,3,5,b,"Two plus two equals four.",60
```

`difficulty` is `easy`, `medium` or `hard`; `correct_option` is `a`, `b`, `c` or `d`. Use four distinct options. Import is limited to 50,000 UTF-8 bytes and 100 rows; question pools are capped at 200. All rows validate before transactional insertion. Duplicate normalized prompts, stale edits or malformed files fail without partial questions. CSV exports escape formula-like text cells.

Limitations: reports cap each filtered export at 1,000 Students (narrow filters if exceeded); UI pages show 25. Prototype scopes/aggregations operate in memory. Existing account pickers cap matches at 500. Published resources remain browsable beyond batch assignments. Legacy ownerless assessments are Admin-only; shared legacy questions are copied on editing and detached on deletion. No new PDF upload or in-app privileged provisioning is claimed. Live Atlas/OpenAI/Judge0 verification remains separate from disposable-database testing. Checkpoints 13 and 15 remain untouched.

See [docs/IMPLEMENTATION.md](docs/IMPLEMENTATION.md) for APIs, models, calculations, permissions and final verification results.

Final verification: **221 tests passed**, all client/server/source-and-test TypeScript checks and both production builds passed. Chromium verified actual authoring/import/assignment/completion/report/export/workload workflows and 375/768/1440px management layouts/mobile navigation with no runtime errors or overflow. Security tests verify backend scopes and protected answer keys. No production database or live provider was contacted; nothing is committed or pushed.

## Leaderboard, badges and activity streaks — Checkpoint 13

Student navigation now includes **Leaderboard** and **Achievements**. The dashboard shows earned badges, point breakdown, meaningful current/longest streak and last active UTC day. The existing visit-inclusive activity indicator is separate and never feeds engagement points or streaks.

Points are calculated on the backend from saved records:

| Activity | Points | Repeat rule |
|---|---:|---|
| Finalized assessment with at least one answered question | Rounded best normalized score, 0–100 | Best score once per assessment ID, across versions and retakes; improving it adds only the difference |
| Accepted coding challenge | Easy 50 / Medium 100 / Hard 150 | Once per distinct problem; uses its current database difficulty |
| Verified full learning module | 40 | Once per module; later unchecking/recompletion cannot earn more |

Unanswered-only expiries, failed code, login, page visits, company checklist clicks and raw legacy counters earn nothing. Valid zero-scoring answered assessments remain completed achievements with zero points. Rankings sort points descending, then completed assessments, solved coding problems and completed modules descending, finally Student ID ascending. Ranks are ordinal and deterministic.

Six badges have clear criteria: first assessment; first accepted problem; five distinct accepted problems; one full module (Learning Explorer); seven consecutive meaningful UTC days; best scores of at least 70% on five distinct assessments (Consistent Performer). Badge awards are persisted with a unique Student/key index. Criteria are verified automatically when engagement, dashboard or leaderboard views load; there is no claim or points-writing button.

**UTC streak policy:** one day per UTC calendar date, regardless of how many activities occur. Answered finalized assessments (including allowed retakes), each first Accepted coding solve and each first module completion qualify. A current streak may end today or yesterday; missing a full UTC day resets current streak to zero. Longest streak and badges remain. This is independent of the device's local timezone.

Older complete learning progress can earn points after verification of current lesson IDs. When its exact completion date is unknown, recognition is saved separately and **no historical streak date is invented**. New completions save their actual first-completion timestamp. Repeating an already-full historical module does not manufacture a new completion date. The interface explains any such unknown dates. Learning completion is self-marked progress, not proof of mastery.

### Local testing

1. Use a private development MongoDB configuration and existing account provisioning; run `npm ci`, `npm test`, `npm run typecheck`, `npm run build`, then `npm run dev`.
2. Sign in as Student and open Leaderboard/Achievements. With no qualifying records, expect zero points, locked badges and no meaningful streak, even after visiting the dashboard.
3. Complete an assessment with at least one selected answer. Open Achievements: its best normalized grade contributes up to 100 points and unlocks the first-assessment badge. Retake it: equal/lower grades add no points; a higher grade replaces the prior contribution.
4. Complete every lesson of a published module: expect 40 points and Learning Explorer. Refresh, uncheck/recomplete or visit: no duplicate points or new module streak day.
5. With a genuinely configured isolated coding provider, earn an Accepted verdict to test difficulty points. Without a provider, there are no pretend solves or bonus points; existing setup-required states remain.
6. In an active batch, choose that batch in Leaderboard scope. Current rank remains visible even outside the current page. Peer profiles show display names, counts and badges without email, answer keys or private performance details.
7. As Trainer, open Leaderboard to see assigned active batch members and their authorized achievements. Unrelated/archived batches and unrelated Student achievement URLs return 404. As Admin, inspect global engagement totals and filter active batches.
8. Check phone/tablet/desktop navigation and refresh persistence. Streak boundary tests use fixed UTC dates in isolated automated tests; never edit production records to create streaks.

No new environment variables, paid services, application dependencies or seed commands are required. Prototype limits: 500 Students per leaderboard, 25 rows/page, 500 active batches per selector, 20,000 grouped records per activity kind, and ten-second aggregation timeouts. Over-limit views fail explicitly rather than showing incomplete ranks; narrow to an active batch. Larger deployments need precomputed totals/incremental workers and query pagination. No caching lag is introduced here. Existing live OpenAI/Judge0 and PDF-upload limitations remain. Checkpoint 15 is reserved for final UI polish; this work implements only Checkpoint 13.

Checkpoint 13 verification: **243 tests passed**, all client/server source/test TypeScript checks and both builds passed. Chromium verified actual saved points/badges/streaks, Student/staff access and 375/768/1440px layouts without page errors or overflow. No production data or live provider was used; the work remains uncommitted. Full endpoint/file/permission evidence is in [docs/IMPLEMENTATION.md](docs/IMPLEMENTATION.md).


## Responsive UI and accessibility — Checkpoint 15

The existing Disha360 UI now has a keyboard-accessible mobile drawer, responsive
forms/cards/table scroll regions, clearer text contrast, touch-friendly controls,
visible focus, route titles/main-focus announcements, accessible loading/error
states and improved registration validation feedback. Authentication forms come
first on phones. Coding offers the existing Monaco syntax editor in high contrast
and an accessible plain text editor; both save the same private drafts. Missing
Judge0 still disables execution, never editing or saving. Failed editor loading
falls back to actual text editing without pretending execution succeeded.

Run `npm test`, `npm run typecheck`, `npm run build`, then `npm run dev` with your
existing private development database. **248 automated tests pass**, including the
original 243 regressions. No new environment variables or application dependencies
are required. See [docs/UI_AUDIT.md](docs/UI_AUDIT.md) for confirmed findings, role
page checklist, five-width browser checks and step-by-step keyboard/workflow tests;
[docs/IMPLEMENTATION.md](docs/IMPLEMENTATION.md) explains implementation and limits.

Chromium checks cover real Student and staff operations against disposable MongoDB.
No production data is used. OpenAI/Judge0 live results, secure PDF resource uploads,
Safari/Firefox/mobile hardware and manual screen-reader audits remain unverified.
Automated accessibility checks do not constitute WCAG certification. The existing
lazy Monaco build-size advisory remains. Commit and push require explicit review approval.

Final browser matrix: **55 role-specific route views at 320, 375, 768, 1024 and
1440px (275 layout checks)**. No remaining axe WCAG violations, document overflow
or unexpected runtime/console errors after corrected findings and targeted reruns.
The full route/finding checklist is in `docs/UI_AUDIT.md`.

## OneCompiler, Coding Mentor and SparkMeet live classes

The existing editor, drafts, challenge/submission models, deterministic judging,
progress, badges and analytics remain in use. Judge0 is preserved behind
`JUDGE0_SECURITY_CONFIRMED=false`; Coding Demo Mode remains development-only and
its separate demo endpoints never call an execution provider or save submissions.
Disable `CODING_DEMO_MODE` to use real Run/Submit buttons. No student code runs on
the Disha360 server, and Gemini never grades a coding submission.

### Local configuration

1. Run `npm ci` using the project's supported Node.js version (22.12 or newer).
2. Keep your recovered private `server/.env` and existing database connection.
   Add settings locally without overwriting the file; this implementation did not
   modify it. Keep real keys out of Git, React, logs and screenshots.
3. Review your OneCompiler account's credits, billing/recharge behavior and worker
   security. For a ₹0 budget, verify remaining free credits and prevent paid
   purchases/recharges externally before enabling execution. The application
   cannot inspect billing state or guarantee a rupee cap from a key.
4. Configure the following backend settings privately and restart the backend:

```dotenv
ONECOMPILER_API_KEY=
ONECOMPILER_ENABLED=false
ONECOMPILER_MAX_EXECUTIONS_PER_DAY=100
```

Fill your existing key and explicitly set `ONECOMPILER_ENABLED=true` when ready.
This provider takes precedence over Judge0; missing credentials never silently
fall back. With OneCompiler disabled, the existing Judge0 security gate still
applies. No billing, accounts, paid resources or real external test calls were
created here. The daily limit counts testcase attempts per process/UTC day, not
credits; failures count, and restarting or multiple instances affect that local
limit. Set a lower limit for your allowance. It is not a durable monetary budget.

5. Keep the existing Gemini settings unchanged. The mentor uses `AI_PROVIDER=gemini`,
   `GEMINI_API_KEY`, `GEMINI_API_KEY_BACKUP`, `GEMINI_MODEL`, and
   `GEMINI_KEY_SELECTION=primary|backup`. Only the manually selected key/model is
   used; configuration changes require restart. No model was guessed or switched:
   the proposed “Gemini 3.8 Flash” API identifier and current Free Tier eligibility
   remain unverified. Follow the Gemini setup/privacy section above.
6. Run `npm run dev`. Sign in as Student and open Coding practice. Use Run with
   custom stdin, or open a published challenge and Submit. History shows only
   genuine backend-evaluated results; API failures save no successful verdict.
7. For classes, use existing Admin batch management to assign a Trainer and enroll
   Students. A Trainer opens **Live classes → Schedule Live Class**, chooses their
   batch, title, description, local start date/time, duration and a meeting link
   independently obtained from SparkMeet. Admins can also assign batch trainers.
   Save, edit notes/resources, launch or cancel from class details. Students see
   their enrolled batches on Overview and Live classes, open details, and join in
   a new tab. Attendance history is visible in the class list/details.
8. After a class starts, its Trainer or authorized Admin selects present, absent
   or excused from their observation and saves manual attendance. Opening a link
   does not mark attendance. Students see only their own attendance.

### Execution contract and limitations

The direct API uses `POST https://api.onecompiler.com/v1/run`, JSON and the
backend-only `X-API-Key` header. Its request is `language`, `stdin`, and
`files: [{ name, content }]`. Identifiers are `python`, `java`, `cpp`, and
`javascript`; filenames are `main.py`, a conventional public Java type's name
(`Main.java` otherwise), `main.cpp`, and `main.js`. Single-file Java projects with
complex packaging/annotations or multiple public top-level types may need
adaptation; no local compiler is used to infer a launch target.

Source/standard input use the existing 30,000/10,000-character validation plus a
40,000-byte encoded request cap. Runs have a 20-second deadline. Batches contain
at most ten tests and 10,000 combined stdin characters per provider call; larger
legitimate test sets are split conservatively. Responses are capped at 250,000
bytes, each displayed output at 16 KiB, and provider calls at ten/minute and two
concurrent calls per backend process. Existing per-Student route limits remain.
No retries or alternate paid execution provider are selected automatically.

Run displays stdout, stderr, compilation diagnostics, runtime exceptions and any
reported metrics (milliseconds are converted to seconds; memory is KB). A run
finishing is not proof of solving a problem. Submit reads authoritative hidden
stdin/stdout tests from MongoDB, sends inputs only to OneCompiler, validates batch
length and echoed stdin ordering, and compares stdout locally. Expected answers
are never sent to the provider. Normalization converts CRLF/CR to LF, strips
trailing spaces/tabs on each line and trailing newlines; leading/interior spaces
and letter case remain significant. Current problems use stdin/stdout, not
function-signature harnesses. Submit returns aggregate passed/total/verdict/score,
never hidden inputs, expected/actual outputs or hidden compiler/runtime details.
Partial/malformed/infrastructure-failed grading has a null score and cannot count
as solved. Request IDs prevent duplicate submission work and existing analytics
consume the completed records normally.

`status: "success"` alone never proves successful execution or correctness. The
supplied contract exposes no exit code or portable compilation-vs-runtime code.
The adapter fails conservatively on stderr/exceptions; classification of actual
diagnostic text is heuristic, so successful programs intentionally printing to
stderr can be rejected. Empty stdout is valid and compared normally. E001–E006,
HTTP errors, quotas, timeouts and malformed output produce safe messages. Either
documented remaining-credit field is recognized; a zero value prevents subsequent
calls in that process. The deadline does not prove a remote job was terminated.
CPU, memory, filesystem and network isolation are provider-managed and were not
independently verified; Judge0's enforced limits are not claimed for OneCompiler.

The endpoint/header/schema, batch behavior, E001–E006, 100 introductory credits,
input allowances and pricing were supplied by the user from the
[official OneCompiler documentation](https://onecompiler.com/api). Independent
access here returned proxy HTTP 403. Credit consumption is not assumed to be one
credit per call/test. Verify account-specific terms and limits before live use.

### Coding Mentor and SparkMeet safeguards

The mentor offers code/error explanations, debug/optimization advice, complexity
analysis, solution approaches and three progressive hint levels. Full solutions
require explicit opt-in; mentor data sharing requires an unchecked consent box.
Only editor code, public problem fields and user-visible Run diagnostics are sent,
never backend hidden tests or demo output. Advice is labeled unexecuted/unverified,
rendered as text and does not create scores, submissions or rewards. It shares
the existing Gemini timeout, schema validation, ten-per-minute/two-concurrent
limits, plus five requests/minute per Student and an 1,800-output-token cap.

SparkMeet URLs are restricted to the exact HTTPS origin
`https://sparkmeet-web.onrender.com`; credential-bearing URLs, lookalike domains,
other protocols/ports and control characters are rejected. Links open in a new
tab with `noopener noreferrer` and no referrer. No extra SparkMeet environment
settings are needed. The app and integration documentation were inaccessible
(proxy HTTP 403), so embedding, meeting-creation APIs, deep-link parameters,
SSO/tokens and in-room access controls remain **unverified**. Disha360 neither
generates room URLs nor claims to secure participation inside SparkMeet. Trainers
must verify actual room links and SparkMeet access controls themselves. No WebRTC
system, guessed API, fake attendance or optional mentorship workflow was added.
Live/Completed describes the stored schedule, not detected video activity.
Cancelling an LMS class hides its link; it does not terminate a SparkMeet room.
Saved manual attendance remains visible to authorized staff and counts in totals,
including records from cancelled classes or previously enrolled Students.

Class APIs retain existing role/session, origin/CSRF, no-store, database and rate
protections. Students need active enrollment in an active batch; trainers need
both class ownership and assignment to that active batch. Admins manage all
classes. Private meeting URLs appear only in authorized details and are omitted
for cancelled classes. Updates use version checks; duplicate create requests are
idempotent. Notes/resources are text/HTTPS links; attendance is validated against
enrollment and records the operator/time. These checks cannot revoke a link
already shared outside the LMS.

Testing commands: `npm test`, `npm run typecheck`, `npm run build`. External
responses are mocked; MongoDB tests use disposable instances. See
`docs/IMPLEMENTATION.md` for endpoints, indexes and final verification evidence.

Production deployment preparation and exact Render/Vercel settings are documented in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). Deployment requires separate approval.

Run `npm run providers:check` for safe backend provider diagnostics. It verifies the configured Gemini model through read-only Google metadata when credentials exist, never generates content or executes code, and reports missing environment settings without printing secrets. OneCompiler credential validity and credit balance require separate account/live verification. Configure keys securely in environment settings; do not paste them into chat or overwrite your private `.env`.
