# Key-free local coding sandbox

Disha360 has an opt-in **local-development Docker runner**, separate from Express.
It supports genuine Python, Java, C++17 and JavaScript Run/Submit using the existing
Monaco workspace, coding problems, hidden tests, submission history and analytics.
Ollama provides AI mentoring independently; it never grades programs.

## macOS setup in VS Code

Use Node 22.23.3 and your existing securely configured MongoDB connection and user
account. Do not overwrite `server/.env` or seed production data.

1. Install Docker Desktop and Ollama:

   ```sh
   brew install --cask docker
   brew install ollama
   open -a Docker
   docker info
   ```

   Wait until Docker Desktop reports the engine is running. The worker uses the
   local Unix socket (`~/.docker/run/docker.sock` on macOS when present, otherwise
   `/var/run/docker.sock`). If needed, explicitly set `DISHA_DOCKER_SOCKET` to your
   local Docker Desktop Unix socket path. Remote TCP Docker endpoints are not used.

2. In the repository folder in a VS Code terminal, install dependencies and build
   the operator-controlled image. This downloads toolchains but buys no API credits:

   ```sh
   npm ci --include=dev
   npm run runner:build
   npm run runner:dev
   ```

   Keep the worker terminal running. Wait for **Local Docker worker ready**. Startup
   performs a real sandbox execution and verifies resource controls. The worker
   binds only `127.0.0.1:4010`, creates a random local authentication token in
   `.disha-local/runner-token` with mode 600, and never prints it. That directory is
   Git-ignored. Neither tokens nor application secrets are copied into containers.

3. In another terminal, start Ollama. Do not start a second server if using its
   official macOS app:

   ```sh
   ollama serve
   ```

   In another terminal explicitly download a recommended model:

   ```sh
   ollama pull qwen2.5-coder:7b
   ollama list
   ```

   Use the exact installed name from `ollama list`. The 7B model is recommended
   with 16 GB RAM or more; smaller 3B variants, if available, suit tighter memory
   budgets with weaker feedback. The app never pulls, guesses or swaps models.
   Current library tag availability was not verified in the cloud workspace.

4. Start the backend from a new terminal, without changing private `.env`:

   ```sh
   export NODE_ENV=development
   export CODING_EXECUTION_PROVIDER=docker
   export CODING_DEMO_MODE=false
   export ONECOMPILER_ENABLED=false
   export JUDGE0_SECURITY_CONFIRMED=false
   export AI_PROVIDER=ollama
   export OLLAMA_BASE_URL=http://127.0.0.1:11434
   export OLLAMA_MODEL=qwen2.5-coder:7b
   npm run db:check
   npm run providers:check
   npm run dev -w server
   ```

   Existing `MONGODB_URI` is reused securely. If it is unavailable, configure your
   own development database securely; authentication and history need MongoDB.
   Provider checks verify the exact installed Ollama model and local worker health
   without requiring OneCompiler/Gemini/OpenAI keys. Restart the backend after
   changing provider configuration. Never seed or test against production data.

5. Start the frontend in another terminal:

   ```sh
   npm run dev -w client
   ```

   Open `http://localhost:5173`, sign in as Student, and open Coding practice. Local
   Vite uses the existing API proxy. No frontend API keys or worker token are needed.

6. Select Python, enter `print("Hello Disha360")`, and click **Run Code**. Confirm
   real stdout and exit status 0. Change custom input and try:

   ```python
   name = input()
   print("Hello " + name)
   ```

7. Select Java and run:

   ```java
   public class Main {
       public static void main(String[] args) {
           System.out.println("Hello Disha360");
       }
   }
   ```

   ASCII public class names other than Main are supported by filename detection.
   Complex declarations/comments can require using a conventional Main class;
   filename/compilation errors remain genuine compiler output. Java uses Java 17,
   Python uses Debian Python 3, JavaScript uses Node 22.23.3, C++ uses g++/C++17.

8. Open a published challenge, read input/output formats and write a complete
   STDIN/STDOUT program in a supported language. **Submit Code** loads authoritative
   hidden tests only on the backend, runs each in a fresh sandbox and compares
   actual output deterministically. You see genuine aggregate passed/total, score
   and verdict; hidden inputs, expected outputs and diagnostics never reach the
   browser. History is private and existing progress/analytics are updated.
   Programs must follow the problem's STDIN/STDOUT contract; no function harness
   or AI-based grading is invented.

9. Expand the AI Coding Mentor, confirm Ollama availability, consent to its context
   and use **Explain Error**, **Get Hint**, or **Explain My Code**. Actual run errors
   and aggregate submission outcomes can be included; hidden test details cannot.
   Responses stream, render safe Markdown and offer copyable highlighted code.
   AI guidance is unexecuted and unverified, with no hiring/correctness guarantees.

## Execution architecture and verified controls

`Express → authenticated loopback HTTP worker → fixed Docker CLI → ephemeral
container`. Only the separate worker accesses the host Docker socket. Docker CLI
commands use argument arrays with `shell:false`; student source is JSON data on
stdin to a fixed preparation command inside the sandbox, never host shell code.
Compilation and execution use fixed executable/argument mappings. Image selection,
commands, paths, mounts and Docker flags are never accepted from students.

The image is built in advance from `node:22.23.3-bookworm-slim`, with Python, g++
and Java 17. Startup resolves its immutable SHA256 image ID. There are no runtime
image pulls. Every case receives a new container with these inspected controls:

- UID/GID 65534, no privileged mode, all capabilities dropped, no new privileges,
  Docker default seccomp, private PID/IPC/cgroup namespaces.
- Network `none`; no host networking, host filesystem bind mounts, devices,
  Docker socket, application environment, credentials or proxy secrets.
- Read-only root; writable RAM-backed `/workspace` (32 MB) and `/tmp` (8 MB).
  Workspace permits compiled binaries; both are nosuid/nodev, `/tmp` is noexec.
- One CPU, 512 MB memory and 512 MB total memory+swap, 64 PIDs, 64 file descriptors,
  bounded file size. Java/Node heaps are additionally capped at 128 MB.
- Five-second execution deadline; ten-second compilation deadline; 16 KB combined
  stdout/stderr or compiler output. Output flooding terminates the container.
- No container log driver, avoiding output-flood disk growth through PID 1.
- One active job, bounded inputs (30,000 source characters, 10,000 per stdin,
  maximum ten cases), 250 KB HTTP body, 75-second whole-job deadline, 30 worker jobs
  per minute, plus existing authenticated student rate limits.
- Forced container removal after every case, including failures, timeout,
  disconnect and children escaping their parent's process group. Cleanup failure
  stops worker readiness; infrastructure failures never become Accepted results.

Run reports stdout/stderr separately, actual Docker-exec exit status, compilation
errors, truncation and wall elapsed time around Docker exec (including its transport
and startup overhead). Peak memory is **unavailable**, not fabricated. Docker OOM
metadata distinguishes memory exhaustion. Timeouts/output termination can have no
normal exit code. Empty stdout is valid, and can match an empty expected output.

Submit normalization preserves case/interior whitespace, converts CRLF/CR to LF,
removes trailing spaces/tabs from each line and final newlines. The existing grading
algorithm stores real results; infrastructure errors have no correctness score.
The entire batch must finish within the existing 90-second submission lease; large
or slow batches can fail with a truthful infrastructure error and no fake results.

## Verification recorded in the managed workspace

- Node 22.23.3: 380 backend + 47 frontend + 3 runner unit tests passed
  (430 total); seven opt-in live backend tests skipped during the standard run.
- Seventeen real container tests passed: all four languages/stdin, streams/empty
  output, compilation/runtime errors, timeout, OOM, output/PID/disk limits,
  network/root-filesystem/secret isolation, Java class naming and child cleanup.
- Two real worker HTTP tests passed: authentication/origin/body validation and
  cleanup after an aborted request. Seven real authenticated backend tests passed:
  four-language Run/hidden grading, genuine wrong answers, private history,
  deduplication, cross-student isolation and concurrent execution/submissions.
- Chromium used the actual Docker worker, Express authentication and disposable
  MongoDB: four-language Run with input/output/exit status, genuine Accepted 3/3
  Submit, protected hidden results, private history and responsive layouts at
  375/768/1440 px passed with no browser JavaScript errors.
- Type-check and production build passed. Vite retains its large-chunk warning.
- Ollama was unavailable: the browser showed setup guidance. No live model
  inference was verified; Ollama automated tests use fixtures.

These checks establish development functionality and specific tested controls,
not a production sandbox security certification. macOS setup still requires the
operator's Docker Desktop, downloaded Ollama model and development database.

## Configuration

| Variable | Purpose |
| --- | --- |
| `CODING_EXECUTION_PROVIDER=docker` | Explicit development-only local selection; no cloud key required |
| `DOCKER_RUNNER_URL=http://127.0.0.1:4010` | Backend loopback endpoint only |
| `DOCKER_RUNNER_TOKEN_FILE=` | Optional absolute path; default generated ignored file |
| `DOCKER_RUNNER_PORT=4010` | Separate worker listening port |
| `DISHA_DOCKER_SOCKET=` | Optional local Unix socket override for worker |
| `DISHA_RUNNER_IMAGE=disha360-runner:local` | Operator-only prebuilt image, resolved to immutable ID |
| `CODING_DEMO_MODE=false` | Real actions; development demo remains optional and labeled |
| `ONECOMPILER_ENABLED=false` | No cloud execution credits required |
| `AI_PROVIDER=ollama` | Existing local AI provider selection |
| `OLLAMA_BASE_URL=http://127.0.0.1:11434` | Backend-side Ollama server |
| `OLLAMA_MODEL=` | Exact installed model |

`CODING_EXECUTION_PROVIDER=auto` preserves existing opt-in OneCompiler/Judge0 behavior.
`onecompiler`, `judge0` and `disabled` are also explicit choices. There is no
fallback to a different provider on errors. `LOCAL_CODE_EXECUTION_ENABLED=false`
is a legacy reserved setting; it does not select the new Docker provider.
The backend rejects Docker selection outside development; the worker also refuses
non-development environments. Judge0 still requires its separate security gate.

## Tests and troubleshooting

```sh
npm test
npm run typecheck
npm run build
# Keep the worker running first for real worker and grading tests:
npm run runner:test:live
DISHA_DOCKER_LIVE_TESTS=true npm run test -w server -- test/dockerLiveWorkflows.test.ts
```

Standard tests use mocked worker/provider responses; real integration tests are
explicitly opt-in and labeled REAL. Real tests use disposable MongoDB, not your
configured database. Live Ollama inference requires an installed server/model and
was not verified in this workspace. Never report mocked model responses as live AI.

Missing image: run `npm run runner:build`. Worker not ready: check Docker Desktop,
required cgroup/seccomp controls and token file owner/mode. Start worker before
backend; retry availability after startup preflight finishes. Busy: wait, do not
start extra workers to bypass limits. Large Java/native compilation may need a
smaller program; limits are intentionally conservative. On unsupported Docker
hosts, readiness fails and execution remains disabled.

In the managed cloud environment, Docker builds use the session's existing proxy
and public CA via BuildKit secret: `docker build --secret
id=proxy_ca,src="$CODEX_PROXY_CERT" ...`. Do not disable TLS/signature verification
or copy this session certificate into the image. Use a writable `BUILDX_CONFIG`
if the default buildx cache directory is read-only; preserve Docker credentials.

## Production restrictions

This is **not a safe public multi-tenant sandbox**. Standard Docker shares the
Linux kernel; container/runtime/kernel vulnerabilities, side channels and host
resource contention remain possible. The Docker-owning worker is powerful even
though student containers cannot access its socket. Run it only for trusted local
development on a patched, expendable host/VM, with resource monitoring and no
sensitive workloads. Rebuild/update and audit image/toolchains regularly.

Do not run this worker inside the existing Render free web service or expose its
port. Production requires a separate hardened execution fleet/VM, stronger audited
isolation (e.g. gVisor/microVM), authenticated private worker transport, quotas,
queueing, lifecycle recovery, monitoring and adversarial security review. A public
Express API must have no Docker socket. Production activation remains rejected.
Render cannot access your Mac's Docker or Ollama loopback services. Existing
OneCompiler and Gemini remain optional cloud choices, and SparkMeet is unchanged.
