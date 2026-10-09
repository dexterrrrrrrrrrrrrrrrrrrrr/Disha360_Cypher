import { Company } from "../models/Company.js";
import { companySchema } from "../validators/company.js";
export const companyDisclaimer =
  "Illustrative preparation profile, not verified recruitment guidance. Stages and topics may vary by role and year. Check the current official job posting for actual requirements.";
const checklist = [
  { key: "aptitude", label: "Review aptitude and verbal topics" },
  { key: "coding", label: "Practise coding problems" },
  { key: "technical", label: "Prepare technical interview questions" },
  { key: "hr", label: "Review HR interview questions" },
  { key: "assessments", label: "Complete available recommended assessments" },
];
const profiles = [
  {
    key: "tcs",
    name: "TCS",
    focus:
      "Build a broad foundation in quantitative reasoning, programming and project explanations.",
    coding: ["Arithmetic", "Arrays", "Strings"],
  },
  {
    key: "infosys",
    name: "Infosys",
    focus:
      "Practise structured problem solving, algorithms and clear explanations of your approach.",
    coding: ["Arrays", "Strings", "Dynamic programming"],
  },
  {
    key: "wipro",
    name: "Wipro",
    focus:
      "Review communication, programming fundamentals and practical debugging exercises.",
    coding: ["Arithmetic", "Strings", "Arrays"],
  },
  {
    key: "accenture",
    name: "Accenture",
    focus:
      "Connect technical fundamentals with scenario reasoning and concise project stories.",
    coding: ["Arrays", "Strings", "Algorithms"],
  },
  {
    key: "cognizant",
    name: "Cognizant",
    focus:
      "Balance quantitative practice with databases, programming and structured interview answers.",
    coding: ["Arithmetic", "Arrays", "Strings"],
  },
  {
    key: "capgemini",
    name: "Capgemini",
    focus:
      "Practise reasoning, coding fundamentals and collaborative problem explanations.",
    coding: ["Strings", "Arrays", "Algorithms"],
  },
];
export const companySamples = profiles.map((p) => ({
  key: `sample-company-${p.key}`,
  name: p.name,
  industry: "IT services and consulting",
  overview: `Illustrative study plan for students exploring ${p.name} roles. ${p.focus} This is a practice guide, not a description of a current hiring process.`,
  disclaimer: companyDisclaimer,
  stages: [
    "Application and eligibility review",
    "Aptitude or technical assessment",
    "Coding or technical discussion",
    "HR or behavioural discussion",
  ],
  topics: {
    aptitude: ["Quantitative reasoning", "Logical reasoning", "Verbal ability"],
    technical: [
      "Programming fundamentals",
      "Object-oriented programming",
      "Databases",
      "Operating systems",
    ],
    coding: p.coding,
    hr: ["Project storytelling", "Teamwork", "Career motivation"],
  },
  interviewQuestions: [
    "Explain a project you built, your contribution and one technical trade-off.",
    "How would you test and debug an unexpected result?",
    "Describe a teamwork challenge and what you learned.",
  ],
  checklist,
  resourceTopics: [
    ...p.coding,
    "Programming fundamentals",
    "Object-oriented programming",
    "Databases",
    "Operating systems",
    "Quantitative reasoning",
    "Logical reasoning",
    "Verbal ability",
  ],
  assessmentCategories: ["quantitative", "logical", "verbal", "technical"],
  published: true,
  demo: true,
}));
export async function seedCompanies(mode: string) {
  if (mode !== "development") throw new Error("Development only");
  const records = companySamples.map((c) => companySchema.parse(c));
  if (
    await Company.exists({
      key: { $in: records.map((c) => c.key) },
      demo: { $ne: true },
    })
  )
    throw new Error("Non-demo key conflict");
  let inserted = 0;
  for (const row of records) {
    try {
      const result = await Company.updateOne(
        { key: row.key },
        { $setOnInsert: row },
        { upsert: true, runValidators: true },
      );
      inserted += result.upsertedCount;
    } catch (e) {
      if (!(typeof e === "object" && e && "code" in e && e.code === 11000))
        throw e;
    }
    if (!(await Company.findOne({ key: row.key }).select("demo"))?.demo)
      throw new Error("Non-demo key conflict");
  }
  return { inserted, samples: records.length };
}
