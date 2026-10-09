# Checkpoints 2–5 implementation report

Disha360 uses the existing React/Vite/Tailwind client, Express/TypeScript server, Mongoose/MongoDB persistence and cookie authentication. No architecture replacement or Checkpoint 6–15 implementation was performed. New feature modules follow existing models, validators, services, controllers, routes and pages. PDF export uses PDFKit; AI uses the official OpenAI Node SDK, both server-only. The dependency lockfile was updated.

## API endpoints

All paths below start with **`/api/v1/student`**, require an authenticated **Student**, and return the existing consistent response envelope. Mutations also require `X-Disha360-Request: 1` and a permitted Origin. PDF is the explicit binary-response exception. Private responses are `no-store`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/dashboard` | Own preparation summary, upcoming assignments, learning evidence, streak, activity and next actions |
| POST | `/activity/check-in` | Idempotent daily UTC check-in for the session owner |
| GET | `/resumes` | Latest 100 own drafts |
| POST | `/resumes` | Create validated structured draft; owner from session |
| GET | `/resumes/:id` | Own saved draft |
| PUT | `/resumes/:id` | Save own draft with optimistic `version`; stale edits return 409 |
| DELETE | `/resumes/:id` | Delete own draft; private historical analysis snapshots retained |
| GET | `/resumes/:id/pdf` | PDF of the saved version with safe download filename |
| POST | `/resumes/:id/analyses` | Analyze own saved resume with `{jobDescription}`; persist snapshot/result |
| GET | `/analyses` | Latest 100 own analysis summaries |
| GET | `/analyses/:id` | Own saved job description and analysis result |
| GET | `/interviews/config` | Safe provider-presence status; never returns secrets |
| GET | `/interviews` | Latest 100 own session summaries, without transcripts |
| POST | `/interviews` | Validate setup, obtain genuine provider question, then create session |
| GET | `/interviews/:id` | Own saved transcript and current state |
| POST | `/interviews/:id/answers` | `{answer,version}`; contextual follow-up; atomic transcript/version update or limit completion |
| POST | `/interviews/:id/complete` | `{version}`; early completion without a feedback report |

Existing `/api/v1/health`, `/ready`, and `/auth/*` endpoints are preserved. Unknown or non-owned record IDs return 404; invalid IDs/inputs return 400; busy/stale/completed-session conflicts return 409; unconfigured or failed AI returns safe 503; disconnected MongoDB returns safe 503. Interview generation is limited to 20 requests/IP/minute in addition to the existing API limiter. Rate-limit responses use the same error shape.

Resume input: `{title,template,content}`. `content` contains personal details, education, skills, projects, experience and certifications (see `server/src/validators/resume.ts` for limits). Updates add `version`. Public bodies cannot set ownership or provider metadata.

Interview setup: `{type: technical|behavioral|hr, difficulty: beginner|intermediate|advanced, targetRole, focus?, questionLimit: 3..10}`. A session requires one provider-generated question before it is persisted. Answer text is limited to 5,000 characters. Provider-generated questions use strict JSON output and additional Zod validation. Processing reserves a 90-second MongoDB lease; the provider timeout is 60 seconds with retries disabled. A stale worker cannot overwrite a newer lease/version. Failed generation does not persist the pending answer, so the browser keeps it for retry. Completion saves the transcript and timestamp; no Checkpoint 6 feedback is generated.

## MongoDB models

Existing **User** and **Session** remain unchanged.

| New model | Stored records / indexes |
|---|---|
| `LearningProgress` | Per-student module evidence, completed/total lesson counts, timestamps; unique `(studentId,moduleKey)`; rejects impossible counts |
| `AssessmentAssignment` | Per-student title/topic/deadline/status and optional earned/max scores; `(studentId,status,dueAt)`; score must be a valid completed result |
| `Activity` | Own event/day/title and stable idempotency key; unique `(studentId,key)` and `(studentId,createdAt)` |
| `Resume` | Owner, title, template, validated structured content, optimistic version, timestamps; `(studentId,updatedAt)` |
| `ResumeAnalysis` | Owner, resume ID/title/version, target description, immutable content snapshot, result/rubric, timestamps; `(studentId,createdAt)` and `(studentId,resumeId)` |
| `InterviewSession` | Owner, validated setup, status, messages/timestamps, answer limit, provider name, version and temporary lease metadata; `(studentId,updatedAt)` |

Indexes are created on backend startup. Activity records are written only by actual check-ins or successful saved feature actions. No student-facing API creates learning/test performance records. Future learning/assessment features must populate the dashboard evidence consistently. No unrelated collections for coding, companies, achievements or feedback were created.

## Transparent scoring

Readiness estimate: **25%** profile completeness + **40%** recorded lesson completion + **35%** recorded assessment percentage average. Missing evidence gives no points; learning/assessment cards show an em dash when absent. A complete new account therefore shows 25%, not fictional performance. Average scores normalize each completed earned/max result. Daily streaks use UTC days and may continue through yesterday before today's first activity.

ATS-style rubric version **1.0**:

- **60 points:** presence coverage of up to 30 extracted unique job-description keywords; each counts once. Known aliases and multiword phrases are normalized, stopwords removed, tokens ranked by occurrence then alphabetically. Matching observes token boundaries (Java does not match JavaScript). Extracted terms are visible as matched/missing lists.
- **30 points:** five checks, six points each — name/email/phone; summary of at least 40 characters; institution+degree; at least three skills; a named project or company+role with an achievement description of at least 40 characters. Experience and certifications are optional for students.
- **10 points:** five for a number in project/experience descriptions, five for a recognized action verb. These indicators cannot verify whether a claim is true.

The displayed score is the sum of displayed components. Identical resume content and description yield the same result. This simple heuristic does not parse employer ATS formats, infer all synonyms, distinguish every hard requirement, or guarantee selection. Students must only add truthful, relevant skills and evidence; keyword repetition earns no extra credit. Results are tied to immutable saved versions.

## Files added or modified

Client:

- `src/pages/StudentDashboard.tsx`, `Resumes.tsx`, `ResumeEditor.tsx`, `ResumeAnalyzer.tsx`, `Interviews.tsx`, `InterviewChat.tsx` — working feature screens.
- `src/features/resume/types.ts`, `ResumePreview.tsx`; `src/features/interview/types.ts` — typed feature data and live preview.
- `src/hooks/useStudentData.ts`, `useSpeech.ts`; `src/services/student.ts`; `src/components/StudentUI.tsx` — reusable fetching, optional speech, private API requests and UI states.
- `src/main.tsx`, `src/layouts/AppLayout.tsx`, `src/styles.css` — protected routes, active responsive navigation and shared button styles.

Server:

- `src/models/Preparation.ts`, `Resume.ts`, `ResumeAnalysis.ts`, `InterviewSession.ts` — persistent owned records.
- `src/validators/resume.ts`, `interview.ts` — strict bounded inputs.
- `src/services/dashboard.ts`, `resumePdf.ts`, `resumeAnalysis.ts`, `interviewProvider.ts` — calculations, PDF generation, deterministic analysis and provider interface.
- `src/controllers/resumes.ts`, `analyses.ts`, `interviews.ts`; `src/routes/student.ts` — private APIs.
- `src/app.ts`, `src/index.ts`, `src/config/env.ts` — route registration, index preparation, server-only provider configuration.
- `test/dashboard.test.ts`, `resumes.test.ts`, `analyses.test.ts`, `interviews.test.ts`, `interviewProvider.test.ts`, `studentAvailability.test.ts`; `test/helpers/student.ts`, `resume.ts` — integration and business/security checks.
- `package.json`, `.env.example`; root `package-lock.json` — server dependencies and placeholder configuration.

Documentation: `README.md`, `docs/CHECKPOINTS.md`, this report. Existing auth source, root dev scripts and Nodemon watcher config are preserved. The watcher regression test now cleans up its full fixture process group so child processes do not remain running after a test. No `.env`, dependencies, PDF downloads, browser fixtures, test databases or build artifacts are committed.

## Configuration and verification

Use your existing private **server/.env**:

- `MONGODB_URI` — required for persistent features; use your verified Atlas connection.
- `CLIENT_ORIGIN` — normally `http://localhost:5173`, must match the browser origin.
- `PORT` — normally `4000`; Vite proxy must match if changed.
- `NODE_ENV` and `TRUST_PROXY` — existing deployment/security settings.
- `OPENAI_API_KEY` — required only for live interviews, server-only.
- `OPENAI_MODEL` — default `gpt-4.1-mini`, a Responses/structured-output-capable model accessible to your account.

No secret is needed in React. ATS analysis and PDF export are local backend operations. Optional browser speech needs browser support/microphone permission independently of OpenAI credentials. Demo/staff setup variables remain the existing optional operator configuration, not requirements for these features.

Run `npm ci`, `npm run db:check`, `npm run typecheck`, `npm test`, `npm run build`, `npm run dev`. Open `http://localhost:5173`; the API is `http://localhost:4000/api/v1`. See README's numbered feature flow for exact UI checks. Health should be 200, readiness 200 with connected Atlas, and a private request without a session should be 401. The Vite proxy was tested using actual HTTP/browser requests.

Current verification: **83 tests passed in 10 files**, both workspace/test TypeScript checks passed, server compilation and Vite production build passed. Earlier phase test totals were 56/60/64. The old watcher regression passed without config changes. Real disposable MongoDB verifies persistence, ownership, actual metric calculations, session concurrency/failure recovery and validation. PDF signatures were checked for all templates; a browser-exported PDF was downloaded and text extracted. OpenAI SDK protocol/error handling was checked against a local HTTP fixture; live OpenAI was not called because no private credentials exist here. Browser fixtures explicitly identify themselves as test fixtures; the application has no simulated provider fallback.

## Known limitations and remaining configuration

- Checkpoint 5 is **Blocked for live-provider verification**. Supply your private key with API billing/model access, restart the server and run a genuine interview before marking it Complete. Atlas connectivity was previously verified by you locally; this cloud task used an isolated MongoDB process, not Atlas credentials.
- Real voice/microphone and browser speech-service connectivity are not verified here. Text fallback and feature-detection paths are tested; browser support varies. Dictation currently uses English.
- Dashboard lesson/test evidence appears only if actual records exist; their delivery/management belongs to later checkpoints. There are no made-up deadlines, lessons or scores.
- Resume editing uses explicit saves, not autosave. Save before route navigation. Export uses saved data; preview is responsive HTML while PDF is paginated A4, so pagination differs. Built-in PDF fonts support typical Latin resumes; broader-script font embedding is future work. Draft fields can be incomplete to support incremental editing.
- Resume/analysis/interview lists show the latest 100 records; pagination and retention controls are future work. Deleting a resume retains its private analysis snapshots, as the UI states.
- ATS matching is a documented lexical heuristic; it cannot represent proprietary employer ATS algorithms or verify student claims.
- No interview feedback report, learning/test authoring, coding, leaderboards, companies or administrative LMS management was added.
- Final pre-push review passed: 83 tests, TypeScript checks, both production builds, authentication regression checks, watcher regression, and checks excluding credentials/generated files. `.env` remains ignored.
