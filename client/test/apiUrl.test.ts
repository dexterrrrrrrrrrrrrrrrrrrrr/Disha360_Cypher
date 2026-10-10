import { expect, it } from 'vitest';
import { resolveApiUrl } from '../src/services/apiUrl';
it('uses local proxy paths or the configured public backend origin', () => {
  expect(resolveApiUrl('/api/v1/auth/me')).toBe('/api/v1/auth/me');
  expect(resolveApiUrl('/api/v1/auth/me', 'https://api.example.test/')).toBe('https://api.example.test/api/v1/auth/me');
});
it('rejects credential-bearing, insecure and ambiguous API origins', () => {
  for (const base of ['https://user:secret@api.example.test', 'http://api.example.test', 'https://api.example.test/api', 'https://api.example.test?key=secret']) {
    expect(() => resolveApiUrl('/api/v1/health', base)).toThrow();
  }
  expect(() => resolveApiUrl('//evil.test')).toThrow();
});
