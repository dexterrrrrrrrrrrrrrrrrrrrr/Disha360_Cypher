import { z } from 'zod';
import { objectIdSchema } from './resume.js';
export const sparkMeetOrigin = 'https://sparkmeet-web.onrender.com';
export const meetingUrl = z.string().trim().max(2000).url().refine(value => {
  try { const u = new URL(value); return u.origin === sparkMeetOrigin && !u.username && !u.password && !/[\\\u0000-\u0020\u007f]/.test(value) && !/%(?:0[0-9a-f]|1[0-9a-f]|7f)/i.test(value); } catch { return false; }
}, 'Use an HTTPS meeting link from the approved SparkMeet origin.');
const resourceUrl = z.string().trim().max(2000).url().refine(value => {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && !/[\\\u0000-\u0020\u007f]/.test(value); } catch { return false; }
}, 'Resources must use HTTPS links without embedded credentials.');
export const classFields = z.object({
  title: z.string().trim().min(3).max(150), description: z.string().trim().max(3000).default(''),
  batchId: objectIdSchema, trainerId: objectIdSchema.optional(),
  startsAt: z.string().datetime({ offset: true }).transform(value => new Date(value)),
  durationMinutes: z.number().int().min(10).max(480), meetingUrl,
  notes: z.string().trim().max(5000).default(''),
  resources: z.array(z.object({ title: z.string().trim().min(1).max(150), url: resourceUrl }).strict()).max(10).default([]),
}).strict();
export const createClassInput = classFields.extend({ requestId: z.string().uuid() }).strict();
export const updateClassInput = classFields.extend({ version: z.number().int().min(1) }).strict();
export const versionInput = z.object({ version: z.number().int().min(1) }).strict();
export const attendanceInput = versionInput.extend({
  records: z.array(z.object({ studentId: objectIdSchema, status: z.enum(['present', 'absent', 'excused']), note: z.string().trim().max(500).default('') }).strict()).max(500)
    .refine(records => new Set(records.map(r => r.studentId)).size === records.length, 'Each student must occur only once.'),
}).strict();
