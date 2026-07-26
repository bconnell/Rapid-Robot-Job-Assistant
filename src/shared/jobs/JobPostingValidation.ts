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
  'privacy policy',
  'accessibility statement',
  'terms of use',
  'sign in',
  'login',
  'untitled job'
]);

const jobEvidenceTerms = [
  'apply',
  'candidate',
  'compensation',
  'employment',
  'experience',
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

  const description = normalizeKey(job.descriptionText);
  const termCount = jobEvidenceTerms.filter((term) => matchesPhrase(description, term)).length;
  const hasDescriptionEvidence = description.length >= 160 && termCount >= 2;
  const hasRequirementsEvidence =
    (job.requirementsText?.trim().length ?? 0) >= 40 ||
    (job.preferredQualificationsText?.trim().length ?? 0) >= 40;
  const hasCompensationEvidence =
    Boolean(job.salaryText?.trim()) &&
    description.length >= 80 &&
    Boolean(job.company?.trim() || job.location?.trim());

  return hasDescriptionEvidence || hasRequirementsEvidence || hasCompensationEvidence;
}

function matchesPhrase(text: string, phrase: string): boolean {
  const normalized = normalizeKey(phrase);
  const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(text);
}
