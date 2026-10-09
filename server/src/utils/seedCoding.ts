import { env } from "../config/env.js";
import { connectDatabase, disconnectDatabase } from "../config/database.js";
import { CodingProblem } from "../models/CodingProblem.js";
import { seedCoding } from "../services/sampleCoding.js";
try {
  if (env.NODE_ENV !== "development" || !env.MONGODB_URI)
    throw new Error("Development database required");
  await connectDatabase(env.MONGODB_URI);
  await CodingProblem.createIndexes();
  await seedCoding(env.NODE_ENV);
  console.log(
    "Two labeled development coding problems ready; existing records preserved.",
  );
} catch {
  console.error(
    "Coding seed failed. Check development mode, database configuration and non-demo key conflicts. Credentials omitted.",
  );
  process.exitCode = 1;
} finally {
  await disconnectDatabase();
}
