import mongoose, { Schema } from "mongoose";
// Lessons are embedded so editing and publication are one atomic module update.
export const LearningLessonSchema = new Schema({
  title: { type: String, required: true, maxlength: 150 },
  kind: { type: String, enum: ["text", "link"], required: true },
  body: { type: String, default: "", maxlength: 10000 },
  url: { type: String, default: "", maxlength: 2000 },
});
const schema = new Schema(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true, maxlength: 200 },
    subject: { type: String, required: true, maxlength: 100 },
    topic: { type: String, required: true, maxlength: 100 },
    description: { type: String, default: "", maxlength: 3000 },
    objectives: { type: [String], default: [] },
    lessons: { type: [LearningLessonSchema], default: [] },
    published: { type: Boolean, default: false },
    version: { type: Number, default: 1 },
  },
  { timestamps: true, autoCreate: false, autoIndex: false },
);
schema.index({ published: 1, subject: 1, topic: 1 });
schema.index({ ownerId: 1, updatedAt: -1 });
export const LearningModule = mongoose.model("LearningModule", schema);
