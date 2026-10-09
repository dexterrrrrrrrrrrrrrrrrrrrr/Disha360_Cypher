import type { RequestHandler } from 'express';
import { databaseStatus } from '../config/database.js';

export function healthController(configured: boolean, status = databaseStatus): RequestHandler {
  return (_req, res) => res.json({ success: true, data: { service: 'cypher-api', status: 'ok', database: { configured, status: status() }, uptime: Math.floor(process.uptime()) } });
}
export function readinessController(configured: boolean, status = databaseStatus): RequestHandler {
  return (_req, res) => {
    const ready = configured && status() === 'connected';
    res.status(ready ? 200 : 503).json({ success: ready, ...(ready ? { data: { status: 'ready' } } : { error: { code: 'DATABASE_UNAVAILABLE', message: 'The database is not connected.' } }) });
  };
}
