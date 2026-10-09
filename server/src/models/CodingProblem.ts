import mongoose, { Schema } from "mongoose";
import { z } from "zod";
import { languages } from "../features/coding/validation.js";
export const problemSchema = z.object({
  key: z.string().min(1).max(100),
  title: z.string().min(3).max(150),
  difficulty: z.enum(["easy", "medium", "hard"]),
  supportedLanguages: z
    .array(z.enum(languages))
    .min(1)
    .max(4)
    .refine((v) => new Set(v).size === v.length, "Languages must be distinct")
    .default([...languages]),
  topic: z.string().min(1).max(100),
  statement: z.string().min(10).max(10000),
  inputFormat: z.string().min(1).max(2000),
  outputFormat: z.string().min(1).max(2000),
  constraints: z.string().min(1).max(2000),
  examples: z
    .array(
      z.object({
        input: z.string().max(10000),
        output: z.string().max(16384),
        explanation: z.string().max(2000),
      }),
    )
    .min(1)
    .max(3),
  hiddenTests: z
    .array(
      z.object({
        input: z.string().max(10000),
        expected: z.string().max(16384),
      }),
    )
    .min(1)
    .max(10),
  published: z.boolean(),
  demo: z.boolean(),
  version: z.number().int().min(1),
});
const test = new Schema(
  {
    input: { type: String, required: true },
    expected: { type: String, required: true },
  },
  { _id: false },
);
const example = new Schema(
  { input: String, output: String, explanation: String },
  { _id: false },
);
const schema = new Schema(
  {
    key: { type: String, required: true },
    title: { type: String, required: true },
    difficulty: {
      type: String,
      enum: ["easy", "medium", "hard"],
      required: true,
    },
    supportedLanguages: {
      type: [String],
      enum: languages,
      default: () => [...languages],
    },
    topic: { type: String, required: true },
    statement: { type: String, required: true },
    inputFormat: { type: String, required: true },
    outputFormat: { type: String, required: true },
    constraints: { type: String, required: true },
    examples: { type: [example], required: true },
    hiddenTests: { type: [test], required: true, select: false },
    published: { type: Boolean, default: false },
    demo: { type: Boolean, default: false },
    version: { type: Number, default: 1 },
  },
  { timestamps: true, autoIndex: false, autoCreate: false },
);
schema.pre("validate", function () {
  const parsed = problemSchema.safeParse(this.toObject());
  if (!parsed.success) this.invalidate("statement", "Invalid coding problem.");
});
schema.index({ key: 1 }, { unique: true });
schema.index({ published: 1, difficulty: 1, topic: 1 });
export const CodingProblem = mongoose.model("CodingProblem", schema);
