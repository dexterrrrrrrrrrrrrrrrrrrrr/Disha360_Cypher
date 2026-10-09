import { expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
it('fails gracefully when MongoDB is unavailable, while health stays accessible', async () => {
  const app = createApp({ clientOrigin: 'http://localhost:5173', databaseConfigured: false, status: () => 'disconnected' });
  expect((await request(app).get('/api/v1/health')).status).toBe(200);
  for (const path of ['dashboard', 'resumes', 'analyses', 'interviews', 'interviews/config', 'assessments', 'attempts', 'analytics', 'coding/config', 'coding/problems', 'coding/submissions']) { const response = await request(app).get(`/api/v1/student/${path}`); expect(response.status).toBe(503); expect(response.body.error.code).toBe('DATABASE_UNAVAILABLE'); }
});
