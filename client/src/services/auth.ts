import { apiUrl } from './apiUrl';
import type { AuthUser, Registration } from '../types';

export class ApiError extends Error {
  constructor(message: string, public status: number, public fields: { field: string; message: string }[] = []) { super(message); }
}
async function call<T>(path: string, body?: object): Promise<T> {
  let response: Response;
  try {
    response = await fetch(apiUrl(`/api/v1/auth/${path}`), { method: body ? 'POST' : 'GET', credentials: 'include', headers: body ? { 'Content-Type': 'application/json', 'X-Disha360-Request': '1' } : {}, ...(body ? { body: JSON.stringify(body) } : {}) });
  } catch { throw new ApiError('Unable to reach the server. Check your connection and try again.', 0); }
  let result;
  try { result = await response.json(); } catch { throw new ApiError('The server returned an unexpected response. Please try again.', response.status); }
  if (!response.ok || !result.success) throw new ApiError(result.error?.message || 'The request failed.', response.status, result.error?.fields || []);
  return result.data as T;
}
export const authApi = {
  me: () => call<{ user: AuthUser }>('me'),
  login: (email: string, password: string) => call<{ user: AuthUser }>('login', { email, password }),
  register: (input: Registration) => call<{ user: AuthUser }>('register', input),
  logout: () => call<{ message: string }>('logout', {}),
  workspace: (role: string) => call<{ user: AuthUser }>(`workspace/${role}`)
};
