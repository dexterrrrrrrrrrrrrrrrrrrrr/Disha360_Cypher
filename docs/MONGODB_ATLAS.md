# MongoDB Atlas configuration

This guide completes database configuration only. No authentication or LMS features are added.

## Create your cluster

1. Sign in at https://cloud.mongodb.com/ and create an Atlas project, for example **Disha360**.
2. Create a **Free** cluster if offered. Choose a provider and a region close to your application, name the cluster, and wait for provisioning to finish.
3. In **Database Access** (sometimes shown under **Security**), create a database user using password authentication. This is a separate account from your Atlas website login. Give it `readWrite` access to the `cypher` database, rather than administrative access to all databases. Store its password privately.
4. In **Network Access / IP Access List**, add the public outbound IP of the machine running the backend. Your laptop's IP does not grant access to a separate cloud runtime. Use your cloud runtime's actual egress IP or a supported private networking configuration. Avoid opening access to `0.0.0.0/0`.
5. On the cluster, choose **Connect → Drivers → Node.js**. Copy the supplied `mongodb+srv://` connection string.

## Put the URI in the correct file

Edit **`/workspace/Disha360_Cypher/server/.env`** in your workspace editor. Replace the blank line beginning `MONGODB_URI=` with your real URI. Do not paste it into chat, source code, the client, README, or `.env.example`.

The file has this shape (these are placeholders, not real credentials):

```dotenv
NODE_ENV=development
PORT=4000
CLIENT_ORIGIN=http://localhost:5173
MONGODB_URI="mongodb+srv://<database-user>:<encoded-password>@<actual-cluster-host>/cypher?retryWrites=true&w=majority"
```

Replace the placeholders using Atlas's supplied hostname and the database user you created. Percent-encode reserved characters in the username/password component, such as `@`, `:`, `/`, `#`, and `%`; do not encode the whole URI. Quoting the value prevents dotenv treating a literal `#` as a comment, but does not replace proper URI encoding. Keep Atlas's additional recommended query parameters if supplied.

The backend loads `server/.env` relative to the configuration module, including when running compiled code. An already-exported `MONGODB_URI` takes precedence over the file, because dotenv does not override injected values. If changing the file seems to have no effect, check whether a runtime binding is set, without printing its value.

`.env` is ignored by Git. The prepared file has owner-only access in this cloud workspace. Never force-add it. Confirm protection with:

```sh
git check-ignore server/.env
```

## Verify the actual connection

From the repository root:

```sh
npm run db:check
```

This reads the backend configuration, opens a genuine MongoDB connection, sends a read-only `ping`, disconnects, and returns a nonzero exit code on a missing URI or connection failure. It does not print the URI, print credentials, create collections, or write records. A successful run prints:

```text
Database check passed: connected and MongoDB ping succeeded. No records were written.
```

Then restart the backend (environment edits are not assumed to trigger a reload):

```sh
npm run dev
```

If services are already running, stop your existing development session first. Verify:

```sh
curl http://localhost:4000/api/v1/health
curl -i http://localhost:4000/api/v1/ready
```

Expected after connection:

- Startup log says `MongoDB connected.`
- Health returns HTTP 200 with `database.configured: true` and `database.status: "connected"`.
- Readiness returns HTTP 200 and `{ "success": true, "data": { "status": "ready" } }`.
- The dashboard environment panel reports **Connected** after refresh.

Without a working connection, health can still return 200 because it checks server liveness. Readiness must return 503. A successful unit test with an injected connected status is not proof of real Atlas access. The database may not appear in Atlas's collection browser until the first write; this stage intentionally creates no collections.

## Diagnose failures safely

- **URI missing:** edit `server/.env`, ensure the filename is exactly `.env`, and restart the backend.
- **Authentication:** use the database user's password, not your Atlas login password; verify username, percent-encoding, and database permissions.
- **Host/DNS:** use the exact Atlas-supplied cluster hostname; ensure the cluster is provisioned and running and the runtime can resolve SRV records.
- **Connection timeout:** check the runtime's public outbound IP against Atlas's access list, and ensure outbound driver traffic to Atlas on its required ports is permitted. Network access must work from this cloud machine, not just your browser or laptop.
- **Production startup fails:** intentional. Production refuses to listen when database configuration or connection fails. Development retains the preview with database readiness unavailable.

Do not disable TLS certificate verification or share your `.env` file to diagnose a connection. If credentials are ever exposed, rotate the database user's password in Atlas and update the private file.

## Current verification status

The runtime has no genuine Atlas URI configured. Configuration loading and graceful missing/failed-connection handling were tested. **Actual Atlas connection and ping remain pending** until you fill in the private file. Run `npm run db:check`, or ask to retest after saving the file; do not send the URI in chat.
