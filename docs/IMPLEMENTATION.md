# Checkpoints 2–11 implementation report

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

Indexes are created on backend startup. Activity records are written only by actual check-ins or successful saved feature actions. Student scores come only from backend assessment finalization. That earlier phase added assessment delivery; coding and learning are extended below. No company or achievement collections were added.

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
- Full assessment authoring, leaderboards, companies and administrative LMS management remain future work; coding and learning are extended below.
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

Known limits: live OpenAI and Atlas are not configured in this cloud runtime; verify locally before marking live feedback complete. Lists/history show latest 100 records; summary analytics scan all own finalized attempts (prototype scale). Batch administration and full question/test authoring remain Checkpoint 14. There are no proctoring guarantees; finalized sample questions can be revisited. Time includes inactivity and first visible question may accrue loading time. Real speech/microphone services were not exercised. The earlier Checkpoints 6–8 phase did not implement 9–15; the subsequent extension below adds only 9–11. The approved pre-commit review reran all 108 tests, TypeScript checks and both production builds successfully; backend timer/scoring enforcement, answer confidentiality, ownership and explicit development seeding passed review.

## Checkpoints 9–11 extension

These checkpoints were implemented sequentially on commit `f767aa9495cbfcc0bc45bd37a861b5ec2bd97305`; no application recreation, authentication replacement, coding execution in Express or Checkpoint 12–15 features were introduced. The implementation was reviewed before the approved final verification and commit.

### New APIs

Existing response envelopes, opaque session cookies, CSRF origin/header checks, safe errors, database availability checks and `no-store` remain in use. Coding routes are Student-only; ownership is derived from the session. All coding paths below start `/api/v1/student`.

| Method | Path | Input / behavior |
|---|---|---|
| GET | `/coding/config` | Safe configured/unavailable state and enforced request limits; never credentials |
| GET | `/coding/drafts/:scope?language=python` | Own draft; scope `playground` or `problem-<ObjectId>` |
| PUT | `/coding/drafts/:scope` | `{language,source,stdin,version}`; version 0 creates, saved version updates; stale conflicts 409 |
| POST | `/coding/run` | `{language,source,stdin}`; genuine configured isolated provider only |
| GET | `/coding/problems?difficulty=easy&topic=Arithmetic` | Published problem list, own solved flags; exact optional filters; latest 100 |
| GET | `/coding/problems/:id` | Statement, formats, constraints, examples, no hidden tests |
| POST | `/coding/problems/:id/submissions` | `{language,source,requestId}`; UUID idempotency, private server judging |
| GET | `/coding/submissions` | Latest 100 own summaries; expires abandoned processing safely |
| GET | `/coding/submissions/:id` | Own summary only; never hidden diagnostics or source |

Learning paths start `/api/v1/learning` and require an authenticated session.

| Method | Path | Role / behavior |
|---|---|---|
| GET | `/config` | All signed-in roles; explicitly reports uploads unavailable |
| GET, POST | `/manage/modules` | Trainer own modules / Admin all; create draft from validated metadata/objectives/lessons |
| GET, PUT | `/manage/modules/:id` | Owner Trainer or Admin; update adds optimistic `version`; immutable owner |
| POST | `/manage/modules/:id/publication` | Owner Trainer/Admin; `{published,version}`, nonempty lessons required for publication |
| GET | `/manage/modules/:id/progress` | Owner Trainer/Admin, module participants only; latest 200 progress records with names/departments |
| GET | `/modules?subject=Web&topic=React&completed=true` | Student, published only; exact optional filters and own completion; latest 100 |
| GET | `/modules/:id` | Student, published module with own progress only |
| POST | `/modules/:id/lessons/:lessonId/visit` | Student, `{}`; own current lesson persists |
| POST | `/modules/:id/lessons/:lessonId/completion` | Student, `{complete:boolean}`; own completion/incompletion only |

Learning create/edit fields: `{title,subject,topic,description,objectives:string[],lessons:[{id?,title,kind:text|link,body,url}]}`. New lessons omit IDs; edit preserves existing IDs and rejects foreign/duplicate IDs. Published empty modules are rejected. Existing global JSON body limit is 100 KB; at most 30 lessons, 10,000 characters per body, 20 objectives. Split large courses across modules rather than exceeding request limits. Plain content is escaped in React; no raw HTML rendering. Link URLs must be external HTTPS without credentials/local/IP hosts. The server does not fetch URLs, embed arbitrary HTML or handle uploads.

### Models and indexes

- **CodeDraft:** owner, scope, language, source/stdin, optimistic version/timestamps; unique `(studentId,scope,language)`. Drafts are explicit saves, never other students' records.
- **CodingProblem:** validated category and supported-language metadata, statement/formats/constraints, examples, private hidden tests (`select:false`), publication/demo/version; unique key and publication/difficulty/topic index. Hidden tests are selected explicitly only by backend judging.
- **CodingSubmission:** owner/problem/version/title, language/source (private), UUID request ID, processing reservation/status, verdict, passed/total/backend score, max runtime/memory, dates; unique owner/request ID, owner/history and owner/problem/verdict indexes, expiry index. No stored per-case outputs are exposed.
- **LearningModule:** owner, metadata/objectives, ordered **embedded LearningLesson documents** with stable ObjectIds, publication/version/timestamps; owner/update and publication/subject/topic indexes. Embedding avoids a separate lesson collection and makes edits/publication atomic in one MongoDB operation; this is the deliberate modular-monolith adjustment.
- **LearningProgress:** existing unique owner/moduleKey collection reused; adds module reference, completed lesson IDs and last visited lesson. `$addToSet`/`$pull` updates prevent duplicate/lost concurrent completion evidence. New-module counts are derived from current published lesson IDs; legacy completed/total fields remain compatible for old evidence records. Unpublished module records are excluded from student dashboard evidence. No duplicate progress collection is created.
- **Activity:** actual successful coding judgments and lesson completions use stable submission/lesson keys; repeated requests do not duplicate events.

### Isolated provider and judge rules

Only `Judge0Provider` can execute configured code in production. It sends base64 source/stdin to a trusted external CE-compatible server, creates a job and polls bounded responses. It never invokes eval/Function/vm/subprocesses. Four language IDs: Python 71, Java 62 (`Main`), C++ 54, JavaScript 63 (Node). Editor/templates are frontend-only strings; Monaco and its worker/language assets are bundled locally, with no CDN credential exposure and lazy editor loading.

Backend fixed request bounds: source 30,000 chars, stdin 10,000 chars, CPU 2s + 0.5s extra, wall 5s, memory 262,144 KB, stack 65,536 KB, process/thread cap 32, created-file/output cap 16 KB, one run, network disabled. Provider response reading stops over 100,000 bytes; decoded output is truncated at 16,384 bytes per stream and successful overflowing output is rejected. Polling has a 20s abort deadline per case, at most 40 polls. Redirects are rejected so credentials cannot be forwarded to another endpoint. Execution/judging share 10 requests per authenticated student/minute, plus the existing API limiter.

`JUDGE0_URL` and `JUDGE0_SECURITY_CONFIRMED=true` are both required to activate execution. Optional `JUDGE0_API_KEY` is sent only as `X-Auth-Token`. Configuration presence cannot verify isolation. The operator must verify a patched provider with host cgroup/resource controls, restricted filesystem/processes and disabled outbound network. HTTPS URLs without embedded credentials/query keys are required; loopback HTTP is allowed for local testing. RapidAPI-specific gateway headers are not supported by this adapter. Real runtime versions and memory enforcement/reporting depend on the provider and need live validation. No external provider is configured here; tests use named fixtures and never run submitted source code.

Judging uses backend-only hidden cases (1–10). The UUID unique index reserves processing once before provider calls; duplicates return the same stored submission. Reservation is 90s; another case is refused with fewer than 20s remaining. Abandoned jobs become System Error on subsequent reads/dashboard access; a late worker cannot overwrite an expired reservation. No client score, hidden input or expected output is accepted. Infrastructure failure is System Error with null score, not an assumed success.

Output normalization: CRLF/CR → LF, strip trailing spaces/tabs on each line, remove final newline characters. Leading/interior whitespace, line count and case remain significant. All tests must match for Accepted; mismatches produce Wrong Answer. Scores are rounded passed/total ×100 (unexecuted cases count as not passed); compile/runtime/time/memory failures preserve their verdict. System Error is excluded from performance. Runtime/memory are maximum reported case values, null if unsupported. Judge0 status mapping: 3 normal exit, 5 TLE, 6 compilation error, 7–12 runtime error; unsupported/internal statuses System Error. A distinct MLE cannot be established from generic runtime failure: only reported memory exceeding the configured bound produces MLE. Hidden inputs/outputs/compiler/runtime diagnostics and per-case details are withheld from every submission DTO; aggregate passed count/verdict are intentional judge results.

`npm run seed:coding` explicitly creates three labeled development-only database problems (Easy, Medium, Hard), validates schemas, inserts missing keys only, preserves existing edits/submissions, rejects non-demo key collisions and refuses non-development. Never called on startup; production hides demos. Full problem authoring/admin systems remain Checkpoint 14.

### Dashboard and learning permissions

Coding performance counts only non-System-Error finalized records. Solved/attempted counts use distinct problem IDs so repeats cannot inflate the solve rate. Recommended actions point to genuinely unsolved coding evidence. Readiness preserves 25% profile, 40% learning and 35% performance: when coding exists, performance is the mean of available assessment average and distinct coding solve rate; without coding the previous assessment calculation is unchanged. This documented extension satisfies the new coding-readiness input requirement without inventing data or changing the original weights.

Students only consume published modules and write their own visit/completion evidence. Trainer authorization is **content ownership**, including progress for participants of that content; there is no implied access to another trainer's module or institution-wide progress. Admin can manage all modules. Full assigned-batch administration is not added. Lessons retain IDs through edits; removed lessons do not count as complete, new lessons add to the denominator, and unpublished modules no longer contribute dashboard evidence. Actual unfinished module records provide resume recommendations. Historical lesson events remain actual events, not fabricated learning outcomes.

**PDF/file uploads remain unavailable.** No private file-storage backend is configured, so no upload endpoint, public upload folder or download-authorization claim exists. Text/link workflows are functional; secure validation, private storage, permissions, scanning and end-to-end download tests are prerequisites for future uploads.

### Files, verification and limitations

New client: `features/coding/Editor.tsx`, `templates.ts`, `pages/CodingWorkspace.tsx`, `CodingProblems.tsx`, `Learning.tsx`, `LearningManage.tsx`, `hooks/useLearningData.ts`, `services/learning.ts`. Modified client: protected routes/navigation, student dashboard and existing request helper's optional API prefix (default behavior unchanged).

New server: coding draft/problem controllers and validation, models `CodeDraft`, `CodingProblem`, `CodingSubmission`, `LearningModule`/embedded lessons; services `codeExecution`, `codingJudge`, `sampleCoding`, `learningProgress`; `routes/learning`, `validators/learning`, `utils/seedCoding`. Modified: app/student route registration, startup indexes/provider construction, env validation/example, existing progress/activity models and dashboard. Root/server scripts add seed command; client dependencies/lock add Monaco and React wrapper only.

Tests: `coding.test.ts`, `codingJudge.test.ts`, `learning.test.ts`; existing env/availability tests extended. Phase checks: 9 — 120 tests, 10 — 131 tests, 11 initial — 137 tests; subsequent full regression — 139 tests in 16 files, all TypeScript checks and both production builds passed. All prior 108 tests remain included: authentication, resumes/PDF, ATS, interviews/feedback, MCQ/analytics and watcher. MongoDB tests use a real isolated process with checksum verification, not Atlas. Provider tests use explicit fixtures, not live isolated execution. README contains exact local setup/UI flows.

Known limitations: live Judge0/OpenAI and Atlas unavailable in this cloud runtime; runtime restrictions/compilers need real provider verification. No secure PDF uploads. Monaco's lazily loaded editor chunk exceeds Vite's 500 KB advisory threshold; main app is approximately 396 KB before gzip. Draft saves are explicit; save before navigating away. No proctoring guarantees. Publication revocation applies to subsequent requests; already fetched content cannot be erased from a browser. Lists/progress have prototype record caps and no pagination. No Checkpoints 12–15 implementation, account management or unrelated features added. No credentials/dependencies/generated outputs are tracked.

Browser verification used a disposable database and real Vite-proxied HTTP APIs with execution deliberately **unconfigured**: all templates/Monaco, private stdin draft saves and restoration, honest disabled Run/Submit, published challenge statements, trainer create/save/publish/unpublish/progress, student safe text/lesson completion/reload/dashboard, and student layouts at 375/768/1440px. No runtime errors occurred. No live code execution, Atlas, OpenAI or PDF upload verification is implied. Client accessibility labels were clarified during this review and the production frontend rebuilt afterward.

Additional Chromium checks verified actual Monaco source editing (not just templates), source save/reload, and trainer content list/editor layouts at 375/768/1440px. The final frontend rebuild passed after the label adjustments. Temporary browser servers/databases/helpers were kept outside Git and stopped after validation.


## Coding seed follow-up review of `1ceaaa5`

Repository inspection confirmed that both npm script registrations and the seed entry point were already published in `1ceaaa5`; Coding practice and Learning modules were enabled student links with registered protected routes. The absent-script/grey-link Mac report could not be reproduced from that commit. README documents safe working-tree, directory and stale-server checks rather than assuming the user's local state or overwriting files.

The actual seed gap was the absence of a Hard problem and explicit language metadata. The retained sample keys for sum (Easy) and reverse (Medium) are joined by `sample-coding-lis` (Hard, strictly increasing subsequence). Its cases cover duplicates, decreasing sequences, negative values, non-contiguous subsequences and a 2,000-element ascending input within the 10,000-character execution input bound. A quadratic independent reference in tests verifies every fixture's expected output; this validates seed data and never executes submitted source. All three include Python/Java/C++/JavaScript support. `CodingProblem.supportedLanguages` is validated/defaulted for compatibility with older records and exposed as safe statement metadata. Hidden test selection and ownership rules remain unchanged.

The entire bank is validated and non-demo key conflicts checked before writes. Unique keys plus `$setOnInsert` make sequential/concurrent seeding idempotent without overwriting prior sample edits, publication flags, custom problems or submissions. No submission writes occur. The CLI requires `NODE_ENV=development` and `CODING_SEED_DATABASE` matching the URI's explicit database path; the acknowledged name must end `_dev`, `_development`, or `_demo`. It checks before connecting and verifies the connected database name, builds the unique index and reports safe counts. Connection/driver errors and credentials are never printed. Guards cannot determine whether an operator has placed live data in a development-named database: use a dedicated database and least-privilege database user. The operator-only variable is read after the existing `server/.env` loader, like other provisioning variables; it is unnecessary for normal application startup.

Changed files: `server/src/models/CodingProblem.ts`, `controllers/codingProblems.ts`, `services/sampleCoding.ts`, new `services/codingSeedSafety.ts`, `utils/seedCoding.ts`, `server/.env.example`, `client/src/pages/CodingProblems.tsx`, existing `server/test/codingJudge.test.ts`, new `server/test/codingSeed.test.ts`, README and this document. Existing root/server script registrations are retained and exercised directly by regression tests. No dependency, lockfile, routing or authentication changes. No new APIs or collections; the existing safe problem DTO adds `supportedLanguages`.

Verification: **147 tests / 17 files** pass, including all existing 139 tests; client/server/test TypeScript checks and both production builds pass. New checks cover both actual npm entry points, all levels/languages, examples and hidden fixture outputs, repeat/concurrent seeding, no overwrite of problems/submissions, fail-before-write non-demo collisions, production refusal before connection, destination acknowledgement and hidden-case confidentiality. Browser checks through Vite's actual backend proxy verify student sidebar navigation to Coding/Learning, Monaco across four languages, source and stdin save/reload, Hard problem rendering, and mobile/tablet navigation. With no Judge0 configuration, Run and Submit are disabled with a setup-required message while editing/saving work. No fake execution was added. Live Atlas/Judge0/OpenAI remain unverified here; the existing lazy Monaco bundle size warning remains. This verification report was recorded before commit/push approval. Checkpoints 12–15 remain out of scope.

## Checkpoint 12 — Company-wise preparation

Implemented on base `264b517` without changing authentication, assessment scoring, coding judging or interview generation. Checkpoints 13–15 are not implemented. No new runtime dependencies or paid services are added.

### APIs (authenticated Student role only)

All paths start `/api/v1/student`; existing session, database availability, no-store and mutation-origin/header protections apply.

| Method | Path | Behaviour |
|---|---|---|
| GET | `/companies?search=TCS&industry=IT%20services%20and%20consulting&completion=in-progress` | Published profiles with only the current student's progress. Search is a literal, case-insensitive match over names/overview/industry/topics. Optional completion values: `not-started`, `in-progress`, `complete`. Industry filter is an exact match. Up to 200 profiles. |
| GET | `/companies/:id` | Published profile, current private checklist, safe summaries of real matching resources and the existing mock interview workspace link. |
| PUT | `/companies/:id/progress` | Strict `{itemKey, completed}` body. Key must belong to that company's current checklist. Server derives the student identity from the session. No student/owner IDs or scores are accepted. |

No public company-create/edit/delete APIs are introduced. Trainer/Admin are denied these student routes. Company IDs and query/body schemas are validated. Unpublished/missing/hidden demo profiles return 404. No arbitrary URLs from the client are used for recommendations.

### Persistence and progress

`Company` stores unique key, name, overview, industry, mandatory caveat, illustrative stages, four topic groups, general interview prompts, stable-key checklist, curated resource topics/categories and published/demo flags. Profile content is validated with Zod and model validation. Unique-key and publication/demo/industry/name indexes are ensured on startup.

`CompanyProgress` stores studentId, companyId and completed item keys, plus timestamps. A unique student/company index prevents duplicates. Updates use atomic `$addToSet`/`$pull` with ownership in the query; concurrent first-upsert collisions retry against the same owner's record. Concurrent completion of distinct items cannot replace each other's arrays. Progress is calculated from the intersection of unique current checklist keys and completed keys: `round(completed / total × 100)`; zero if there are no checklist items. Stale keys and duplicates never inflate it. Progress is self-reported preparation, not objectively verified activity or an employer readiness measure. No changes to dashboard readiness/scoring are made.

### Real resource selection and confidentiality

Learning recommendations match published modules by curated subject/topic using case-insensitive exact matching. Coding recommendations match curated topics and existing published/demo visibility rules. Assessment recommendations match curated categories, publication/demo visibility and current open/close windows, and require sufficient published questions in the correct category to create an attempt. Summaries include only IDs, titles, display metadata and server-constructed internal links; no hidden coding inputs/outputs, MCQ answer keys, source code, private attempts, owner IDs or other student information. No random scores or fictional resources are generated. Each group has a helpful empty state and a 12-item cap. Recommendations are general study matches rather than employer endorsements. Existing destination APIs enforce visibility again when opened. The actual `/interviews` workspace is linked with its existing credential/setup limitations; it is not advertised as company-specific AI generation.

### Development seed

Root and server manifests register `seed:companies`; operator entry point `server/src/utils/seedCompanies.ts` explicitly loads the existing private `server/.env` loader. It reuses `assertCodingSeedTarget` unchanged, supplying `COMPANY_SEED_DATABASE` as the acknowledgement. `NODE_ENV=development`, an explicit matching URI database path, and a dedicated database name ending `_dev`, `_development`, or `_demo` are required before connecting. Connected name is verified; credentials/driver errors are omitted from output. Database naming checks cannot establish whether its contents are production data; operators must use a dedicated development database with appropriately restricted credentials.

Six profiles for TCS/Infosys/Wipro/Accenture/Cognizant/Capgemini are labeled illustrative in overview/disclaimer and demo metadata. Generic stages and questions are not claimed real historical recruitment facts. The entire bank is validated and non-demo key conflicts checked before inserts. Unique keys and `$setOnInsert` preserve custom profiles, existing sample edits/publication status and all progress. Concurrent duplicate-key insert collisions are checked safely. No automatic production seeds; production hides demo profiles. No learning/assessment/coding seeds are invoked by this command.

### Files and verification

New files: `server/src/validators/company.ts`, `models/Company.ts`, `services/companyPreparation.ts`, `services/sampleCompanies.ts`, `controllers/companies.ts`, `utils/seedCompanies.ts`, `server/test/companies.test.ts`, `client/src/features/companies/types.ts`, `client/src/pages/Companies.tsx`. Modified: root/server package scripts, `server/.env.example`, student routes, server startup indexes, client protected routes/sidebar, README, this document and CHECKPOINTS status. Existing dependencies/lockfile/auth/scoring/judge/provider code are unchanged.

Automated tests cover directory/search/filter, details, student-only access, read-only content, strict mutation validation, CSRF, MongoDB checklist refresh/completion/uncompletion, current-key progress formulas, concurrent upserts, student/company isolation, real resource recommendations, hidden-test/answer confidentiality, missing/unpublished/closed/unusable resources, development sample visibility, idempotent seeds/data preservation/conflict refusal and both actual npm seed commands. Existing Checkpoints 1–11 tests remain in the suite. See README for exact local setup and UI flows.

Known limitations: illustrative recruitment content only; no authoring UI, automatic activity verification, company-specific AI prompts, extra dashboard score, pagination or official employer feed. Existing live Atlas/OpenAI/Judge0 and secure PDF limitations are unchanged. No credentials, generated output or dependencies belong in Git. The implementation was prepared for review before approved final verification.

Final Checkpoint 12 verification: `npm test` passed **161 tests / 18 files**, `npm run typecheck` passed client/server/test TypeScript, and `npm run build` passed both production targets. The existing advisory warning for the lazy Monaco chunk remains. Chromium flows verified real proxy/database-backed directory/search/detail/checklist refresh/uncheck, published learning navigation, missing-resource states, interview workspace navigation and 375/768/1440px layouts without overflow/runtime errors. Live external services were not invoked. The first cold test run hit the MongoDB binary download-lock race; the binary was subsequently cached with checksum verification intact. If a fresh machine encounters that prerequisite race, initialize the cache with `npm run test -w server -- test/companies.test.ts`, then run the full `npm test`; never disable checksum verification. All application regressions passed in the final run.

## Checkpoint 14 — Trainer/Admin management

Base: `28affda54c50922ebe1f0e9ba38428112d8a4c84`. Preserves the existing uncommitted Phases 1–3 and extends the modular MERN application. Checkpoints 13/15 are untouched. Authentication, secure provisioning, Student timers/randomization/grading, coding judge and interview services are retained.

### Phase delivery

| Phase | Implemented scope |
|---|---|
| 1–3 | Real role dashboards, Admin batch CRUD/trainer/membership/archive, scoped Student directory and performance; original 202-test baseline retained |
| 4 | Owned assessment/question CRUD, duration/scoring, draft versions, safe publication, validated atomic CSV import, batch assignments and safe submissions |
| 5 | Existing content CRUD plus active-batch assignments and current authorized Student completion |
| 6 | Real assessment/coding/learning/company reports, batch/assessment/Admin-Trainer filters and authorized CSV exports |
| 7 | Admin Trainer directory, actual workloads and versioned assignment/removal; existing secure account provisioning |
| 8 | Working responsive staff navigation, management forms, search/filter, loading/error/empty states and downloads |
| 9 | Regression/security tests and actual browser workflows; results below |
| 10 | README walkthrough and implementation/API/model/formula/limit documentation |

### Roles, persistence and integrity

All `/api/v1/staff` APIs require a connected database and current Trainer/Admin session. Existing CSRF origin/header protection, rate limiting, error envelopes and `Cache-Control: no-store` apply. Student gets 403; an unrelated resource gets 404. Admin manages all resources; Trainer assessment/module mutations require ownership. Legacy ownerless assessments are Admin-only. Trainer read scopes use current active Enrollment in current active assigned Batches, recomputed on each request. Revocation takes effect immediately. Account DTOs whitelist safe profile fields; private resumes, interview transcripts, code source/drafts, tokens and answer snapshots are excluded from reports.

Reuse `Batch` and `Enrollment`: additive description, Trainer IDs and optimistic version with `(trainerIds,active)` index. Unique `(batchId,studentId)` prevents duplicate memberships; removal/archive preserves history. Admin validates actual Student/Trainer roles, max 20 distinct Trainers and strict inputs. Legacy missing batch version safely upgrades on first edit. No role mutation or startup provisioning added.

Reuse `Assessment`, `Question`, `TestAttempt`, learning models and performance records. Assessment gains optional owner ID/index. Questions gain optional owner, managed assessment reference and normalized SHA-256 prompt fingerprint. Unique partial `(managedAssessmentId,fingerprint)` index protects managed duplicates without changing legacy shared rows. Shared legacy questions are copied for edits and detached on deletion; private attempt snapshots remain immutable.

New `BatchAssignment`: batchId, kind (`assessment`/`learning`), resourceId, assignedBy, optional dueAt (required for assessments), timestamps, unique `(batchId,kind,resourceId)` and resource lookup index. Assessment and module assignments share one collection. Repeat writes are idempotent; current active batch and publication checks use MongoDB transactions with batch/resource write guards against concurrent archive/reassignment. Removing an assignment never deletes attempts/progress.

All assessment configuration/question edits and CSV imports are versioned and transactional. Published assessments must be unpublished before editing; publishing validates pool size, category and allowed published/shared resources. Only managed question publication flags change. Existing attempt scoring/deadline/randomized snapshots and ownership logic are unchanged. Changing later drafts cannot rewrite prior scores. DueAt is an advisory assignment deadline, not a replacement for the backend attempt deadline.

**MongoDB Atlas or another replica set is required** for these multi-document transactions; unsupported standalone MongoDB returns 503 `TRANSACTIONS_REQUIRED` without partial changes. No new environment variables. Startup creates indexes but never seeds or creates privileged accounts.

### API inventory

Prefix `/api/v1/staff`; standard JSON envelopes except CSV downloads.

| Method | Path | Scope/purpose |
|---|---|---|
| GET | `/dashboard` | Actual Trainer-scoped/Admin institution counts |
| GET/POST | `/batches` | Scoped listing / Admin creation |
| GET/PUT | `/batches/:id` | Authorized detail / Admin versioned edit/archive |
| PUT | `/batches/:id/members/:studentId` | Admin validated idempotent `{active}` enrollment |
| GET | `/people?role=student\|trainer&search=...` | Admin safe account picker; 500-match limit/truncated flag |
| GET | `/students?search=&department=&batchId=&page=` | Scoped Student directory; 25/page |
| GET | `/students/:id` | Safe profile and actual authorized performance |
| GET/POST | `/assessments` | Owned Trainer/Admin-all listing / create draft |
| GET/PUT | `/assessments/:id` | Owned detail including staff-only keys / draft config `{version,content}` |
| POST | `/assessments/:id/questions` | Add validated question `{version,content}` |
| PUT/DELETE | `/assessments/:id/questions/:questionId` | Draft question edit `{version,content}` / delete `{version}` |
| PUT | `/assessments/:id/publish` | `{version,published}` with complete-pool validation |
| GET | `/assessments/csv-template` | Download exact CSV template |
| POST | `/assessments/:id/import` | `{version,csv}` atomic validated import |
| GET/POST | `/assessments/:id/assignments` | Scoped list / `{batchId,dueAt}` authorized active-batch assignment |
| DELETE | `/assessments/:id/assignments/:batchId` | Remove authorized assignment only |
| GET | `/assessments/:id/submissions?batchId=` | Owned assessment, scoped Student statuses and safe finalized grades |
| GET | `/assessments/:id/results.csv?batchId=` | Owned assessment and authorized filtered attempt export |
| GET/POST | `/learning/:id/assignments` | Own Trainer/Admin-all module, scoped list / `{batchId}` assignment |
| DELETE | `/learning/:id/assignments/:batchId` | Authorized module assignment removal |
| GET | `/learning/:id/completion?batchId=` | Assigned authorized Students and current lesson completion |
| GET | `/assignments` | Real batch assignment directory; foreign unpublished resources hidden; published foreign resources read-only |
| GET | `/report-options` | Authorized real batch/assessment filter choices; Admin Trainer choices |
| GET | `/reports?batchId=&assessmentId=&trainerId=&search=&page=` | Real scoped metrics, 25/page; Trainer cannot use trainerId |
| GET | `/reports/export` | Same filters, all authorized rows up to 1,000 Students; larger selection requires narrowing |
| GET | `/trainers?search=` | Admin actual Trainer workload directory |
| PUT | `/trainers/:trainerId/batches/:batchId` | Admin `{assigned,version}`; actual Trainer role; no new archived assignment |

Existing `/api/v1/learning/manage/*` remains the content CRUD API. Its progress serializer now additionally limits Trainer participants to currently assigned Students. Existing public Student APIs remain unchanged.

Protected frontend routes: `/dashboard/:role`, `/manage/:role/batches[/id]`, `/manage/:role/students[/id]`, `/manage/:role/assessments[/id]` (new uses `/new`), `/manage/:role/assignments`, `/manage/:role/reports`, `/manage/admin/trainers`, and existing `/learning/manage/:role[/id]`.

### CSV format and safety

Exact headers: `prompt,topic,difficulty,option_a,option_b,option_c,option_d,correct_option,explanation,expected_seconds`. Downloadable UI template supplies an example. Difficulty is easy/medium/hard; correct option is a/b/c/d; four unique non-empty choices required. Parser `csv-parse` supports quoted commas/newlines and UTF-8 BOM. Limits: 50,000 UTF-8 bytes, 100 rows/import, 10,000-character parser record, 200 questions/pool. All rows parse and validate before persistence. Errors identify row/field; duplicate prompts within a file or existing pool reject the entire import. Transactions, indexes and version conflicts prevent concurrent partial/duplicate imports. The frontend accepts a CSV file then sends bounded text through the authenticated API; no insecure file storage is introduced.

Exports use quoted escaped cells, UTF-8 BOM and CRLF. Formula-like/control-prefixed text receives a leading apostrophe; actual numeric negative marks remain numeric. No answer keys, source, hidden tests or private transcripts enter CSV.

### Actual metrics and integration

Reports use finalized TestAttempts for grades; no result reads finalize attempts or call providers. Average = mean stored finalized percentages, nullable without scored records. Attempt history carries version, status and safe scalar result fields; unfinished scores stay null. Assessment completion = unique assigned published assessments with a finalized attempt / unique assigned assessments, nullable with no assignment denominator. Multiple batch membership never double counts tasks; any prior finalized version satisfies task completion, while version remains available in exported attempt history.

Coding = completed scored submissions only: attempted/solved are distinct problem IDs; solve rate = solved/attempted or null. Unscored System Errors do not fabricate proficiency. Learning = current published assigned or recorded modules, intersection of saved completion IDs with current lesson IDs, unique modules/lessons; no-record assigned lessons are actual zero, missing denominator is null. Existing legacy recorded learning remains supported. Company = unique valid completed checklist keys/current published profile keys; unstarted available profiles are zero, no available denominator is null. This is explicitly self-reported preparation, not hiring readiness.

Trainer reports are always limited to currently assigned Students. Batch/assessment filters are validated; Admin Trainer filter narrows to that Trainer's actual active memberships. Equivalent scope applies to exports. Published assessment metadata may be filterable without ownership, but answer-key and mutation APIs still require ownership. Batch-level aggregate reporting never exposes unrelated Students.

Staff dashboards use real legacy and new batch assignment records with distinct assessment/Student task keys. Student dashboard adds actual batch assessment deadlines and learning recommendations, preserving readiness formula, saved activity and existing grading. Published resources remain browsable; assignments organize tasks rather than restrict the global published library. No fabricated activities or AI metrics are inserted.

Trainer workloads show unique active assigned Students, active batches (archived history separate), owned/published content counts and real assignment definitions in active batches. Assignment/removal uses optimistic batch versions; membership is deduplicated; no password or arbitrary role field is accepted.

### Files, verification and limitations

Preserved Phase 1–3 controllers/pages/scope/tests and additive Batch fields. New continuation files: `controllers/staffAssessments.ts`, `staffAssignments.ts`, `staffLearning.ts`, `staffReports.ts`, `staffTrainers.ts`; `models/BatchAssignment.ts`; `services/questionCSV.ts`, `staffAssessment.ts`, `staffReports.ts`, `studentAssignments.ts`; `validators/staffAssessment.ts`; `test/staffManagement.test.ts`, `test/helpers/staffDatabase.ts`; client `components/StaffAssignments.tsx`, pages `StaffAssessments.tsx`, `StaffAssignmentDirectory.tsx`, `StaffLearningCompletion.tsx`, `StaffReports.tsx`, `StaffTrainers.tsx`. Existing staff router/dashboard, learning route/UI, assessment models/validator, Student dashboard integration, startup indexes, navigation/routes and learning test fixtures updated. Server manifest/lockfile adds only csv-parse. Documentation updated; temporary browser dependencies/helpers are outside Git.

Sequential phase checks: Phase 4 **210 tests**, Phase 5 **213**, Phase 6 **217**, Phase 7 **219**, each with client/server/source-and-test TypeScript checks and both production builds. Final security review adds assignment directory scope and CSV duplicate/row-limit coverage. Final results are recorded after all checks below.

Run `npm test`, `npm run typecheck`, `npm run build`. Targeted integration: `npm run test -w server -- test/staff.test.ts test/staffManagement.test.ts`. All automated databases are disposable; the management suite uses a replica set to exercise real atomic transactions. README contains the beginner-friendly actual UI workflow.

Limitations: prototype scope/aggregation queries use in-memory processing; report/export selections capped at 1,000 Students, page size 25, account pickers 500. Profile history retains prior bounds. Report scores may combine finalized versions (exports expose versions); company checklists are self-reported. No in-app privileged creation/role editing, secure PDF storage or coding-problem authoring added. Live Atlas/OpenAI/Judge0 verification remains pending where previously documented. Monaco retains its existing lazy chunk advisory. No production data, paid service, commit or push is involved.

Final automated verification: **221 tests passed** (205 server tests in 20 files, 16 client tests in one file), no skipped tests. Client/server source and test TypeScript checks passed; both production builds passed. New tests cover staff/ownership/Student isolation, active-batch assignments, version conflicts, atomic concurrent imports, invalid/duplicate/oversized/row-limited CSV, finalized snapshot/scoring/key confidentiality, scoped completion, report/export/filter denial and formula escaping, real workload counts, and prevention of role escalation. Existing Checkpoints 1–12 and watcher regressions remain passing. `git diff --check` passed; no private environment, dependency directory, generated artifact or credential pattern was found among tracked candidates. Nothing is staged, committed or pushed.

Chromium final verification passed actual Admin and Trainer login/redirects, assessment creation, downloadable template, file-based CSV import, publication, batch assignment, owned learning assignment, saved Student lesson completion, an actual finalized scored Student assessment, filtered real-result reports and both report/assessment CSV downloads. Trainer ownership and unauthorized Student/unrelated-batch export denials passed. Admin workload views and Trainer removal/restoration controls persisted through real MongoDB. Management assessment/learning/report/Trainer pages passed at **375/768/1440px** without document overflow; mobile sidebar navigation worked and no browser runtime errors occurred. Temporary randomly credentialed fixtures and a disposable replica set were used through Vite's actual API proxy; requests were paced across the unchanged API rate-limit windows. No live provider or production database was contacted.

Full working-tree file inventory (includes preserved Phases 1–3):

```text
README.md
client/src/layouts/AppLayout.tsx
client/src/main.tsx
client/src/pages/LearningManage.tsx
docs/CHECKPOINTS.md
docs/IMPLEMENTATION.md
package-lock.json
server/package.json
server/src/app.ts
server/src/index.ts
server/src/models/Assessment.ts
server/src/models/Batch.ts
server/src/routes/learning.ts
server/src/services/dashboard.ts
server/src/validators/assessment.ts
server/test/learning.test.ts
client/src/components/StaffAssignments.tsx
client/src/hooks/useStaffData.ts
client/src/pages/StaffAssessments.tsx
client/src/pages/StaffAssignmentDirectory.tsx
client/src/pages/StaffBatches.tsx
client/src/pages/StaffDashboard.tsx
client/src/pages/StaffLearningCompletion.tsx
client/src/pages/StaffReports.tsx
client/src/pages/StaffStudents.tsx
client/src/pages/StaffTrainers.tsx
server/src/controllers/staffAssessments.ts
server/src/controllers/staffAssignments.ts
server/src/controllers/staffBatches.ts
server/src/controllers/staffDashboard.ts
server/src/controllers/staffLearning.ts
server/src/controllers/staffReports.ts
server/src/controllers/staffStudents.ts
server/src/controllers/staffTrainers.ts
server/src/models/BatchAssignment.ts
server/src/routes/staff.ts
server/src/services/questionCSV.ts
server/src/services/staffAssessment.ts
server/src/services/staffReports.ts
server/src/services/staffScope.ts
server/src/services/studentAssignments.ts
server/src/validators/staff.ts
server/src/validators/staffAssessment.ts
server/test/helpers/staffDatabase.ts
server/test/staff.test.ts
server/test/staffManagement.test.ts
```

## Checkpoint 13 — engagement system

Base `8a437071f026dd7199128c9483fe7d74de2f6f7d`. Extends the existing Student/staff architecture; Checkpoint 14 and all prior functionality remain. Checkpoint 15 is not implemented. No application dependency, paid service, credential, environment variable or seed command is added.

### Sources and points

All points are recalculated on the backend from actual MongoDB records. No client score input or point-writing endpoint exists.

- **MCQ:** submitted `TestAttempt`, valid finalized timestamp not in the future, numeric finite normalized percentage and at least one answered question (`correct + incorrect > 0`). Aggregate by Student/assessment ID across retakes and versions. Contribution = rounded clamped best percentage (0–100). A lower/equal retake adds nothing; a better retake replaces the prior contribution. Completion count is distinct assessments, including genuine answered zero results. Unanswered-only expiry, active attempts and legacy `AssessmentAssignment` counters do not earn engagement points. Finalized grading and attempt timers are unchanged.
- **Coding:** completed `CodingSubmission` with Accepted, score 100 and a valid finished timestamp; group by Student/problem ID using earliest accepted finish. Join current problem metadata only: Easy 50, Medium 100, Hard 150. Repeats, failed runs and System Errors earn no additional points/day. No source, diagnostics or hidden cases are queried/serialized. Current difficulty is used (changing/removing trusted problem metadata can change recomputed coding totals); the existing judge is unchanged and absent providers never invent solves.
- **Learning:** progress with a real module ID and either an already verified completion/recognition marker or all non-empty current lesson IDs present in saved completion IDs. Forty points per distinct module, once. The server saves the first exact completion time on a genuine incomplete-to-full completion transition. Already-full historical progress may be recognized separately without assigning a completion date. Recognition preserves the achieved milestone across later unchecking/content edits, but cannot become a historical streak day. Standalone legacy counters without module identity earn nothing. Empty modules, visits and partial lessons do not qualify. Learning completion remains self-marked progress, not proof of mastery.

Deduplication is by resource identity, not number of activity events or versions. Company checklist changes, login, dashboard visits, resume/interview actions and failed code never enter point calculation.

### Streak policy and badges

UTC is the consistent calendar policy, independent of browser timezone/DST. Qualifying days are answered finalized MCQ completion dates (allowed retakes may maintain a day), first Accepted finish dates and first exact full-module completion dates. Same-day activities are deduplicated. Future/invalid dates are excluded. Current streak ends today or yesterday; after a missing full UTC day it is zero. Longest streak uses the full qualifying-day set; last active day is null with no trustworthy qualifying timestamp. Unknown historical learning dates are disclosed in the interface. Repeated completion of an already-full legacy module cannot manufacture a timestamp. Existing visit-inclusive activity/check-in records remain separate and are never used by engagement streaks.

| Badge key | Actual criterion |
|---|---|
| `first-assessment` | One qualifying finalized answered assessment |
| `first-code` | One distinct Accepted coding problem |
| `five-code` | Five distinct Accepted problems |
| `learning-explorer` | One verified full module |
| `seven-day` | A run of seven consecutive qualifying UTC days (lifetime achievement) |
| `consistent-performer` | Best actual normalized scores at least 70% on five distinct assessments |

Badge criteria are evaluated automatically on authorized engagement/dashboard/leaderboard views and saved with `$setOnInsert`; no claim button. Unique `(studentId,key)` enforces idempotency even during concurrent views. Earned dates use actual qualifying evidence; unknown-date legacy learning badges record first recognition time. Seven-day earned date is the UTC calendar day the run first reached seven. Qualifying score dates track when each assessment first reached 70%, not when an earlier low attempt was completed. Previously earned badges remain lifetime awards even when a resource later becomes unavailable; points are recomputed from available authoritative sources.

### Models, bounds and authorization

One new collection: `BadgeAward` (Student reference, fixed catalog key, earnedAt, timestamps; unique Student/key index). Existing `LearningProgress` gains optional `engagementCompletedAt` and `engagementRecognizedAt` timestamps. Neither is accepted in Student input. `User` gains an additive `(role,isDemo,_id)` index for role-filtered leaderboard lookup; password handling, registration and sessions are unchanged. Startup ensures indexes but does not seed/provision/rewrite existing data. Read-time recognition writes occur only for real previously completed progress; no bulk startup migration.

Reuse existing TestAttempt, CodingSubmission, CodingProblem, LearningModule, Batch and Enrollment. Aggregations project only safe achievement fields, group in MongoDB and limit output to 20,001 rows to detect an over-limit 20,000-record view. Each aggregation has a ten-second timeout. User lists stop at 501 to detect over 500 Students; rankings never silently use a truncated population. UI pagination is 25; current Student rank is calculated in the full authorized scope before slicing. Batch selectors cap at 500 active batches and use bounded/time-limited metadata queries. Student selectors query only enrolled batch IDs; Trainer selectors query only assigned active batches. Indexes on existing source/student fields are reused. Over-limit views return explicit 422 and require narrowing; larger deployments need incremental/precomputed aggregates and paginated metadata. This prototype makes no unlimited-scale performance claim.

Deterministic order: total points descending, completed assessments descending, solved coding descending, completed modules descending, stable Student ID ascending. Ranks are ordinal 1..N, including genuine zero-point participants. The current rank is null when no eligible membership places the Student in the selected scope.

All endpoints reuse authenticated sessions, connected-database checks, safe centralized errors, no-store responses and existing global API rate limits. Global means this application's institution, with environment demo visibility preserved; it is not a cross-institution directory. Student batch scope requires a current active enrollment in an active batch. Trainer scope is the union of active members of their active assigned batches; unrelated/archived batches and unrelated achievement profiles return 404. Admin may view all visible Students and filter active batches. No role writes or public privileged registration are introduced.

Student-public leaderboard/profile DTOs whitelist Student ID, display name, points, achievement counts and unlocked badge names/keys; **no email, department, answer selections/keys, individual grades, source, hidden tests, transcripts, tokens or private activity dates**. Own/full achievement DTOs (including streak dates and locked criteria) are available only to the authenticated Student or currently authorized staff. Staff view URLs do not grant access by themselves. No public unauthenticated routes are added.

### APIs and routes

| Method | Path | Scope |
|---|---|---|
| GET | `/api/v1/student/engagement` | Own points, breakdown, counts, earned/locked badges, meaningful streak and unknown-date disclosure; rejects identity/points filters |
| GET | `/api/v1/student/leaderboard?batchId=&page=` | Global or own active batch; current rank and paginated public rows |
| GET | `/api/v1/student/leaderboard/options` | Own active batch choices, independently available when a global ranking exceeds limits |
| GET | `/api/v1/student/leaderboard/:id?batchId=` | Safe public participant profile within visible selected scope |
| GET | `/api/v1/staff/leaderboard?batchId=&page=` | Trainer active assigned members / Admin institution; Admin engagement statistics |
| GET | `/api/v1/staff/leaderboard/options` | Authorized active batch choices |
| GET | `/api/v1/staff/engagement/:id?batchId=` | Full authorized Student achievements and streak (no underlying private attempts/source) |

Student pages `/leaderboard`, `/leaderboard/:id`, `/achievements`; staff `/manage/:role/leaderboard`, `/manage/:role/achievements/:id`, guarded by existing React role routes. Student dashboard adds reusable `DashboardEngagement`; existing readiness/grading/analytics data remains unchanged. The old activity card is explicitly labeled visit-inclusive activity, not the meaningful achievement streak. Student and staff sidebars have functioning links; admin statistics distinguish Students in scope from Students with actual achievements. Empty, zero, loading, retry/error and locked/earned states are explicit.

### Local checks and files

Run `npm test`, `npm run typecheck`, `npm run build`. Targeted suites: `npm run test -w server -- test/engagement.test.ts`; `npm run test -w client -- test/engagementUI.test.tsx`. All database tests use isolated MongoDB, never a production/Atlas connection. README has exact local role/progress walkthroughs; no service key is required to view engagement. Existing code execution still requires a real isolated provider for new accepted solves.

New: server `models/BadgeAward.ts`, `services/engagement.ts`, `controllers/engagement.ts`, `test/engagement.test.ts`; client `types/engagement.ts`, `hooks/useEngagementData.ts`, `components/EngagementSummary.tsx`, `pages/Leaderboard.tsx`, `pages/Achievements.tsx`, `test/engagementUI.test.tsx`. Modified: User/Preparation models, index startup, Student/staff route registration, narrowly scoped learning completion metadata, StudentDashboard integration, protected client routes and sidebar links, README/implementation/checkpoint documentation. Formatting touched only relevant modified files. No existing assessment grader, coding judge, AI provider, authentication middleware/session logic or watcher changes.

### Verified delivery

- Backend phase: **234 tests** passed with all source/test TypeScript checks and both production builds. Frontend integration and historical-date safeguards grew coverage to **243 tests**. Final full run: **222 server tests in 21 files plus 21 client tests in 2 files**, no skipped tests; client/server source/test TypeScript checks and both production builds passed. A final breadcrumb-only adjustment passed client source/test types and a client production rebuild.
- New coverage includes best-score retakes and versions, unanswered/future/demo exclusions, coding difficulty and duplicate solves, actual first module completion, legacy recognition without fabricated dates, repeated legacy completion guard, UTC midnight/yesterday/gaps/leap dates, all six badges and concurrent unique awards, deterministic ties, current rank outside a page, active batch selectors/isolation, Student/staff authorization, strict identity/point input rejection, privacy, output limits, locked/earned UI, dashboard links and loading/errors. Original 221 regressions (authentication/provisioning, Student flows, management and watcher) remain passing.
- Chromium used actual role login and HTTP requests through Vite into disposable MongoDB, with randomly generated temporary credentials. It verified zero-point/locked states, a real backend-graded Student attempt plus a Student-marked full module (140 points, two badges and one UTC streak day), refresh persistence, global/batch ranking, public profile/dashboard, Trainer scoped achievements and unrelated-batch/Student denials, Admin statistics/filters, mobile navigation and 375/768/1440px pages. No browser runtime errors or page overflow. Screenshots were visually inspected. Requests respected unchanged application API limits. Test-bank fixtures did not execute code or call AI; no live provider, Atlas or production database was used.
- Git candidate review and `git diff --check` passed: no secrets/private .env/generated/dependency files; no staged files, commit or push. No additional checkpoints implemented. Existing lazy Monaco chunk advisory remains.

Batch filters choose eligible participants; each participant's points reflect all of their eligible preparation, not only that batch's assigned resources. Badges are lifetime awards, while point/streak calculations depend on available source records. Trusted deletion of source/problem metadata can change recomputed totals; production-scale immutable event snapshots are future work, not claimed here.

Checkpoint 13 working-tree file inventory:

```text
README.md
client/src/layouts/AppLayout.tsx
client/src/main.tsx
client/src/pages/StudentDashboard.tsx
docs/CHECKPOINTS.md
docs/IMPLEMENTATION.md
server/src/index.ts
server/src/models/Preparation.ts
server/src/models/User.ts
server/src/routes/learning.ts
server/src/routes/staff.ts
server/src/routes/student.ts
client/src/components/EngagementSummary.tsx
client/src/hooks/useEngagementData.ts
client/src/pages/Achievements.tsx
client/src/pages/Leaderboard.tsx
client/src/types/engagement.ts
client/test/engagementUI.test.tsx
server/src/controllers/engagement.ts
server/src/models/BadgeAward.ts
server/src/services/engagement.ts
server/test/engagement.test.ts
```


## Checkpoint 15 — responsive UI, accessibility and final polish

Base `8a2b728e5763218f91e29053fc5d2aa8e27e09cf`. This stage changes frontend
presentation, accessibility and recovery only. No backend routes/models, scoring,
provider execution, role checks, session logic, points/badges/streaks or seeds are
changed. No application dependencies or environment variables are added.

### Implementation

- Shared CSS preserves purple/indigo branding while correcting confirmed contrast
  failures, intrinsic grid widths, mobile input sizing and touch targets. Tables
  retain internal horizontal scrolling rather than clipping the whole page.
- The mobile drawer is an explicitly named dialog with inert background/closed
  navigation, Tab/Shift+Tab containment, Escape, opener focus restoration, body
  scroll locking and clean desktop-breakpoint behavior. All sidebar destinations
  remain role-specific; the home logo goes straight to the role dashboard.
- `RouteAccessibility` makes main content focusable, updates page titles and polite
  route announcements, handles asynchronous protected-route mounting/direct links,
  and makes table scroll regions named and keyboard reachable with column scopes.
- Focus styles now cover textareas and details summaries. Loading skeletons
  announce progress while hiding decorative blocks. Existing inline success
  statuses and error/retry alerts are reused. Reduced motion stays supported.
- Authentication forms come first on mobile, have proper page headings and usable
  password visibility targets. Registration associates all field errors, announces
  them and focuses the first invalid field; its existing account/role behavior is
  unchanged. Saved textarea content no longer contaminates affected control names.
- Resume section Add actions are individually named. Learning navigation announces
  the current lesson. Saved interview speaker captions meet text contrast.
- Monaco uses its built-in high-contrast light theme and screen-reader mode. Keyboard
  help and a plain editor use exactly the same source/language/draft save APIs.
  A failed editor bundle falls back to real editable/savable text; it never fabricates
  execution. Draft changes warn before tab reload/closure. The existing provider
  setup-required state still disables only Run/Submit. A local SVG favicon avoids
  missing-asset console errors.

### Verification and local reproduction

`npm test`, `npm run typecheck`, `npm run build`: **248 tests passed** (222 server,
26 client; original 243 plus five accessibility regressions). All client/server
source/test TypeScript checks and both builds passed. No tests were disabled.
The lazy Monaco bundle-size advisory remains; compilation succeeds.

Chromium used actual authenticated UI and API requests into disposable MongoDB,
not production/Atlas. Random temporary credentials stayed outside Git. Actual
staff authoring/CSV import/publication/batch assignments, learning completion,
assessment grading, resume saves/templates/PDF download and ATS analysis were
verified. Four-language drafts save/restore with missing Judge0, company checklist
refresh persistence, achievements, reports/CSV downloads, Trainer workload controls,
Admin batch/trainer assignment and manual question create/edit were exercised.
Student access to staff routes redirects; unrelated Trainer batches/Students and
unauthorized exports remain denied. Deliberately aborted network/import requests
verify real error recovery/fallback; no successful API response is mocked.

Keyboard checks cover drawer focus containment/restoration, Escape, main focus,
registration mismatch focus/error description, reduced motion and resizing an open
drawer to desktop. Native confirmations retain browser-managed dialog focus. See
[UI_AUDIT.md](UI_AUDIT.md) for findings, route inventory, matrix results and the exact
local walkthrough. Run the existing app with a private development database and
explicit account/resource provisioning; no new service configuration is needed.

### Limitations

Axe WCAG checks plus Chromium keyboard/layout checks are not a formal accessibility
certification or manual NVDA/VoiceOver audit. Other browser engines, real touch
hardware and microphone permissions require separate device testing. Live OpenAI
interview/feedback and Judge0 execution remain unverified; only truthful missing-
configuration states were tested. The stored transcript used in browser checks is
explicitly a manual test fixture; no evaluation report or AI score was invented.
Secure PDF resource uploads remain unavailable. No paid service, production write,
credential, dependency or generated output is introduced or staged. Commit and push require explicit review approval.


Final Checkpoint 15 matrix: **55 role-specific route views × five widths = 275
layout checks** at 320/375/768/1024/1440px. No document overflow, remaining axe WCAG
violations or unexpected page/console errors after targeted corrected-finding
reruns. Multiline/folded code uses explicit readable line-number theme colors, not
only Monaco's default high-contrast palette. Actual module, assessment and code
records preserve their original server-side permissions. No source/history/test
content is fabricated for presentation. The active assessment was checked at each
width before actual submission. Full details and limitations: `UI_AUDIT.md`.

Checkpoint 15 file inventory:

```text
README.md
client/index.html
client/public/favicon.svg
client/src/components/EditorBoundary.tsx
client/src/components/EngagementSummary.tsx
client/src/components/RouteAccessibility.tsx
client/src/components/StudentUI.tsx
client/src/features/coding/Editor.tsx
client/src/hooks/useNavigationDrawer.ts
client/src/layouts/AppLayout.tsx
client/src/layouts/AuthLayout.tsx
client/src/main.tsx
client/src/pages/CodingWorkspace.tsx
client/src/pages/InterviewChat.tsx
client/src/pages/Learning.tsx
client/src/pages/LearningManage.tsx
client/src/pages/Login.tsx
client/src/pages/Register.tsx
client/src/pages/ResumeEditor.tsx
client/src/pages/StaffAssessments.tsx
client/src/pages/StaffBatches.tsx
client/src/pages/StudentDashboard.tsx
client/src/styles.css
client/test/uiAccessibility.test.tsx
docs/CHECKPOINTS.md
docs/IMPLEMENTATION.md
docs/UI_AUDIT.md
```


## Development-only Coding Demo Mode

The completed checkpoint implementation and real Judge0 adapter remain intact.
`CODING_DEMO_MODE` defaults to false. Environment parsing forces it off outside
development; application creation and demo handlers also enforce the development
guard. No Judge0 security setting is changed.

Authenticated Student routes:

- `GET /api/v1/student/coding/config` adds a separate `demoMode` capability;
  `configured` continues to describe the real execution provider.
- `POST /api/v1/student/coding/demo/run` validates bounded code/input and a supported
  language, then returns only a fixed, explicitly illustrative output. Source and
  input are never evaluated or forwarded.
- `POST /api/v1/student/coding/demo/problems/:id/submissions` validates input and
  reads only a visible published problem's title/languages. It returns a temporary
  `demo-` receipt, with no verdict, score, passed-test count or source. Unsupported
  languages and unavailable problems are rejected. No receipt is persisted.

Demo routes share existing database availability, authentication, Student role,
CSRF/origin and per-Student rate-limit middleware. They do not import an executor,
submission model, activity recorder or achievement service. Hidden tests are not
selected. Real `/coding/run` and `/coding/problems/:id/submissions` are unchanged.
Demo receipts cannot enter real submission history, grading, leaderboard, badges,
streaks or analytics. Existing private draft writes are preserved.

The frontend follows the backend capability, labels Demo Run/Demo Submit, shows
an always-visible no-execution disclaimer and fixed illustrative-output panel,
and renders a separate temporary receipt rather than a real graded result. Draft
load failures disable actions; request errors use the existing accessible alert.
The playground links users to published challenges for submission demonstrations.
Monaco remains locally bundled, with the existing accessible plain text fallback.

Local enable/disable instructions and future real-provider configuration are in
README.md, “Coding Demo Mode (development only)”. A dedicated development MongoDB
connection remains necessary; the mode does not bypass login or fabricate users.

Validation for this change: `npm test` passed 225 server tests and 29 client tests
(254 total), including six new backend/UI tests and all existing auth, Judge0,
grading, engagement and checkpoint regression suites. `npm run typecheck` and
`npm run build` passed. The existing Monaco bundle-size advisory remains.

Headless Chromium, against the actual development API and a checksum-verified,
disposable MongoDB 7.0.24 database, verified Student registration, Monaco editing
and draft saving, Demo Run/Demo Submit in all four languages, receipt/disclaimer
labels, receipt clearing and saved-draft restoration after reload, empty real
submission history, rate-limit error feedback, and no document
overflow at 320/375/768/1024/1440px. No page errors or external browser requests
were observed. No production database, live execution provider or paid service
was used. Live Judge0 execution remains unverified and unchanged.


## Centralized Google Gemini integration

The current AI setup section in README.md supersedes earlier OpenAI-only setup
instructions. Existing OpenAI behavior remains available only with explicit
`AI_PROVIDER=openai`. Default `AI_PROVIDER=gemini`, key selection `primary`, and
blank `GEMINI_MODEL` are intentional: no potentially paid or obsolete model is
silently selected. Official pricing/rate-limit pages were blocked by this
workspace's outbound policy on 10 October 2026. Model Free Tier eligibility,
project billing status, retention terms and live Google availability remain
manual checks. The maintained SDK source was accessible; `@google/genai` 2.28.0
was verified via npm metadata and installed with the lockfile. Existing locked
package versions were preserved.

### AI feature audit

| Feature | Before integration | Result |
| --- | --- | --- |
| Mock interviews | A: OpenAI conversation | Gemini or explicit OpenAI; existing types/setup/history |
| Initial question generation | A: provider-generated | Gemini structured question with validated setup |
| Follow-up questions | A: answer-adaptive provider calls | Actual previous questions/answers sent to Gemini |
| Answer evaluation | A: completed-interview feedback | Existing evidence-linked rubric preserved |
| Interview feedback/preparation advice | A: provider report/nextSteps | Gemini report, same evidence/score validator |
| Resume builder/PDF | B: structured editing and deterministic export | Preserved; no automatic AI editing |
| Resume/ATS analysis | B: deterministic ATS-style rubric | Unchanged score algorithm and saved snapshots |
| Resume improvement suggestions | B: heuristic suggestions | Heuristics preserved; optional consent-based Gemini qualitative suggestions added |
| Learning recommendations | B: dashboard actions/curated content | Kept rule-based; no new AI recommender |
| Coding explanations | C: no existing AI explanation workflow | Not invented; Monaco, Demo Mode and Judge0 preserved |
| Company preparation | B: curated profiles/checklists and assessment matching | Kept rule-based; provider-neutral existing interview guidance |

### Architecture and safeguards

`configureAI` selects one provider at startup. `GeminiAIService` owns one SDK
client, shared rate/concurrency state, the selected immutable model and the
request/response boundary for every Gemini feature. `GEMINI_KEY_SELECTION` chooses
exactly one of `GEMINI_API_KEY`/`GEMINI_API_KEY_BACKUP`; the unselected key is not
sent to the SDK. Selection changes require operator configuration and restart.
A missing selected key does not fall back. Invalid/revoked credentials, quota
exhaustion, timeouts or unavailable models do not rotate keys/providers/models.
The SDK is explicitly set to the Gemini Developer API rather than Vertex AI or
Enterprise, and `retryOptions.attempts=1` prevents automatic retries.

Questions/feedback share the same prompts with the preserved OpenAI adapter.
Setup and transcript are treated as untrusted data. The service uses JSON MIME
and JSON schemas, requires a completed STOP response, and validates with Zod.
Feedback additionally uses the existing saved-answer quote and question-coverage
checks before persistence. No raw SDK errors, keys or student content are logged
or sent in error responses. No tools/code execution, grounding, caches, billing
activation or cloud-resource creation are used. Configuration status reports
presence only, without a quota-consuming probe or claim of live readiness.

Limits are documented in README.md: 45 seconds, bounded input/output bytes and
output tokens, ten calls/minute and two concurrent calls per backend instance,
plus preserved HTTP AI limits and bounded MongoDB leases/version checks. The
per-instance limiter is not a distributed project-wide quota or rupee cap. A
client timeout cannot guarantee cancellation of work already received by Google.
A strict ₹0 setup requires verified Free Tier eligibility and disabled project
billing; the code cannot infer billing state from a key.

### Resume privacy and UI

`POST /api/v1/student/resumes/:id/ai-suggestions` requires authenticated Student
ownership, existing origin/CSRF protection, the AI limiter, strict input validation
and `consent:true` on each request. It reads the owned saved resume, prepares a
minimized/redacted payload and calls the shared Gemini service. It returns only
validated qualitative suggestions, provider label, saved version and disclaimer.
It does not update resume content/version, ATS analyses, scores or other models.
No keys or key-selection settings are returned. Hidden coding tests are unrelated
and untouched. The request cannot supply another owner, keys, provider or model.

The ATS page explains that its scores remain deterministic. The separate panel
shows provider disclosure, unchecked consent, disabled duplicate actions, loading,
errors and AI-generated labels. Consent/results reset when resume or description
changes; stale asynchronous responses are discarded. Results are temporary and
are not applied automatically. Contact-field omission and best-effort text
redaction do not guarantee anonymity; the user must review content and Google's
current Free Tier retention/data-use terms. Existing interview privacy text now
explains provider sharing rather than implying content never leaves the app.

No private .env files, production data, Coding Demo Mode or Judge0 execution
implementation were modified. `JUDGE0_SECURITY_CONFIRMED` still defaults to false.

### Verification and changed-file inventory

Validation on 10 October 2026: `npm test` passed all 288 tests (257 server,
31 client), including 34 new mocked Gemini/privacy tests. `npm run typecheck`
and `npm run build` passed. The existing large Monaco bundle warning remains.
Chromium verified authenticated Technical/HR questions, actual-answer follow-ups,
feedback/history, resume consent, unchanged ATS scores and saved resume content,
friendly quota errors without fabricated results, Coding Demo Mode, and responsive
layouts at 320/375/768/1024/1440 pixels. Browser checks used the real Google SDK
against a local mock and a disposable test database, not a live Gemini key;
there were no page errors or external browser requests.

Current Google Free Tier model eligibility could not be independently verified:
official pricing/rate-limit pages returned HTTP 403 in this environment.
`GEMINI_MODEL` remains blank intentionally. Live provider operation and ₹0 billing
eligibility require the operator checks documented in README.md before enabling AI.

Modified files:

- `README.md`, `docs/IMPLEMENTATION.md`, `package-lock.json`
- `server/.env.example`, `server/package.json`
- `server/src/app.ts`, `server/src/index.ts`, `server/src/config/env.ts`
- `server/src/routes/student.ts`
- `server/src/controllers/interviews.ts`, `server/src/controllers/feedback.ts`
- `server/src/services/interviewProvider.ts`, `server/src/services/companyPreparation.ts`
- `server/test/interviews.test.ts`
- `client/src/pages/Interviews.tsx`, `client/src/pages/ResumeAnalyzer.tsx`

Created files:

- `server/src/services/aiPrompts.ts`, `server/src/services/aiProvider.ts`, `server/src/services/geminiAI.ts`
- `server/src/controllers/resumeSuggestions.ts`, `server/src/validators/resumeSuggestions.ts`
- `server/test/geminiAI.test.ts`, `server/test/geminiWorkflows.test.ts`, `server/test/helpers/gemini.ts`
- `client/src/features/resume/ResumeAISuggestions.tsx`, `client/test/resumeAIUI.test.tsx`

## OneCompiler execution, Gemini Coding Mentor and SparkMeet classes

This extension keeps the existing provider abstraction, coding drafts/problems/
submissions, deterministic grading and reward consumers. `configureExecution`
selects OneCompiler only with explicit enablement and a backend key; otherwise
the original Judge0 gate remains. Missing selected configuration has no fallback.
The OneCompiler direct contract was supplied by the user from official docs after
network access failed (HTTP 403); no private keys or live paid calls were used.

`OneCompilerProvider` sends the supplied fixed HTTPS endpoint/header and schema,
never a caller-controlled URL. Central language/filename mapping, strict input
limits, bounded streamed responses, abort/deadline, rate/concurrency/day caps and
safe E001–E006/HTTP handling precede normalization. It recognizes either quota
remaining field and stops future calls at zero. Batch responses require exact
length and ordered echoed stdin; no missing or reordered result is invented.
Oversized combined stdin is split into bounded batches with an overall submission
deadline. `judgeSubmission` accepts optional provider batching, then applies the
unchanged whitespace policy. It keeps deterministic aggregate results, saved
request IDs, Student ownership, null scores for provider/system failures, and
hidden-diagnostic suppression. Existing solved/progress/leaderboard/badge logic
consumes genuine completed records without any AI grading changes.

OneCompiler does not expose a portable exit/compilation status in the supplied
contract. Nonempty diagnostics fail conservatively and their classification is
heuristic; stderr-writing successful programs may be rejected. No worker CPU,
memory or egress guarantees were independently verified. Request timeouts bound
the LMS wait, not remote work. Caps are per-process attempt limits, not durable
Google/OneCompiler quotas or rupee caps. Check account credits/billing externally.
The current problem model is stdin/stdout-only; no function-test harness is invented.

`GeminiAIService.codingMentor` uses the same immutable SDK client, model/key
selection and shared limits as interviews/resume suggestions. Its strict context
contains code/language/action, progressive hint level, explicit full-solution
opt-in, public problem fields and displayed Run diagnostics only. Hidden tests,
test results and source from other Student records are not read. Output schema
contains explanation/nextSteps, no grading fields. The panel requires data-sharing
consent, discards stale responses on source/context changes and never saves code
edits, awards or submissions. Model identifiers (including a proposed Gemini 3.8
Flash) are not guessed; private configuration was untouched.

### API additions and existing endpoints extended

All routes use existing authentication/roles, origin/CSRF and private no-store
responses. Prefixes below are `/api/v1/student` and `/api/v1/staff` respectively.

| Scope | Method/path | Behavior |
| --- | --- | --- |
| Student | GET `/coding/config` | Selected executor/configuration; truthful provider-managed limits |
| Student | POST `/coding/run` | Real OneCompiler run through existing execution interface |
| Student | POST `/coding/problems/:id/submissions` | Authoritative backend batch grading/persistence |
| Student | GET `/coding/submissions`, GET `/coding/submissions/:id` | Existing private aggregate history |
| Student | GET `/coding/mentor/config` | Mentor capability, without credentials |
| Student | POST `/coding/mentor` | Validated public context and shared Gemini advice |
| Student | GET `/live-classes` | Classes and own attendance in active enrolled batches |
| Student | GET `/live-classes/:id` | Authorized meeting, notes/resources and own attendance |
| Staff | GET `/live-classes` | Owned/assigned trainer scope or all Admin classes, real analytics |
| Staff | GET `/live-classes/:id` | Scoped meeting details, enrollment roster and attendance |
| Staff | POST `/live-classes` | Versioned scheduling with creator-scoped idempotency UUID |
| Staff | PUT `/live-classes/:id` | Scoped editing/assignment with optimistic version checks |
| Staff | POST `/live-classes/:id/cancel` | Cancellation/version guard; links withheld afterward |
| Staff | PUT `/live-classes/:id/attendance` | Enrollment-validated manual observations after start |

Class list query supports `view=all|upcoming` (strictly validated). Lists are bounded
at 100 entries with truncation indication; dashboards request nearest upcoming/
currently scheduled-live classes. Analytics count the complete authorized scope,
not just the displayed page. Status uses start + duration, never video telemetry.

### Live-class model and authorization

New `LiveClass` stores title, description, batchId, trainerId, createdBy, requestId,
private requestFingerprint/meetingUrl, startsAt, durationMinutes, cancelled,
optimistic version, notes, resource links and embedded manual attendance entries
(studentId/status/note/recordedBy/recordedAt). Indexes are unique creator/requestId,
batch/start and trainer/start; normal startup ensures them alongside existing
indexes. Existing Batch/Enrollment/User schemas and connection remain unchanged.

Trainers can operate only their own classes in actively assigned batches; Admins
may assign only real Trainers in the chosen batch. Students need current active
enrollment and an active batch for both list/detail access; revocation removes LMS
access, including previous class details. They receive only their attendance,
never other students' roster/records. Attendance edits merge observations by
student with version checks; duplicate/unrelated attendees, future or cancelled
class updates are rejected. Opening a link does not create any attendance record.
After start, schedule/batch/trainer changes are rejected; notes/resources remain
editable. Completed classes cannot be cancelled; cancelled classes cannot be edited.
Creation retries have identical fingerprints or return conflict, not duplicate rows.

SparkMeet integration stores actual operator-supplied links on the fixed origin and
opens a separate tab. No verified API/embed/token/SSO documentation was available;
no such capability or automatic room creation/attendance is claimed. Additional
mentorship is intentionally outside this core implementation. Resource links use
HTTPS; external sites have their own privacy/security policies. Detailed setup,
limits, costs and provider caveats are documented in README.md.

### Changed-file inventory

- `README.md`
- `client/src/features/coding/CodingMentor.tsx`
- `client/src/hooks/useStaffData.ts`
- `client/src/layouts/AppLayout.tsx`
- `client/src/main.tsx`
- `client/src/pages/CodingWorkspace.tsx`
- `client/src/pages/LiveClasses.tsx`
- `client/src/pages/StaffDashboard.tsx`
- `client/src/pages/StudentDashboard.tsx`
- `client/test/liveCodingUI.test.tsx`
- `docs/IMPLEMENTATION.md`
- `server/.env.example`
- `server/src/app.ts`
- `server/src/config/env.ts`
- `server/src/controllers/coding.ts`
- `server/src/controllers/codingMentor.ts`
- `server/src/controllers/codingProblems.ts`
- `server/src/controllers/liveClasses.ts`
- `server/src/index.ts`
- `server/src/models/LiveClass.ts`
- `server/src/routes/staff.ts`
- `server/src/routes/student.ts`
- `server/src/services/codeExecution.ts`
- `server/src/services/codingJudge.ts`
- `server/src/services/executionProvider.ts`
- `server/src/services/geminiAI.ts`
- `server/src/services/interviewProvider.ts`
- `server/src/services/oneCompiler.ts`
- `server/src/validators/codingMentor.ts`
- `server/src/validators/liveClass.ts`
- `server/test/codingMentor.test.ts`
- `server/test/liveClasses.test.ts`
- `server/test/oneCompiler.test.ts`
- `server/test/oneCompilerWorkflows.test.ts`

### Verification

The final implementation adds 64 focused tests to the existing 288-test suite.
The full suite passed 352 tests (317 server, 35 client), with no failures.
`npm run typecheck` and `npm run build` passed; the existing lazy Monaco
bundle-size advisory remains. Tests cover direct-API language mapping, batch
ordering/chunking, output/UTF-8 limits, E001–E006, HTTP/network/timeout/quota
errors, no retries/fallbacks, hidden grading/history, demo and Judge0 gates,
mentor hints/context/limits/errors/no grading, and class ownership/enrollment,
admin assignments, URL/date/version/idempotency/attendance protections.

Chromium exercised real authenticated React/Express workflows against a disposable
MongoDB database and mocked OneCompiler/Gemini transports (the real shared Google
SDK was used). Scheduling, editing/notes/resources, cancellation, Student batch
isolation, manual attendance, Admin totals, Run output/runtime errors, progressive
hints and quota messages, deterministic hidden batch grading and submission
history passed. Representative layouts passed at 320, 375, 768 and 1440 pixels
without overflow; there were no page errors or external browser requests. These
checks do not verify live credentials, credits, external worker security or actual
SparkMeet video rooms. No production records, private .env files, credentials,
commits or pushes were changed/created by this implementation.
