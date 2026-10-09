import mongoose from "mongoose";
import { env } from "../config/env.js";
import { connectDatabase, disconnectDatabase } from "../config/database.js";
import { assertCodingSeedTarget } from "../services/codingSeedSafety.js";
import { Company } from "../models/Company.js";
import { seedCompanies } from "../services/sampleCompanies.js";
try {
  // Reuse the established development destination guard without changing coding seeding.
  const expected = assertCodingSeedTarget(
    env.NODE_ENV,
    env.MONGODB_URI,
    process.env.COMPANY_SEED_DATABASE,
  );
  await connectDatabase(env.MONGODB_URI!);
  if (mongoose.connection.name !== expected)
    throw new Error("Unexpected development database.");
  await Company.createIndexes();
  const result = await seedCompanies(env.NODE_ENV);
  console.log(
    `Illustrative company profiles ready: ${result.samples} samples; ${result.inserted} inserted. Existing profiles and progress preserved.`,
  );
} catch {
  console.error(
    "Company seed refused or failed. Use NODE_ENV=development and COMPANY_SEED_DATABASE matching a dedicated _dev, _development or _demo database in MONGODB_URI. Check connectivity and non-demo key conflicts. Credentials omitted.",
  );
  process.exitCode = 1;
} finally {
  await disconnectDatabase();
}
