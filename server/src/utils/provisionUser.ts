import { assertCodingSeedTarget } from '../services/codingSeedSafety.js';
import { env } from '../config/env.js';
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { User } from '../models/User.js';
import { provisioningSchema } from '../validators/auth.js';
import { hashPassword } from '../services/password.js';

const developmentOnly = process.argv.includes('--development');
try {
  if (developmentOnly) assertCodingSeedTarget(env.NODE_ENV, env.MONGODB_URI, process.env.PROVISION_DATABASE);
  const parsed = provisioningSchema.safeParse({ name: process.env.PROVISION_NAME, email: process.env.PROVISION_EMAIL, password: process.env.PROVISION_PASSWORD, role: process.env.PROVISION_ROLE });
  if (!parsed.success) {
    console.error('Set valid private PROVISION_NAME, PROVISION_EMAIL, PROVISION_PASSWORD, and PROVISION_ROLE (trainer or admin). Passwords need 12–128 characters, uppercase, lowercase, and a number.');
    process.exitCode = 1;
  } else if (!env.MONGODB_URI) {
    console.error('Configure MONGODB_URI first.'); process.exitCode = 1;
  } else {
    await connectDatabase(env.MONGODB_URI);
    await User.createIndexes();
    if (await User.exists({ email: parsed.data.email })) {
      console.error('An account with this email already exists. It was not changed.'); process.exitCode = 1;
    } else {
      await User.create({ name: parsed.data.name, email: parsed.data.email, role: parsed.data.role, ...(developmentOnly ? { isDemo: true } : {}), passwordHash: await hashPassword(parsed.data.password) });
      console.log('Staff account created. Credentials omitted.');
    }
  }
} catch {
  console.error(developmentOnly ? 'Development provisioning refused or failed. Use NODE_ENV=development and PROVISION_DATABASE matching a dedicated _dev, _development or _demo database selected by MONGODB_URI. Check credentials, connectivity and duplicate emails. Secrets omitted.' : 'Account provisioning failed. Check database configuration; credentials are omitted.'); process.exitCode = 1;
} finally { await disconnectDatabase(); }
