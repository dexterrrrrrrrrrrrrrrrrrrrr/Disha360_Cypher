import mongoose from "mongoose";
import { TestAttempt } from "../models/Assessment.js";
import { CodingSubmission } from "../models/CodingSubmission.js";
import { LearningProgress } from "../models/Preparation.js";
import { BadgeAward } from "../models/BadgeAward.js";
import { AppError } from "../utils/AppError.js";
export const engagementRules =
  "Each assessment with at least one answered question: rounded best normalized finalized score, 0–100 points, once per assessment across all versions/retakes. Each first Accepted coding problem: Easy 50, Medium 100, Hard 150 using current problem difficulty. Each first verified completed learning module: 40. No points for visits, login or checklists. UTC meaningful-completion streak; assessment retakes can sustain a day but cannot add duplicate points; coding/module repeats cannot create new streak days. Older full-module progress without a trustworthy completion timestamp earns points but contributes no historical streak day.";
export const badgeCatalog = [
  {
    key: "first-assessment",
    name: "First Assessment Completed",
    description: "Finalize one assessment with a valid recorded grade.",
  },
  {
    key: "first-code",
    name: "First Coding Challenge Solved",
    description: "Receive an Accepted verdict on one problem.",
  },
  {
    key: "five-code",
    name: "Five Coding Challenges Solved",
    description: "Solve five distinct coding problems.",
  },
  {
    key: "learning-explorer",
    name: "Learning Explorer",
    description: "Complete one full learning module.",
  },
  {
    key: "seven-day",
    name: "Seven-Day Streak",
    description: "Qualifying completions on seven consecutive UTC days.",
  },
  {
    key: "consistent-performer",
    name: "Consistent Performer",
    description:
      "Best normalized scores of at least 70% on five distinct assessments.",
  },
] as const;
type Event = {
  studentId: string;
  kind: "assessment" | "coding" | "learning";
  resourceId: string;
  points: number;
  at: Date;
  qualifiedAt?: Date;
  days?: string[];
};
export function normalizedPoints(value: number) {
  return Math.round(Math.max(0, Math.min(100, value)));
}
export function streakStats(days: string[], now = new Date()) {
  const today = now.toISOString().slice(0, 10),
    valid = [
      ...new Set(
        days.filter(
          (d) =>
            /^\d{4}-\d{2}-\d{2}$/.test(d) &&
            d <= today &&
            Number.isFinite(Date.parse(d)) &&
            new Date(d).toISOString().slice(0, 10) === d,
        ),
      ),
    ].sort();
  let longest = 0,
    run = 0,
    prior: number | undefined,
    sevenDayAt: Date | null = null;
  for (const day of valid) {
    const time = Date.parse(day + "T00:00:00Z");
    run = prior !== undefined && time - prior === 86400000 ? run + 1 : 1;
    longest = Math.max(longest, run);
    if (run === 7 && !sevenDayAt) sevenDayAt = new Date(day + "T00:00:00Z");
    prior = time;
  }
  let current = 0;
  let cursor = Date.parse(today + "T00:00:00Z");
  const set = new Set(valid);
  if (!set.has(today)) cursor -= 86400000;
  while (set.has(new Date(cursor).toISOString().slice(0, 10))) {
    current++;
    cursor -= 86400000;
  }
  return {
    current,
    longest,
    lastActiveDay: valid.at(-1) || null,
    timezone: "UTC",
    sevenDayAt,
  };
}
export function summarizeEvents(
  studentId: string,
  events: Event[],
  now = new Date(),
) {
  const own = events.filter((e) => e.studentId === studentId),
    distinct = new Map<string, Event>();
  for (const e of own) {
    const key = e.kind + ":" + e.resourceId,
      old = distinct.get(key);
    if (!old) distinct.set(key, { ...e });
    else {
      old.points = Math.max(old.points, e.points);
      old.at = new Date(Math.min(old.at.getTime(), e.at.getTime()));
      if (e.qualifiedAt)
        old.qualifiedAt = old.qualifiedAt
          ? new Date(
              Math.min(old.qualifiedAt.getTime(), e.qualifiedAt.getTime()),
            )
          : e.qualifiedAt;
    }
  }
  const records = [...distinct.values()],
    assessment = records.filter((e) => e.kind === "assessment"),
    coding = records.filter((e) => e.kind === "coding"),
    learning = records.filter((e) => e.kind === "learning");
  const streak = streakStats(
    own.flatMap((e) => e.days || [e.at.toISOString().slice(0, 10)]),
    now,
  );
  const criteria: Record<string, Date> = {};
  const ordered = (items: Event[]) =>
    items.map((e) => e.at).sort((a, b) => a.getTime() - b.getTime());
  if (assessment.length) criteria["first-assessment"] = ordered(assessment)[0];
  if (coding.length) criteria["first-code"] = ordered(coding)[0];
  if (coding.length >= 5) criteria["five-code"] = ordered(coding)[4];
  if (learning.length) criteria["learning-explorer"] = ordered(learning)[0];
  if (streak.sevenDayAt) criteria["seven-day"] = streak.sevenDayAt;
  const consistent = assessment
    .filter((e) => e.qualifiedAt)
    .map((e) => e.qualifiedAt!)
    .sort((a, b) => a.getTime() - b.getTime());
  if (consistent.length >= 5) criteria["consistent-performer"] = consistent[4];
  return {
    studentId,
    totalPoints: records.reduce((n, e) => n + e.points, 0),
    completedAssessments: assessment.length,
    solvedCoding: coding.length,
    completedModules: learning.length,
    learningDatesUnknown: learning.filter((e) => e.days?.length === 0).length,
    breakdown: {
      assessments: assessment.reduce((n, e) => n + e.points, 0),
      coding: coding.reduce((n, e) => n + e.points, 0),
      learning: learning.length * 40,
    },
    streak,
    criteria,
  };
}
// Database grouping avoids transferring attempts, code, keys or private lesson content. Every output is bounded.
async function aggregate(
  model: typeof TestAttempt | typeof CodingSubmission | typeof LearningProgress,
  pipeline: mongoose.PipelineStage[],
) {
  const result = await model
    .aggregate([...pipeline, { $limit: 20001 }])
    .option({ maxTimeMS: 10000 });
  if (result.length > 20000)
    throw new AppError(
      422,
      "ENGAGEMENT_LIMIT",
      "Too many engagement records for one view. Narrow the batch filter. No partial ranking was returned.",
    );
  return result;
}
export async function engagementSummaries(
  ids: string[],
  allowDemo: boolean,
  now = new Date(),
) {
  if (!ids.length) return [];
  const objectIds = ids.map((id) => new mongoose.Types.ObjectId(id));
  const [assessments, coding, learning] = await Promise.all([
    aggregate(TestAttempt, [
      {
        $match: {
          studentId: { $in: objectIds },
          status: "submitted",
          finalizedAt: { $lte: now },
          "result.percentage": { $type: "number" },
          $expr: {
            $gt: [
              {
                $add: [
                  { $ifNull: ["$result.correct", 0] },
                  { $ifNull: ["$result.incorrect", 0] },
                ],
              },
              0,
            ],
          },
          ...(!allowDemo ? { demo: false } : {}),
        },
      },
      {
        $group: {
          _id: { studentId: "$studentId", resourceId: "$assessmentId" },
          score: { $max: "$result.percentage" },
          qualifiedAt: {
            $min: {
              $cond: [
                { $gte: ["$result.percentage", 70] },
                "$finalizedAt",
                new Date("9999-01-01T00:00:00Z"),
              ],
            },
          },
          at: { $min: "$finalizedAt" },
          days: {
            $addToSet: {
              $dateToString: {
                date: "$finalizedAt",
                format: "%Y-%m-%d",
                timezone: "UTC",
              },
            },
          },
        },
      },
    ]),
    aggregate(CodingSubmission, [
      {
        $match: {
          studentId: { $in: objectIds },
          status: "completed",
          verdict: "Accepted",
          score: 100,
          finishedAt: { $lte: now },
        },
      },
      {
        $group: {
          _id: { studentId: "$studentId", resourceId: "$problemId" },
          at: { $min: "$finishedAt" },
        },
      },
      {
        $lookup: {
          from: "codingproblems",
          localField: "_id.resourceId",
          foreignField: "_id",
          pipeline: [{ $project: { difficulty: 1, demo: 1 } }],
          as: "problem",
        },
      },
      { $unwind: "$problem" },
      ...(!allowDemo ? [{ $match: { "problem.demo": false } }] : []),
    ]),
    aggregate(LearningProgress, [
      { $match: { studentId: { $in: objectIds }, moduleId: { $ne: null } } },
      {
        $lookup: {
          from: "learningmodules",
          localField: "moduleId",
          foreignField: "_id",
          pipeline: [{ $project: { "lessons._id": 1 } }],
          as: "module",
        },
      },
      {
        $set: {
          lessonIds: {
            $map: {
              input: {
                $ifNull: [
                  {
                    $getField: {
                      field: "lessons",
                      input: { $arrayElemAt: ["$module", 0] },
                    },
                  },
                  [],
                ],
              },
              as: "lesson",
              in: "$$lesson._id",
            },
          },
        },
      },
      {
        $match: {
          $or: [
            { engagementCompletedAt: { $lte: now } },
            { engagementRecognizedAt: { $lte: now } },
            {
              $expr: {
                $and: [
                  { $gt: [{ $size: "$lessonIds" }, 0] },
                  { $setIsSubset: ["$lessonIds", "$completedLessonIds"] },
                ],
              },
            },
          ],
        },
      },
      {
        $group: {
          _id: { studentId: "$studentId", resourceId: "$moduleId" },
          at: { $min: "$engagementCompletedAt" },
          recognizedAt: { $min: "$engagementRecognizedAt" },
        },
      },
    ]),
  ]);
  // Recognition records existing full progress, but never invents a historical completion/streak date.
  if (learning.length)
    await LearningProgress.bulkWrite(
      learning.map((l) => ({
        updateOne: {
          filter: {
            studentId: l._id.studentId,
            moduleId: l._id.resourceId,
            engagementRecognizedAt: null,
          },
          update: { $set: { engagementRecognizedAt: now } },
        },
      })),
    );
  const events: Event[] = [
    ...assessments
      .filter((a) => Number.isFinite(a.score))
      .map((a) => ({
        studentId: String(a._id.studentId),
        resourceId: String(a._id.resourceId),
        kind: "assessment" as const,
        points: normalizedPoints(a.score),
        at: a.at,
        qualifiedAt: a.qualifiedAt <= now ? a.qualifiedAt : undefined,
        days: a.days,
      })),
    ...coding.map((c) => ({
      studentId: String(c._id.studentId),
      resourceId: String(c._id.resourceId),
      kind: "coding" as const,
      points:
        ({ easy: 50, medium: 100, hard: 150 } as Record<string, number>)[
          c.problem.difficulty
        ] || 0,
      at: c.at,
    })),
    ...learning.map((l) => ({
      studentId: String(l._id.studentId),
      resourceId: String(l._id.resourceId),
      kind: "learning" as const,
      points: 40,
      at:
        l.at && l.at <= now
          ? l.at
          : l.recognizedAt && l.recognizedAt <= now
            ? l.recognizedAt
            : now,
      days: l.at && l.at <= now ? [l.at.toISOString().slice(0, 10)] : [],
    })),
  ];
  const summaries = ids.map((id) => summarizeEvents(id, events, now));
  const awards = summaries.flatMap((s) =>
    Object.entries(s.criteria).map(([key, earnedAt]) => ({
      updateOne: {
        filter: { studentId: new mongoose.Types.ObjectId(s.studentId), key },
        update: {
          $setOnInsert: {
            studentId: new mongoose.Types.ObjectId(s.studentId),
            key: key as (typeof badgeCatalog)[number]["key"],
            earnedAt,
          },
        },
        upsert: true,
      },
    })),
  );
  if (awards.length) {
    try {
      await BadgeAward.bulkWrite(awards, { ordered: false });
    } catch (e) {
      const error = e as { writeErrors?: { code: number }[]; code?: number };
      if (
        error.writeErrors?.length
          ? !error.writeErrors.every((x) => x.code === 11000)
          : error.code !== 11000
      )
        throw e;
    }
  }
  const saved = await BadgeAward.find({ studentId: { $in: objectIds } })
    .select("studentId key earnedAt")
    .limit(ids.length * badgeCatalog.length)
    .lean();
  return summaries.map((s) => ({
    studentId: s.studentId,
    totalPoints: s.totalPoints,
    completedAssessments: s.completedAssessments,
    solvedCoding: s.solvedCoding,
    completedModules: s.completedModules,
    learningDatesUnknown: s.learningDatesUnknown,
    breakdown: s.breakdown,
    streak: {
      current: s.streak.current,
      longest: s.streak.longest,
      lastActiveDay: s.streak.lastActiveDay,
      timezone: s.streak.timezone,
    },
    badges: badgeCatalog.map((b) => {
      const award = saved.find(
        (a) => String(a.studentId) === s.studentId && a.key === b.key,
      );
      return { ...b, unlocked: !!award, earnedAt: award?.earnedAt || null };
    }),
  }));
}
export function rankSummaries<
  T extends {
    studentId: string;
    totalPoints: number;
    completedAssessments: number;
    solvedCoding: number;
    completedModules: number;
  },
>(rows: T[]) {
  return [...rows]
    .sort(
      (a, b) =>
        b.totalPoints - a.totalPoints ||
        b.completedAssessments - a.completedAssessments ||
        b.solvedCoding - a.solvedCoding ||
        b.completedModules - a.completedModules ||
        a.studentId.localeCompare(b.studentId),
    )
    .map((row, i) => ({ ...row, rank: i + 1 }));
}
