import { LearningModule } from "../models/LearningModule.js";
import { LearningProgress } from "../models/Preparation.js";
export function progressDTO(
  module: InstanceType<typeof LearningModule>,
  record: InstanceType<typeof LearningProgress> | null,
) {
  const valid = new Set(module.lessons.map((l) => l.id as string));
  const completed = (record?.completedLessonIds || [])
    .map((id) => id.toString())
    .filter((id) => valid.has(id));
  return {
    completedLessonIds: completed,
    completedLessons: completed.length,
    totalLessons: module.lessons.length,
    percent: module.lessons.length
      ? Math.round((completed.length / module.lessons.length) * 100)
      : 0,
    lastLessonId: valid.has(record?.lastLessonId || "")
      ? record!.lastLessonId
      : null,
  };
}
export async function learningRecords(studentId: string) {
  const records = await LearningProgress.find({ studentId });
  const modules = await LearningModule.find({
    _id: { $in: records.filter((r) => r.moduleId).map((r) => r.moduleId) },
    published: true,
  });
  return records.flatMap((r) => {
    if (!r.moduleId)
      return [
        {
          _id: r._id,
          title: r.title,
          completedLessons: r.completedLessons,
          totalLessons: r.totalLessons,
          href: undefined as string | undefined,
        },
      ];
    const m = modules.find((m) => m._id.equals(r.moduleId!));
    if (!m) return [];
    const p = progressDTO(m, r);
    return [
      {
        _id: r._id,
        title: m.title,
        completedLessons: p.completedLessons,
        totalLessons: p.totalLessons,
        href: `/learning/${m.id}`,
      },
    ];
  });
}
