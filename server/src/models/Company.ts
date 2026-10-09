import mongoose, { Schema } from "mongoose";
import { companySchema } from "../validators/company.js";
const topicSchema = new Schema(
  { aptitude: [String], technical: [String], coding: [String], hr: [String] },
  { _id: false },
);
const schema = new Schema(
  {
    key: { type: String, required: true },
    name: { type: String, required: true },
    overview: { type: String, required: true },
    industry: { type: String, required: true },
    disclaimer: { type: String, required: true },
    stages: { type: [String], required: true },
    topics: { type: topicSchema, required: true },
    interviewQuestions: { type: [String], required: true },
    checklist: {
      type: [
        new Schema(
          {
            key: { type: String, required: true },
            label: { type: String, required: true },
          },
          { _id: false },
        ),
      ],
      required: true,
    },
    resourceTopics: { type: [String], required: true },
    assessmentCategories: {
      type: [String],
      enum: ["quantitative", "logical", "verbal", "technical"],
      required: true,
    },
    published: { type: Boolean, default: false },
    demo: { type: Boolean, default: false },
  },
  { timestamps: true, autoCreate: false, autoIndex: false },
);
schema.pre("validate", function () {
  const { _id, createdAt, updatedAt, __v, ...content } = this.toObject();
  if (!companySchema.safeParse(content).success)
    this.invalidate("name", "Invalid company profile.");
});
schema.index({ key: 1 }, { unique: true });
schema.index({ published: 1, demo: 1, industry: 1, name: 1 });
export const Company = mongoose.model("Company", schema);
const progress = new Schema(
  {
    studentId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true },
    completedItemKeys: { type: [String], default: [] },
  },
  { timestamps: true, autoCreate: false, autoIndex: false },
);
progress.index({ studentId: 1, companyId: 1 }, { unique: true });
export const CompanyProgress = mongoose.model("CompanyProgress", progress);
