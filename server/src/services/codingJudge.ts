import { CodingSubmission } from "../models/CodingSubmission.js";
import { recordActivity } from "./activity.js";
import type { ExecutionProvider } from "./codeExecution.js";
import type { CodeInput } from "../features/coding/validation.js";
export function normalizeOutput(s: string) {
  return s
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(/[ \t]+$/, ""))
    .join("\n")
    .replace(/\n+$/, "");
}
export function submissionDTO(s: InstanceType<typeof CodingSubmission>) {
  return {
    id: s.id,
    problemId: s.problemId.toString(),
    problemVersion: s.problemVersion,
    title: s.title,
    language: s.language,
    status: s.status,
    verdict: s.verdict || null,
    score: s.score,
    passed: s.passed,
    total: s.total,
    timeSeconds: s.timeSeconds,
    memoryKb: s.memoryKb,
    createdAt: s.createdAt,
    finishedAt: s.finishedAt,
  };
}
export async function expireSubmissions(studentId: string) {
  await CodingSubmission.updateMany(
    { studentId, status: "processing", processingUntil: { $lte: new Date() } },
    {
      $set: {
        status: "completed",
        verdict: "System Error",
        score: null,
        finishedAt: new Date(),
      },
    },
  );
}
export async function judgeSubmission(
  s: InstanceType<typeof CodingSubmission>,
  input: CodeInput,
  tests: { input: string; expected: string }[],
  provider: ExecutionProvider,
) {
  let verdict = "Accepted",
    passed = 0,
    time: number | null = null,
    memory: number | null = null;
  try {
    if (!tests.length) throw new Error('No authoritative tests');
    const batchResults = provider.executeBatch ? await provider.executeBatch({ language: input.language, source: input.source }, tests.map(t => t.input)) : undefined;
    if (batchResults && batchResults.length !== tests.length) throw new Error('Incomplete batch');
    let index = 0;
    for (const t of tests) {
      if (Date.now() > s.processingUntil.getTime() - (batchResults ? 0 : 20000))
        throw new Error("Judging deadline");
      const result = batchResults ? batchResults[index++] : await provider.execute({ ...input, stdin: t.input });
      if (result.timeSeconds !== null)
        time = Math.max(time ?? 0, result.timeSeconds);
      if (result.memoryKb !== null)
        memory = Math.max(memory ?? 0, result.memoryKb);
      if (result.verdict !== "Accepted") {
        if (verdict === 'Accepted' || verdict === 'Wrong Answer') verdict = result.verdict;
        if (!batchResults) break;
        continue;
      }
      if (normalizeOutput(result.stdout) === normalizeOutput(t.expected))
        passed++;
      else if (verdict === 'Accepted') verdict = "Wrong Answer";
    }
  } catch {
    verdict = "System Error";
  }
  // Do not return hidden inputs, output, compile diagnostics or per-case outcomes.
  const done = await CodingSubmission.findOneAndUpdate(
    {
      _id: s._id,
      studentId: s.studentId,
      status: "processing",
      processingUntil: { $gt: new Date() },
    },
    {
      $set: {
        status: "completed",
        verdict,
        passed,
        total: tests.length,
        score:
          verdict === "System Error"
            ? null
            : Math.round((passed / tests.length) * 100),
        timeSeconds: time,
        memoryKb: memory,
        finishedAt: new Date(),
      },
    },
    { new: true, runValidators: true },
  );
  if (done) {
    await recordActivity(
      s.studentId.toString(),
      "coding_submitted",
      `Judged ${s.title}: ${verdict}`,
      `coding:${s.id}`,
    );
    return done;
  }
  await expireSubmissions(s.studentId.toString());
  return (await CodingSubmission.findById(s._id))!;
}
export async function codingMetrics(studentId: string) {
  await expireSubmissions(studentId);
  const submissions = await CodingSubmission.find({
    studentId,
    status: "completed",
    score: { $ne: null },
  });
  const attempted = new Set(submissions.map((s) => s.problemId.toString())),
    solved = new Set(
      submissions
        .filter((s) => s.verdict === "Accepted")
        .map((s) => s.problemId.toString()),
    );
  return {
    judged: submissions.length,
    attempted: attempted.size,
    solved: solved.size,
    solveRate: attempted.size
      ? Math.round((solved.size / attempted.size) * 100)
      : null,
  };
}
