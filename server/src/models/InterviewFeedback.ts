import mongoose, { Schema } from 'mongoose';
const schema = new Schema({ studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true }, sessionId: { type: Schema.Types.ObjectId, ref: 'InterviewSession', required: true }, sessionVersion: { type: Number, required: true }, provider: { type: String, required: true }, report: { type: Schema.Types.Mixed, required: true } }, { timestamps: true, autoCreate: false, autoIndex: false });
schema.index({ sessionId: 1 }, { unique: true });
schema.index({ studentId: 1, createdAt: -1 });
export const InterviewFeedback = mongoose.model('InterviewFeedback', schema);
