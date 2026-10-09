export type Role = 'student' | 'trainer' | 'admin';
export interface Health { service: string; status: string; database: { configured: boolean; status: 'connected' | 'connecting' | 'disconnected' }; uptime: number }
export const roleLabels: Record<Role, string> = { student: 'Student', trainer: 'Trainer / Faculty', admin: 'Placement Officer / Admin' };
export function isRole(value: string | undefined): value is Role { return value === 'student' || value === 'trainer' || value === 'admin'; }
