# Local AI development without API credits

Disha360 supports **Ollama**, Gemini and the optional official OpenAI SDK through
one backend provider selection. Ollama supplies genuine model-generated interview
questions, follow-ups, evidence-checked practice scorecards, optional consent-based
resume suggestions, and coding mentor guidance. No paid API credential is needed
for a locally downloaded open-weight model. Electricity, hardware and downloads
are still your responsibility. There is no automatic cloud/model fallback.

## macOS installation and startup

Use Node **22.23.3**, npm, VS Code and your existing authorized MongoDB setup.
These commands do not edit your private `server/.env`:

```sh
brew install ollama
ollama serve
```

Leave that terminal running. Alternatively use Ollama's official macOS app:
https://ollama.com/download/mac. Don't start both servers on port 11434.
In another terminal, explicitly download the recommended coding model:

```sh
ollama pull qwen2.5-coder:7b
ollama list
ollama run qwen2.5-coder:7b "Explain binary search briefly."
```

Recommendation: Qwen2.5-Coder 7B, a coding-oriented open-weight model capable of
instruction following. The tag is a recommendation, **not evidence of installation**.
The Ollama library page is https://ollama.com/library/qwen2.5-coder; its page was
blocked by this workspace's proxy, so current downloadable tag availability could
not be independently verified here. The backend checks the **exact name returned
by your server's `/api/tags`**. Never guess an installed tag or silently substitute
another model. Verify the model license before redistribution.

An Apple Silicon Mac with **16 GB RAM or more** is recommended; 7B quantized weights
are roughly 5 GB and context/cache need additional memory. These are planning
estimates, not measured hardware requirements. On 8 GB systems, consider the
smaller `qwen2.5-coder:3b` tag if currently offered, explicitly pull it and use its
exact name from `ollama list`. Expect weaker structured feedback and slower CPU
inference. Structured outputs can fail: errors remain visible and no fake report
is saved. Interview quality and scores are AI estimates, never hiring decisions.

Open the repository folder in VS Code and use its integrated terminal:

```sh
npm ci --include=dev
export AI_PROVIDER=ollama
export OLLAMA_BASE_URL=http://127.0.0.1:11434
export OLLAMA_MODEL=qwen2.5-coder:7b
npm run db:check
npm run providers:check
npm run dev
```

Replace only the model value with the exact installed name. Shell exports take
precedence over dotenv's existing values and leave `server/.env` untouched.
MongoDB must already be configured securely for authentication and history.
`db:check` checks connectivity without changing the URI or writing production data.
Frontend: `http://localhost:5173`; backend: `http://localhost:4000`.
Use your existing student account. Do not seed production databases.
Provider checks may separately report cloud execution as unavailable: Ollama
readiness does not require OneCompiler credentials. Unconfigured code execution
does not block AI mentoring or interviews.

To make local settings persistent, configure these **non-secret** variables in
VS Code's terminal environment or your local shell configuration. Restart the
backend after changing provider or model. Never put keys into React or chat.

## Test the coding mentor

1. Log in as Student and open Coding workspace or a published challenge.
2. Select Python, Java, C++ or JavaScript and enter code.
3. Expand **AI provider settings & privacy**; confirm Ollama and the exact model.
4. Consent to sharing this context with the configured server. Remove secrets.
5. Request hints 1–3, code/error explanations, debugging, optimization,
   complexity, algorithm explanations or practice questions. Optional follow-up
   text and the latest six conversation messages are bounded context.
6. Ollama guidance streams into the chat. Copy fenced code blocks as needed.
   Stop cancels inference. Interrupted content is labeled incomplete; it is not
   a completed answer. Cloud providers use validated buffered JSON responses.
7. A full solution requires the separate explicit opt-in. AI cannot grade or
   create coding submissions. Hidden tests and demo output never enter prompts.

## Test mock interviews

Open Interview studio; choose Technical, HR or Behavioral, difficulty, role,
focus and question count. Start, answer and inspect relevant follow-ups. Complete
and request feedback. The existing scorecard validates evidence quotes against
actual saved answers and labels numerical scores as AI-generated assessments.
History and feedback remain private to that student's account. Progress shows
saved answers only. Failed inference never becomes a fabricated question/score.

## Real local code execution

The separate opt-in Docker worker now supports Python, Java, C++ and JavaScript
without cloud keys. See [DOCKER_SANDBOX.md](DOCKER_SANDBOX.md) for exact Docker
Desktop, worker, backend/frontend setup, execution controls and real test commands.
Set `CODING_EXECUTION_PROVIDER=docker` only in development, start the worker first,
and keep `CODING_DEMO_MODE=false` for genuine Run/Submit. Public production activation
is rejected. OneCompiler, gated Judge0 and labeled demo actions remain available.

## Configuration and limits

| Variable | Purpose |
| --- | --- |
| `AI_PROVIDER=ollama` | Select local AI explicitly; `gemini` and `openai` remain available |
| `OLLAMA_BASE_URL=http://127.0.0.1:11434` | Backend-only loopback HTTP or trusted HTTPS origin; no credentials/path/query |
| `OLLAMA_MODEL=` | Exact installed model name; no automatic pull/default |
| `LOCAL_CODE_EXECUTION_ENABLED=false` | Legacy reserved flag; use explicit Docker provider selection |
| `ONECOMPILER_ENABLED=false` | Optional cloud execution disabled |
| `CODING_DEMO_MODE=false` | Keep demo off; true allowed only in development |
| `JUDGE0_SECURITY_CONFIRMED=false` | Existing Judge0 safety gate remains off |

Ollama requests have a 120-second deadline, 85 KB serialized context, 100 KB
provider response cap, one concurrent inference and ten requests per minute per
backend instance, plus existing authenticated student limits. Mentor text is
capped at 8,000 characters and 1,800 predicted tokens. Questions use 600 tokens;
feedback uses up to 6,000. Context is configured to 16,384 tokens; large/non-English
inputs can exceed a model's practical context and quality must be reviewed.
Availability checks use a five-second deadline, never download a model and do not
prove that later generation will succeed. No retries or key rotation bypass quotas.

Ollama receives code and interview answers at the operator-configured endpoint.
Keep loopback binding for local development, protect remote servers with a private
network/access-controlled gateway, and review logs/retention yourself. The app
does not expose API keys or provider configuration controls to students.

## Tests and hosting limitations

```sh
npm test
npm run typecheck
npm run build
```

Automated Ollama tests use mocked responses and a local HTTP fixture implementing
the documented contract. They are **not real model integration tests**. The
workspace has no installed Ollama/model; live inference was not verified. The separate Docker sandbox has real execution and authenticated grading tests;
see DOCKER_SANDBOX.md for the current results and production restrictions. Existing OneCompiler/Judge0 mocks and protection tests remain.

Render cannot access your Mac's `127.0.0.1`. A public Disha360 deployment still
requires reachable MongoDB, a separately provisioned trusted AI inference server
or optional authorized cloud API, and a verified execution service for real
judging. SparkMeet stays on its existing external deployment. No paid resources
or cloud credentials are required just to run local Ollama AI.

Official API contract consulted:
https://github.com/ollama/ollama/blob/main/docs/api.md (`/api/tags`, `/api/chat`,
JSON-schema `format`, NDJSON `stream`, `done`, `options`, `keep_alive`).

Validation recorded for this change: **418 automated tests passed** (372 backend,
46 frontend), TypeScript checks and the production build passed on Node 22.23.3.
Chromium verified authenticated streaming mentoring, progressive hints, HR
interview creation/follow-ups/progress and preserved demo labeling, with responsive
coding/interview layouts at 375, 768 and 1440 pixels and no JavaScript errors.
Browser AI responses were **fixtures**, not an installed Ollama model. Production
npm dependency audit reported zero vulnerabilities. The existing Monaco/main
bundle size warnings remain. No production records or private `.env` were changed.
