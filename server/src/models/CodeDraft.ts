import mongoose, { Schema } from "mongoose";
import { languages } from "../features/coding/validation.js";
const schema = new Schema(
  {
    studentId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    scope: { type: String, required: true },
    language: { type: String, enum: languages, required: true },
    source: { type: String, required: true, maxlength: 30000 },
    stdin: { type: String, default: "", maxlength: 10000 },
    version: { type: Number, default: 1 },
  },
  { timestamps: true, autoIndex: false, autoCreate: false },
);
schema.index({ studentId: 1, scope: 1, language: 1 }, { unique: true });
export const CodeDraft = mongoose.model("CodeDraft", schema);
