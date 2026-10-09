import mongoose, { Schema } from "mongoose";
import { languages, verdicts } from "../features/coding/validation.js";
const schema = new Schema(
  {
    studentId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    problemId: {
      type: Schema.Types.ObjectId,
      ref: "CodingProblem",
      required: true,
    },
    problemVersion: { type: Number, required: true },
    title: { type: String, required: true },
    language: { type: String, enum: languages, required: true },
    source: { type: String, required: true, maxlength: 30000, select: false },
    requestId: { type: String, required: true },
    status: {
      type: String,
      enum: ["processing", "completed"],
      default: "processing",
    },
    processingUntil: { type: Date, required: true },
    verdict: { type: String, enum: verdicts },
    passed: { type: Number, default: 0 },
    total: { type: Number, required: true },
    score: { type: Number, default: null },
    timeSeconds: { type: Number, default: null },
    memoryKb: { type: Number, default: null },
    finishedAt: Date,
  },
  { timestamps: true, autoIndex: false, autoCreate: false },
);
schema.index({ studentId: 1, requestId: 1 }, { unique: true });
schema.index({ studentId: 1, createdAt: -1 });
schema.index({ studentId: 1, problemId: 1, verdict: 1 });
schema.index({ status: 1, processingUntil: 1 });
export const CodingSubmission = mongoose.model("CodingSubmission", schema);
