import { env } from '../config/env.js';
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { User } from '../models/User.js';
import { passwordSchema } from '../validators/auth.js';
import { hashPassword } from '../services/password.js';

async function seed() {
  if (env.NODE_ENV !== 'development') throw new Error('Demo seeding is allowed only in development.');
  if (!env.MONGODB_URI) throw new Error('Configure MONGODB_URI first.');
  const parsed = passwordSchema.safeParse(process.env.SEED_DEMO_PASSWORD);
  if (!parsed.success) throw new Error('Set a private SEED_DEMO_PASSWORD: 12–128 characters with uppercase, lowercase, and a number.');
  await connectDatabase(env.MONGODB_URI);
  await User.createIndexes();
  for (const role of ['student', 'trainer', 'admin'] as const) {
    const email = `demo.${role}@disha360.test`;
    const existing = await User.findOne({ email }).select('+isDemo');
    if (existing) {
      if (!existing.isDemo) throw new Error('A demo email belongs to an existing non-demo account. No changes were made to that account.');
      console.log(`Existing ${role} demo account preserved; its password was not reset.`);
      continue;
    }
    await User.create({ name: `Demo ${role[0].toUpperCase()}${role.slice(1)}`, email, role, passwordHash: await hashPassword(parsed.data), isDemo: true, ...(role === 'student' ? { department: 'Computer Science', semester: 6 } : {}) });
    console.log(`Created ${role} demo account. Password omitted.`);
  }
}
try { await seed(); }
catch (error) {
  console.error(error instanceof Error && ['Demo seeding is allowed only in development.', 'Configure MONGODB_URI first.', 'Set a private SEED_DEMO_PASSWORD: 12–128 characters with uppercase, lowercase, and a number.', 'A demo email belongs to an existing non-demo account. No changes were made to that account.'].includes(error.message) ? error.message : 'Demo seeding failed. Check configuration and database access; credentials are omitted.');
  process.exitCode = 1;
} finally { await disconnectDatabase(); }
