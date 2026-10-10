import { env } from '../config/env.js';
import { checkProviders } from '../services/providerChecks.js';

const result = await checkProviders(env);
for (const check of result.checks) console.log(`${check.feature}: ${check.status}. ${check.message}`);
if (!env.MONGODB_URI) console.log('Database: MONGODB_URI is missing. Authentication requires a connected database.');
else console.log('Database: URI is present; connectivity was not checked. Run npm run db:check separately.');
process.exitCode = result.configurationReady && !!env.MONGODB_URI ? 0 : 1;
