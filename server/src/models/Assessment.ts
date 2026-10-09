import mongoose, { Schema } from "mongoose";
import {
  categories,
  difficulties,
  questionSchema,
  assessmentSchema,
} from "../validators/assessment.js";
const options = {
  timestamps: true,
  autoCreate: false,
  autoIndex: false,
} as const;
const choice = new Schema(
  {
    id: { type: String, required: true },
    text: { type: String, required: true, maxlength: 1000 },
  },
  { _id: false },
);
const question = new Schema(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    managedAssessmentId: {
      type: Schema.Types.ObjectId,
      ref: "Assessment",
      default: null,
    },
    fingerprint: String,
    key: { type: String, required: true },
    category: { type: String, enum: categories, required: true },
    topic: { type: String, required: true },
    difficulty: { type: String, enum: difficulties, required: true },
    prompt: { type: String, required: true },
    options: { type: [choice], required: true },
    correctOptionId: { type: String, required: true },
    explanation: { type: String, required: true },
    shuffleOptions: { type: Boolean, default: true },
    expectedSeconds: { type: Number, default: 60 },
    published: { type: Boolean, default: false },
    demo: { type: Boolean, default: false },
    version: { type: Number, default: 1 },
  },
  options,
);
question.pre("validate", function () {
  const result = questionSchema.safeParse({
    key: this.key,
    category: this.category,
    topic: this.topic,
    difficulty: this.difficulty,
    prompt: this.prompt,
    options: this.options.map((v) => ({ id: v.id, text: v.text })),
    correctOptionId: this.correctOptionId,
    explanation: this.explanation,
    shuffleOptions: this.shuffleOptions,
    expectedSeconds: this.expectedSeconds,
    published: this.published,
    demo: this.demo,
    version: this.version,
  });
  if (!result.success) this.invalidate("prompt", "Invalid question content.");
});
question.index(
  { managedAssessmentId: 1, fingerprint: 1 },
  {
    unique: true,
    partialFilterExpression: { fingerprint: { $type: "string" } },
  },
);
question.index({ key: 1 }, { unique: true });
question.index({ published: 1, category: 1, topic: 1 });
export const Question = mongoose.model("Question", question);
const assessment = new Schema(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    key: { type: String, required: true },
    title: { type: String, required: true },
    instructions: { type: String, required: true },
    category: { type: String, enum: categories, required: true },
    questionIds: {
      type: [Schema.Types.ObjectId],
      ref: "Question",
      required: true,
    },
    questionCount: { type: Number, required: true },
    durationSeconds: { type: Number, required: true },
    pointsPerCorrect: { type: Number, default: 1 },
    penaltyPerIncorrect: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 3 },
    opensAt: { type: Date, default: null },
    closesAt: { type: Date, default: null },
    published: { type: Boolean, default: false },
    demo: { type: Boolean, default: false },
    version: { type: Number, default: 1 },
  },
  options,
);
assessment.pre("validate", function () {
  const result = assessmentSchema.safeParse({
    key: this.key,
    title: this.title,
    instructions: this.instructions,
    category: this.category,
    questionIds: this.questionIds.map((v) => v.toString()),
    questionCount: this.questionCount,
    durationSeconds: this.durationSeconds,
    pointsPerCorrect: this.pointsPerCorrect,
    penaltyPerIncorrect: this.penaltyPerIncorrect,
    maxAttempts: this.maxAttempts,
    opensAt: this.opensAt,
    closesAt: this.closesAt,
    published: this.published,
    demo: this.demo,
    version: this.version,
  });
  if (!result.success)
    this.invalidate("questionIds", "Invalid assessment configuration.");
});
assessment.index({ ownerId: 1, published: 1 });
assessment.index({ key: 1 }, { unique: true });
assessment.index({ published: 1, category: 1, closesAt: 1 });
export const Assessment = mongoose.model("Assessment", assessment);
const snapshot = new Schema(
  {
    questionId: { type: String, required: true },
    questionVersion: { type: Number, required: true },
    prompt: { type: String, required: true },
    options: { type: [choice], required: true },
    correctOptionId: { type: String, required: true },
    explanation: { type: String, required: true },
    category: { type: String, enum: categories, required: true },
    topic: { type: String, required: true },
    difficulty: { type: String, enum: difficulties, required: true },
    expectedSeconds: { type: Number, required: true },
    selectedOptionId: { type: String, default: null },
    timeSpentMs: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);
const attempt = new Schema(
  {
    studentId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    assessmentId: {
      type: Schema.Types.ObjectId,
      ref: "Assessment",
      required: true,
    },
    assessmentVersion: { type: Number, required: true },
    attemptNumber: { type: Number, required: true },
    title: { type: String, required: true },
    category: { type: String, enum: categories, required: true },
    demo: { type: Boolean, required: true },
    status: {
      type: String,
      enum: ["in-progress", "submitted"],
      default: "in-progress",
    },
    startedAt: { type: Date, required: true },
    deadlineAt: { type: Date, required: true },
    finalizedAt: Date,
    finishReason: { type: String, enum: ["manual", "expired"] },
    currentQuestionId: { type: String, required: true },
    cursorSince: { type: Date, required: true },
    questions: { type: [snapshot], required: true },
    pointsPerCorrect: { type: Number, required: true },
    penaltyPerIncorrect: { type: Number, required: true },
    setSignature: { type: String, required: true },
    version: { type: Number, default: 1 },
    result: { type: Schema.Types.Mixed, default: null },
  },
  options,
);
attempt.index(
  { studentId: 1, assessmentId: 1, attemptNumber: 1 },
  { unique: true },
);
attempt.index(
  { studentId: 1, assessmentId: 1 },
  { unique: true, partialFilterExpression: { status: "in-progress" } },
);
attempt.index({ status: 1, deadlineAt: 1 });
attempt.index({ studentId: 1, finalizedAt: -1 });
attempt.index({
  assessmentId: 1,
  assessmentVersion: 1,
  setSignature: 1,
  status: 1,
});
export const TestAttempt = mongoose.model("TestAttempt", attempt);
export type AttemptDocument = mongoose.HydratedDocument<
  mongoose.InferSchemaType<typeof attempt>
>;
