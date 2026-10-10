import mongoose, { Schema } from 'mongoose';
const resource = new Schema({ title: { type: String, required: true, maxlength: 150 }, url: { type: String, required: true, maxlength: 2000 } }, { _id: false });
const attendance = new Schema({
  studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['present', 'absent', 'excused'], required: true },
  note: { type: String, default: '', maxlength: 500 },
  recordedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  recordedAt: { type: Date, required: true },
}, { _id: false });
const schema = new Schema({
  title: { type: String, required: true, maxlength: 150 }, description: { type: String, default: '', maxlength: 3000 },
  batchId: { type: Schema.Types.ObjectId, ref: 'Batch', required: true }, trainerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }, requestId: { type: String, required: true }, requestFingerprint: { type: String, required: true, select: false },
  startsAt: { type: Date, required: true }, durationMinutes: { type: Number, required: true, min: 10, max: 480 },
  meetingUrl: { type: String, required: true, maxlength: 2000, select: false },
  cancelled: { type: Boolean, default: false }, version: { type: Number, default: 1, min: 1 },
  notes: { type: String, default: '', maxlength: 5000 }, resources: { type: [resource], default: [] }, attendance: { type: [attendance], default: [] },
}, { timestamps: true, autoCreate: false, autoIndex: false });
schema.index({ createdBy: 1, requestId: 1 }, { unique: true });
schema.index({ batchId: 1, startsAt: -1 });
schema.index({ trainerId: 1, startsAt: -1 });
export const LiveClass = mongoose.model('LiveClass', schema);
