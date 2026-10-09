import mongoose, { Schema } from 'mongoose';
import { resumeContentSchema } from '../validators/resume.js';

const schema = new Schema({
  studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true, trim: true, maxlength: 100 },
  template: { type: String, enum: ['classic', 'modern', 'compact'], required: true },
  content: { type: Schema.Types.Mixed, required: true, validate: { validator: (value: unknown) => resumeContentSchema.safeParse(value).success, message: 'Invalid resume content.' } },
  version: { type: Number, required: true, default: 1, min: 1 }
}, { timestamps: true, autoCreate: false, autoIndex: false });
schema.index({ studentId: 1, updatedAt: -1 });
export const Resume = mongoose.model('Resume', schema);
export type ResumeDocument = mongoose.HydratedDocument<mongoose.InferSchemaType<typeof schema>>;
export function resumeDTO(resume: ResumeDocument) { return { id: resume.id as string, title: resume.title, template: resume.template, content: resumeContentSchema.parse(resume.content), version: resume.version, updatedAt: resume.updatedAt }; }
