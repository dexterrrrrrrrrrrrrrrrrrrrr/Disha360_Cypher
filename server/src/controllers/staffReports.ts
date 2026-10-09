import type { RequestHandler } from "express";
import {
  buildStaffReport,
  reportChoices,
  reportCSV,
  assessmentResultsCSV,
} from "../services/staffReports.js";
import { assessmentOwned } from "../services/staffAssessment.js";
import { batchFilter } from "../validators/staffAssessment.js";
export const reportOptions: RequestHandler = async (req, res) =>
  res.json({ success: true, data: await reportChoices(req) });
export const reports: RequestHandler = async (req, res) => {
  const report = await buildStaffReport(req, req.query);
  res.json({
    success: true,
    data: {
      ...report,
      rows: report.rows.slice((report.page - 1) * 25, report.page * 25),
    },
  });
};
export const exportReport: RequestHandler = async (req, res) => {
  const report = await buildStaffReport(req, req.query);
  res
    .type("text/csv")
    .attachment("disha360-preparation-report.csv")
    .send(reportCSV(report));
};
export const exportAssessmentResults: RequestHandler = async (req, res) => {
  const a = await assessmentOwned(req, req.params.id),
    q = batchFilter.parse(req.query);
  const report = await buildStaffReport(req, { ...q, assessmentId: a.id });
  res
    .type("text/csv")
    .attachment("disha360-assessment-results.csv")
    .send(assessmentResultsCSV(report));
};
