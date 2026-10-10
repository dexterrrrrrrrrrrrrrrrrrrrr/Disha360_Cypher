# Production deployment preparation

No deployment, commit, push or merge is performed by this preparation. The
current implementation is on `work`; production services must use `main` only
after a reviewed PR is merged explicitly. Do not deploy the older default branch
and expect features from `work` to be present.

## Repository and build settings

The root `package-lock.json` owns both npm workspaces. Install from the repository
root; there are no independent workspace lockfiles. Use Node **22.x**, at least
22.12.0 (root engine requirement), consistently on both platforms.

| Setting | Render API | Vercel frontend |
| --- | --- | --- |
| Source branch | `main`, after review/merge | `main`, after review/merge |
| Platform project root | Repository root (leave Root Directory blank) | `client` |
| Application sources | `server` | `client` |
| Install | Included in build command | `cd .. && npm ci --include=dev` |
| Build | `npm ci --include=dev && npm run build -w server` | `npm run build` (runs inside `client`) |
| Output | `server/dist` | `dist` (relative to `client`) |
| Start | `npm run start -w server` | Static Vite output; no Node start command |
| Health check | `/api/v1/ready` | Manual route-refresh and API checks |

Development dependencies must be installed during builds because TypeScript/Vite
are development dependencies. Never copy a private `.env` into a build artifact.
The API reads Render's `PORT` and binds `0.0.0.0`; leave PORT managed by Render.
Graceful SIGTERM closes HTTP/database connections. `/api/v1/health` is liveness;
`/api/v1/ready` returns 503 when MongoDB is disconnected. Production startup
requires MongoDB and exits on connection/index initialization failure.

## Environment checklist (names only; no real credentials)

All backend variables belong only in Render's private environment settings.
`VITE_*` values are compiled into public JavaScript and are not secret storage.

| Variable | Platform | Requirement | Purpose / production setting |
| --- | --- | --- | --- |
| NODE_ENV | Render | Required | `production`; secure cookies and no demo accounts |
| NODE_VERSION | Render | Required configuration | `22.23.3` tested patch; align with Vercel 22.x |
| PORT | Render | Platform-managed | Listener port; do not hardcode a deployment port |
| MONGODB_URI | Render | Required, secret | Atlas SRV URI, explicit production database and least-privilege database user |
| CLIENT_ORIGIN | Render | Required | Exact HTTPS Vercel/custom frontend origin, no path/query/userinfo |
| TRUST_PROXY | Render | Required configuration | `true` only with a verified single trusted ingress hop |
| COOKIE_SAME_SITE | Render | Required configuration | `none` for cross-site vercel.app → onrender.com; `lax` for same-site custom domains |
| CODING_DEMO_MODE | Render | Keep disabled | `false`; production additionally forces it off |
| ONECOMPILER_ENABLED | Render | Required for real execution | `true` only after validating account credits, billing and provider safety; otherwise `false` |
| ONECOMPILER_API_KEY | Render | Secret, required when enabled | Direct OneCompiler credential; never frontend |
| ONECOMPILER_MAX_EXECUTIONS_PER_DAY | Render | Optional | Default 100 testcase attempts/process/UTC day; lower for available allowance |
| AI_PROVIDER | Render | Required for Gemini workflows | `gemini`; no automatic provider fallback |
| GEMINI_API_KEY | Render | Secret, required for primary selection | Selected backend credential |
| GEMINI_API_KEY_BACKUP | Render | Optional secret | Manual backup; required only when backup is selected |
| GEMINI_MODEL | Render | Required for AI | Exact currently available, independently verified Free Tier API model ID |
| GEMINI_KEY_SELECTION | Render | Required configuration | `primary` by default; `backup` requires config change/restart, never quota rotation |
| JUDGE0_SECURITY_CONFIRMED | Render | Keep disabled | `false`; OneCompiler does not bypass Judge0's gate |
| JUDGE0_URL / JUDGE0_API_KEY | Render | Optional, leave unset | Existing separately hardened Judge0 alternative only |
| OPENAI_API_KEY / OPENAI_MODEL | Render | Optional, leave unset | Preserved explicitly selected alternative, not a paid fallback |
| VITE_API_BASE_URL | Vercel | Required for direct API topology | Public HTTPS Render API **origin**, no `/api` suffix, credentials, path or query |

SparkMeet needs no environment variable: meeting URLs are restricted to
`https://sparkmeet-web.onrender.com`. `SEED_DEMO_PASSWORD`, `CODING_SEED_DATABASE`,
`COMPANY_SEED_DATABASE` and `PROVISION_DATABASE` are development/operator settings,
not production service requirements. Temporary `PROVISION_NAME`,
`PROVISION_EMAIL`, `PROVISION_ROLE`, `PROVISION_PASSWORD` are only for the
operator-owned account command; do not persist provisioning passwords on services.
There is no JWT/session signing secret: opaque random tokens are hashed in MongoDB.

## Render instructions (execute only after deployment approval)

1. Create a Node Web Service for this GitHub repository. Choose the reviewed
   `main` revision; leave root blank and enter the build/start settings above.
   Disable automatic deployments while preparing/reviewing changes.
2. Select Node 22.23.3 via NODE_VERSION and a suitable region.
   Review current pricing yourself; do not enable paid resources for a ₹0 budget.
3. Add the Render environment checklist privately. CLIENT_ORIGIN must match the
   final stable frontend URL exactly, not a wildcard or arbitrary preview domain.
   Keep ONECOMPILER_ENABLED=false until account-specific free usage is verified.
4. Configure `/api/v1/ready` as the health check. Validate Render's forwarded-IP
   behavior before setting TRUST_PROXY=true: Express trusts one hop, never all
   forwarded addresses. A different ingress chain requires review, not a blind
   increase in hop count. Rate limits must distinguish actual clients.
5. In Atlas, create/select the intended production database, a least-privilege
   database user, and permit the documented Render outbound addresses for the
   chosen region/service. Avoid an unrestricted `0.0.0.0/0` allowlist. Keep TLS
   enabled, URL-encode credentials and include the database name in the SRV URI.
   Application startup creates required unique/TTL indexes; the account needs
   index permissions. Review backups/retention and plan limits before launch.
6. After explicit approval, deploy, check readiness and safe logs, then follow
   the functional acceptance checklist. Never run development seeds on production.

Read-only Atlas verification uses `npm run db:check` from the repository root
with privately injected settings, or a Render operator shell. It only connects
and pings, does not seed data, and omits credentials from its output. This task's
local connectivity result does not certify connectivity from Render's network.

## Vercel instructions (execute only after deployment approval)

1. Import the same repository, choose `main`, Framework Preset **Vite**, Root
   Directory **client**, and Node **22.x**. Enable access to source outside the
   Root Directory if that project option is shown: the root workspace lockfile
   and root package.json are required by the install command.
2. Override install to `cd .. && npm ci --include=dev`, build to `npm run build`,
   output to `dist`. No backend or API key is hosted in the static frontend.
3. Set VITE_API_BASE_URL to the public Render HTTPS origin. Set no OneCompiler,
   Gemini, MongoDB, provisioning or session secrets in Vercel. Build-time changes
   require a fresh frontend build; they cannot be changed by a browser user.
4. `client/vercel.json` rewrites SPA routes to index.html. Vercel serves existing
   assets normally; refresh `/dashboard/student`, `/coding` and actual detail
   URLs to verify routing. API requests go directly to Render via the configured
   origin. Without it, relative API paths are intended only for the local Vite
   proxy and would be incorrectly handled by a production SPA fallback.
5. Use the final frontend origin in Render CLIENT_ORIGIN. Preview URLs are not
   automatically authorized; use a separate non-production backend/database for
   previews instead of widening production CORS.

## Authentication and browser constraints

Login/register/logout and student/staff/learning requests retain
`credentials: include`, the required `X-Disha360-Request: 1` mutation header,
and exact-origin CORS/CSRF checks. Sessions are persisted for seven days in
MongoDB, store only token hashes, and are revoked on logout. Cookies are host-only,
HttpOnly, Secure in production, path `/api`; deletion uses the same attributes.
SameSite=None is rejected without secure production cookies. Production requires
an exact HTTPS CLIENT_ORIGIN; local defaults remain suitable for development.

**Cross-site cookies are a launch constraint.** SameSite=None permits cross-site
requests but does not override browser third-party-cookie blocking. Direct
`*.vercel.app` to `*.onrender.com` login must be tested in target browsers, including
privacy modes. For reliable cookie authentication, prefer HTTPS custom domains
under one registrable domain (e.g. app.example.org and api.example.org), set
COOKIE_SAME_SITE=lax, and retain exact CORS/CSRF checks. If domains are unavailable,
review a same-origin `/api` reverse-proxy deployment separately. Do not weaken
CSRF, expose session tokens to JavaScript or promise universal default-domain login.

## Integration and budget checks

- OneCompiler fixed-origin API calls and its key remain backend-only. Run uses
  current editor/stdin; Submit retrieves authoritative hidden tests and performs
  deterministic comparisons. History and analytics consume real persisted
  results. Provider failures cannot create accepted results or AI grading.
- Gemini interviews, feedback, resume suggestions and coding mentor share the
  existing service and manually selected model/key. Do not guess an API identifier
  for “Gemini 3.8 Flash”. Confirm model availability and current Free Tier terms
  in official Google docs/account before setting GEMINI_MODEL. Rate limits do
  not trigger key switching, paid fallbacks or endless retries.
- SparkMeet opens operator-verified external meeting links in a new tab with
  noopener/noreferrer. Batch authorization and manual attendance remain enforced;
  room security/APIs/embedding and actual video functionality are not verified here.
- Local process limits are not durable monetary caps. Multiple processes/restarts
  reset counters; quotas may be project/account-wide. Verify credit balance,
  recharge/billing behavior, model eligibility and account restrictions externally.
  Keep a single backend instance initially; review shared rate/usage storage before
  horizontal scaling. Free services may sleep/cold-start and have no production SLA.

## Validation and launch acceptance

Run from the root: `npm test`, `npm run typecheck`, `npm run build`.
New deployment tests exercise secure cross-origin login/logout/session persistence
and authorization for all three roles, CORS preflight, CSRF, readiness, trusted
proxy configuration, HTTPS origin validation and frontend API URL validation.
External services are mocked and database tests use disposable MongoDB.

Before launch, verify on approved deployed URLs: readiness/Atlas ping; login,
refresh/session persistence, logout/revocation for Student/Trainer/Admin; forbidden
role/private-data requests; rejected untrusted-origin mutations; browser cookies
and preflight; SPA deep-link refresh; one explicitly budget-authorized execution
and hidden-test submission/history/analytics; interviews and mentor failure states;
valid SparkMeet joins and manual attendance. Do not make paid provider calls as
an automated deployment smoke test. Hosted browser behavior and live credentials
cannot be certified before deployment.

Private server/.env must remain unchanged and untracked. Review `git diff` and
untracked files for secrets, env backups and generated artifacts before a separate
approved commit. Judge0's default is false and production forces demo mode off.

## Preparation evidence and remaining blockers

The final local suite passed **360 tests: 323 backend and 37 frontend**, zero
failures. `npm run typecheck` and `npm run build` also passed. The existing
Monaco bundle-size advisory remains. Existing OneCompiler, Gemini workflows, coding demo/security gates,
hidden tests, analytics and class authorization tests remain included. Production
authentication tests use the actual session models and disposable MongoDB, not
live accounts. Hosted cross-site browser cookie acceptance is still unverified.
The complete test/type-check/build sequence was also rerun successfully on
Node **22.23.3**, matching the recommended Render runtime. A separate frontend
production build with a placeholder HTTPS VITE_API_BASE_URL passed and contained
that configured public origin in its output; no provider credentials were used.

The read-only `npm run db:check` failed from this workspace. No connection string
or provider credential was changed and no database records were written. The
safe error does not establish whether credentials, DNS/outbound access or Atlas
network rules caused the failure. Verify Atlas connectivity from Render before
declaring deployment ready. Current default-domain third-party cookie support,
live provider/model credentials and free quotas, actual SparkMeet rooms and the
reviewed merge into `main` remain manual launch checks.

### Files changed by this preparation

- `README.md`, `docs/DEPLOYMENT.md`
- `client/.env.example`, `client/vercel.json`
- `client/src/services/apiUrl.ts`, `client/src/services/api.ts`,
  `client/src/services/auth.ts`, `client/src/services/student.ts`
- `client/test/apiUrl.test.ts`
- `server/.env.example`, `server/src/app.ts`, `server/src/config/env.ts`,
  `server/src/index.ts`, `server/src/controllers/auth.ts`,
  `server/src/routes/auth.ts`, `server/src/services/session.ts`
- `server/test/deployment.test.ts`, `server/test/auth.test.ts`,
  `server/test/codingDemo.test.ts`, `server/test/codingSeed.test.ts`,
  `server/test/companies.test.ts`

Existing operator/seed tests now supply a valid production HTTPS origin so their
original early-refusal assertions still execute under stricter validation. No
package manifests, lockfiles, database connection implementation, execution or AI
provider adapters, hidden-test architecture or SparkMeet class services changed.
