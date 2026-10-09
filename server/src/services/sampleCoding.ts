import { CodingProblem, problemSchema } from "../models/CodingProblem.js";
export const codingSamples = [
  {
    key: "sample-coding-sum",
    title: "[SAMPLE] Sum two integers",
    difficulty: "easy",
    topic: "Arithmetic",
    statement: "Read two integers and print their sum.",
    inputFormat: "Two space-separated integers a and b.",
    outputFormat: "One integer: a + b.",
    constraints: "-1000000 <= a,b <= 1000000",
    examples: [{ input: "2 3\n", output: "5\n", explanation: "2 + 3 = 5." }],
    hiddenTests: [
      { input: "-7 9\n", expected: "2\n" },
      { input: "0 0\n", expected: "0\n" },
      { input: "1000000 -1\n", expected: "999999\n" },
    ],
  },
  {
    key: "sample-coding-reverse",
    title: "[SAMPLE] Reverse a word",
    difficulty: "medium",
    topic: "Strings",
    statement: "Read one ASCII word and print its characters in reverse order.",
    inputFormat: "One nonempty ASCII word.",
    outputFormat: "The word reversed.",
    constraints: "1 <= word length <= 100",
    examples: [
      {
        input: "code\n",
        output: "edoc\n",
        explanation: "Characters are reversed.",
      },
    ],
    hiddenTests: [
      { input: "a\n", expected: "a\n" },
      { input: "placement\n", expected: "tnemecalp\n" },
    ],
  },
  {
    key: "sample-coding-lis",
    title: "[SAMPLE] Longest increasing subsequence",
    difficulty: "hard",
    topic: "Dynamic programming",
    statement:
      "Given a sequence of integers, print the length of its longest strictly increasing subsequence. A subsequence retains the original order but may skip elements. Equal values do not extend a strictly increasing subsequence. Design an O(n log n) solution for the stated limit.",
    inputFormat:
      "First line: integer n. Second line: n space-separated integers.",
    outputFormat:
      "One integer: the length of the longest strictly increasing subsequence.",
    constraints: "1 <= n <= 2000; -1000000000 <= a[i] <= 1000000000",
    examples: [
      {
        input: "8\n10 9 2 5 3 7 101 18\n",
        output: "4\n",
        explanation: "One longest subsequence is 2, 3, 7, 18.",
      },
      {
        input: "4\n3 3 3 3\n",
        output: "1\n",
        explanation: "Equal values cannot extend the subsequence.",
      },
    ],
    hiddenTests: [
      { input: "1\n-5\n", expected: "1\n" },
      { input: "5\n5 4 3 2 1\n", expected: "1\n" },
      { input: "6\n-3 -2 -2 -1 0 1\n", expected: "5\n" },
      { input: "6\n1 3 2 4 3 5\n", expected: "4\n" },
      {
        input: `2000\n${Array.from({ length: 2000 }, (_, i) => String(i + 1)).join(" ")}\n`,
        expected: "2000\n",
      },
    ],
  },
];
export async function seedCoding(mode: string) {
  if (mode !== "development") throw new Error("Development only");
  // Validate the entire bank and reject non-demo collisions before any insert.
  const records = codingSamples.map((row) =>
    problemSchema.parse({ ...row, published: true, demo: true, version: 1 }),
  );
  if (
    await CodingProblem.exists({
      key: { $in: records.map((r) => r.key) },
      demo: { $ne: true },
    })
  )
    throw new Error("Non-demo key conflict");
  let inserted = 0;
  for (const row of records) {
    try {
      const result = await CodingProblem.updateOne(
        { key: row.key },
        { $setOnInsert: row },
        { upsert: true, runValidators: true },
      );
      inserted += result.upsertedCount;
    } catch (e) {
      if (!(typeof e === "object" && e && "code" in e && e.code === 11000))
        throw e;
    }
    const saved = await CodingProblem.findOne({ key: row.key }).select("demo");
    if (!saved?.demo) throw new Error("Non-demo key conflict");
  }
  return { inserted, samples: records.length };
}
