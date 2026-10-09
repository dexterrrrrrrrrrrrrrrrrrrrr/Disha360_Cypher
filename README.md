# MyStartupWave Cypher 4.0

A beginner-friendly placement training LMS foundation. The current implementation is **stage 0 only**, not a complete LMS. It includes a responsive login screen, role-specific dashboard previews, an Express API, and MongoDB connection configuration. Authentication, student records, and all learning workflows remain unimplemented.

## Requirements and installation

- Node.js 22.12+ (Node 24 is supported), npm 10+.
- A MongoDB Atlas cluster and database user for persistence.

Run from the repository root:

```sh
npm ci
cp server/.env.example server/.env
# Edit server/.env with your Atlas configuration.
npm run dev
```

In this cloud workspace, npm's default home cache is not writable. Use `npm ci --cache /tmp/cypher-npm-cache` for installation here. The saved environment setup uses that writable cache automatically.

Open `http://localhost:5173`. The API listens on port `4000` by default; Vite forwards `/api` requests to it. The frontend and backend run as separate services. If you change the API port, update the proxy target in `client/vite.config.ts` too. For a deployment with a separate frontend origin, configure an appropriate reverse proxy for `/api` and set `CLIENT_ORIGIN` on the backend. Production deployment is outside this foundation stage.

## MongoDB Atlas configuration

1. Create an Atlas project and cluster.
2. Under **Database Access**, create a database user with read/write access to the `cypher` database. Your Atlas account password is different from this database user's password.
3. Under **Network Access**, permit the machine's actual outbound IP, or your environment's supported private networking. Avoid allowing all Internet addresses.
4. Choose **Connect → Drivers** and copy the `mongodb+srv://` URI into `MONGODB_URI` in `server/.env`. Replace the username, password, cluster hostname, and database name. Percent-encode special characters in credentials.
5. Restart the backend. Confirm `MongoDB connected.` in the log and `database.status: "connected"` from the health endpoint. `/api/v1/ready` must return HTTP 200.

Never commit `.env` files or use `VITE_` variables for credentials. Both example environment files contain placeholders only. `.env.example` at the root is a reference; the server loads **server/.env** regardless of the working directory.

If Atlas is not configured, development mode still serves the preview and health endpoint. The database remains unavailable; no in-memory database or fake persistence is used. Database connection failures are reported without printing the URI. Production mode fails startup if the URI is absent or the connection fails.

## Commands and verification

```sh
npm run dev           # Both services, with reload
npm run typecheck     # Strict TypeScript checks for both workspaces
npm test              # API integration tests
npm run build         # Compiled backend and frontend production assets
npm start             # Run the compiled API (build first)
npm run preview -w client # Preview the built client on port 4173
```

`npm start` runs the API, not the frontend. The Vite preview server does not proxy `/api`; use `npm run dev` for the fully connected local UI, or provide a reverse proxy for production assets. Set `NODE_ENV=production` and `CLIENT_ORIGIN` explicitly for deployment.

Verify the backend separately:

```sh
curl http://localhost:4000/api/v1/health
curl -i http://localhost:4000/api/v1/ready
```

Health returns `{ "success": true, "data": { ... } }` even when the database is offline: it is a **liveness** endpoint. Readiness returns HTTP 503 until MongoDB is configured and connected, and 200 when connected. Error responses use `{ "success": false, "error": { "code": "...", "message": "..." } }`.

## Preview and login setup

There are **no demo accounts or login credentials** at this stage. On `/login`, choose Student, Trainer / Faculty, or Placement Officer / Admin, then click **Open dashboard preview**. These routes are intentionally public layout previews:

- `/preview/student`
- `/preview/trainer`
- `/preview/admin`

The sign-in form validates required fields in the browser and explains that authentication is unavailable. It does not transmit, store, or verify passwords. Switching preview roles is not authorization. Future private APIs must enforce roles on the backend. Preview statistics display dashes rather than fabricated student records, and planned navigation items are disabled.

Check the mobile navigation button, role selector, password visibility toggle, sign-in status message, and environment refresh button. Browser refresh and deep links should work through the Vite SPA server.

## Structure

```text
client/
  src/
    components/   # Shared UI and environment status
    layouts/      # Responsive sidebar and role navigation
    pages/        # Login and role-specific dashboard previews
    features/     # Reserved for later checkpoint implementations
    hooks/        # API health state and refresh
    services/     # Frontend HTTP calls
    types/        # Shared frontend types
server/
  src/
    config/       # Validated environment and MongoDB connection
    middleware/   # Centralized error handling
    models/       # Reserved; no unused collections created
    routes/       # /api/v1 endpoints
    controllers/  # Health and readiness behavior
    services/     # Reserved for business/provider integrations
    validators/   # Reserved for future API input schemas
    utils/        # Typed application errors
  test/           # API integration tests
docs/
  CHECKPOINTS.md
```

The existing repository root is the project root, rather than adding a redundant `teamname_Cypher/` directory. npm workspaces keep installation and commands simple. The backend uses Express, Mongoose, Zod, Helmet, CORS, and a general API rate limiter. Dedicated authentication rate limits, password hashing, cookies, authorization, file uploads, and provider integrations belong to their later checkpoints. No models or collections are created before their features need them.

## Current limitations

MongoDB connectivity requires your own Atlas URI and network access and has not been verified against a real cluster in this environment. API tests inject connection status and do not establish a real database connection. This foundation has no authentication, persistent student data, file storage, AI integration, or coding judge. Track all feature work in [docs/CHECKPOINTS.md](docs/CHECKPOINTS.md).
