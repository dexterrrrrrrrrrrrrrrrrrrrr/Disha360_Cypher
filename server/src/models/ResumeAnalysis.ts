import mongoose, { Schema } from 'mongoose';
const schema = new Schema({ studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true }, resumeId: { type: Schema.Types.ObjectId, ref: 'Resume', required: true }, resumeTitle: { type: String, required: true, maxlength: 100 }, resumeVersion: { type: Number, required: true, min: 1 }, jobDescription: { type: String, required: true, maxlength: 12000 }, resumeSnapshot: { type: Schema.Types.Mixed, required: true }, result: { type: Schema.Types.Mixed, required: true } }, { timestamps: true, autoCreate: false, autoIndex: false });
schema.index({ studentId: 1, createdAt: -1 });
schema.index({ studentId: 1, resumeId: 1 });
export const ResumeAnalysis = mongoose.model('ResumeAnalysis', schema);
