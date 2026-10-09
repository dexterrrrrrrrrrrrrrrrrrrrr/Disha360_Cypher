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
