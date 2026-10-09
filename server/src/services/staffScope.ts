import { Batch, Enrollment } from "../models/Batch.js";
import { User, type UserDocument } from "../models/User.js";
export function visibleUsers(allowDemo: boolean) {
  return allowDemo ? {} : { isDemo: false };
}
export async function staffScope(user: UserDocument, allowDemo: boolean) {
  const batches = await Batch.find(
    user.role === "admin"
      ? { active: true }
      : { active: true, trainerIds: user._id },
  );
  const members = await Enrollment.distinct("studentId", {
    batchId: { $in: batches.map((b) => b._id) },
    active: true,
  });
  const students = await User.find({
    role: "student",
    ...visibleUsers(allowDemo),
    ...(user.role === "admin" ? {} : { _id: { $in: members } }),
  }).select("name email department semester role");
  return { batches, students, studentIds: students.map((s) => s._id) };
}
