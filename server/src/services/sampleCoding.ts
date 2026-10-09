import { CodingProblem, problemSchema } from "../models/CodingProblem.js";
export async function seedCoding(mode: string) {
  if (mode !== "development") throw new Error("Development only");
  const records = [
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
      statement:
        "Read one ASCII word and print its characters in reverse order.",
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
  ];
  for (const row of records) {
    const parsed = problemSchema.parse({
      ...row,
      published: true,
      demo: true,
      version: 1,
    });
    const existing = await CodingProblem.findOne({ key: row.key });
    if (existing && !existing.demo) throw new Error("Non-demo key conflict");
    if (!existing) await CodingProblem.create(parsed);
  }
}
