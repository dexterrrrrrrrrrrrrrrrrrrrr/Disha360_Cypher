import { env } from "../config/env.js";
import mongoose from "mongoose";
import { connectDatabase, disconnectDatabase } from "../config/database.js";
import { CodingProblem } from "../models/CodingProblem.js";
import { seedCoding } from "../services/sampleCoding.js";
import { assertCodingSeedTarget } from "../services/codingSeedSafety.js";
try {
  // Refuse unsafe targets before opening a database connection.
  const expected = assertCodingSeedTarget(
    env.NODE_ENV,
    env.MONGODB_URI,
    process.env.CODING_SEED_DATABASE,
  );
  await connectDatabase(env.MONGODB_URI!);
  if (mongoose.connection.name !== expected)
    throw new Error(
      "Connected database does not match the acknowledged development target.",
    );
  await CodingProblem.createIndexes();
  const result = await seedCoding(env.NODE_ENV);
  console.log(
    `Coding samples ready: ${result.samples} labeled Easy/Medium/Hard challenges; ${result.inserted} inserted. Existing problems and submissions preserved.`,
  );
} catch (error) {
  // Only static safety messages are public; never print driver errors or connection strings.
  const safe =
    error instanceof Error &&
    /^(Coding samples can only|Set MONGODB_URI|Set CODING_SEED_DATABASE|MONGODB_URI must explicitly|Connected database does not match|Invalid MongoDB URI)/.test(
      error.message,
    );
  console.error(
    safe
      ? error.message
      : "Coding seed failed. Check database connectivity and non-demo key conflicts. Credentials omitted.",
  );
  process.exitCode = 1;
} finally {
  await disconnectDatabase();
}
