import type { Request, RequestHandler } from 'express';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { Batch, Enrollment } from '../models/Batch.js';
import { User } from '../models/User.js';
import { LiveClass } from '../models/LiveClass.js';
import { objectIdSchema } from '../validators/resume.js';
import { createClassInput, updateClassInput, attendanceInput, versionInput } from '../validators/liveClass.js';
import { authorizedBatch } from './staffBatches.js';
import { visibleUsers } from '../services/staffScope.js';
import { AppError } from '../utils/AppError.js';
export function classStatus(c: { cancelled: boolean; startsAt: Date; durationMinutes: number }, now = Date.now()) {
  return c.cancelled ? 'Cancelled' : now < c.startsAt.getTime() ? 'Upcoming' : now < c.startsAt.getTime() + c.durationMinutes * 60000 ? 'Live' : 'Completed';
}
type ClassDocument = InstanceType<typeof LiveClass>;
async function scope(req: Request) {
  if (req.user!.role === 'admin') return {};
  if (req.user!.role === 'trainer') {
    const ids = await Batch.distinct('_id', { active: true, trainerIds: req.user!._id });
    return { trainerId: req.user!._id, batchId: { $in: ids } };
  }
  const active = await Batch.distinct('_id', { active: true });
  const ids = await Enrollment.distinct('batchId', { studentId: req.user!._id, active: true, batchId: { $in: active } });
  return { batchId: { $in: ids } };
}
async function owned(req: Request) {
  const c = await LiveClass.findOne({ _id: objectIdSchema.parse(req.params.id), ...await scope(req) }).select('+meetingUrl');
  if (!c) throw new AppError(404, 'NOT_FOUND', 'Live class not found in your authorized workspace.');
  return c;
}
function dto(c: ClassDocument, req: Request, details = false) {
  const student = req.user!.role === 'student';
  const status = classStatus(c);
  return { id: c.id, title: c.title, description: c.description, batchId: c.batchId.toString(), trainerId: c.trainerId.toString(),
    startsAt: c.startsAt, durationMinutes: c.durationMinutes, status, version: c.version,
    // Cancelled links are never returned. Only authorized detail requests disclose links.
    ...(details ? { meetingUrl: status === 'Cancelled' ? null : c.meetingUrl, notes: c.notes, resources: c.resources.map(r => ({ title: r.title, url: r.url })) } : {}),
    ...(student ? { attendance: c.attendance.filter(a => a.studentId.equals(req.user!._id)).map(a => ({ status: a.status, note: a.note, recordedAt: a.recordedAt })) }
      : details ? { attendance: c.attendance.map(a => ({ studentId: a.studentId.toString(), status: a.status, note: a.note, recordedAt: a.recordedAt })) } : {}),
  };
}
async function assigned(req: Request, input: { batchId: string; trainerId?: string }) {
  const batch = await authorizedBatch(req, input.batchId);
  if (!batch.active) throw new AppError(409, 'ARCHIVED_BATCH', 'Schedule classes only in active batches.');
  const trainerId = req.user!.role === 'trainer' ? req.user!.id as string : input.trainerId;
  if (req.user!.role === 'trainer' && input.trainerId && input.trainerId !== trainerId) throw new AppError(403, 'FORBIDDEN', 'Trainers can only schedule their own classes.');
  if (!trainerId || !batch.trainerIds.some(id => id.toString() === trainerId) || !await User.exists({ _id: trainerId, role: 'trainer', ...visibleUsers(!!req.app.locals.allowDemoAccounts) }))
    throw new AppError(400, 'INVALID_TRAINER', 'Select an existing trainer assigned to this batch.');
  return trainerId;
}
function future(date: Date) {
  if (date.getTime() <= Date.now() || date.getTime() > Date.now() + 366 * 86400000) throw new AppError(400, 'INVALID_SCHEDULE', 'Choose a future start within the next year.');
}
export const listLiveClasses: RequestHandler = async (req, res) => {
  const filter = await scope(req), now = new Date();
  const query = z.object({ view: z.enum(['all', 'upcoming']).default('all') }).strict().parse(req.query);
  const listFilter = query.view === 'upcoming' ? { ...filter, cancelled: false, $expr: { $gt: [{ $add: ['$startsAt', { $multiply: ['$durationMinutes', 60000] }] }, now] } } : filter;
  const [classes, total, cancelled, upcoming, completed, attendance] = await Promise.all([
    LiveClass.find(listFilter).sort({ startsAt: query.view === 'upcoming' ? 1 : -1, _id: -1 }).limit(101),
    LiveClass.countDocuments(filter), LiveClass.countDocuments({ ...filter, cancelled: true }),
    LiveClass.countDocuments({ ...filter, cancelled: false, startsAt: { $gt: now } }),
    LiveClass.countDocuments({ ...filter, cancelled: false, $expr: { $lte: [{ $add: ['$startsAt', { $multiply: ['$durationMinutes', 60000] }] }, now] } }),
    req.user!.role === 'student' ? [] : LiveClass.aggregate([{ $match: filter }, { $unwind: '$attendance' }, { $group: { _id: '$attendance.status', count: { $sum: 1 } } }]),
  ]);
  res.json({ success: true, data: { classes: classes.slice(0, 100).map(c => dto(c, req)), truncated: classes.length > 100,
    analytics: req.user!.role === 'student' ? undefined : { total, cancelled, upcoming, completed, live: total - cancelled - upcoming - completed, attendance: Object.fromEntries(attendance.map(a => [a._id, a.count])) } } });
};
export const getLiveClass: RequestHandler = async (req, res) => {
  const c = await owned(req);
  let students: { id: string; name: string; email: string }[] = [];
  if (req.user!.role !== 'student') {
    const ids = await Enrollment.distinct('studentId', { batchId: c.batchId, active: true });
    students = (await User.find({ _id: { $in: ids }, role: 'student', ...visibleUsers(!!req.app.locals.allowDemoAccounts) }).select('name email').sort({ name: 1 })).map(s => ({ id: s.id, name: s.name, email: s.email }));
  }
  res.json({ success: true, data: { ...dto(c, req, true), ...(req.user!.role !== 'student' ? { students } : {}) } });
};
export const createLiveClass: RequestHandler = async (req, res) => {
  const { requestId, ...input } = createClassInput.parse(req.body);
  const trainerId = await assigned(req, input);
  const requestFingerprint = createHash('sha256').update(JSON.stringify({ ...input, trainerId })).digest('hex');
  const duplicate = async () => {
    const c = await LiveClass.findOne({ createdBy: req.user!._id, requestId, ...await scope(req) }).select('+requestFingerprint +meetingUrl');
    if (!c || c.requestFingerprint !== requestFingerprint) throw new AppError(409, 'REQUEST_CONFLICT', 'This scheduling request already belongs to different class details.');
    return c;
  };
  if (await LiveClass.exists({ createdBy: req.user!._id, requestId })) { res.json({ success: true, data: dto(await duplicate(), req, true) }); return; }
  future(input.startsAt);
  let c;
  try { c = await LiveClass.create({ ...input, trainerId, createdBy: req.user!._id, requestId, requestFingerprint }); }
  catch (error) { if ((error as { code?: number }).code !== 11000) throw error; c = await duplicate(); }
  res.status(201).json({ success: true, data: dto(c, req, true) });
};
export const updateLiveClass: RequestHandler = async (req, res) => {
  const { version, ...input } = updateClassInput.parse(req.body), current = await owned(req);
  if (current.cancelled) throw new AppError(409, 'CLASS_CANCELLED', 'Cancelled classes cannot be edited.');
  const trainerId = await assigned(req, input);
  const scheduleChanged = current.startsAt.getTime() !== input.startsAt.getTime() || current.durationMinutes !== input.durationMinutes || current.batchId.toString() !== input.batchId || current.trainerId.toString() !== trainerId;
  if (scheduleChanged) {
    if (current.startsAt.getTime() <= Date.now() || current.attendance.length) throw new AppError(409, 'CLASS_STARTED', 'A started or attendance-recorded class cannot be reassigned or rescheduled. Create a new class instead.');
    future(input.startsAt);
  }
  const c = await LiveClass.findOneAndUpdate({ _id: current._id, version, cancelled: false, ...await scope(req) }, { $set: { ...input, trainerId }, $inc: { version: 1 } }, { new: true, runValidators: true }).select('+meetingUrl');
  if (!c) throw new AppError(409, 'CLASS_CONFLICT', 'This class changed. Reload before saving.');
  res.json({ success: true, data: dto(c, req, true) });
};
export const cancelLiveClass: RequestHandler = async (req, res) => {
  const { version } = versionInput.parse(req.body), current = await owned(req);
  if (classStatus(current) === 'Completed') throw new AppError(409, 'CLASS_COMPLETED', 'Completed classes cannot be cancelled.');
  const c = await LiveClass.findOneAndUpdate({ _id: current._id, version, cancelled: false, ...await scope(req) }, { $set: { cancelled: true }, $inc: { version: 1 } }, { new: true, runValidators: true });
  if (!c) throw new AppError(409, 'CLASS_CONFLICT', 'This class changed or was cancelled. Reload before saving.');
  res.json({ success: true, data: dto(c, req, true) });
};
export const recordClassAttendance: RequestHandler = async (req, res) => {
  const { version, records } = attendanceInput.parse(req.body), current = await owned(req);
  if (current.cancelled || current.startsAt.getTime() > Date.now()) throw new AppError(409, 'ATTENDANCE_UNAVAILABLE', 'Record attendance only after a non-cancelled class has started.');
  const ids = records.map(r => r.studentId);
  if (await Enrollment.countDocuments({ batchId: current.batchId, active: true, studentId: { $in: ids } }) !== ids.length || await User.countDocuments({ _id: { $in: ids }, role: 'student', ...visibleUsers(!!req.app.locals.allowDemoAccounts) }) !== ids.length)
    throw new AppError(400, 'INVALID_ATTENDEES', 'Attendance must refer to currently enrolled students in this class batch.');
  const changes = new Map(records.map(r => [r.studentId, r]));
  const retained = current.attendance.filter(a => !changes.has(a.studentId.toString())).map(a => a.toObject());
  const attendance = [...retained, ...records.map(r => ({ ...r, recordedBy: req.user!._id, recordedAt: new Date() }))];
  if (attendance.length > 500) throw new AppError(400, 'ROSTER_LIMIT', 'A class supports at most 500 attendance records.');
  const c = await LiveClass.findOneAndUpdate({ _id: current._id, version, cancelled: false, ...await scope(req) }, { $set: { attendance }, $inc: { version: 1 } }, { new: true, runValidators: true }).select('+meetingUrl');
  if (!c) throw new AppError(409, 'CLASS_CONFLICT', 'This class changed. Reload attendance before saving.');
  res.json({ success: true, data: dto(c, req, true) });
};
