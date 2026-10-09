import { Activity } from '../models/Preparation.js';

export async function recordActivity(studentId: string, kind: string, title: string, key: string, now = new Date()) {
  try {
    await Activity.updateOne({ studentId, key }, { $setOnInsert: { studentId, key, kind, title, day: now.toISOString().slice(0, 10), createdAt: now } }, { upsert: true, runValidators: true });
  } catch (error) {
    if (!(typeof error === 'object' && error !== null && 'code' in error && error.code === 11000)) throw error;
  }
}
