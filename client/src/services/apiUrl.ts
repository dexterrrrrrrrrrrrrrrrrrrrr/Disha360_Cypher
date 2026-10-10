// Public origin only. VITE_* settings are bundled into frontend JavaScript.
export function resolveApiUrl(path: string, base = ''): string {
  if (!path.startsWith('/api/') || path.startsWith('//')) throw new Error('Invalid API path');
  if (!base.trim()) return path; // Existing local Vite proxy.
  const url = new URL(base.trim());
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash ||
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) {
    throw new Error('Use an HTTPS API origin without credentials or a path');
  }
  return `${url.origin}${path}`;
}
export const apiUrl = (path: string) => resolveApiUrl(path, import.meta.env.VITE_API_BASE_URL);
