import { env } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { createApp } from './app.js';

if (env.MONGODB_URI) {
  try { await connectDatabase(env.MONGODB_URI); console.log('MongoDB connected.'); }
  catch {
    console.error('MongoDB connection failed. Check the Atlas host, database user, and network access. Credentials are omitted from logs.');
    if (env.NODE_ENV === 'production') process.exit(1);
  }
} else console.warn('MONGODB_URI is not configured. Foundation preview is available; persistence is unavailable.');

const app = createApp({ clientOrigin: env.CLIENT_ORIGIN, databaseConfigured: Boolean(env.MONGODB_URI) });
const server = app.listen(env.PORT, '0.0.0.0', () => console.log(`Cypher API listening on port ${env.PORT}`));
async function shutdown() {
  const forceExit = setTimeout(() => process.exit(1), 10000);
  forceExit.unref();
  server.close(async () => { await disconnectDatabase(); clearTimeout(forceExit); process.exit(0); });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
