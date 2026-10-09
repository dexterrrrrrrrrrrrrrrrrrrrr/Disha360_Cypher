import type { RequestHandler } from 'express';
import { assessmentMetrics, batchComparisons } from '../services/assessmentAnalytics.js';
export const studentAnalytics: RequestHandler = async (req, res) => { const { attempts, analytics } = await assessmentMetrics(req.user!.id as string); res.json({ success: true, data: { ...analytics, batch: await batchComparisons(req.user!.id as string, attempts) } }); };
