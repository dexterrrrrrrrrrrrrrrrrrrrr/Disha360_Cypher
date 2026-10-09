// An explicit destination acknowledgement reduces accidental writes to live data.
export function assertCodingSeedTarget(
  mode: string,
  uri: string | undefined,
  expected: string | undefined,
) {
  if (mode !== "development")
    throw new Error(
      "Coding samples can only be seeded with NODE_ENV=development.",
    );
  if (!uri) throw new Error("Set MONGODB_URI in the private server/.env.");
  if (
    !expected ||
    !/^[A-Za-z0-9][A-Za-z0-9_-]*_(dev|development|demo)$/.test(expected)
  )
    throw new Error(
      "Set CODING_SEED_DATABASE to a dedicated database name ending _dev, _development, or _demo.",
    );
  let actual: string;
  try {
    actual = decodeURIComponent(new URL(uri).pathname.slice(1));
  } catch {
    throw new Error("Invalid MongoDB URI; credentials omitted.");
  }
  if (actual !== expected)
    throw new Error(
      "MONGODB_URI must explicitly select the same development database as CODING_SEED_DATABASE. No data was seeded.",
    );
  return expected;
}
