import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { connectDatabase, disconnectDatabase } from '../config/database.js';

// Read-only connection verification. Never log the URI or the driver error object.
if (!env.MONGODB_URI) {
  console.error('Database check blocked: set MONGODB_URI in server/.env first.');
  process.exitCode = 1;
} else {
  try {
    await connectDatabase(env.MONGODB_URI);
    if (!mongoose.connection.db) throw new Error('Database unavailable');
    const result = await mongoose.connection.db.command({ ping: 1 });
    if (result.ok !== 1) throw new Error('Ping failed');
    console.log('Database check passed: connected and MongoDB ping succeeded. No records were written.');
  } catch {
    console.error('Database check failed. Check the Atlas connection string, database user, network access, and outbound connectivity. Credentials were not logged.');
    process.exitCode = 1;
  } finally {
    await disconnectDatabase();
  }
}
