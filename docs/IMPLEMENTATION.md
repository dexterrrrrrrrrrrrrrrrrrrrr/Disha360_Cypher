# Checkpoints 2–8 implementation report

Disha360 uses the existing React/Vite/Tailwind client, Express/TypeScript server, Mongoose/MongoDB persistence and cookie authentication. No architecture replacement or Checkpoint 9–15 implementation was performed. New feature modules follow existing models, validators, services, controllers, routes and pages. PDF export uses PDFKit; AI uses the official OpenAI Node SDK, both server-only. The dependency lockfile was updated.

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
| POST | `/interviews/:id/complete` | `{version}`; early completion; feedback is generated separately |

Existing `/api/v1/health`, `/ready`, and `/auth/*` endpoints are preserved. Unknown or non-owned record IDs return 404; invalid IDs/inputs return 400; busy/stale/completed-session conflicts return 409; unconfigured or failed AI returns safe 503; disconnected MongoDB returns safe 503. Interview generation is limited to 20 requests/IP/minute in addition to the existing API limiter. Rate-limit responses use the same error shape.

Resume input: `{title,template,content}`. `content` contains personal details, education, skills, projects, experience and certifications (see `server/src/validators/resume.ts` for limits). Updates add `version`. Public bodies cannot set ownership or provider metadata.

Interview setup: `{type: technical|behavioral|hr, difficulty: beginner|intermediate|advanced, targetRole, focus?, questionLimit: 3..10}`. A session requires one provider-generated question before it is persisted. Answer text is limited to 5,000 characters. Provider-generated questions use strict JSON output and additional Zod validation. Processing reserves a 90-second MongoDB lease; the provider timeout is 60 seconds with retries disabled. A stale worker cannot overwrite a newer lease/version. Failed generation does not persist the pending answer, so the browser keeps it for retry. Completion saves the transcript and timestamp. The completed-session UI separately requests a Checkpoint 6 report.

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

Indexes are created on backend startup. Activity records are written only by actual check-ins or successful saved feature actions. Student scores come only from backend assessment finalization. Learning delivery remains future work; no coding, company or achievement collections were added.

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

Previous Checkpoints 2–5 verification: **83 tests passed in 10 files**, both workspace/test TypeScript checks passed, server compilation and Vite production build passed. Earlier phase test totals were 56/60/64. The old watcher regression passed without config changes. Real disposable MongoDB verifies persistence, ownership, actual metric calculations, session concurrency/failure recovery and validation. PDF signatures were checked for all templates; a browser-exported PDF was downloaded and text extracted. OpenAI SDK protocol/error handling was checked against a local HTTP fixture; live OpenAI was not called because no private credentials exist here. Browser fixtures explicitly identify themselves as test fixtures; the application has no simulated provider fallback.

## Known limitations and remaining configuration

- Checkpoints 5–6 are **Blocked for live-provider verification**. Supply your private key with API billing/model access, restart the server and run a genuine interview before marking it Complete. Atlas connectivity was previously verified by you locally; this cloud task used an isolated MongoDB process, not Atlas credentials.
- Real voice/microphone and browser speech-service connectivity are not verified here. Text fallback and feature-detection paths are tested; browser support varies. Dictation currently uses English.
- Dashboard learning evidence appears only if actual records exist; learning delivery/management belongs to later checkpoints. Assessment delivery is implemented in Checkpoint 7. There are no made-up deadlines, lessons or scores.
- Resume editing uses explicit saves, not autosave. Save before route navigation. Export uses saved data; preview is responsive HTML while PDF is paginated A4, so pagination differs. Built-in PDF fonts support typical Latin resumes; broader-script font embedding is future work. Draft fields can be incomplete to support incremental editing.
- Resume/analysis/interview lists show the latest 100 records; pagination and retention controls are future work. Deleting a resume retains its private analysis snapshots, as the UI states.
- ATS matching is a documented lexical heuristic; it cannot represent proprietary employer ATS algorithms or verify student claims.
- No full learning/test authoring, coding, leaderboards, companies or administrative LMS management was added.
- Previous pre-push review passed: 83 tests, TypeScript checks, both production builds, authentication regression checks, watcher regression, and checks excluding credentials/generated files. `.env` remains ignored.

## Checkpoints 6–8: sequential extension

No new application dependencies were needed. Authentication source and watcher configuration remain unchanged. These phases add student functionality to the existing modular monolith, not the full Checkpoint 14 management system.

### New APIs

All paths retain the `/api/v1/student` prefix, Student session/role checks, mutation origin/header checks, ownership checks, `no-store` and existing response envelope.

| Method | Path | Behavior / body |
|---|---|---|
| GET | `/interviews/:id/feedback` | Own saved report or honest availability/pending/no-answer state |
| POST | `/interviews/:id/feedback` | Empty `{}` body; evaluate own completed transcript, validate, persist once, reuse existing report |
| GET | `/assessments?category=quantitative&search=sample` | Published assessment summaries; optional category/search; no question bank/keys |
| GET | `/assessments/:id` | Instructions, scoring, availability, own attempt count/resume ID |
| POST | `/assessments/:id/attempts` | Empty `{}`; start or resume stable randomized attempt |
| GET | `/attempts` | Latest 100 own attempt summaries |
| GET | `/attempts/:id` | Own saved attempt; finalize if expired; keys only after finalization |
| PUT | `/attempts/:id/progress` | `{version,currentQuestionId,questionId?,selectedOptionId?}`; answer fields supplied together; null clears selection |
| POST | `/attempts/:id/submit` | `{version}`; score saved answers only; duplicate finalization returns existing result |
| GET | `/analytics` | Own completed-attempt analytics and anonymous eligible batch comparisons |

Unknown/other-student IDs return 404, invalid input 400, stale/finalized/expired progress 409, provider configuration/failure 503. Client scores, deadlines, ownership and feedback evaluations are never accepted. Trainer/Admin accounts cannot use these student endpoints. Feedback generation shares the existing 20 requests/IP/minute interview limiter; the general API limit is 120 requests/IP/minute.

### New MongoDB models and integration points

| Model | Stored evidence / indexes |
|---|---|
| `InterviewFeedback` | Owner, unique session ID, transcript version, provider, validated report/rubric, timestamps; unique session and owner/creation index |
| `Question` | Four distinct options, hidden answer/explanation, category, topic, difficulty, expected seconds, version, publication/demo flags; unique key and publication/category/topic index; Zod model validation |
| `Assessment` | Question pool, requested subset count, duration, availability, scoring, attempts limit, version, publication/demo flags; unique key and publication/category/closing index |
| `TestAttempt` | Owner, assessment/version, fixed question/option snapshot and hidden key, selections, server timing, deadline, cursor, version, final result and equivalence signature; unique owner/assessment/attempt number; partial unique active owner/assessment; expiry, owner/history and equivalent-assessment indexes |
| `Batch` | Minimal real batch name/active flag with active index |
| `Enrollment` | Real student/batch membership with active flag; unique batch/student and student/active indexes |

`InterviewSession` gains private feedback lease fields. `Activity` supports successful feedback and assessment start/completion events, with existing stable unique keys. `AssessmentAssignment` gains an optional assessment reference for future assignment integration. These are clean integration points for Checkpoint 14, not new public staff-management APIs. Batch membership must be supplied by a trusted operator using actual institutional data; do not seed fictional memberships to make comparisons appear. Without that data, comparison is explicitly unavailable.

### Checkpoint 6 feedback generation

The existing server-only OpenAI provider uses Responses with `store:false`, strict JSON schema output, Zod bounds/shape validation, 60-second timeout and disabled automatic retries. Only actual saved question/answer pairs and setup are supplied. At least one saved answer and a completed own session are required. Scored competencies require evidence; every evidence quotation must occur verbatim in the cited saved answer. Exactly one question-level entry is required for each answered question. Invalid shapes, invented quotes, duplicates and entirely unsupported scores are rejected without saving an evaluation.

Report: written communication, technical accuracy, problem solving, relevance, clarity/structure; nullable unsupported competencies; strengths, improvements, question-level estimates/suggestions, and personalized preparation steps. Overall estimate = rounded equal-weight mean of supported competency scores. A 90-second session lease prevents concurrent generation; the unique report is persisted once and can be revisited even if the provider is subsequently removed. Failure releases the reservation for retry. Feedback is requested automatically by the completed-session page, with manual retry/reload states.

All scores are visibly **AI-generated judgments**, not measured aptitude or hiring predictions. Text cannot substantiate vocal confidence, tone or body language; confidence is explicitly unassessed. Quote validation anchors evidence but cannot prove a model's judgment or technical evaluation is correct. A missing provider displays feedback unavailable; no runtime fixture or canned report is supplied.

### Checkpoint 7 scoring, randomization and timer

Question selection/order and eligible option order use cryptographic Fisher–Yates randomization on the backend. The resulting complete snapshot is saved once; refresh or question-bank edits cannot alter an active attempt. Ordered-answer questions can set `shuffleOptions:false`.

- Raw score = correct × points-per-correct − incorrect × configured penalty, rounded to two decimals. Unanswered = 0.
- Maximum = question count × points-per-correct. Percentage = rounded `max(0,raw score)/maximum × 100`; raw negative scores remain visible.
- Accuracy = correct / all questions × 100, including unanswered in the denominator.
- Deadline = earlier of server start + configured duration and assessment closing time. Browser clock changes cannot extend it.
- Answer/navigation writes require matching version, active status and database deadline greater than MongoDB `$$NOW`. No new answers or changes are accepted at/after expiry. Submission bodies contain no answers or score.
- Finalization is atomic using status/version compare-and-set. Concurrent or repeated submission reuses the existing final result; stale active submissions conflict. At expiry, only already-saved answers count.
- Backend expiry worker runs every five seconds (up to 100 expired attempts per sweep); attempt/history/dashboard/analytics requests also finalize expired own attempts. Closing the browser does not suspend the timer. The deadline, not worker execution time, is the expiry completion timestamp.
- Per-question time accrues from the server's current-question cursor on navigation/save/finalization, bounded by the deadline. Time away counts; this is wall time, not attention. Refresh retains cursor/answers/version. Keep application/database host clocks synchronized.

Correct IDs, explanations and correctness flags are explicitly excluded from active-attempt DTOs. Published assessments do not expose pool IDs or question-bank keys. Finalized attempts reveal their own answer explanations for learning; unpublished questions are never selected into new attempts.

`npm run seed:assessments` is an **explicit development-only** command. It inserts 20 clearly marked sample questions and four 5-question/5-minute assessments (quantitative, logical, verbal, technical). The technical sample has a 0.25 incorrect-answer penalty; other samples have none. Seeding is idempotent, preserves existing sample records, rejects non-demo key collisions, refuses production, and is never called by startup. Production hides sample assessments/questions. Use a dedicated development database.

### Checkpoint 8 analytics and dashboard integration

Only finalized owned attempt records with saved results count; IDs are deduplicated. Active attempts never contribute. No-data returns null metrics, insufficient evidence has a distinct state, and genuine zero scores remain zero.

- Overall score average is the mean of each attempt's zero-floor percentage. Category/topic/difficulty accuracy aggregates actual correct answers over all corresponding questions.
- Average question time = sum of stored per-question milliseconds / all questions / 1000. Total/per-assessment time = server start to finalization, bounded by the timer.
- Topic conclusions need at least **5 responses, 2 distinct attempts and 3 distinct questions**. Difficulty-weighted accuracy uses easy=1, medium=2, hard=3.
- Weak topic: sufficient evidence, accuracy <60% AND weighted accuracy <65%. Strong: sufficient evidence, both accuracies ≥80% AND actual/expected time ratio ≤1.5. Otherwise show developing/time practice; insufficient evidence never implies weakness/mastery. Expected-time metadata is a practice benchmark, not a validated aptitude norm.
- Trends group by UTC completion date; daily mean score and aggregated accuracy are returned chronologically. Fewer than two dates cannot establish a trend. UI shows latest 14 days as bars and all dates in the table.
- Batch comparison requires active real membership in an active batch and at least **3 distinct other Student members** with finalized equivalent attempts. Equivalence uses assessment ID/version plus SHA-256 signature of exact question content/set, scoring and configured duration; question/option order is ignored. The latest matching result per peer counts once. Compare at most the latest 10 distinct own equivalent sets per batch; only aggregate average/count is returned, no peer identifiers or individual scores.

Dashboard readiness keeps the original **25% profile + 40% learning + 35% assessment average** weights. Real finalized MCQ results take precedence; legacy completed assignment scores are used only when no finalized attempt score exists. A real zero is never replaced by a legacy nonzero result. Attempts and legacy scores are not summed. Recent activities have stable per-attempt keys. Recommendations use supported weak-topic evidence and genuinely available published assessments; upcoming tests show only actual closing dates/assignments, with linked entries deduplicated. No fictional learning/assessment data is introduced.

### Files changed for Checkpoints 6–8

Client: new `features/interview/InterviewFeedback.tsx`, `features/assessment/types.ts`, `pages/Assessments.tsx`, `AssessmentInstructions.tsx`, `AssessmentAttempt.tsx`, `AssessmentAnalytics.tsx`; updated `pages/InterviewChat.tsx`, `Interviews.tsx`, `components/StudentUI.tsx`, `layouts/AppLayout.tsx`, `main.tsx`.

Server: new `controllers/feedback.ts`, `assessments.ts`, `analytics.ts`; `models/InterviewFeedback.ts`, `Assessment.ts`, `Batch.ts`; `validators/feedback.ts`, `assessment.ts`; `services/interviewFeedback.ts`, `assessments.ts`, `assessmentAnalytics.ts`, `sampleAssessments.ts`, `activity.ts`; `utils/seedAssessments.ts`; updated `models/InterviewSession.ts`, `Preparation.ts`, `services/interviewProvider.ts`, `dashboard.ts`, `routes/student.ts`, `index.ts`.

Tests: new `test/feedback.test.ts`, `assessments.test.ts`, `analytics.test.ts`, `helpers/assessment.ts`; updated `interviewProvider.test.ts`, `studentAvailability.test.ts`. Root/server `package.json` add only the explicit seed command. README, checkpoint status and this document are updated. No auth implementation, lockfile, credentials or generated dependencies were changed.

### Configuration, verification and limitations

No new environment variables are required: use private `server/.env` with the existing `MONGODB_URI`, `CLIENT_ORIGIN`, `PORT`, `NODE_ENV`, `OPENAI_API_KEY` and `OPENAI_MODEL`. Only live interview/feedback generation requires OpenAI credentials, billing and structured-output model access. MCQ/analytics need MongoDB, not an AI key. Never put secrets in React, shell arguments, Git or chat.

Each phase ran `npm run typecheck`, `npm test`, `npm run build`: Checkpoint 6 **90 tests**, Checkpoint 7 **101 tests**, initial Checkpoint 8 **107 tests**, followed by final validation: **108 tests in 13 files**, both TypeScript checks and both production builds passed. All phase checks and both production builds passed. Tests run real disposable MongoDB with actual persistence, ownership, scoring, timers, resumability, concurrency, confidentiality and analytics. Existing registration/login/logout/role, resume/PDF/ATS/interview tests and the source-only watcher regression remain included. Provider tests use the official SDK against an explicit local protocol fixture; they do not call live OpenAI.

Known limits: live OpenAI and Atlas are not configured in this cloud runtime; verify locally before marking live feedback complete. Lists/history show latest 100 records; summary analytics scan all own finalized attempts (prototype scale). Batch administration and full question/test authoring remain Checkpoint 14. There are no proctoring guarantees; finalized sample questions can be revisited. Time includes inactivity and first visible question may accrue loading time. Real speech/microphone services were not exercised. No Checkpoints 9–15 features or unrelated innovations were implemented. The approved pre-commit review reran all 108 tests, TypeScript checks and both production builds successfully; backend timer/scoring enforcement, answer confidentiality, ownership and explicit development seeding passed review.
