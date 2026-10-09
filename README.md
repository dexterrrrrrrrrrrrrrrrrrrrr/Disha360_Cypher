# Disha360 Placement Training LMS

A placement training LMS built with React, Vite, TypeScript, Tailwind, Express, and MongoDB. **Checkpoint 1 implements authentication and role-based access.** Preparation metrics and all learning activities remain placeholders for later checkpoints. The existing design system and project structure are preserved.

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

Without a connected database, health remains available but auth endpoints return 503. No fallback accounts or in-memory session storage are used. Startup explicitly creates the User unique-email and Session unique-token/TTL indexes. Production refuses startup if database connection or index preparation fails. Development retains the server with the database disconnected. Sessions and users persist in MongoDB Atlas; only tests use disposable MongoDB instances.

## Authentication

- `/register`: Student-only registration with name, email, password, department, and semester (1–12). Passwords require 12–128 characters, uppercase, lowercase, and a number. Registration signs the student in.
- `/login`: One sign-in form for Student, Trainer, and Admin. The stored account role determines the workspace; users cannot pick or promote their role.
- `/dashboard/student`, `/dashboard/trainer`, `/dashboard/admin`: authenticated, role-protected dashboard shells. Wrong-role navigation redirects to the account's own workspace. The former public `/preview/*` routes no longer expose dashboards.
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

In this cloud run, the verified official MongoDB image supplied `/tmp/cypher-mongodb/mongod`. MongoDB integration tests cover Student-only registration, validation, email uniqueness, hashing, login for all roles, session persistence/rotation/expiry, logout revocation, CSRF, rate limits, role denial, student privacy, secure cookie flags, demo restrictions, and operator provisioning. Disposable data is deleted after the suite. The test database is isolated from development and Atlas data.

## Manual testing

1. Configure Atlas, run `npm run db:check`, then `npm run dev`.
2. Open `/dashboard/admin` while signed out: expect `/login`.
3. Register a Student at `/register`; test mismatched passwords, then valid registration. Expect a success message and Student workspace.
4. Reload the page: login persists. Visit `/dashboard/admin`: expect a redirect to the Student workspace.
5. Sign out, then revisit a private route: expect login. Try an incorrect password: expect an error.
6. Seed the three development accounts and verify each lands in its own workspace.
7. Confirm the session cookie is HttpOnly and no token exists in browser localStorage. Inspect API responses: no password/hash fields.
8. Test narrow viewports and the navigation drawer. Existing dashboard data is still explicitly placeholder content.

Backend checks:

```sh
curl http://localhost:4000/api/v1/health
curl -i http://localhost:4000/api/v1/ready
curl -i http://localhost:4000/api/v1/auth/me # 401 when no cookie is supplied
```

## Structure and scope

`client/src/features/auth` contains session state and protected routing; `layouts/AuthLayout.tsx` preserves the shared sign-in design. Backend modules separate models, validators, services, controllers, middleware, routes, and operator utilities. npm workspaces keep installation simple.

Checkpoint 1 is implemented. Checkpoint 2 and all learning, assessment, resume, interview, coding, content-management, and placement features remain unimplemented. Your locally verified Atlas connection was not re-tested here because its credentials are not available in this cloud runtime. The auth flows were verified using an isolated actual MongoDB server. See [docs/CHECKPOINTS.md](docs/CHECKPOINTS.md) for status.
