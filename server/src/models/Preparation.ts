import mongoose, { Schema } from 'mongoose';

const options = { timestamps: true, autoCreate: false, autoIndex: false } as const;
const progressSchema = new Schema({
  studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  moduleKey: { type: String, required: true, maxlength: 100 },
  title: { type: String, required: true, maxlength: 200 },
  completedLessons: { type: Number, required: true, min: 0, validate: Number.isInteger },
  totalLessons: { type: Number, required: true, min: 1, validate: Number.isInteger }
}, options);
progressSchema.pre('validate', function () { if (this.completedLessons > this.totalLessons) this.invalidate('completedLessons', 'Cannot exceed total lessons.'); });
progressSchema.index({ studentId: 1, moduleKey: 1 }, { unique: true });
export const LearningProgress = mongoose.model('LearningProgress', progressSchema);

const assignmentSchema = new Schema({
  studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true, maxlength: 200 },
  topic: { type: String, required: true, maxlength: 100 },
  dueAt: { type: Date, required: true },
  status: { type: String, enum: ['pending', 'completed'], default: 'pending', required: true },
  score: { type: Number, min: 0, default: null },
  maxScore: { type: Number, min: 1, default: null }
}, options);
assignmentSchema.pre('validate', function () {
  if (this.score != null && (this.status !== 'completed' || this.maxScore == null || this.score > this.maxScore)) this.invalidate('score', 'A completed result must have a valid maximum score.');
});
assignmentSchema.index({ studentId: 1, status: 1, dueAt: 1 });
export const AssessmentAssignment = mongoose.model('AssessmentAssignment', assignmentSchema);

const activitySchema = new Schema({
  studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  key: { type: String, required: true, maxlength: 200 },
  kind: { type: String, required: true, enum: ['dashboard_visit', 'resume_saved', 'resume_analyzed', 'interview_started', 'interview_answered', 'interview_completed'] },
  title: { type: String, required: true, maxlength: 200 },
  day: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ }
}, options);
activitySchema.index({ studentId: 1, key: 1 }, { unique: true });
activitySchema.index({ studentId: 1, createdAt: -1 });
export const Activity = mongoose.model('Activity', activitySchema);
