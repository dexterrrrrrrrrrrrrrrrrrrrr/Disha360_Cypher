import { parse } from "csv-parse/sync";
import { questionInput } from "../validators/staffAssessment.js";
import { AppError } from "../utils/AppError.js";
import { z } from "zod";
export const csvColumns = [
  "prompt",
  "topic",
  "difficulty",
  "option_a",
  "option_b",
  "option_c",
  "option_d",
  "correct_option",
  "explanation",
  "expected_seconds",
];
export const questionCSVTemplate =
  csvColumns.join(",") +
  '\n"What is 2 + 2?",Arithmetic,easy,3,4,5,6,b,"Adding two and two gives four.",60\n';
export function parseQuestionCSV(csv: string) {
  if (Buffer.byteLength(csv, "utf8") > 50000)
    throw new AppError(
      400,
      "CSV_SIZE",
      "CSV must be at most 50,000 UTF-8 bytes.",
    );
  let rows: Record<string, string>[];
  try {
    rows = parse(csv, {
      bom: true,
      columns: (headers: string[]) => {
        if (
          headers.length !== csvColumns.length ||
          headers.some((h, i) => h !== csvColumns[i])
        )
          throw new Error("Header");
        return headers;
      },
      skip_empty_lines: true,
      max_record_size: 10000,
      to: 102,
      trim: true,
    });
  } catch {
    throw new AppError(
      400,
      "INVALID_CSV",
      "Malformed CSV. Use the template headers in order, quote fields containing commas/newlines, and provide exactly ten columns.",
    );
  }
  if (!rows.length || rows.length > 100)
    throw new AppError(
      400,
      "CSV_ROWS",
      "Import between 1 and 100 question rows.",
    );
  const issues: z.ZodIssue[] = [];
  const valid: z.infer<typeof questionInput>[] = [];
  rows.forEach((r, i) => {
    const parsed = questionInput.safeParse({
      prompt: r.prompt,
      topic: r.topic,
      difficulty: r.difficulty,
      options: ["a", "b", "c", "d"].map((id) => ({
        id,
        text: r["option_" + id],
      })),
      correctOptionId: r.correct_option,
      explanation: r.explanation,
      expectedSeconds: /^\d+$/.test(r.expected_seconds)
        ? Number(r.expected_seconds)
        : NaN,
      shuffleOptions: true,
    });
    if (parsed.success) valid.push(parsed.data);
    else
      for (const issue of parsed.error.issues)
        issues.push({ ...issue, path: [`row ${i + 2}`, ...issue.path] });
  });
  if (issues.length) throw new z.ZodError(issues.slice(0, 50));
  return valid;
}
