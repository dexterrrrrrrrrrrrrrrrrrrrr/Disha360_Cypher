import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

const app = createApp({ clientOrigin: 'http://localhost:5173', databaseConfigured: false, status: () => 'disconnected' });
describe('foundation API', () => {
  it('reports liveness without claiming database readiness', async () => {
    const response = await request(app).get('/api/v1/health');
    expect(response.status).toBe(200);
    expect(response.body.data.database).toEqual({ configured: false, status: 'disconnected' });
    expect(response.headers['x-powered-by']).toBeUndefined();
  });
  it('returns 503 when persistence is unavailable', async () => {
    expect((await request(app).get('/api/v1/ready')).status).toBe(503);
  });
  it('reports ready only when configured and connected', async () => {
    const connected = createApp({ clientOrigin: 'http://localhost:5173', databaseConfigured: true, status: () => 'connected' });
    expect((await request(connected).get('/api/v1/ready')).status).toBe(200);
  });
  it('returns a consistent API 404', async () => {
    const response = await request(app).get('/api/v1/users');
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });
  it('rejects malformed JSON without exposing internals', async () => {
    const response = await request(app).post('/api/v1/anything').set('Content-Type', 'application/json').send('{broken');
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_JSON');
    expect(response.body).not.toHaveProperty('stack');
  });
  it('allows only the configured browser origin', async () => {
    const response = await request(app).get('/api/v1/health').set('Origin', 'https://untrusted.example');
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });
  it('rejects oversized JSON bodies', async () => {
    const response = await request(app).post('/api/v1/anything').send({ data: 'x'.repeat(110000) });
    expect(response.status).toBe(413);
  });
});
