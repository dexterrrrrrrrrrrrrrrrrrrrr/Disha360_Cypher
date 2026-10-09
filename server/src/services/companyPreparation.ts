import { Company } from "../models/Company.js";
import { LearningModule } from "../models/LearningModule.js";
import { Assessment, Question } from "../models/Assessment.js";
import { CodingProblem } from "../models/CodingProblem.js";
export function preparationProgress(keys: string[], completed: string[]) {
  const current = [...new Set(keys)];
  const completedItemKeys = current.filter((k) => completed.includes(k));
  return {
    completedItemKeys,
    completed: completedItemKeys.length,
    total: current.length,
    percent: current.length
      ? Math.round((completedItemKeys.length / current.length) * 100)
      : 0,
  };
}
export function companyDTO(
  company: InstanceType<typeof Company>,
  completed: string[] = [],
) {
  return {
    id: company.id as string,
    name: company.name,
    overview: company.overview,
    industry: company.industry,
    disclaimer: company.disclaimer,
    demo: company.demo,
    stages: [...company.stages],
    topics: {
      aptitude: [...company.topics.aptitude],
      technical: [...company.topics.technical],
      coding: [...company.topics.coding],
      hr: [...company.topics.hr],
    },
    interviewQuestions: [...company.interviewQuestions],
    checklist: company.checklist.map((i) => ({ key: i.key, label: i.label })),
    progress: preparationProgress(
      company.checklist.map((i) => i.key),
      completed,
    ),
  };
}
export async function companyResources(
  company: InstanceType<typeof Company>,
  allowDemo: boolean,
) {
  const visibility = {
    published: true,
    ...(!allowDemo ? { demo: false } : {}),
  };
  const now = new Date();
  const [learning, coding, assessments] = await Promise.all([
    LearningModule.find({
      published: true,
      $or: [
        { topic: { $in: company.resourceTopics } },
        { subject: { $in: company.resourceTopics } },
      ],
    })
      .collation({ locale: "en", strength: 2 })
      .sort({ title: 1 })
      .limit(12)
      .select("title subject topic"),
    CodingProblem.find({
      ...visibility,
      topic: { $in: company.resourceTopics },
    })
      .collation({ locale: "en", strength: 2 })
      .sort({ difficulty: 1, title: 1 })
      .limit(12)
      .select("title topic difficulty demo"),
    Assessment.find({
      ...visibility,
      category: { $in: company.assessmentCategories },
      $and: [
        { $or: [{ opensAt: null }, { opensAt: { $lte: now } }] },
        { $or: [{ closesAt: null }, { closesAt: { $gt: now } }] },
      ],
    })
      .sort({ title: 1 })
      .select("title category questionIds questionCount demo"),
  ]);
  // Never recommend assessments whose published question pool cannot start an attempt.
  const questions = await Question.find({
    ...visibility,
    _id: { $in: assessments.flatMap((a) => a.questionIds) },
  }).select("_id category");
  const available = assessments
    .filter(
      (a) =>
        questions.filter(
          (q) =>
            q.category === a.category &&
            a.questionIds.some((id) => id.equals(q._id)),
        ).length >= a.questionCount,
    )
    .slice(0, 12);
  return {
    learning: learning.map((m) => ({
      id: m.id,
      title: m.title,
      detail: `${m.subject} · ${m.topic}`,
      href: `/learning/${m.id}`,
    })),
    coding: coding.map((p) => ({
      id: p.id,
      title: p.title,
      detail: `${p.difficulty} · ${p.topic}`,
      href: `/coding/problems/${p.id}`,
    })),
    assessments: available.map((a) => ({
      id: a.id,
      title: a.title,
      detail: a.category,
      href: `/assessments/${a.id}`,
    })),
    interview: {
      href: "/interviews",
      title: "Mock interview workspace",
      detail:
        "Use these topics to prepare. Live interviews require configured OpenAI access; these profiles do not create company-specific AI interviews.",
    },
    explanation:
      "Resources match curated topics or assessment categories. They are general preparation materials, not company-endorsed tests. Availability is checked when this page loads.",
  };
}
