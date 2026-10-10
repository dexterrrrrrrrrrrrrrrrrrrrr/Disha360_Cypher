import mongoose, { Schema } from "mongoose";
const schema = new Schema(
  {
    studentId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    key: {
      type: String,
      required: true,
      enum: [
        "first-assessment",
        "first-code",
        "five-code",
        "learning-explorer",
        "seven-day",
        "consistent-performer",
      ],
    },
    earnedAt: { type: Date, required: true },
  },
  { timestamps: true, autoCreate: false, autoIndex: false },
);
schema.index({ studentId: 1, key: 1 }, { unique: true });
export const BadgeAward = mongoose.model("BadgeAward", schema);
