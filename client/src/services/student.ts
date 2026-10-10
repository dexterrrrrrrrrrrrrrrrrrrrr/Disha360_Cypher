import { apiUrl } from './apiUrl';
import { ApiError } from './auth';

export async function studentRequest<T>(path: string, options: { method?: string; body?: unknown; signal?: AbortSignal; raw?: boolean; prefix?: string } = {}): Promise<T> {
  let response: Response;
  try { response = await fetch(apiUrl(`${options.prefix || '/api/v1/student'}${path}`), { method: options.method || 'GET', credentials: 'include', signal: options.signal, headers: options.method && options.method !== 'GET' ? { 'Content-Type': 'application/json', 'X-Disha360-Request': '1' } : {}, ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}) }); }
  catch (error) { if (options.signal?.aborted) throw error; throw new ApiError('Unable to reach the server. Check your connection and retry.', 0); }
  if (options.raw && response.ok) return await response.blob() as T;
  let result;
  try { result = await response.json(); } catch { throw new ApiError('The server returned an unexpected response. Please try again.', response.status); }
  if (!response.ok || !result.success) {
    const fields: { field: string; message: string }[] = result.error?.fields || [];
    const detail = fields.slice(0, 6).map(f => `${f.field.replace(/^content\./, '')}: ${f.message}`).join(' ');
    throw new ApiError(`${result.error?.message || 'Request failed.'}${detail ? ` ${detail}` : ''}`, response.status, fields);
  }
  return result.data as T;
}
