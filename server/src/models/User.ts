import mongoose, { Schema } from 'mongoose';

export const roles = ['student', 'trainer', 'admin'] as const;
export type Role = typeof roles[number];
const userSchema = new Schema({
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
  email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254, unique: true, match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
  passwordHash: { type: String, required: true, select: false, match: /^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/ },
  role: { type: String, enum: roles, required: true, default: 'student' },
  department: { type: String, trim: true, maxlength: 100, required: function (this: { role: string }): boolean { return this.role === 'student'; } },
  semester: { type: Number, min: 1, max: 12, validate: Number.isInteger, required: function (this: { role: string }): boolean { return this.role === 'student'; } },
  isDemo: { type: Boolean, default: false, select: false }
}, { timestamps: true, autoCreate: false, autoIndex: false });
userSchema.set('toJSON', { transform: (_doc, ret) => { const { passwordHash, isDemo, ...safe } = ret; return safe; } });
export const User = mongoose.model('User', userSchema);
export type UserDocument = mongoose.HydratedDocument<mongoose.InferSchemaType<typeof userSchema>>;
export function publicUser(user: UserDocument) {
  return { id: user.id as string, name: user.name, email: user.email, role: user.role as Role, department: user.department ?? null, semester: user.semester ?? null };
}
