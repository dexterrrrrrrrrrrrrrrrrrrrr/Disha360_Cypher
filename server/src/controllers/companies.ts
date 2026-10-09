import type { RequestHandler } from "express";
import { Company, CompanyProgress } from "../models/Company.js";
import {
  companyFilterSchema,
  companyProgressSchema,
} from "../validators/company.js";
import { objectIdSchema } from "../validators/resume.js";
import { AppError } from "../utils/AppError.js";
import {
  companyDTO,
  companyResources,
} from "../services/companyPreparation.js";
function visibility(allowDemo: boolean) {
  return { published: true, ...(!allowDemo ? { demo: false } : {}) };
}
export const listCompanies: RequestHandler = async (req, res) => {
  const filter = companyFilterSchema.parse(req.query);
  const companies = await Company.find({
    ...visibility(!!req.app.locals.allowDemoAccounts),
    ...(filter.industry ? { industry: filter.industry } : {}),
  })
    .sort({ name: 1 })
    .limit(200);
  const progress = await CompanyProgress.find({
    studentId: req.user!._id,
    companyId: { $in: companies.map((c) => c._id) },
  });
  const rows = companies
    .map((c) =>
      companyDTO(
        c,
        progress.find((p) => p.companyId.equals(c._id))?.completedItemKeys,
      ),
    )
    .filter((c) => {
      const searchMatch =
        !filter.search ||
        [c.name, c.overview, c.industry, ...Object.values(c.topics).flat()]
          .join(" ")
          .toLowerCase()
          .includes(filter.search.toLowerCase());
      return (
        searchMatch &&
        (!filter.completion ||
          (filter.completion === "complete"
            ? c.progress.completed === c.progress.total
            : filter.completion === "not-started"
              ? c.progress.completed === 0
              : c.progress.completed > 0 &&
                c.progress.completed < c.progress.total))
      );
    });
  res.json({ success: true, data: { companies: rows } });
};
async function visibleCompany(id: unknown, allowDemo: boolean) {
  const company = await Company.findOne({
    _id: objectIdSchema.parse(id),
    ...visibility(allowDemo),
  });
  if (!company)
    throw new AppError(
      404,
      "NOT_FOUND",
      "Company preparation profile not found.",
    );
  return company;
}
export const companyDetails: RequestHandler = async (req, res) => {
  const company = await visibleCompany(
    req.params.id,
    !!req.app.locals.allowDemoAccounts,
  );
  const progress = await CompanyProgress.findOne({
    studentId: req.user!._id,
    companyId: company._id,
  });
  res.json({
    success: true,
    data: {
      company: companyDTO(company, progress?.completedItemKeys),
      resources: await companyResources(
        company,
        !!req.app.locals.allowDemoAccounts,
      ),
    },
  });
};
export const updateCompanyProgress: RequestHandler = async (req, res) => {
  const input = companyProgressSchema.parse(req.body);
  const company = await visibleCompany(
    req.params.id,
    !!req.app.locals.allowDemoAccounts,
  );
  if (!company.checklist.some((i) => i.key === input.itemKey))
    throw new AppError(
      400,
      "INVALID_CHECKLIST_ITEM",
      "Choose an item from this company checklist.",
    );
  const owner = { studentId: req.user!._id, companyId: company._id };
  const update = input.completed
    ? { $addToSet: { completedItemKeys: input.itemKey } }
    : { $pull: { completedItemKeys: input.itemKey } };
  let progress;
  try {
    progress = await CompanyProgress.findOneAndUpdate(owner, update, {
      upsert: true,
      new: true,
      runValidators: true,
    });
  } catch (e) {
    if (!(typeof e === "object" && e && "code" in e && e.code === 11000))
      throw e;
    progress = await CompanyProgress.findOneAndUpdate(owner, update, {
      new: true,
      runValidators: true,
    });
  }
  res.json({
    success: true,
    data: { company: companyDTO(company, progress?.completedItemKeys) },
  });
};
