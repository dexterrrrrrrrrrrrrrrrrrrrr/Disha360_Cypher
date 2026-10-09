# Disha360 Placement Training LMS

A placement training LMS built with React, Vite, TypeScript, Tailwind, Express, and MongoDB. **Checkpoints 1–4, 7–8 and text/link learning (11) are implemented and locally verified.** Checkpoints 5–6 have a real OpenAI integration and tested workflows; live AI verification requires backend credentials. The student dashboard reads actual MongoDB records and shows empty states when performance evidence is absent. The existing design system and project structure are preserved.

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

Checkpoints 1–4, 7 and 8 are implemented; Checkpoints 5–6 await live provider verification. Coding workspace/judge (9–10) are implemented with live-provider verification pending. Checkpoints 12–15 remain out of scope. Your locally verified Atlas connection was not re-tested here because its credentials are not available in this cloud runtime. The auth flows were verified using an isolated actual MongoDB server. See [docs/CHECKPOINTS.md](docs/CHECKPOINTS.md) for status.

## Student preparation features (Checkpoints 2–8)

- **Dashboard `/dashboard/student`:** personal details, learning completion, recorded assessment average, upcoming assignments, UTC daily streak, persisted recent activity, and next actions derived from the student's resume/interview records. Readiness is an explicit estimate: 25% profile completeness + 40% recorded lesson completion + 35% recorded assessment average. Missing performance records contribute no points; their displayed metrics are blank. A new student with a complete profile has a 25% estimate, not an invented test score. Dashboard visits count as daily check-ins. Students cannot set scores: the assessment engine calculates them from saved answers. Published text/link learning and saved completion are now available.
- **Resume studio `/resumes`:** private structured drafts, personal details, education, skills, projects, experience, certifications; Classic, Modern, and Compact templates; live preview; explicit save; server-generated PDF. Reload preserves saved content. Save before exporting; the PDF uses the saved version. Concurrent edits are rejected with 409 instead of overwriting a newer version. Resume lists show the latest 100 drafts.
- **ATS analyzer `/resume-analyzer`:** select a saved resume and enter a 50–12,000-character job description. Deterministic keyword extraction, matched/missing keywords, five completeness checks, evidence checks, component breakdown and suggestions. Scores are reproducible, never random. No AI credentials are needed for this heuristic. History retains private immutable content snapshots and the rubric/version used, including after the original resume is deleted. Latest 100 results are listed.
- **Interviews `/interviews`:** Technical, Behavioral or HR; Beginner, Intermediate or Advanced; target role, optional focus, 3–10 questions; AI-generated first questions and adaptive follow-ups; private saved transcripts, history, resumable active sessions, automatic completion or early end. The server forwards actual prior questions and answers to OpenAI. Concurrent processing uses a bounded MongoDB lease and version checks. Failed question generation leaves the transcript/version unchanged and permits retry. Text answers remain in the input after a failed request. Completed sessions can now generate saved evidence-linked feedback reports; see Checkpoint 6 below.

All feature routes are protected for Students on both client and server. Ownership always comes from the authenticated session, never a submitted student ID. Cross-student record access returns 404. Private responses use `Cache-Control: no-store`; mutations require the existing CSRF header/origin checks. Inputs use Zod, records are persisted in MongoDB, and MongoDB unavailability returns a safe 503. No credentials or session tokens enter React code.

### AI configuration (Checkpoints 5–6)

In your existing **private `server/.env`**, add:

```dotenv
OPENAI_API_KEY=<your-private-openai-api-key>
OPENAI_MODEL=gpt-4.1-mini
```

Create a project API key in the [OpenAI API platform](https://platform.openai.com/api-keys), configure API billing and model access, then restart `npm run dev`. Keep this key on the backend; never use a `VITE_` variable or paste credentials into chat. The SDK uses the Responses API, structured JSON output, a 60-second timeout, no automatic retries, and `store: false`. The model can be changed to one that supports Responses and structured output. Calls can incur provider charges. No key means a visible **AI setup required** state and a 503 `AI_SETUP_REQUIRED` for starting an interview; it never substitutes canned AI answers. Configuration presence does not prove valid credentials/billing; upstream failures show safe errors.

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
4. Without `OPENAI_API_KEY`, open Mock interviews: expect AI setup required and disabled Start. With a private valid key and API billing, restart the backend, choose a type/difficulty/role and Start. Wait for the generated question, send an answer containing concrete detail, and check that the next question follows the conversation. Reload and continue from history. Finish at the question limit or End session; review the saved transcript. A second Student must not be able to open this session or your resume/analysis by URL.
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
5. Batch comparison remains unavailable until an operator supplies **real** Batch/Enrollment data and at least three other members complete the same assessment version and exact question set. Full batch-management UI is deliberately reserved for Checkpoint 14. No other student's individual performance is exposed.
6. For feedback, privately configure `OPENAI_API_KEY` and an accessible `OPENAI_MODEL` in **server/.env**, with billing/model access; restart development. Start an interview, answer with concrete evidence, complete it and wait for the report. Inspect quoted evidence and AI-estimate labeling; reload and reopen from history. Unsupported technical competencies may be unassessed. Without a key, the application explicitly shows AI/feedback unavailable.
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

Sign in as a securely provisioned Trainer/Admin and open Learning content. Create a draft with subject/topic, description/objectives, text lessons or HTTPS resources. Save; publish the saved module; edit and save changes; view student progress; unpublish. Trainers can manage only modules they own, including participant progress for those modules. Admins can manage all modules. No batch-management or unrelated Checkpoint 14 interface was added.

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
