import type { Health } from '../types';

export async function fetchHealth(signal?: AbortSignal): Promise<Health> {
  const response = await fetch('/api/v1/health', { signal });
  if (!response.ok) throw new Error('The API is unavailable. Start the server and try again.');
  const body = await response.json();
  if (!body.success || !body.data?.database) throw new Error('The API returned an unexpected response.');
  return body.data;
}
