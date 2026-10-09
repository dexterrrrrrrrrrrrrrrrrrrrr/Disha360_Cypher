import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
import { join } from "node:path";
import { tmpdir } from "node:os";
export async function staffDatabase() {
  const mongo = await MongoMemoryReplSet.create({
    binary: {
      version: "7.0.24",
      downloadDir: join(tmpdir(), "cypher-mongodb"),
      checkMD5: true,
    },
    replSet: { count: 1 },
  });
  await mongoose.connect(mongo.getUri());
  await Promise.all(
    Object.values(mongoose.models).map((m) => m.createIndexes()),
  );
  return {
    clear: async () => {
      await Promise.all(
        Object.values(mongoose.models).map((m) => m.deleteMany({})),
      );
    },
    close: async () => {
      await mongoose.disconnect();
      await mongo.stop();
    },
  };
}
