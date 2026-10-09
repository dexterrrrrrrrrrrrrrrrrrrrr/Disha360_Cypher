import mongoose, { Schema } from 'mongoose';
const options = { timestamps: true, autoCreate: false, autoIndex: false } as const;
const batch = new Schema({ name: { type: String, required: true, trim: true, maxlength: 100 }, active: { type: Boolean, default: true } }, options);
batch.index({ active: 1 });
export const Batch = mongoose.model('Batch', batch);
const enrollment = new Schema({ batchId: { type: Schema.Types.ObjectId, ref: 'Batch', required: true }, studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true }, active: { type: Boolean, default: true } }, options);
enrollment.index({ batchId: 1, studentId: 1 }, { unique: true }); enrollment.index({ studentId: 1, active: 1 });
export const Enrollment = mongoose.model('Enrollment', enrollment);
