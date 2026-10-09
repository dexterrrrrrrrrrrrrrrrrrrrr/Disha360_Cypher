import { env } from '../config/env.js';
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { Assessment, Question } from '../models/Assessment.js';
import { seedSampleAssessments } from '../services/sampleAssessments.js';
try {
  if (env.NODE_ENV !== 'development') throw new Error('Development only.');
  if (!env.MONGODB_URI) throw new Error('Database configuration required.');
  await connectDatabase(env.MONGODB_URI); await Promise.all([Question.createIndexes(), Assessment.createIndexes()]);
  await seedSampleAssessments(env.NODE_ENV); console.log('Development sample bank ready: 20 labeled questions and 4 labeled assessments. Existing records were preserved.');
} catch { console.error('Sample seeding failed. Use development mode, check MongoDB configuration, and avoid conflicting non-demo keys. Credentials are omitted.'); process.exitCode = 1; }
finally { await disconnectDatabase(); }
