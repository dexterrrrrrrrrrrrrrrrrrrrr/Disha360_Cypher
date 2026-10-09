import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../utils/AppError.js';

export const notFound: RequestHandler = (_req, _res, next) => next(new AppError(404, 'NOT_FOUND', 'This API endpoint does not exist.'));
export const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  if (error instanceof ZodError) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Please check the submitted fields.', fields: error.issues.map(issue => ({ field: issue.path.join('.'), message: issue.message })) } });
    return;
  }
  if (error instanceof AppError) {
    res.status(error.status).json({ success: false, error: { code: error.code, message: error.message } });
    return;
  }
  if (error instanceof SyntaxError && 'body' in error) {
    res.status(400).json({ success: false, error: { code: 'INVALID_JSON', message: 'The request body must contain valid JSON.' } });
    return;
  }
  if (typeof error === 'object' && error !== null && 'status' in error && error.status === 413) {
    res.status(413).json({ success: false, error: { code: 'PAYLOAD_TOO_LARGE', message: 'The request body is too large.' } });
    return;
  }
  console.error('Unhandled API error:', error instanceof Error ? error.name : 'UnknownError');
  res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' } });
};
