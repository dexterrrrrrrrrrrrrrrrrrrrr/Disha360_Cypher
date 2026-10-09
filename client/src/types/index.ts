export type Role = 'student' | 'trainer' | 'admin';
export interface AuthUser { id: string; name: string; email: string; role: Role; department: string | null; semester: number | null }
export interface Registration { name: string; email: string; password: string; department: string; semester: number }
export interface Health { service: string; status: string; database: { configured: boolean; status: 'connected' | 'connecting' | 'disconnected' }; uptime: number }
export const roleLabels: Record<Role, string> = { student: 'Student', trainer: 'Trainer / Faculty', admin: 'Placement Officer / Admin' };
export function isRole(value: string | undefined): value is Role { return value === 'student' || value === 'trainer' || value === 'admin'; }
