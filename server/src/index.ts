import { env } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { createApp } from './app.js';
import { User } from './models/User.js';
import { Session } from './models/Session.js';
import { Activity, LearningProgress, AssessmentAssignment } from './models/Preparation.js';
import { Resume } from './models/Resume.js';
import { ResumeAnalysis } from './models/ResumeAnalysis.js';
import { InterviewSession } from './models/InterviewSession.js';
import { OpenAIInterviewProvider } from './services/interviewProvider.js';

if (env.MONGODB_URI) {
  try {
    await connectDatabase(env.MONGODB_URI);
    // Explicitly ensure unique and TTL indexes, even when production autoIndex is disabled.
    await User.createIndexes();
    await Session.createIndexes();
    await Promise.all([Activity.createIndexes(), LearningProgress.createIndexes(), AssessmentAssignment.createIndexes()]);
    await Resume.createIndexes();
    await ResumeAnalysis.createIndexes();
    await InterviewSession.createIndexes();
    console.log('MongoDB connected.');
  }
  catch {
    await disconnectDatabase();
    console.error('MongoDB connection failed. Check the Atlas host, database user, and network access. Credentials are omitted from logs.');
    if (env.NODE_ENV === 'production') process.exit(1);
  }
} else console.warn('MONGODB_URI is not configured. Authentication and persistence are unavailable; health endpoints remain available.');

const app = createApp({ clientOrigin: env.CLIENT_ORIGIN, databaseConfigured: Boolean(env.MONGODB_URI), secureCookies: env.NODE_ENV === 'production', trustProxy: env.TRUST_PROXY, allowDemoAccounts: env.NODE_ENV === 'development', interviewProvider: env.OPENAI_API_KEY ? new OpenAIInterviewProvider(env.OPENAI_API_KEY, env.OPENAI_MODEL) : undefined });
const server = app.listen(env.PORT, '0.0.0.0', () => console.log(`Disha360 API listening on port ${env.PORT}`));
async function shutdown() {
  const forceExit = setTimeout(() => process.exit(1), 10000);
  forceExit.unref();
  server.close(async () => { await disconnectDatabase(); clearTimeout(forceExit); process.exit(0); });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
