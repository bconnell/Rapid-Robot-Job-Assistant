import type { JobPosting } from '../models/JobPosting';
import { normalizeKey } from '../utils/Validation';

const genericTitles = new Set([
  '',
  'home',
  'job',
  'jobs',
  'careers',
  'career',
  'job search',
  'search jobs',
  'open positions',
  'opportunities',
  'untitled job'
]);

const jobEvidenceTerms = [
  'apply',
  'candidate',
  'compensation',
  'employment',
  'experience',
  'job',
  'position',
  'qualifications',
  'requirements',
  'responsibilities',
  'role',
  'salary'
];

export function isMeaningfulJobPosting(job: JobPosting): boolean {
  const title = normalizeKey(job.title);
  const specificTitle =
    title.length >= 3 &&
    title.length <= 180 &&
    !genericTitles.has(title) &&
    !/^https?:\/\//.test(title);

  if (!specificTitle) return false;

  let evidence = 0;
  if (job.company?.trim()) evidence += 1;
  if (job.location?.trim()) evidence += 1;
  if (job.salaryText?.trim()) evidence += 1;
  if ((job.requirementsText?.trim().length ?? 0) >= 40) evidence += 1;
  if ((job.preferredQualificationsText?.trim().length ?? 0) >= 40) evidence += 1;
  if (job.detectedKeywords.length > 0) evidence += 1;

  const description = normalizeKey(job.descriptionText);
  const termCount = jobEvidenceTerms.filter((term) =>
    new RegExp(`(^|[^a-z0-9])${term}([^a-z0-9]|$)`).test(description)
  ).length;
  if (description.length >= 200 && termCount >= 2) evidence += 1;

  return evidence >= 1;
}
