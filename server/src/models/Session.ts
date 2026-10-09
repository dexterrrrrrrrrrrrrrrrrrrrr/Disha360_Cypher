import mongoose, { Schema } from 'mongoose';

const sessionSchema = new Schema({
  tokenHash: { type: String, required: true, unique: true, select: false, match: /^[a-f0-9]{64}$/ },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  expiresAt: { type: Date, required: true }
}, { timestamps: true, autoCreate: false, autoIndex: false });
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const Session = mongoose.model('Session', sessionSchema);
