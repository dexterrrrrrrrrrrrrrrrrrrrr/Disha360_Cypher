import mongoose, { Schema } from "mongoose";
const schema = new Schema(
  {
    batchId: { type: Schema.Types.ObjectId, ref: "Batch", required: true },
    kind: { type: String, enum: ["assessment", "learning"], required: true },
    resourceId: { type: Schema.Types.ObjectId, required: true },
    assignedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    dueAt: {
      type: Date,
      default: null,
      required: function (this: { kind: string }) {
        return this.kind === "assessment";
      },
    },
  },
  { timestamps: true, autoCreate: false, autoIndex: false },
);
schema.index({ batchId: 1, kind: 1, resourceId: 1 }, { unique: true });
schema.index({ kind: 1, resourceId: 1 });
export const BatchAssignment = mongoose.model("BatchAssignment", schema);
